// A Grundriss server in the process of the browser tests, with the app of the build of the tests
// (.e2e-build, which playwright.config.ts makes). Each test gets its own server with an admin.

import type { BrowserContext, Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { COOKIE, createHandler } from "../server/src/app";
import { Store, type AccountRecord } from "../server/src/store";

export const PASSWORD = "correct horse";

const running: { server: Server; dir: string }[] = [];

/** Starts a server with an admin account. */
export async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), "grundriss-browser-"));
  const store = new Store(dir);
  const admin = await store.acceptLink(store.setupLink()!, "Admin", PASSWORD);
  const handler = createHandler(store, {
    appDir: resolve(".e2e-build"),
    siteDir: "",
    maxBody: 10 * 1024 * 1024,
    version: "test",
  });
  const server = createServer((req, res) => void handler(req, res));
  running.push({ server, dir });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  /** Logs a browser in as the account: its session goes into the cookie. */
  const login = (context: BrowserContext, account: AccountRecord = admin) =>
    context.addCookies([{ name: COOKIE, value: store.createSession(account), url: base }]);
  /** The plans of the server, as the admin sees them. */
  const plans = () => store.plans(store.access(store.createSession(admin))!);
  return { store, admin, base, login, plans };
}

/** Stops the servers of a test. */
export function stopServers(): void {
  for (const { server, dir } of running.splice(0)) {
    server.closeAllConnections();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Opens the app of a server in English, without the file pickers. */
export async function openServerApp(page: Page, base: string, path = "/app/"): Promise<void> {
  await page.addInitScript(() => {
    // @ts-expect-error The tests remove the picker, so the app downloads the files.
    delete window.showSaveFilePicker;
    // @ts-expect-error The same for the open picker.
    delete window.showOpenFilePicker;
    localStorage.setItem("grundriss-language", "en");
  });
  await page.goto(`${base}${path}`);
}
