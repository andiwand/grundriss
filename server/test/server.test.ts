import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyBuilding } from "../../src/model/building";
import { serializeBuilding } from "../../src/model/file";
import { makeHouse } from "../../src/model/example";
import { COOKIE, createHandler, type Config } from "../src/app";
import { Store, type StoreOptions } from "../src/store";

let dir: string;
let server: Server;
let base: string;
let store: Store;
let admin: Browser;

const PASSWORD = "correct horse";

const plan = (name = "Ground floor") => {
  const building = emptyBuilding();
  building.stories[0].name = name;
  return serializeBuilding(building);
};

/** A browser with its cookie of the session. */
class Browser {
  cookie = "";

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(this.cookie ? { Cookie: this.cookie } : {}), ...(init.headers ?? {}) },
      redirect: "manual",
    });
    const set = response.headers.get("set-cookie");
    if (set) {
      const value = set.split(";")[0];
      this.cookie = value.endsWith("=") ? "" : value;
    }
    return response;
  }

  /** A call of the API, as JSON. */
  async call(path: string, init: RequestInit & { json?: unknown } = {}) {
    const response = await this.fetch(`/api/${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      body: init.json === undefined ? init.body : JSON.stringify(init.json),
    });
    const text = await response.text();
    const type = response.headers.get("content-type") ?? "";
    return { status: response.status, body: type.includes("json") ? JSON.parse(text) : text };
  }
}

async function start(config: Partial<Config> = {}, options: Partial<StoreOptions> = {}) {
  dir = mkdtempSync(join(tmpdir(), "grundriss-"));
  const appDir = join(dir, "app");
  mkdirSync(appDir);
  writeFileSync(join(appDir, "index.html"), "<!doctype html><title>Grundriss</title>");
  store = new Store(join(dir, "data"), options);
  const handler = createHandler(store, {
    appDir,
    siteDir: "",
    maxBody: 10 * 1024 * 1024,
    version: "test",
    ...config,
  });
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((done) => server.listen(0, done));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
  admin = new Browser();
  const setup = await admin.call(`links/${store.setupLink()}`, {
    method: "POST",
    json: { name: "Admin", password: PASSWORD },
  });
  expect(setup.status).toBe(200);
}

function stop() {
  server.closeAllConnections();
  server.close();
  rmSync(dir, { recursive: true, force: true });
}

beforeEach(() => start());
afterEach(stop);

/** A new account with the rights, logged in. */
async function account(name: string, rights: Record<string, unknown> = {}): Promise<Browser> {
  const { body } = await admin.call("invites", { method: "POST", json: rights });
  const browser = new Browser();
  const code = (body.path as string).split("/").pop();
  const made = await browser.call(`links/${code}`, {
    method: "POST",
    json: { name, password: PASSWORD },
  });
  expect(made.status).toBe(200);
  return browser;
}

/** A share link of a plan, and a new browser that opened it. */
async function shared(planId: string, write = false) {
  const { body: link } = await admin.call(`plans/${planId}/shares`, {
    method: "POST",
    json: { label: write ? "Writer" : "Reader", write },
  });
  const browser = new Browser();
  const opened = await browser.fetch(link.path);
  expect(opened.status).toBe(302);
  return { link, browser };
}

describe("the paths of the server", () => {
  it("serves the app at /app/, and sends / to it without the website", async () => {
    const page = await admin.fetch("/app/");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Grundriss");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect((await admin.fetch("/app")).headers.get("location")).toBe("/app/");
    expect((await admin.fetch("/")).headers.get("location")).toBe("/app/");
    for (const path of ["/nothing", "/app/nothing.js", "/app/../data/data.yaml", "/s/nothing"]) {
      expect((await admin.fetch(path)).status).toBe(404);
    }
  });

  it("serves the website at / and the app at /app/", async () => {
    stop();
    const site = mkdtempSync(join(tmpdir(), "grundriss-site-"));
    writeFileSync(join(site, "index.html"), "<!doctype html><title>Website</title>");
    mkdirSync(join(site, "de"));
    writeFileSync(join(site, "de", "index.html"), "<!doctype html><title>Webseite</title>");
    await start({ siteDir: site });
    expect(await (await admin.fetch("/")).text()).toContain("Website");
    expect(await (await admin.fetch("/de/")).text()).toContain("Webseite");
    expect(await (await admin.fetch("/app/")).text()).toContain("Grundriss");
    expect((await admin.fetch("/nothing")).status).toBe(404);
    expect((await admin.fetch("/../data/data.yaml")).status).toBe(404);
    rmSync(site, { recursive: true, force: true });
  });

  it("sends a link for one use on to the app, with its code in the fragment", async () => {
    for (const kind of ["setup", "invite", "reset"]) {
      const response = await admin.fetch(`/${kind}/abc`);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(`/app/#${kind}=abc`);
    }
  });

  it("refuses a change that comes from another site", async () => {
    const other = await admin.call("plans", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      json: { data: plan() },
    });
    expect(other.status).toBe(403);
    const own = await admin.call("plans", {
      method: "POST",
      headers: { Origin: base },
      json: { data: plan() },
    });
    expect(own.status).toBe(201);
  });
});

describe("accounts", () => {
  it("sets up the admin once, with an httpOnly cookie", async () => {
    const session = await admin.call("session");
    expect(session.body).toMatchObject({
      api: 2,
      account: { name: "Admin", admin: true, createPlans: true },
    });
    // The admin exists, so a setup link does not work any more.
    expect(store.setupLink()).toBeNull();
    const fresh = await fetch(`${base}/api/links/${"x".repeat(22)}`);
    expect(fresh.status).toBe(404);
    const login = await new Browser().fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "admin", password: PASSWORD }),
    });
    const cookie = login.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("logs in with the name and the password, and out again", async () => {
    await account("Anna");
    const browser = new Browser();
    expect((await browser.call("plans")).status).toBe(401);
    const wrong = await browser.call("login", {
      method: "POST",
      json: { name: "Anna", password: "wrong password" },
    });
    expect(wrong.status).toBe(401);
    const right = await browser.call("login", {
      method: "POST",
      json: { name: "anna", password: PASSWORD },
    });
    expect(right.body.account.name).toBe("Anna");
    expect((await browser.call("plans")).status).toBe(200);
    const session = browser.cookie;
    await browser.call("logout", { method: "POST" });
    expect(browser.cookie).toBe("");
    // The old cookie does not work any more either.
    browser.cookie = session;
    expect((await browser.call("plans")).status).toBe(401);
  });

  it("stops the logins of a name after too many wrong passwords", async () => {
    await account("Anna");
    const browser = new Browser();
    const login = (password: string) =>
      browser.call("login", { method: "POST", json: { name: "Anna", password } });
    for (let i = 0; i < 10; i++) expect((await login("wrong password")).status).toBe(401);
    expect((await login(PASSWORD)).status).toBe(429);
  });

  it("makes an account with an invite link, which works once", async () => {
    const { body } = await admin.call("invites", {
      method: "POST",
      json: { createPlans: false, seeAll: true },
    });
    expect(body.path).toMatch(/^\/invite\//);
    const code = body.path.split("/").pop();
    const anna = new Browser();
    expect((await anna.call(`links/${code}`)).body.kind).toBe("invite");
    const short = await anna.call(`links/${code}`, {
      method: "POST",
      json: { name: "Anna", password: "short" },
    });
    expect(short.status).toBe(400);
    const taken = await anna.call(`links/${code}`, {
      method: "POST",
      json: { name: "admin", password: PASSWORD },
    });
    expect(taken.status).toBe(409);
    const made = await anna.call(`links/${code}`, {
      method: "POST",
      json: { name: "Anna", password: PASSWORD },
    });
    expect(made.body.account).toMatchObject({ name: "Anna", createPlans: false, seeAll: true });
    const again = await new Browser().call(`links/${code}`, {
      method: "POST",
      json: { name: "Ben", password: PASSWORD },
    });
    expect(again.status).toBe(404);
  });

  it("gives an invited account at most the rights of the account that invites", async () => {
    const lead = await account("Lead", { makeAccounts: true, createPlans: true });
    const { body } = await lead.call("invites", {
      method: "POST",
      json: { seeAll: true, makeAccounts: true, quota: 0 },
    });
    const code = body.path.split("/").pop();
    const staff = new Browser();
    const made = await staff.call(`links/${code}`, {
      method: "POST",
      json: { name: "Staff", password: PASSWORD },
    });
    expect(made.body.account).toMatchObject({ seeAll: false, makeAccounts: true, quota: null });
    // Only the admin sees the accounts.
    expect((await lead.call("accounts")).status).toBe(403);
    expect((await admin.call("accounts")).body.map((a: { name: string }) => a.name)).toEqual([
      "Admin",
      "Lead",
      "Staff",
    ]);
  });

  it("sets a new password with a reset link of the admin, and ends the old sessions", async () => {
    const anna = await account("Anna");
    const id = (await anna.call("session")).body.account.id;
    const { body } = await admin.call(`accounts/${id}/reset`, { method: "POST" });
    const code = body.path.split("/").pop();
    const browser = new Browser();
    expect((await browser.call(`links/${code}`)).body).toMatchObject({
      kind: "reset",
      name: "Anna",
    });
    const reset = await browser.call(`links/${code}`, {
      method: "POST",
      json: { password: "a new password" },
    });
    expect(reset.body.account.name).toBe("Anna");
    expect((await anna.call("plans")).status).toBe(401);
    const login = await new Browser().call("login", {
      method: "POST",
      json: { name: "Anna", password: "a new password" },
    });
    expect(login.status).toBe(200);
  });

  it("changes the own password with the old one", async () => {
    const anna = await account("Anna");
    const wrong = await anna.call("password", {
      method: "POST",
      json: { old: "wrong password", password: "a new password" },
    });
    expect(wrong.status).toBe(403);
    const right = await anna.call("password", {
      method: "POST",
      json: { old: PASSWORD, password: "a new password" },
    });
    expect(right.status).toBe(200);
    // This session stays.
    expect((await anna.call("plans")).status).toBe(200);
  });

  it("gives the plans of a removed account to the admin who removes it", async () => {
    const anna = await account("Anna");
    const id = (await anna.call("session")).body.account.id;
    await anna.call("plans", { method: "POST", json: { name: "Anna's", data: plan() } });
    expect((await admin.call(`accounts/${id}`, { method: "DELETE" })).status).toBe(200);
    expect((await anna.call("plans")).status).toBe(401);
    const [listed] = (await admin.call("plans")).body;
    expect(listed).toMatchObject({ name: "Anna's", owner: "Admin" });
    expect(
      (
        await admin.call(`accounts/${(await admin.call("session")).body.account.id}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(400);
  });

  it("lets only the admin change the settings", async () => {
    const anna = await account("Anna");
    expect((await anna.call("settings", { method: "PUT", json: { name: "X" } })).status).toBe(403);
    const saved = await admin.call("settings", { method: "PUT", json: { name: "Home" } });
    expect(saved.body).toMatchObject({ name: "Home", accounts: 2 });
    expect((await anna.call("session")).body.server).toBe("Home");
  });
});

describe("plans and revisions", () => {
  it("shows the plans of an account only to it, to the admin, and to who sees all", async () => {
    const anna = await account("Anna");
    const ben = await account("Ben");
    const all = await account("All", { seeAll: true });
    await anna.call("plans", { method: "POST", json: { name: "Anna's", data: plan() } });
    expect((await anna.call("plans")).body).toHaveLength(1);
    expect((await ben.call("plans")).body).toHaveLength(0);
    expect((await all.call("plans")).body[0]).toMatchObject({ write: true, delete: false });
    expect((await admin.call("plans")).body[0]).toMatchObject({ owner: "Anna", delete: true });
  });

  it("does not delete a newer revision after a copy was downloaded", async () => {
    const { body: house } = await admin.call("plans", { method: "POST", json: { data: plan() } });
    await admin.call(`plans/${house.id}`, {
      method: "PUT",
      json: { parent: "1", data: plan("New") },
    });
    expect((await admin.call(`plans/${house.id}?parent=1`, { method: "DELETE" })).status).toBe(409);
    expect((await admin.call(`plans/${house.id}`)).body.revision).toBe("2");
    expect((await admin.call(`plans/${house.id}?parent=2`, { method: "DELETE" })).status).toBe(200);
  });

  it("rejects an oversized body with HTTP 413 instead of resetting the connection", async () => {
    const response = await admin.call("plans", {
      method: "POST",
      body: "x".repeat(10 * 1024 * 1024 + 1),
    });
    expect(response.status).toBe(413);
  });

  it("rechecks the access after receiving a slow request body", async () => {
    const anna = await account("Anna");
    const id = (await anna.call("session")).body.account.id;
    const payload = JSON.stringify({ data: plan() });
    let finish!: () => void;
    const answer = new Promise<number>((resolve, reject) => {
      const req = request(
        `${base}/api/plans`,
        {
          method: "POST",
          headers: { "Content-Length": Buffer.byteLength(payload), Cookie: anna.cookie },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      );
      req.on("error", reject);
      req.write(payload.slice(0, 1));
      finish = () => req.end(payload.slice(1));
    });
    await admin.call(`accounts/${id}`, { method: "DELETE" });
    finish();
    expect(await answer).toBe(401);
    expect((await admin.call("plans")).body).toHaveLength(0);
  });

  it("rejects non-object bodies and invalid names with a client error", async () => {
    for (const json of [null, [], 42, { data: plan(), name: 42 }]) {
      expect((await admin.call("plans", { method: "POST", json })).status).toBe(400);
    }
  });

  it("saves a revision only on top of the current one", async () => {
    const created = await admin.call("plans", {
      method: "POST",
      json: { name: "House", data: plan() },
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(created.body.revision).toBe("1");
    const saved = await admin.call(`plans/${id}`, {
      method: "PUT",
      json: { parent: "1", data: plan("First") },
    });
    expect(saved.body.revision).toBe("2");
    // A save on top of revision 1 comes too late.
    const late = await admin.call(`plans/${id}`, {
      method: "PUT",
      json: { parent: "1", data: plan("Second") },
    });
    expect(late.status).toBe(409);
    const revisions = await admin.call(`plans/${id}/revisions`);
    expect(revisions.body.map((r: { id: string; by: string }) => [r.id, r.by])).toEqual([
      ["1", "Admin"],
      ["2", "Admin"],
    ]);
    const old = await admin.call(`plans/${id}/revisions/1`);
    expect(JSON.parse(old.body.data).stories[0].name).toBe("Ground floor");
  });

  it("lists each plan with a picture of its ground floor, also after a save", async () => {
    const empty = await admin.call("plans", { method: "POST", json: { name: "x", data: plan() } });
    expect((await admin.call("plans")).body[0].preview).toBe("");
    const house = serializeBuilding(makeHouse());
    await admin.call(`plans/${empty.body.id}`, {
      method: "PUT",
      json: { parent: "1", data: house },
    });
    const [listed] = (await admin.call("plans")).body;
    expect(listed.preview).toMatch(/^<svg/);
    // The plan itself has no picture, because only the list shows it.
    expect((await admin.call(`plans/${empty.body.id}`)).body.preview).toBeUndefined();
  });

  it("refuses data that is not a plan", async () => {
    const response = await admin.call("plans", {
      method: "POST",
      json: { name: "x", data: "{}" },
    });
    expect(response.status).toBe(400);
  });
});

describe("the limits of an account", () => {
  it("refuses a plan over the space or the number of plans of the account", async () => {
    stop();
    await start({}, { quota: 5000, maxPlans: 2 });
    const anna = await account("Anna");
    const first = await anna.call("plans", { method: "POST", json: { data: plan() } });
    expect(first.status).toBe(201);
    // The plan of another person counts for the owner.
    const big = emptyBuilding();
    big.stories[0].name = "x".repeat(6000);
    const save = await admin.call(`plans/${first.body.id}`, {
      method: "PUT",
      json: { parent: "1", data: serializeBuilding(big) },
    });
    expect(save.status).toBe(413);
    expect((await anna.call(`plans/${first.body.id}`)).body.revision).toBe("1");
    expect((await anna.call("plans", { method: "POST", json: { data: plan() } })).status).toBe(201);
    const third = await anna.call("plans", { method: "POST", json: { data: plan() } });
    expect(third.status).toBe(413);
    const { body: me } = await anna.call("session");
    expect(me.account).toMatchObject({ plans: 2, planLimit: 2, limit: 5000 });
    expect(me.account.used).toBeGreaterThan(0);
  });

  it("lets the admin change the limits of an account", async () => {
    stop();
    await start({}, { maxPlans: 1 });
    const anna = await account("Anna");
    const id = (await anna.call("session")).body.account.id;
    await anna.call("plans", { method: "POST", json: { data: plan() } });
    expect((await anna.call("plans", { method: "POST", json: { data: plan() } })).status).toBe(413);
    const changed = await admin.call(`accounts/${id}`, {
      method: "PUT",
      json: { maxPlans: 0, seeAll: true },
    });
    expect(changed.body).toMatchObject({ maxPlans: 0, planLimit: 0, seeAll: true });
    expect((await anna.call("plans", { method: "POST", json: { data: plan() } })).status).toBe(201);
  });
});

describe("share links", () => {
  it("opens a plan without an account, only to view", async () => {
    const { body: house } = await admin.call("plans", { method: "POST", json: { data: plan() } });
    await admin.call("plans", { method: "POST", json: { name: "Other", data: plan() } });
    const { link, browser } = await shared(house.id);
    expect(link.path).toMatch(/^\/s\//);
    // The link went on to the plan; the token is not in that address.
    const session = await browser.call("session");
    expect(session.body).toMatchObject({ account: null, grants: [{ planId: house.id }] });
    const plans = (await browser.call("plans")).body;
    expect(plans.map((p: { id: string }) => p.id)).toEqual([house.id]);
    expect(plans[0]).toMatchObject({ write: false, share: false, delete: false });
    const change = await browser.call(`plans/${house.id}/changes`, {
      method: "POST",
      headers: { "X-Client": "x" },
      json: { parent: "1", patch: { t: "keys", keys: { north: { t: "set", v: 10 } } } },
    });
    expect(change.status).toBe(403);
    expect(
      (await browser.call(`plans/${house.id}/shares`, { method: "POST", json: { label: "x" } }))
        .status,
    ).toBe(403);
    expect((await browser.call("plans", { method: "POST", json: { data: plan() } })).status).toBe(
      403,
    );
  });

  it("names the person of a link that can edit by its label", async () => {
    const { body: house } = await admin.call("plans", { method: "POST", json: { data: plan() } });
    const { browser } = await shared(house.id, true);
    const change = await browser.call(`plans/${house.id}/changes`, {
      method: "POST",
      headers: { "X-Client": "x" },
      json: { parent: "1", patch: { t: "keys", keys: { north: { t: "set", v: 10 } } } },
    });
    expect(change.body).toMatchObject({ revision: "2", by: "Writer" });
  });

  it("adds the plan of a link to an account, and keeps it after a new login", async () => {
    const { body: house } = await admin.call("plans", { method: "POST", json: { data: plan() } });
    const anna = await account("Anna");
    const { body: link } = await admin.call(`plans/${house.id}/shares`, {
      method: "POST",
      json: { label: "Anna", write: true },
    });
    await anna.fetch(link.path);
    expect((await anna.call("plans")).body.map((p: { id: string }) => p.id)).toEqual([house.id]);
    // A login of the same browser keeps the grants of its session.
    const guest = new Browser();
    await guest.fetch(link.path);
    await guest.call("login", { method: "POST", json: { name: "Anna", password: PASSWORD } });
    expect((await guest.call("session")).body).toMatchObject({
      account: { name: "Anna" },
      grants: [{ planId: house.id, write: true }],
    });
  });

  it("ends the access and the stream of a link when its owner removes it", async () => {
    const { body: house } = await admin.call("plans", { method: "POST", json: { data: plan() } });
    const { link, browser } = await shared(house.id);
    expect((await admin.call(`shares?plan=${house.id}`)).body).toHaveLength(1);
    const abort = new AbortController();
    const response = await browser.fetch(`/api/plans/${house.id}/events`, {
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    await reader.read();
    await admin.call(`shares/${link.id}`, { method: "DELETE" });
    try {
      expect((await reader.read()).done).toBe(true);
    } finally {
      abort.abort();
    }
    expect((await browser.call(`plans/${house.id}`)).status).toBe(404);
    expect((await browser.fetch(link.path)).status).toBe(404);
  });

  it("ends the links of a plan with the plan", async () => {
    const { body: house } = await admin.call("plans", { method: "POST", json: { data: plan() } });
    const { link } = await shared(house.id);
    await admin.call(`plans/${house.id}`, { method: "DELETE" });
    expect((await new Browser().fetch(link.path)).status).toBe(404);
  });
});

describe("live editing", () => {
  /** Reads the events of a stream until `stop` gives true for one of them. */
  async function events(browser: Browser, planId: string, client: string) {
    const abort = new AbortController();
    const response = await browser.fetch(`/api/plans/${planId}/events?client=${client}`, {
      signal: abort.signal,
    });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const seen: { event: string; data: Record<string, unknown> }[] = [];
    const next = async (stop: (e: { event: string; data: Record<string, unknown> }) => boolean) => {
      for (;;) {
        const found = seen.find(stop);
        if (found) return found;
        const { value, done } = await reader.read();
        if (done) throw new Error("The stream ended.");
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (event && data) seen.push({ event, data: JSON.parse(data) });
        }
      }
    };
    return { next, close: () => abort.abort() };
  }

  it("merges the changes of two people and sends each change to the others", async () => {
    const start = emptyBuilding();
    const story = start.stories[0];
    const { body: house } = await admin.call("plans", {
      method: "POST",
      json: { name: "House", data: serializeBuilding(start) },
    });
    const watcher = await events(admin, house.id, "watcher");
    await watcher.next((e) => e.event === "hello");
    const vertex = (id: string, x: number) => ({
      t: "keys",
      keys: {
        stories: {
          t: "items",
          items: {
            [story.id]: {
              t: "keys",
              keys: { vertices: { t: "items", items: {}, add: [{ id, x, y: 0 }] } },
            },
          },
        },
      },
    });
    // Both start from revision 1; the second change applies on top of the first.
    for (const [client, id] of [
      ["a", "v-a"],
      ["b", "v-b"],
    ]) {
      const sent = await admin.call(`plans/${house.id}/changes`, {
        method: "POST",
        headers: { "X-Client": client },
        json: { parent: "1", patch: vertex(id, 1) },
      });
      expect(sent.status).toBe(200);
    }
    const saved = await admin.call(`plans/${house.id}`);
    expect(saved.body.revision).toBe("3");
    const ids = JSON.parse(saved.body.data).stories[0].vertices.map((v: { id: string }) => v.id);
    expect(ids).toEqual(["v-a", "v-b"]);
    const second = await watcher.next((e) => e.event === "revision" && e.data.id === "3");
    expect(second.data).toMatchObject({ parent: "2", client: "b", base: "1" });
    expect(second.data.patch).toEqual(vertex("v-b", 1));
    watcher.close();
  });

  it("refuses changes that do not fit", async () => {
    const { body: house } = await admin.call("plans", { method: "POST", json: { data: plan() } });
    const change = (body: unknown) =>
      admin.call(`plans/${house.id}/changes`, {
        method: "POST",
        headers: { "X-Client": "x" },
        json: { parent: "1", patch: body },
      });
    expect((await change({ t: "keys", keys: { stories: { t: "set", v: [] } } })).status).toBe(400);
    expect((await change("nothing")).status).toBe(400);
    expect((await change({ t: "keys", keys: { north: { t: "set", v: 10 } } })).status).toBe(200);
  });

  it("sends the change that the file has, and saves no revision without a change", async () => {
    const { body: house } = await admin.call("plans", { method: "POST", json: { data: plan() } });
    const watcher = await events(admin, house.id, "watcher");
    await watcher.next((e) => e.event === "hello");
    const change = (patch: unknown) =>
      admin.call(`plans/${house.id}/changes`, {
        method: "POST",
        headers: { "X-Client": "a" },
        json: { parent: "1", patch },
      });
    // The reader of the file replaces a bad value; the others get the value of the file.
    expect((await change({ t: "keys", keys: { north: { t: "set", v: "x" } } })).status).toBe(200);
    expect((await change({ t: "keys", keys: { north: { t: "set", v: 0 } } })).body.revision).toBe(
      "1",
    );
    const sent = await change({ t: "keys", keys: { north: { t: "set", v: 30 } } });
    expect(sent.body.revision).toBe("2");
    const seen = await watcher.next((e) => e.event === "revision");
    expect(seen.data.patch).toEqual({ t: "keys", keys: { north: { t: "set", v: 30 } } });
    watcher.close();
  });

  it("keeps the presence of a tab to the session that has it", async () => {
    const { body: house } = await admin.call("plans", { method: "POST", json: { data: plan() } });
    const { browser } = await shared(house.id);
    const post = (who: Browser, name: string) =>
      who.call(`plans/${house.id}/presence`, {
        method: "POST",
        headers: { "X-Client": "anna" },
        json: { name, state: null },
      });
    expect((await post(admin, "Anna")).status).toBe(200);
    expect((await post(browser, "Not Anna")).status).toBe(403);
  });

  it("shows who has the plan open, also to readers, until the tab goes", async () => {
    const { body: house } = await admin.call("plans", { method: "POST", json: { data: plan() } });
    const { browser } = await shared(house.id);
    const reader = await events(browser, house.id, "reader");
    await reader.next((e) => e.event === "hello");
    const editor = await events(admin, house.id, "editor");
    await editor.next((e) => e.event === "hello");
    const state = { story: "s1", cursor: { x: 1, y: 2 } };
    const sent = await admin.call(`plans/${house.id}/presence`, {
      method: "POST",
      headers: { "X-Client": "editor" },
      json: { name: "Anna", state },
    });
    expect(sent.status).toBe(200);
    const seen = await reader.next((e) => e.event === "presence");
    expect(seen.data).toEqual({ client: "editor", name: "Anna", write: true, state });
    // A new stream gets the people in its hello.
    const late = await events(browser, house.id, "late");
    const hello = await late.next((e) => e.event === "hello");
    expect(hello.data.people).toEqual([{ client: "editor", name: "Anna", write: true, state }]);
    late.close();
    // The tab of the editor closes its stream: the others see that it left.
    editor.close();
    const gone = await reader.next((e) => e.event === "presence" && e.data.gone === true);
    expect(gone.data.client).toBe("editor");
    reader.close();
  });
});

describe("the store of the images", () => {
  it("keeps an image of many revisions once, and gives the full plan back", async () => {
    const building = emptyBuilding();
    building.stories[0].background = {
      image: `data:image/png;base64,${"A".repeat(20_000)}`,
      width: 100,
      height: 100,
      x: 0,
      y: 0,
      scale: 0.01,
      opacity: 0.5,
    };
    const data = serializeBuilding(building);
    const created = await admin.call("plans", { method: "POST", json: { name: "Scan", data } });
    const id = created.body.id as string;
    await admin.call(`plans/${id}`, { method: "PUT", json: { parent: "1", data } });
    const blobs = readdirSync(join(dir, "data", "blobs"));
    expect(blobs).toHaveLength(1);
    const revision = readFileSync(join(dir, "data", "plans", id, "2.json"), "utf8");
    expect(revision).not.toContain("data:image");
    const read = await admin.call(`plans/${id}`);
    expect(JSON.parse(read.body.data).stories[0].background.image).toBe(
      building.stories[0].background.image,
    );
    // The image counts once in the space of the account.
    const used = (await admin.call("session")).body.account.used;
    expect(used).toBeGreaterThan(20_000);
    expect(used).toBeLessThan(30_000);
  });
});
