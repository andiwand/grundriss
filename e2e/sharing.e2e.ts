// The app with a real Grundriss server (playwright.config.ts starts it in mode "api"): connect
// with the root link, put a plan on the server, share it with a link to view, see the changes of
// the editor in a second browser at once, and restore an old revision.

import { expect, test } from "@playwright/test";
import { SERVER_PORT, SERVER_ROOT } from "../playwright.config";
import { isPhone, openApp } from "./helpers";

const SERVER = `http://localhost:${SERVER_PORT}`;

/** The plans of the server, read with the root token. */
const serverPlans = () =>
  fetch(`${SERVER}/${SERVER_ROOT}/api/plans`).then(
    (r) => r.json() as Promise<{ name: string; revision: string }[]>,
  );

test("shares a plan of a server, updates a viewer, and restores a revision", async ({
  page,
  browser,
}) => {
  await openApp(page);
  test.skip(await isPhone(page), "The test deletes with the keyboard.");

  // Connect with the root link.
  await page.getByRole("button", { name: "Connect a server" }).click();
  await page.locator(".app-dialog input").fill(`${SERVER}/${SERVER_ROOT}/`);
  await page.locator(".app-dialog button.primary").click();
  await expect(page.locator(".server-section")).toBeVisible();

  // Put the example house on the server: it opens from there.
  await page.locator(".start-row .project-start", { hasText: "Example house" }).click();
  await page.locator("#share").click();
  await page.locator(".app-dialog button.primary").click();
  await expect(page.locator("#remote-state")).toBeVisible();
  const walls = page.locator('#plan-2d [data-kind="wall"]');
  const count = await walls.count();
  expect(count).toBeGreaterThan(0);
  await expect.poll(async () => (await serverPlans()).length).toBe(1);

  // A link to view the plan, opened in a second browser with this app.
  await page.locator("#share").click();
  await page.locator(".app-dialog input").first().fill("Viewer");
  await page.locator(".app-dialog button.primary", { hasText: "Make a link" }).click();
  const link = await page.locator(".new-link input").nth(1).inputValue();
  expect(link).toContain("#connect=");
  await page.keyboard.press("Escape");
  const context = await browser.newContext();
  const viewer = await context.newPage();
  await viewer.addInitScript(() => localStorage.setItem("grundriss-language", "en"));
  await viewer.goto(link);
  const viewerWalls = viewer.locator('#plan-2d [data-kind="wall"]');
  await expect(viewerWalls).toHaveCount(count);
  await expect(viewer.locator("#remote-state")).toContainText("edits");

  // The editor deletes all walls; the viewer sees it at once.
  await page
    .locator("#plan-2d svg")
    .first()
    .click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await expect(walls).toHaveCount(0);
  await expect.poll(async () => (await serverPlans())[0].revision).toBe("2");
  await expect(viewerWalls).toHaveCount(0);

  // The viewer only views: its undo changes nothing.
  await viewer
    .locator("#plan-2d svg")
    .first()
    .click({ position: { x: 5, y: 5 } });
  await viewer.keyboard.press("ControlOrMeta+z");
  await expect(viewerWalls).toHaveCount(0);

  // The editor restores revision 1; the server gets revision 3, and the viewer sees it.
  await page.locator("#file-name").click();
  const versions = page.locator(".app-dialog .token-row");
  await expect(versions).toHaveCount(2);
  await versions.nth(1).getByRole("button", { name: "Restore" }).click();
  await expect(walls).toHaveCount(count);
  await expect.poll(async () => (await serverPlans())[0].revision).toBe("3");
  await expect(viewerWalls).toHaveCount(count);
  await context.close();
});
