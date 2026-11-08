import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyBuilding } from "../../src/model/building";
import { serializeBuilding } from "../../src/model/file";
import { createHandler, type Config } from "../src/app";
import { Store } from "../src/store";

let dir: string;
let server: Server;
let base: string;
let root: string;

const plan = (name = "Ground floor") => {
  const building = emptyBuilding();
  building.stories[0].name = name;
  return serializeBuilding(building);
};

async function start(config: Partial<Config> = {}) {
  dir = mkdtempSync(join(tmpdir(), "grundriss-"));
  const appDir = join(dir, "app");
  mkdirSync(appDir);
  writeFileSync(join(appDir, "index.html"), "<!doctype html><title>Grundriss</title>");
  const store = new Store(join(dir, "data"));
  root = store.ensureRoot()!;
  const handler = createHandler(store, {
    mode: "full",
    appDir,
    origins: [],
    appUrl: "",
    homeUrl: "",
    siteDir: "",
    maxBody: 10 * 1024 * 1024,
    version: "test",
    ...config,
  });
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((done) => server.listen(0, done));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
}

beforeEach(() => start());
afterEach(() => {
  server.closeAllConnections();
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A call of the API with a token, as JSON. */
async function call(token: string, path: string, init: RequestInit & { json?: unknown } = {}) {
  const response = await fetch(`${base}/${token}/api/${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
    redirect: "manual",
  });
  const text = await response.text();
  const type = response.headers.get("content-type") ?? "";
  return { status: response.status, body: type.includes("json") ? JSON.parse(text) : text };
}

describe("the paths of the server", () => {
  it("answers 404 to each path without a valid token", async () => {
    for (const path of ["/", "/api/me", "/nothing/", "/nothing/api/me", "/index.html"]) {
      expect((await fetch(`${base}${path}`)).status).toBe(404);
    }
  });

  it("serves the app under a token, and the API next to it", async () => {
    const page = await fetch(`${base}/${root}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Grundriss");
    const moved = await fetch(`${base}/${root}`, { redirect: "manual" });
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toBe(`/${root}/`);
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    const me = await call(root, "me");
    expect(me.body).toMatchObject({ api: 1, token: { kind: "root", write: true } });
    expect(JSON.stringify(me.body)).not.toContain(root);
  });

  it("takes the token as a Bearer header too", async () => {
    const response = await fetch(`${base}/api/me`, {
      headers: { Authorization: `Bearer ${root}` },
    });
    expect(response.status).toBe(200);
  });

  it("serves only the API in mode api, or sends the browser to the app", async () => {
    server.closeAllConnections();
    server.close();
    await start({ mode: "api" });
    expect((await fetch(`${base}/${root}/`)).status).toBe(404);
    expect((await call(root, "me")).status).toBe(200);
    server.closeAllConnections();
    server.close();
    await start({ mode: "api", appUrl: "https://example.org/app/" });
    const moved = await fetch(`${base}/${root}/`, { redirect: "manual" });
    expect(moved.status).toBe(302);
    expect(moved.headers.get("location")).toBe(
      `https://example.org/app/#connect=${encodeURIComponent(`http://${new URL(base).host}/${root}`)}`,
    );
    // Without the website, `/` stays 404; `/app` sends the browser to the app, without a token.
    expect((await fetch(`${base}/`, { redirect: "manual" })).status).toBe(404);
    const app = await fetch(`${base}/app`, { redirect: "manual" });
    expect(app.headers.get("location")).toBe("https://example.org/app/");
    server.closeAllConnections();
    server.close();
    await start({
      mode: "api",
      appUrl: "https://example.org/app/",
      homeUrl: "https://example.org/",
    });
    const home = await fetch(`${base}/`, { redirect: "manual" });
    expect(home.headers.get("location")).toBe("https://example.org/");
    // The app may call the API from its origin.
    const cors = await fetch(`${base}/${root}/api/me`, {
      headers: { Origin: "https://example.org" },
    });
    expect(cors.headers.get("access-control-allow-origin")).toBe("https://example.org");
  });
});

describe("the public website", () => {
  it("serves the website at / and the app at /app/, next to the tokens", async () => {
    server.closeAllConnections();
    server.close();
    const site = mkdtempSync(join(tmpdir(), "grundriss-site-"));
    writeFileSync(join(site, "index.html"), "<!doctype html><title>Website</title>");
    mkdirSync(join(site, "de"));
    writeFileSync(join(site, "de", "index.html"), "<!doctype html><title>Webseite</title>");
    await start({ siteDir: site });
    expect(await (await fetch(`${base}/`)).text()).toContain("Website");
    expect(await (await fetch(`${base}/de/`)).text()).toContain("Webseite");
    expect(await (await fetch(`${base}/app/`)).text()).toContain("Grundriss");
    expect((await fetch(`${base}/app`, { redirect: "manual" })).status).toBe(301);
    expect((await fetch(`${base}/nothing`)).status).toBe(404);
    expect((await fetch(`${base}/../data/data.json`)).status).toBe(404);
    expect((await call(root, "me")).status).toBe(200);
    rmSync(site, { recursive: true, force: true });
  });
});

describe("plans and revisions", () => {
  it("saves a revision only on top of the current one", async () => {
    const created = await call(root, "plans", {
      method: "POST",
      json: { name: "House", data: plan() },
    });
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(created.body.revision).toBe("1");
    const saved = await call(root, `plans/${id}`, {
      method: "PUT",
      json: { parent: "1", data: plan("First") },
    });
    expect(saved.body.revision).toBe("2");
    // A save on top of revision 1 comes too late.
    const late = await call(root, `plans/${id}`, {
      method: "PUT",
      json: { parent: "1", data: plan("Second") },
    });
    expect(late.status).toBe(409);
    const revisions = await call(root, `plans/${id}/revisions`);
    expect(revisions.body.map((r: { id: string }) => r.id)).toEqual(["1", "2"]);
    const old = await call(root, `plans/${id}/revisions/1`);
    expect(JSON.parse(old.body.data).stories[0].name).toBe("Ground floor");
  });

  it("refuses data that is not a plan", async () => {
    const response = await call(root, "plans", { method: "POST", json: { name: "x", data: "{}" } });
    expect(response.status).toBe(400);
  });

  it("lets one client edit at a time with the lease", async () => {
    const { body } = await call(root, "plans", {
      method: "POST",
      json: { name: "House", data: plan() },
    });
    const take = (client: string) =>
      call(root, `plans/${body.id}/lease`, { method: "POST", headers: { "X-Client": client } });
    expect((await take("a")).status).toBe(200);
    expect((await take("b")).status).toBe(423);
    const save = await call(root, `plans/${body.id}`, {
      method: "PUT",
      headers: { "X-Client": "b" },
      json: { parent: "1", data: plan() },
    });
    expect(save.status).toBe(423);
    await call(root, `plans/${body.id}/lease`, { method: "DELETE", headers: { "X-Client": "a" } });
    expect((await take("b")).status).toBe(200);
  });
});

describe("tokens", () => {
  async function user(rights: Record<string, unknown>) {
    const made = await call(root, "tokens", {
      method: "POST",
      json: { kind: "user", label: "Anna", write: true, createPlans: true, ...rights },
    });
    expect(made.status).toBe(201);
    return made.body.token as string;
  }

  it("shows the plans of a user only to the user and to root", async () => {
    const anna = await user({});
    const ben = await user({ label: "Ben" });
    const house = await call(anna, "plans", {
      method: "POST",
      json: { name: "House", data: plan() },
    });
    expect((await call(anna, "plans")).body).toHaveLength(1);
    expect((await call(ben, "plans")).body).toHaveLength(0);
    expect((await call(root, "plans")).body).toHaveLength(1);
    expect((await call(ben, `plans/${house.body.id}`)).status).toBe(404);
    const all = await user({ label: "Office", seeAll: true, write: false });
    expect((await call(all, "plans")).body).toHaveLength(1);
    // A user that sees all plans but only reads cannot save.
    const save = await call(all, `plans/${house.body.id}`, {
      method: "PUT",
      json: { parent: "1", data: plan() },
    });
    expect(save.status).toBe(403);
  });

  it("makes share links for one plan, with the right to read and an end date", async () => {
    const anna = await user({});
    const house = await call(anna, "plans", {
      method: "POST",
      json: { name: "House", data: plan() },
    });
    const link = await call(anna, "tokens", {
      method: "POST",
      json: { kind: "plan", label: "Bank", planId: house.body.id, write: false },
    });
    expect(link.status).toBe(201);
    const bank = link.body.token as string;
    expect((await call(bank, "me")).body.token).toMatchObject({ kind: "plan", write: false });
    expect((await call(bank, "plans")).body.map((p: { id: string }) => p.id)).toEqual([
      house.body.id,
    ]);
    expect((await call(bank, `plans/${house.body.id}`)).status).toBe(200);
    // A plan token makes no tokens, and it only reads.
    const more = await call(bank, "tokens", {
      method: "POST",
      json: { kind: "plan", label: "More", planId: house.body.id },
    });
    expect(more.status).toBe(403);
    const lease = await call(bank, `plans/${house.body.id}/lease`, {
      method: "POST",
      headers: { "X-Client": "x" },
    });
    expect(lease.status).toBe(403);
    // A past end date is refused.
    const past = await call(anna, "tokens", {
      method: "POST",
      json: { kind: "plan", label: "Old", planId: house.body.id, expires: Date.now() - 1000 },
    });
    expect(past.status).toBe(400);
  });

  it("gives a token at most the rights of its maker", async () => {
    const reader = await user({ write: false });
    const denied = await call(reader, "tokens", {
      method: "POST",
      json: { kind: "user", label: "x" },
    });
    expect(denied.status).toBe(403);
    const anna = await user({});
    // Anna may not make users without the right.
    const noUsers = await call(anna, "tokens", {
      method: "POST",
      json: { kind: "user", label: "x" },
    });
    expect(noUsers.status).toBe(403);
    const lead = await user({ label: "Lead", makeUsers: true, expires: Date.now() + 3_600_000 });
    const made = await call(lead, "tokens", {
      method: "POST",
      json: { kind: "user", label: "Staff", write: true, seeAll: true, makeUsers: true },
    });
    expect(made.status).toBe(201);
    // Lead cannot see all plans, so Staff cannot either; Staff ends with Lead.
    expect(made.body.seeAll).toBe(false);
    expect(made.body.makeUsers).toBe(true);
    expect(made.body.expires).toBeLessThanOrEqual(Date.now() + 3_600_000);
  });

  it("removes a token and the tokens that it made", async () => {
    const lead = await user({ label: "Lead", makeUsers: true });
    const staff = await call(lead, "tokens", {
      method: "POST",
      json: { kind: "user", label: "Staff", write: true, createPlans: true },
    });
    const staffToken = staff.body.token as string;
    const house = await call(staffToken, "plans", {
      method: "POST",
      json: { name: "H", data: plan() },
    });
    const link = await call(staffToken, "tokens", {
      method: "POST",
      json: { kind: "plan", label: "Link", planId: house.body.id },
    });
    // Lead sees the tokens of Staff, and root sees all.
    expect((await call(lead, "tokens")).body).toHaveLength(2);
    const leadId = (await call(lead, "me")).body.token.id;
    expect((await call(root, `tokens/${leadId}`, { method: "DELETE" })).status).toBe(200);
    expect((await call(lead, "me")).status).toBe(404);
    expect((await call(staffToken, "me")).status).toBe(404);
    expect((await call(link.body.token, "me")).status).toBe(404);
    // The plan of Staff stays, and root still sees it.
    expect((await call(root, "plans")).body).toHaveLength(1);
  });

  it("lets only root change the settings", async () => {
    const anna = await user({});
    expect((await call(anna, "settings")).status).toBe(403);
    const saved = await call(root, "settings", { method: "PUT", json: { name: "Office" } });
    expect(saved.body).toMatchObject({ name: "Office", plans: 0 });
    expect((await call(anna, "me")).body.server).toBe("Office");
  });
});
