import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHandler } from "../server/src/app";
import { Store } from "../server/src/store";
import { emptyBuilding } from "../src/model/building";
import { serializeBuilding } from "../src/model/file";

const running: { server: Server; dir: string }[] = [];
async function start() {
  const dir = mkdtempSync(join(tmpdir(), "grundriss-browser-"));
  const store = new Store(dir);
  const root = store.ensureRoot()!;
  const handler = createHandler(store, {
    mode: "full",
    appDir: resolve(".e2e-build"),
    siteDir: "",
    homeUrl: "",
    appUrl: "",
    origins: [],
    maxBody: 10 * 1024 * 1024,
    version: "test",
  });
  const server = createServer((req, res) => void handler(req, res));
  running.push({ server, dir });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const owner = store.token(root)!;
  const plan = store.createPlan(owner, "Shared house", serializeBuilding(emptyBuilding()));
  return { store, root, owner, plan, base };
}

test.afterEach(() => {
  for (const { server, dir } of running.splice(0)) {
    server.closeAllConnections();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shares live changes and hands the edit lease to a waiting browser", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Uses two desktop browser contexts.");
  const { store, owner, plan, base } = await start();
  const first = store.makeToken(owner, {
    kind: "plan",
    label: "First",
    planId: plan.id,
    write: true,
  });
  const second = store.makeToken(owner, {
    kind: "plan",
    label: "Second",
    planId: plan.id,
    write: true,
  });
  const a = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const b = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  try {
    const writer = await a.newPage();
    const viewer = await b.newPage();
    await writer.goto(`${base}/${first.token}/`);
    await expect(writer.locator("#remote-state")).toHaveText("Grundriss");
    await viewer.goto(`${base}/${second.token}/`);
    await expect(viewer.locator("#remote-state")).toContainText("First edits");
    const north = writer.getByRole("spinbutton", { name: "North" });
    await north.fill("25");
    await north.press("Tab");
    await expect(viewer.getByRole("spinbutton", { name: "North" })).toHaveValue("25");
    await writer.close();
    await expect(viewer.locator("#remote-state")).toHaveText("Grundriss");
    const next = viewer.getByRole("spinbutton", { name: "North" });
    await next.fill("40");
    await next.press("Tab");
    await expect
      .poll(() => JSON.parse(store.revisionData(plan, plan.revisions.at(-1)!.id)).north)
      .toBe(40);
  } finally {
    await a.close();
    await b.close();
  }
});

test("does not put the current private app address in a share link for another server", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Uses the desktop share dialog.");
  const own = await start();
  const other = await start();
  await page.addInitScript(
    ({ address }) => {
      localStorage.setItem(
        "grundriss-servers",
        JSON.stringify([
          {
            address,
            name: "Other server",
            token: { kind: "root", write: true, createPlans: true },
          },
        ]),
      );
    },
    { address: `${other.base}/${other.root}` },
  );
  // The two test servers are on different origins. Allow the app's API requests in this test.
  await page.route(`${other.base}/**`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        "Access-Control-Allow-Origin": own.base,
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  });
  await page.goto(
    `${own.base}/${own.root}/#connect=${encodeURIComponent(`${other.base}/${other.root}`)}`,
  );
  await page.getByRole("button", { name: "Share: Shared house", exact: true }).first().click();
  await page.getByRole("button", { name: "Make a link", exact: true }).click();
  await expect(page.locator(".new-link input")).toHaveCount(1);
  await expect(page.locator(".new-link input")).not.toHaveValue(new RegExp(own.root));
});
