// The HTTP handler of the server.
//
//   /                                    The website (with GRUNDRISS_PUBLIC_SITE), else to /app/.
//   /app/, /app/plans/<id>               The app, and the app with a plan open.
//   /api/…                               The API, with the session in a cookie.
//   /s/<token>                           A share link: adds its grant to the session of the
//                                        browser (a new session if there is none), and goes on
//                                        to the plan. So the token is in an address only once.
//   /setup/<code>, /invite/<code>,       A link for one use. It goes on to the app, which asks
//   /reset/<code>                        for a name and a password (`#invite=<code>`).
//
// The session is a random string in an httpOnly cookie, so a script of the page cannot read it.
// The app and the API are on the same address, so the cookie is not a third-party cookie, and the
// server needs no CORS. Against CSRF, the cookie is SameSite=Lax, and a request that changes
// something must come from the address of the server (`Origin`).

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { planPreview } from "../../src/export/preview";
import { parseBuilding, serializeBuilding } from "../../src/model/file";
import { diffBuildings, patchBuilding, type Patch } from "../../src/model/patch";
import type { Building } from "../../src/model/types";
import {
  Store,
  StoreError,
  type Access,
  type AccountRecord,
  type LinkRecord,
  type PlanRecord,
  type ShareRecord,
} from "./store";

/** The version of the API. A change that old apps cannot use gives a new version. */
export const API_VERSION = 2;

/** The time that a person stays in the list of a plan without a sign of life, in ms. */
export const PRESENCE_TIME = 60_000;

/** The largest state of a person: the cursor, the view, and the selection. */
const MAX_PRESENCE = 16_000;

/** The name of the cookie of the session. */
export const COOKIE = "grundriss_session";

/** Failed logins: at most this many in the time below, for each name and each address. */
const LOGIN_TRIES = 10;
const LOGIN_WINDOW = 15 * 60_000;

export interface Config {
  /** The folder of the build of the app. */
  appDir: string;
  /** The folder of the build of the website, or "". With it, the server serves it at `/`. */
  siteDir: string;
  /** The largest body of a request, in bytes. */
  maxBody: number;
  version: string;
}

/** A person who has a plan open: the name, and the state that the app sends. */
interface Presence {
  client: string;
  session: string;
  name: string;
  write: boolean;
  state: unknown;
  seen: number;
}

/** An open stream of the events of a plan, with the session that opened it. */
interface Stream {
  session: string;
  client: string;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
};

/** The text of an error in the log: the secrets in a path are masked. */
export const maskPath = (path: string) =>
  path.replace(/^\/(s|setup|invite|reset|api\/links)\/[^/?]+/, "/$1/…");

export function createHandler(store: Store, config: Config) {
  /** The open streams of the events of each plan. */
  const streams = new Map<string, Map<ServerResponse, Stream>>();
  /** The people who have each plan open, by the id of their tab. */
  const people = new Map<string, Map<string, Presence>>();
  /** The building of the last revision of each plan, for the patches. */
  const buildings = new Map<string, { revision: string; building: Building }>();
  /** The failed logins of each name and each address. */
  const failures = new Map<string, { count: number; until: number }>();

  /** True if the session still sees the plan. */
  const sees = (session: string, planId: string) => {
    const access = store.accessOf(session);
    const plan = store.plan(planId);
    return !!access && !!plan && store.canSee(access, plan);
  };

  const send = (planId: string, event: string, data: unknown) => {
    for (const [res, stream] of streams.get(planId) ?? []) {
      if (event !== "removed" && !sees(stream.session, planId)) {
        res.end();
        continue;
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  /** Ends the streams whose session lost the access, for example after a removed link. */
  const closeLost = () => {
    for (const [planId, set] of streams) {
      for (const [res, stream] of set) if (!sees(stream.session, planId)) res.end();
    }
  };

  const personInfo = (p: Presence) => ({
    client: p.client,
    name: p.name,
    write: p.write,
    state: p.state,
  });

  /** Removes a person from a plan, and tells the others. */
  const leave = (planId: string, client: string) => {
    const set = people.get(planId);
    if (!set?.delete(client)) return;
    if (set.size === 0) people.delete(planId);
    send(planId, "presence", { client, gone: true });
  };

  /** The people of a plan, without the ones who left without a word or lost the access. */
  const present = (planId: string, now = Date.now()): Presence[] => {
    for (const p of [...(people.get(planId)?.values() ?? [])]) {
      if (now - p.seen > PRESENCE_TIME || !sees(p.session, planId)) leave(planId, p.client);
    }
    return [...(people.get(planId)?.values() ?? [])];
  };

  /** The building of the last revision of a plan. */
  const latestBuilding = (plan: PlanRecord): Building => {
    const revision = plan.revisions.at(-1)!.id;
    const known = buildings.get(plan.id);
    if (known?.revision === revision) return known.building;
    const building = parseBuilding(store.revisionData(plan, revision));
    buildings.set(plan.id, { revision, building });
    return building;
  };

  // The picture of each plan for the list, with the revision that it shows.
  const previews = new Map<string, { revision: string; svg: string }>();
  const preview = (plan: PlanRecord): string => {
    const revision = plan.revisions.at(-1)!.id;
    const known = previews.get(plan.id);
    if (known?.revision === revision) return known.svg;
    let svg = "";
    try {
      svg = planPreview(parseBuilding(store.revisionData(plan, revision)));
    } catch {
      // A plan that the server cannot read has no picture.
    }
    previews.set(plan.id, { revision, svg });
    return svg;
  };

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const url = new URL(req.url ?? "/", "http://server");
      const parts = url.pathname.split("/").filter(Boolean);
      const method = req.method ?? "GET";

      if (parts[0] === "api") return await api(req, res, parts.slice(1));

      if (method !== "GET" && method !== "HEAD") return notFound(res);

      // A share link: the grant goes into the session, and the browser goes on to the plan.
      if (parts[0] === "s" && parts.length === 2) {
        const share = store.share(parts[1]);
        if (!share) return notFound(res, "This link is not valid. It can be removed or too old.");
        let access = store.access(cookie(req));
        if (!access) {
          setSession(req, res, store.createSession(null));
          access = store.access(sessionOf(res))!;
        }
        store.addGrant(access.session.id, share);
        res.writeHead(302, { Location: `/app/plans/${encodeURIComponent(share.planId)}` });
        return void res.end();
      }

      // A link for one use: the app asks for the name and the password. The code goes into the
      // fragment, so that it is not in the next requests.
      if (["setup", "invite", "reset"].includes(parts[0]) && parts.length === 2) {
        res.writeHead(302, { Location: `/app/#${parts[0]}=${encodeURIComponent(parts[1])}` });
        return void res.end();
      }

      if (url.pathname === "/app") {
        res.writeHead(301, { Location: "/app/" });
        return void res.end();
      }
      // The address of a plan is the app itself: its page sets the base of its files.
      if (parts[0] === "app" && parts[1] === "plans" && parts.length === 3)
        return serveFile(res, config.appDir, []);
      if (url.pathname.startsWith("/app/")) return serveFile(res, config.appDir, parts.slice(1));
      if (config.siteDir) return serveFile(res, config.siteDir, parts);
      if (url.pathname === "/") {
        res.writeHead(302, { Location: "/app/" });
        return void res.end();
      }
      return notFound(res);
    } catch (error) {
      if (error instanceof StoreError) return json(res, error.status, { error: error.message });
      console.error(maskPath(req.url ?? ""), error);
      return json(res, 500, { error: "The server has an error." });
    }
  };

  /** The file of a path in a folder, or the index.html of a folder, or null. */
  function findFile(dir: string, path: string): string | null {
    let file = normalize(join(dir, decodeURIComponent(path)));
    if (file !== normalize(dir) && !file.startsWith(normalize(dir) + sep)) return null;
    if (!existsSync(file)) return null;
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    return existsSync(file) ? file : null;
  }

  function serveFile(res: ServerResponse, dir: string, parts: string[]): void {
    const path = parts.join("/");
    const file = findFile(dir, path || "index.html");
    if (!file) return notFound(res);
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    // The files of the build have a hash in their name, so they can stay in a cache.
    const cache = path.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cache });
    res.end(readFileSync(file));
  }

  /** The secret of the session in the cookie of a request, or "". */
  function cookie(req: IncomingMessage): string {
    for (const part of (req.headers.cookie ?? "").split(";")) {
      const [key, ...value] = part.trim().split("=");
      if (key === COOKIE) return value.join("=");
    }
    return "";
  }

  /** Sets the cookie of a new session, or removes it with "". */
  function setSession(req: IncomingMessage, res: ServerResponse, secret: string): void {
    const https =
      (req.socket as { encrypted?: boolean }).encrypted === true ||
      String(req.headers["x-forwarded-proto"] ?? "").split(",")[0] === "https";
    const age = secret ? store.options.sessionDays * 86_400 : 0;
    res.setHeader(
      "Set-Cookie",
      `${COOKIE}=${secret}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${https ? "; Secure" : ""}`,
    );
    (res as ServerResponse & { session?: string }).session = secret;
  }

  /** The secret of the session that this response sets. */
  function sessionOf(res: ServerResponse): string {
    return (res as ServerResponse & { session?: string }).session ?? "";
  }

  /** The address of the client, for the limit of the logins. */
  function address(req: IncomingMessage): string {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "")
      .split(",")[0]
      .trim();
    return forwarded || req.socket.remoteAddress || "";
  }

  /** Throws if a name or an address had too many failed logins. */
  function checkTries(keys: string[], now = Date.now()): void {
    for (const key of keys) {
      const entry = failures.get(key);
      if (entry && entry.until > now && entry.count >= LOGIN_TRIES)
        throw new StoreError(429, "Too many tries. Wait a few minutes.");
    }
  }

  function failed(keys: string[], now = Date.now()): void {
    for (const key of keys) {
      const entry = failures.get(key);
      if (!entry || entry.until <= now) failures.set(key, { count: 1, until: now + LOGIN_WINDOW });
      else entry.count++;
    }
    // The map does not grow without an end.
    if (failures.size > 10_000) {
      for (const [key, entry] of failures) if (entry.until <= now) failures.delete(key);
    }
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string[]): Promise<void> {
    res.setHeader("Cache-Control", "no-store");
    const method = req.method ?? "GET";
    const [head, id, sub, subId] = path;
    const client = String(req.headers["x-client"] ?? "");

    // Against CSRF: a change must come from a page of this server. A client that is not a
    // browser sends no Origin, and has no cookie of a browser either.
    if (method !== "GET" && method !== "HEAD") {
      const origin = req.headers.origin;
      const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
      if (origin && !sameHost(origin, host))
        throw new StoreError(403, "The request comes from another site.");
    }

    let access = store.access(cookie(req));

    /** Makes a new session for an account, with the grants of the session before it. */
    const startSession = (account: AccountRecord) => {
      const grants = access?.session.grants ?? [];
      if (access) store.endSession(access.session.id);
      setSession(req, res, store.createSession(account, grants));
      access = store.access(sessionOf(res));
    };

    if (head === "session" && method === "GET") return json(res, 200, sessionInfo(access));

    if (head === "login" && method === "POST") {
      const value = await body(req);
      const keys = [
        `name:${String(value.name ?? "")
          .trim()
          .toLowerCase()}`,
        `ip:${address(req)}`,
      ];
      checkTries(keys);
      const account = await store.login(value.name, value.password);
      if (!account) {
        failed(keys);
        throw new StoreError(401, "The name or the password is wrong.");
      }
      startSession(account);
      return json(res, 200, sessionInfo(access));
    }

    if (head === "logout" && method === "POST") {
      if (access) store.endSession(access.session.id);
      setSession(req, res, "");
      closeLost();
      return json(res, 200, sessionInfo(null));
    }

    // The links for one use: what a link is, and its use with a name and a password.
    if (head === "links" && id) {
      if (method === "GET") {
        const link = store.link(id);
        if (!link) throw new StoreError(404, "The link is not valid. It can be used or too old.");
        return json(res, 200, {
          kind: link.kind,
          name: link.kind === "reset" ? (store.account(link.account)?.name ?? "") : "",
          server: store.settings.name,
        });
      }
      if (method === "POST") {
        const value = await body(req);
        const account = await store.acceptLink(id, value.name, value.password);
        startSession(account);
        return json(res, 200, sessionInfo(access));
      }
    }

    if (!access) throw new StoreError(401, "Log in first.");
    const me = access;

    if (head === "password" && method === "POST") {
      const value = await body(req);
      await store.changePassword(me, value.old, value.password);
      return json(res, 200, { ok: true });
    }

    if (head === "settings") {
      if (!me.account?.admin) throw new StoreError(403, "Only the admin can do this.");
      if (method === "PUT") store.saveSettings(me, await body(req));
      return json(res, 200, {
        ...store.settings,
        ...store.counts(),
        version: config.version,
        publicSite: config.siteDir !== "",
        quota: store.options.quota,
        maxPlans: store.options.maxPlans,
        linkHours: store.options.linkHours,
      });
    }

    if (head === "accounts") {
      if (method === "GET" && !id) return json(res, 200, store.accounts(me).map(accountInfo));
      if (method === "PUT" && id && !sub) {
        const account = store.updateAccount(me, id, await body(req));
        closeLost();
        return json(res, 200, accountInfo(account));
      }
      if (method === "DELETE" && id && !sub) {
        store.removeAccount(me, id);
        closeLost();
        return json(res, 200, { ok: true });
      }
      if (method === "POST" && id && sub === "reset") {
        const code = store.makeReset(me, id);
        return json(res, 201, { path: `/reset/${code}` });
      }
    }

    if (head === "invites") {
      if (method === "GET" && !id) return json(res, 200, store.links(me).map(linkInfo));
      if (method === "POST" && !id) {
        const code = store.makeInvite(me, await body(req));
        return json(res, 201, { path: `/invite/${code}` });
      }
      if (method === "DELETE" && id) {
        store.removeLink(me, id);
        return json(res, 200, { ok: true });
      }
    }

    if (head === "shares") {
      if (method === "GET" && !id) {
        const planId = new URL(req.url ?? "/", "http://server").searchParams.get("plan");
        return json(res, 200, store.shares(me, planId ?? undefined).map(shareInfo));
      }
      if (method === "DELETE" && id) {
        store.removeShare(me, id);
        closeLost();
        return json(res, 200, { ok: true });
      }
    }

    if (head === "plans") {
      if (!id) {
        if (method === "GET")
          return json(
            res,
            200,
            store.plans(me).map((p) => ({ ...planInfo(p), preview: preview(p) })),
          );
        if (method === "POST") {
          const { name, data } = await input();
          const plan = store.createPlan(me, typeof name === "string" ? name : "", checkPlan(data));
          return json(res, 201, planInfo(plan));
        }
      }
      const plan = id ? store.plan(id) : undefined;
      if (!plan || !store.canSee(me, plan)) throw new StoreError(404, "The plan does not exist.");

      if (!sub) {
        if (method === "GET") {
          const current = plan.revisions.at(-1)!;
          return json(res, 200, { ...planInfo(plan), data: store.revisionData(plan, current.id) });
        }
        if (method === "PUT") {
          const value = await input();
          // The plan and the access can change while the request body arrives.
          const latest = store.plan(plan.id);
          if (!latest || !store.canSee(fresh(), latest))
            throw new StoreError(404, "The plan does not exist.");
          const revision = store.saveRevision(
            fresh(),
            latest,
            value.parent ?? null,
            checkPlan(value.data),
            value.name,
          );
          buildings.delete(plan.id);
          send(plan.id, "revision", { ...revision, name: latest.name, client });
          return json(res, 200, planInfo(latest));
        }
        if (method === "DELETE") {
          const parent = new URL(req.url ?? "/", "http://server").searchParams.get("parent");
          if (parent !== null && parent !== plan.revisions.at(-1)?.id)
            throw new StoreError(409, "The plan has a newer revision. Load it first.");
          store.removePlan(me, plan);
          previews.delete(plan.id);
          buildings.delete(plan.id);
          people.delete(plan.id);
          send(plan.id, "removed", {});
          for (const stream of streams.get(plan.id)?.keys() ?? []) stream.end();
          return json(res, 200, { ok: true });
        }
      }

      if (sub === "shares" && method === "POST") {
        const { record, token } = store.makeShare(me, plan, await body(req));
        return json(res, 201, { ...shareInfo(record), path: `/s/${token}` });
      }

      if (sub === "revisions" && method === "GET") {
        if (subId) return json(res, 200, { data: store.revisionData(plan, subId) });
        return json(
          res,
          200,
          plan.revisions.map(({ id, parent, time, by, size }) => ({ id, parent, time, by, size })),
        );
      }

      if (sub === "changes" && method === "POST") {
        if (!client) throw new StoreError(400, "The request needs the header X-Client.");
        const value = (await input()) as { parent?: string | null; patch?: unknown; name?: string };
        const latest = store.plan(plan.id);
        const now = fresh();
        if (!latest || !store.canSee(now, latest))
          throw new StoreError(404, "The plan does not exist.");
        if (!store.canWrite(now, latest)) throw new StoreError(403, "You can only view this plan.");
        const patch = value.patch as Patch | undefined;
        if (!patch || typeof patch !== "object" || typeof patch.t !== "string")
          throw new StoreError(400, "The request needs the changes as a patch.");
        // The patch names the objects by id, so it applies to the last revision also when other
        // people saved after its parent. Their changes stay, and the later change of a field wins.
        const parent = latest.revisions.at(-1)!.id;
        const before = latestBuilding(latest);
        let data: string;
        try {
          data = serializeBuilding(patchBuilding(before, patch));
        } catch {
          throw new StoreError(400, "The changes do not fit the plan.");
        }
        // The file is what counts: its reader corrects bad values, and the others get the change
        // that the file has, not the patch of the client.
        const building = parseBuilding(checkPlan(data));
        const applied = diffBuildings(before, building);
        if (!applied) return json(res, 200, planInfo(latest));
        const revision = store.saveRevision(now, latest, parent, data, value.name);
        buildings.set(latest.id, { revision: revision.id, building });
        send(plan.id, "revision", {
          id: revision.id,
          parent: revision.parent,
          time: revision.time,
          by: revision.by,
          size: revision.size,
          name: latest.name,
          client,
          base: value.parent ?? null,
          patch: applied,
        });
        return json(res, 200, planInfo(latest));
      }

      if (sub === "presence" && method === "POST") {
        if (!client) throw new StoreError(400, "The request needs the header X-Client.");
        const value = (await body(req)) as { name?: string; state?: unknown };
        if (JSON.stringify(value.state ?? null).length > MAX_PRESENCE)
          throw new StoreError(413, "The state is too large.");
        // Old entries go first, so that ids without a stream do not stay.
        present(plan.id);
        const set = people.get(plan.id) ?? new Map<string, Presence>();
        // Each tab id belongs to the session that first used it: the ids are not secret.
        if (set.get(client) && set.get(client)!.session !== me.session.id)
          throw new StoreError(403, "Another person uses this id.");
        people.set(plan.id, set);
        const name = typeof value.name === "string" ? value.name.trim().slice(0, 40) : "";
        const person: Presence = {
          client,
          session: me.session.id,
          name: name || store.nameOf(me, plan.id),
          write: store.canWrite(me, plan),
          state: value.state ?? null,
          seen: Date.now(),
        };
        set.set(client, person);
        send(plan.id, "presence", personInfo(person));
        return json(res, 200, { ok: true });
      }

      if (sub === "presence" && method === "DELETE") {
        if (client && people.get(plan.id)?.get(client)?.session === me.session.id)
          leave(plan.id, client);
        return json(res, 200, { ok: true });
      }

      if (sub === "events" && method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        const streamClient =
          new URL(req.url ?? "/", "http://server").searchParams.get("client") ?? "";
        res.write(
          `event: hello\ndata: ${JSON.stringify({
            revision: plan.revisions.at(-1)?.id ?? null,
            people: present(plan.id).map(personInfo),
          })}\n\n`,
        );
        const set = streams.get(plan.id) ?? new Map<ServerResponse, Stream>();
        set.set(res, { session: me.session.id, client: streamClient });
        streams.set(plan.id, set);
        const ping = setInterval(() => {
          if (!sees(me.session.id, plan.id)) return void res.end();
          res.write(": ping\n\n");
          present(plan.id);
        }, 25_000);
        req.on("close", () => {
          clearInterval(ping);
          set.delete(res);
          if (set.size === 0) streams.delete(plan.id);
          // The tab is gone. A tab that opened a new stream already stays.
          const again = [...set.values()].some((other) => other.client === streamClient);
          if (
            streamClient &&
            !again &&
            people.get(plan.id)?.get(streamClient)?.session === me.session.id
          )
            leave(plan.id, streamClient);
        });
        return;
      }
    }
    throw new StoreError(404, "The address does not exist.");

    /** The access after the body of the request: a link or the session can end meanwhile. */
    function fresh(): Access {
      const now = store.accessOf(me.session.id);
      if (!now) throw new StoreError(401, "Log in first.");
      return now;
    }

    async function input(): Promise<{ name?: string; data?: unknown; parent?: string | null }> {
      const value = await body(req);
      fresh();
      if (value.name !== undefined && typeof value.name !== "string")
        throw new StoreError(400, "The name must be text.");
      if (value.parent != null && typeof value.parent !== "string")
        throw new StoreError(400, "The parent must be a revision id.");
      return value as { name?: string; data?: unknown; parent?: string | null };
    }

    function planInfo(plan: PlanRecord) {
      const current = plan.revisions.at(-1)!;
      return {
        id: plan.id,
        name: plan.name,
        owner: store.ownerName(plan),
        revision: current.id,
        updated: current.time,
        by: current.by,
        write: store.canWrite(me, plan),
        share: store.canShare(me, plan),
        delete: store.canDelete(me, plan),
      };
    }
  }

  /** What the app knows about the session: the server, the account, and the shared plans. */
  function sessionInfo(access: Access | null) {
    const account = access?.account ?? null;
    return {
      api: API_VERSION,
      version: config.version,
      server: store.settings.name,
      account: account ? accountInfo(account) : null,
      grants: (access?.shares ?? []).map((s) => ({ planId: s.planId, write: s.write })),
    };
  }

  function accountInfo(a: AccountRecord) {
    const limits = store.limits(a);
    return {
      id: a.id,
      name: a.name,
      admin: a.admin,
      createPlans: a.admin || a.createPlans,
      seeAll: a.admin || a.seeAll,
      makeAccounts: a.admin || a.makeAccounts,
      quota: a.quota,
      maxPlans: a.maxPlans,
      limit: limits.quota,
      planLimit: limits.maxPlans,
      used: store.usage(a.id),
      plans: store.planCount(a.id),
      created: a.created,
    };
  }

  function linkInfo(l: LinkRecord) {
    return {
      id: l.id,
      kind: l.kind,
      account: l.account ? (store.account(l.account)?.name ?? "") : "",
      rights: l.rights,
      quota: l.quota,
      expires: l.expires,
      created: l.created,
    };
  }

  function shareInfo(s: ShareRecord) {
    return {
      id: s.id,
      planId: s.planId,
      planName: store.plan(s.planId)?.name ?? "",
      label: s.label,
      write: s.write,
      expires: s.expires,
      created: s.created,
    };
  }

  /** Reads the body of a request as JSON, up to `maxBody` bytes. */
  function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > config.maxBody) {
          chunks.length = 0;
          reject(new StoreError(413, "The plan is too large for this server."));
        } else chunks.push(chunk);
      });
      req.on("end", () => {
        try {
          const text = Buffer.concat(chunks).toString("utf8");
          const value: unknown = text ? JSON.parse(text) : {};
          if (value === null || typeof value !== "object" || Array.isArray(value)) {
            reject(new StoreError(400, "The body must be a JSON object."));
          } else resolve(value as Record<string, unknown>);
        } catch {
          reject(new StoreError(400, "The body is not JSON."));
        }
      });
      req.on("error", reject);
    });
  }
}

/** True if an origin has the host of the server. */
function sameHost(origin: string, host: string): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Checks that the data is a plan file that the app can read. */
function checkPlan(data: unknown): string {
  if (typeof data !== "string") throw new StoreError(400, "The request needs the plan as data.");
  try {
    parseBuilding(data);
  } catch (error) {
    throw new StoreError(400, (error as Error).message);
  }
  return data;
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

function notFound(res: ServerResponse, text = "Not found"): void {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

/** A new id for a client, for a test or a script. */
export const newClient = () => randomUUID();
