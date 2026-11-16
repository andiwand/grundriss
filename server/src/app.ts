// The HTTP handler of the server. Each address starts with a token: `/<token>/` is the app with
// the access of that token (mode "full"), and `/<token>/api/…` is its API. The API also takes
// `Authorization: Bearer <token>` at `/api/…`, for scripts. Each request outside a valid token
// gets 404, also `/`, so the server shows nothing to a scan. Only with GRUNDRISS_HOME_URL, `/`
// sends the browser to that website, and only with GRUNDRISS_APP_URL, `/app` to that app.

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { planPreview } from "../../src/export/preview";
import { parseBuilding, serializeBuilding } from "../../src/model/file";
import { patchBuilding, type Patch } from "../../src/model/patch";
import type { Building } from "../../src/model/types";
import { Store, StoreError, type PlanRecord, type TokenRecord } from "./store";

/** The version of the API. A change that old apps cannot use gives a new version. */
export const API_VERSION = 1;

/** The time of the edit lease without a renewal, in ms. */
export const LEASE_TIME = 60_000;

/** The time that a person stays in the list of a plan without a sign of life, in ms. */
export const PRESENCE_TIME = 60_000;

/** The largest state of a person: the cursor, the view, and the selection. */
const MAX_PRESENCE = 16_000;

export interface Config {
  mode: "full" | "api";
  /** The folder of the build of the app, for mode "full". */
  appDir: string;
  /** The origins that may call the API from a browser (CORS). */
  origins: string[];
  /**
   * The address of an app, or "". `/app` sends the browser to it, and in mode "api" also
   * `/<token>/`, with the address of the token.
   */
  appUrl: string;
  /** The address of a website that `/` sends the browser to, or "". */
  homeUrl: string;
  /**
   * The folder of the build of the website, or "". With it, the server serves the website at `/`
   * and the app at `/app/`, for everybody, next to the paths of the tokens.
   */
  siteDir: string;
  /** The largest body of a request, in bytes. */
  maxBody: number;
  version: string;
}

/** A person who has a plan open: the name, and the state that the app sends. */
interface Presence {
  client: string;
  token: TokenRecord;
  name: string;
  write: boolean;
  state: unknown;
  seen: number;
}

interface Lease {
  client: string;
  token: TokenRecord;
  holder: string;
  until: number;
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

/** The text of an error in the log: the tokens in a path are masked. */
export const maskPath = (path: string) => path.replace(/^\/[^/]+/, "/…");

export function createHandler(store: Store, config: Config) {
  const leases = new Map<string, Lease>();
  /** The open streams of the events of each plan. */
  const streams = new Map<string, Map<ServerResponse, TokenRecord>>();
  /** The people who have each plan open, by the id of their tab. */
  const people = new Map<string, Map<string, Presence>>();
  /** The building of the last revision of each plan, for the patches. */
  const buildings = new Map<string, { revision: string; building: Building }>();
  const origins = new Set(config.origins);
  if (config.appUrl) origins.add(new URL(config.appUrl).origin);

  const lease = (planId: string, now = Date.now()) => {
    const current = leases.get(planId);
    return current && current.until > now && store.active(current.token, now) ? current : null;
  };

  const send = (planId: string, event: string, data: unknown) => {
    for (const [res, token] of streams.get(planId) ?? []) {
      if (!store.active(token) && event !== "removed") {
        res.end();
        continue;
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
      if (now - p.seen > PRESENCE_TIME || !store.active(p.token, now)) leave(planId, p.client);
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
    const origin = req.headers.origin;
    if (origin && origins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      // Chrome asks before a public site calls a server in a local network.
      if (req.headers["access-control-request-private-network"]) {
        res.setHeader("Access-Control-Allow-Private-Network", "true");
      }
    }
    try {
      const url = new URL(req.url ?? "/", "http://server");
      const parts = url.pathname.split("/").filter(Boolean);
      // The token: the first part of the path, or the Bearer header for /api/…
      let secret = "";
      let rest: string[];
      const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "")?.[1];
      if (parts[0] === "api" && bearer) {
        secret = bearer;
        rest = parts;
      } else {
        secret = parts[0] ?? "";
        rest = parts.slice(1);
      }
      // With the settings, `/` sends the browser to the website, and `/app` to the app, without a
      // connection. This tells a scan that the server exists, so it happens only with them.
      const target =
        req.method !== "GET"
          ? ""
          : url.pathname === "/"
            ? config.homeUrl
            : url.pathname === "/app" || url.pathname === "/app/"
              ? config.appUrl
              : "";
      if (target) {
        res.writeHead(302, { Location: target });
        return void res.end();
      }
      // The public website and the app. A token is 22 random characters, so it is never the name
      // of a file of the website.
      if (config.siteDir && req.method === "GET") {
        if (url.pathname === "/app") {
          res.writeHead(301, { Location: "/app/" });
          return void res.end();
        }
        const [dir, path] = url.pathname.startsWith("/app/")
          ? [config.appDir, url.pathname.slice(5)]
          : [config.siteDir, url.pathname.slice(1)];
        if (findFile(dir, path || "index.html")) return serveFile(res, path || "index.html", dir);
      }
      const token = secret ? store.token(secret) : null;
      if (!token) return notFound(res);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return void res.end();
      }
      if (rest[0] === "api") return await api(req, res, token, rest.slice(1));

      // The app. A path without the slash after the token gets it, so that relative paths work.
      if (url.pathname === `/${secret}`) {
        res.writeHead(301, { Location: `/${secret}/` });
        return void res.end();
      }
      if (config.mode === "api") {
        if (!config.appUrl || rest.length > 0 || req.method !== "GET") return notFound(res);
        // The browser goes to the app, with the address of this token in the fragment.
        const host = req.headers["x-forwarded-host"] ?? req.headers.host;
        const proto = req.headers["x-forwarded-proto"] ?? "http";
        const here = `${proto}://${host}/${secret}`;
        res.writeHead(302, { Location: `${config.appUrl}#connect=${encodeURIComponent(here)}` });
        return void res.end();
      }
      return serveFile(res, rest.join("/") || "index.html");
    } catch (error) {
      if (error instanceof StoreError) return json(res, error.status, { error: error.message });
      console.error(maskPath(req.url ?? ""), error);
      return json(res, 500, { error: "The server has an error." });
    }
  };

  /** The file of a path in a folder, or the index.html of a folder, or null. */
  function findFile(dir: string, path: string): string | null {
    let file = normalize(join(dir, decodeURIComponent(path)));
    if (!file.startsWith(normalize(dir) + sep) || !existsSync(file)) return null;
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    return existsSync(file) ? file : null;
  }

  function serveFile(res: ServerResponse, path: string, dir = config.appDir): void {
    const file = findFile(dir, path);
    if (!file) return notFound(res);
    const type = TYPES[extname(file)] ?? "application/octet-stream";
    // The files of the build have a hash in their name, so they can stay in a cache.
    const cache = path.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cache });
    res.end(readFileSync(file));
  }

  async function api(
    req: IncomingMessage,
    res: ServerResponse,
    token: TokenRecord,
    path: string[],
  ): Promise<void> {
    res.setHeader("Cache-Control", "no-store");
    const method = req.method ?? "GET";
    const [head, id, sub, subId] = path;
    const client = String(req.headers["x-client"] ?? "");

    if (head === "me" && method === "GET") {
      return json(res, 200, {
        api: API_VERSION,
        version: config.version,
        server: store.settings.name,
        mode: config.mode,
        token: publicToken(token),
        live: true,
      });
    }

    if (head === "settings") {
      if (token.kind !== "root") throw new StoreError(403, "Only root can change the settings.");
      if (method === "PUT") store.saveSettings(await input());
      return json(res, 200, {
        ...store.settings,
        ...store.counts(),
        mode: config.mode,
        version: config.version,
        origins: [...origins],
        appUrl: config.appUrl,
        homeUrl: config.homeUrl,
        publicSite: config.siteDir !== "",
      });
    }

    if (head === "tokens") {
      if (method === "GET" && !id) {
        const planId = new URL(req.url ?? "/", "http://server").searchParams.get("plan");
        // A share link has the name of its plan, for the list of all links.
        return json(
          res,
          200,
          store.tokens(token, planId ?? undefined).map((t) => ({
            ...publicToken(t),
            planName: t.planId ? (store.plan(t.planId)?.name ?? null) : null,
          })),
        );
      }
      if (method === "POST" && !id) {
        const { record, token: secret } = store.makeToken(token, (await input()) as never);
        return json(res, 201, { ...publicToken(record), token: secret });
      }
      if (method === "DELETE" && id) {
        store.removeToken(token, id);
        for (const set of streams.values()) {
          for (const [stream, access] of set) if (!store.active(access)) stream.end();
        }
        for (const [planId, held] of leases) {
          if (!store.active(held.token)) {
            leases.delete(planId);
            send(planId, "lease", null);
          }
        }
        return json(res, 200, { ok: true });
      }
    }

    if (head === "plans") {
      if (!id) {
        if (method === "GET")
          return json(
            res,
            200,
            store.plans(token).map((p) => ({ ...planInfo(p), preview: preview(p) })),
          );
        if (method === "POST") {
          const { name, data } = await input();
          const plan = store.createPlan(token, name ?? "", checkPlan(data));
          return json(res, 201, planInfo(plan));
        }
      }
      const plan = id ? store.plan(id) : undefined;
      if (!plan || !store.canSee(token, plan))
        throw new StoreError(404, "The plan does not exist.");

      if (!sub) {
        if (method === "GET") {
          const current = plan.revisions.at(-1)!;
          return json(res, 200, { ...planInfo(plan), data: store.revisionData(plan, current.id) });
        }
        if (method === "PUT") {
          const value = await input();
          // The plan, access, and lease can change while the request body arrives.
          const latest = store.plan(plan.id);
          if (!latest || !store.canSee(token, latest))
            throw new StoreError(404, "The plan does not exist.");
          const held = lease(plan.id);
          if (held && (held.client !== client || held.token.id !== token.id)) {
            throw new StoreError(423, `${held.holder} edits the plan.`);
          }
          const revision = store.saveRevision(
            token,
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
          if (parent !== null) {
            if (parent !== plan.revisions.at(-1)?.id)
              throw new StoreError(409, "The plan has a newer revision. Load it first.");
            const held = lease(plan.id);
            if (held && (held.client !== client || held.token.id !== token.id))
              throw new StoreError(423, `${held.holder} edits the plan.`);
          }
          store.removePlan(token, plan);
          previews.delete(plan.id);
          buildings.delete(plan.id);
          people.delete(plan.id);
          send(plan.id, "removed", {});
          for (const stream of streams.get(plan.id)?.keys() ?? []) stream.end();
          leases.delete(plan.id);
          return json(res, 200, { ok: true });
        }
      }

      if (sub === "revisions" && method === "GET") {
        if (subId) return json(res, 200, { data: store.revisionData(plan, subId) });
        return json(res, 200, plan.revisions);
      }

      if (sub === "changes" && method === "POST") {
        if (!client) throw new StoreError(400, "The request needs the header X-Client.");
        const value = (await input()) as { parent?: string | null; patch?: unknown; name?: string };
        const latest = store.plan(plan.id);
        if (!latest || !store.canSee(token, latest))
          throw new StoreError(404, "The plan does not exist.");
        if (!store.canWrite(token, latest)) throw new StoreError(403, "This token only reads.");
        const patch = value.patch as Patch | undefined;
        if (!patch || typeof patch !== "object" || typeof patch.t !== "string")
          throw new StoreError(400, "The request needs the changes as a patch.");
        // The patch names the objects by id, so it applies to the last revision also when other
        // people saved after its parent. Their changes stay, and the later change of a field wins.
        const parent = latest.revisions.at(-1)!.id;
        let building: Building;
        let data: string;
        try {
          building = patchBuilding(latestBuilding(latest), patch);
          data = serializeBuilding(building);
        } catch {
          throw new StoreError(400, "The changes do not fit the plan.");
        }
        const revision = store.saveRevision(token, latest, parent, checkPlan(data), value.name);
        buildings.set(latest.id, { revision: revision.id, building });
        send(plan.id, "revision", {
          ...revision,
          name: latest.name,
          client,
          base: value.parent ?? null,
          patch,
        });
        return json(res, 200, planInfo(latest));
      }

      if (sub === "presence" && method === "POST") {
        if (!client) throw new StoreError(400, "The request needs the header X-Client.");
        const value = (await input()) as { name?: string; state?: unknown };
        if (JSON.stringify(value.state ?? null).length > MAX_PRESENCE)
          throw new StoreError(413, "The state is too large.");
        const set = people.get(plan.id) ?? new Map<string, Presence>();
        people.set(plan.id, set);
        const name = typeof value.name === "string" ? value.name.trim().slice(0, 40) : "";
        const person: Presence = {
          client,
          token,
          name: name || token.label,
          write: store.canWrite(token, plan),
          state: value.state ?? null,
          seen: Date.now(),
        };
        set.set(client, person);
        send(plan.id, "presence", personInfo(person));
        return json(res, 200, { ok: true });
      }

      if (sub === "presence" && method === "DELETE") {
        if (client && people.get(plan.id)?.get(client)?.token.id === token.id)
          leave(plan.id, client);
        return json(res, 200, { ok: true });
      }

      if (sub === "lease") {
        if (!client) throw new StoreError(400, "The request needs the header X-Client.");
        if (!store.canWrite(token, plan)) throw new StoreError(403, "This token only reads.");
        if (method === "POST") {
          const held = lease(plan.id);
          if (held && (held.client !== client || held.token.id !== token.id)) {
            return json(res, 423, {
              error: `${held.holder} edits the plan.`,
              lease: { holder: held.holder, until: held.until },
            });
          }
          const next = { client, token, holder: token.label, until: Date.now() + LEASE_TIME };
          leases.set(plan.id, next);
          if (!held) send(plan.id, "lease", { holder: next.holder, client, until: next.until });
          return json(res, 200, { holder: next.holder, until: next.until });
        }
        if (method === "DELETE") {
          const held = lease(plan.id);
          if (held?.client === client && held.token.id === token.id) {
            leases.delete(plan.id);
            send(plan.id, "lease", null);
          }
          return json(res, 200, { ok: true });
        }
      }

      if (sub === "events" && method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        const held = lease(plan.id);
        const streamClient = new URL(req.url ?? "/", "http://server").searchParams.get("client");
        res.write(
          `event: hello\ndata: ${JSON.stringify({
            revision: plan.revisions.at(-1)?.id ?? null,
            lease: held ? { holder: held.holder, client: held.client, until: held.until } : null,
            people: present(plan.id).map(personInfo),
          })}\n\n`,
        );
        const set = streams.get(plan.id) ?? new Map();
        set.set(res, token);
        streams.set(plan.id, set);
        const ping = setInterval(() => {
          if (!store.active(token)) return void res.end();
          res.write(": ping\n\n");
          if (leases.has(plan.id) && !lease(plan.id)) {
            leases.delete(plan.id);
            send(plan.id, "lease", null);
          }
          present(plan.id);
        }, 25_000);
        req.on("close", () => {
          clearInterval(ping);
          set.delete(res);
          if (set.size === 0) streams.delete(plan.id);
          // The tab is gone, or it opens a new stream at once, which sends its state again.
          if (streamClient && people.get(plan.id)?.get(streamClient)?.token.id === token.id)
            leave(plan.id, streamClient);
        });
        return;
      }
    }
    throw new StoreError(404, "The address does not exist.");

    async function input(): Promise<{ name?: string; data?: unknown; parent?: string | null }> {
      const value = await body(req);
      if (!store.active(token)) throw new StoreError(404, "The token does not exist.");
      if (value.name !== undefined && typeof value.name !== "string")
        throw new StoreError(400, "The name must be text.");
      if (value.parent != null && typeof value.parent !== "string")
        throw new StoreError(400, "The parent must be a revision id.");
      return value as { name?: string; data?: unknown; parent?: string | null };
    }

    function planInfo(plan: PlanRecord) {
      const current = plan.revisions.at(-1)!;
      const held = lease(plan.id);
      return {
        id: plan.id,
        name: plan.name,
        owner: store.ownerLabel(plan),
        revision: current.id,
        updated: current.time,
        by: current.by,
        write: store.canWrite(token, plan),
        lease: held ? { holder: held.holder, until: held.until } : null,
      };
    }
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

/** The part of a token that the API shows: never its hash. */
function publicToken(t: TokenRecord) {
  return {
    id: t.id,
    kind: t.kind,
    label: t.label,
    planId: t.planId,
    write: t.write,
    createPlans: t.createPlans,
    seeAll: t.seeAll,
    makeUsers: t.makeUsers,
    expires: t.expires,
    created: t.created,
  };
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

/** A new id for a client, for a test or a script. */
export const newClient = () => randomUUID();
