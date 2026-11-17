// The accounts of a Grundriss server in the browser: the setup of the admin, an invite, the
// login, and two browsers that edit one plan through share links.

import { expect, test } from "@playwright/test";
import { emptyBuilding } from "../src/model/building";
import { serializeBuilding } from "../src/model/file";
import { openServerApp, PASSWORD, startServer, stopServers } from "./server-helpers";

test.afterEach(stopServers);

test("sets up the admin, invites an account, and logs in", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Uses two desktop browser contexts.");
  const { store, base } = await startServer();
  const a = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const b = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  try {
    const admin = await a.newPage();
    // Log in as the admin with the dialog that a browser without a session gets.
    await openServerApp(admin, base);
    const login = admin.locator(".app-dialog");
    await expect(login).toContainText("Log in to Grundriss");
    await login.getByLabel("Name").fill("Admin");
    await login.getByLabel("Password").fill(PASSWORD);
    await login.locator("button.primary").click();
    await expect(admin.locator(".server-head")).toContainText("Admin");

    // An invite link for a new account.
    await admin.getByRole("button", { name: "Server and accounts" }).click();
    await admin.getByRole("button", { name: "Make an invite link" }).click();
    const invite = await admin.locator(".new-link input").inputValue();
    expect(invite).toMatch(new RegExp(`^${base}/invite/`));
    await admin.keyboard.press("Escape");

    // The invited person chooses a name and a password, and is logged in.
    const anna = await b.newPage();
    await anna.addInitScript(() => localStorage.setItem("grundriss-language", "en"));
    await anna.goto(invite);
    const made = anna.locator(".app-dialog");
    await expect(made).toContainText("Your account on Grundriss");
    await made.getByLabel("Name").fill("Anna");
    await made.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await made.getByLabel("Password again").fill(PASSWORD);
    await made.locator("button.primary").click();
    await expect(anna.locator(".server-head")).toContainText("Anna");
    await expect(anna.locator(".server-section")).toContainText("No plans on this server yet.");
    // The address has no code any more.
    expect(anna.url()).not.toContain("invite");
    expect(store.counts().accounts).toBe(2);

    // The invite works only once.
    const other = await (await browser.newContext()).newPage();
    await other.goto(invite);
    await expect(other.locator("#status")).toContainText("not valid");
  } finally {
    await a.close();
    await b.close();
  }
});

test("shows two people who edit through share links, and their changes", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Uses two desktop browser contexts.");
  const { store, admin, base, plans } = await startServer();
  const access = store.access(store.createSession(admin))!;
  const plan = store.createPlan(access, "Shared house", serializeBuilding(emptyBuilding()));
  const first = store.makeShare(access, plan, { label: "First", write: true });
  const second = store.makeShare(access, plan, { label: "Second", write: true });
  const a = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  const b = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
  try {
    const one = await a.newPage();
    const two = await b.newPage();
    await openServerApp(one, base, `/s/${first.token}`);
    await expect(one.locator("#remote-state")).toHaveText("Grundriss");
    // The address names the plan, not the token, and a reload opens the plan again.
    expect(one.url()).toBe(`${base}/app/plans/${plan.id}`);
    await one.reload();
    await expect(one.locator("#remote-state")).toHaveText("Grundriss");
    await expect(one.locator("#plan-2d svg").first()).toBeVisible();
    await openServerApp(two, base, `/s/${second.token}`);
    // Both edit at once; each sees the other, by the label of the link.
    await expect(two.locator("#remote-state")).toHaveText("Grundriss");
    await expect(one.locator("#people .person")).toHaveText("S");
    await expect(two.locator("#people .person")).toHaveText("F");
    const north = one.getByRole("spinbutton", { name: "North" });
    await north.fill("25");
    await north.press("Tab");
    await expect(two.getByRole("spinbutton", { name: "North" })).toHaveValue("25");
    const next = two.getByRole("spinbutton", { name: "North" });
    await next.fill("40");
    await next.press("Tab");
    await expect(one.getByRole("spinbutton", { name: "North" })).toHaveValue("40");
    await expect
      .poll(() => {
        const current = plans()[0];
        return JSON.parse(store.revisionData(current, current.revisions.at(-1)!.id)).north;
      })
      .toBe(40);
    // A closed tab leaves the list of the others.
    await one.close();
    await expect(two.locator("#people .person")).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});
