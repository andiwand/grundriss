// The app with a real Grundriss server (playwright.config.ts starts it in mode "api"): connect
// with the root link, put a plan on the server, share it with a link to view, see the changes of
// the editor in a second browser at once, and restore an old revision. Two people edit at the
// same time, see each other, and one follows the other.

import { expect, test } from "@playwright/test";
import { SERVER_PORT, SERVER_ROOT } from "../playwright.config";
import { isPhone, openApp } from "./helpers";

// The tests share one server, and the first one counts its plans.
test.describe.configure({ mode: "serial" });

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
  await expect(viewer.locator("#remote-state")).toContainText("View only");
  // The viewer sees the editor in the list of the people.
  await expect(viewer.locator("#people .person")).toHaveCount(1);

  // The viewer gets only the tools to view, and a wall that it selects has no fields to change.
  await expect(viewer.locator("body")).toHaveClass(/read-only/);
  await expect(viewer.locator('#tools [data-tool="select"]')).toBeVisible();
  await expect(viewer.locator('#tools [data-tool="wall"]')).toBeHidden();
  await expect(viewer.locator("#undo")).toBeHidden();
  const box = (await viewerWalls.first().boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await viewer.mouse.move(center.x, center.y);
  await viewer.mouse.down();
  await viewer.mouse.move(center.x + 60, center.y + 60, { steps: 5 });
  // A drag does not move the wall, also not for a moment.
  expect(await viewerWalls.first().boundingBox()).toEqual(box);
  await viewer.mouse.up();
  await expect(viewer.locator("#panel input:not([disabled])")).toHaveCount(0);
  await expect(viewer.locator("#panel button:not([hidden]):not([data-view])")).toHaveCount(0);
  // The measure tool does not change the plan, so the viewer has it too.
  await viewer.locator('#tools [data-tool="measure"]').click();
  await viewer.mouse.click(center.x, center.y);
  await viewer.mouse.click(center.x + 80, center.y + 40);
  await expect(viewer.locator("#plan-2d .overlay .ruler")).toHaveCount(1);
  await viewer.locator('#tools [data-tool="select"]').click();

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

test("lets two people edit at once, see each other, and follow", async ({ page, browser }) => {
  await openApp(page);
  test.skip(await isPhone(page), "The test deletes with the keyboard and follows a mouse.");

  await page.getByRole("button", { name: "Connect a server" }).click();
  await page.locator(".app-dialog input").fill(`${SERVER}/${SERVER_ROOT}/`);
  await page.locator(".app-dialog button.primary").click();
  await page.locator(".start-row .project-start", { hasText: "Example house" }).click();
  await page.locator("#share").click();
  await page.locator(".app-dialog button.primary").click();
  await expect(page.locator("#remote-state")).toBeVisible();

  // A link to edit, for the second person.
  await page.locator("#share").click();
  await page.locator(".app-dialog input").first().fill("Ben");
  await page.locator(".app-dialog select").first().selectOption("write");
  await page.locator(".app-dialog button.primary", { hasText: "Make a link" }).click();
  const link = await page.locator(".new-link input").nth(1).inputValue();
  await page.keyboard.press("Escape");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ben = await context.newPage();
  await ben.addInitScript(() => localStorage.setItem("grundriss-language", "en"));
  await ben.goto(link);

  const walls = page.locator('#plan-2d [data-kind="wall"]');
  const benWalls = ben.locator('#plan-2d [data-kind="wall"]');
  const count = await walls.count();
  await expect(benWalls).toHaveCount(count);
  // Both edit, and each sees the other.
  await expect(ben.locator("body")).not.toHaveClass(/read-only/);
  await expect(page.locator("#people .person")).toHaveCount(1);
  await expect(ben.locator("#people .person")).toHaveCount(1);
  await expect(page.locator("#people .person")).toHaveText("B");

  // Each removes a different wall at the same time: both changes stay.
  const ids = await walls.evaluateAll((list) => list.map((w) => (w as SVGElement).dataset.id!));
  // A point where the wall is on top, not a door in it.
  const pointOn = (who: typeof page, id: string) =>
    who.evaluate((wall) => {
      for (const element of document.querySelectorAll(
        `#plan-2d [data-kind="wall"][data-id="${wall}"]`,
      )) {
        const box = element.getBoundingClientRect();
        for (let k = 1; k < 20; k++) {
          const x =
            box.width > box.height ? box.left + (box.width * k) / 20 : box.left + box.width / 2;
          const y =
            box.width > box.height ? box.top + box.height / 2 : box.top + (box.height * k) / 20;
          const hit = document.elementFromPoint(x, y)?.closest<SVGElement>("[data-kind]");
          if (hit?.dataset.id === wall) return { x, y };
        }
      }
      return null;
    }, id);
  const remove = async (who: typeof page, id: string) => {
    const point = (await pointOn(who, id))!;
    await who.mouse.click(point.x, point.y);
    await who.keyboard.press("Delete");
  };
  await Promise.all([remove(page, ids[0]), remove(ben, ids[ids.length - 1])]);
  // A removed wall can join the walls at its ends, so the test compares the walls by id.
  const wallIds = (who: typeof page) =>
    who
      .locator('#plan-2d [data-kind="wall"]')
      .evaluateAll((list) => [...new Set(list.map((w) => (w as SVGElement).dataset.id!))].sort());
  const first = ids[0];
  const last = ids[ids.length - 1];
  await expect.poll(async () => (await wallIds(page)).includes(first)).toBe(false);
  await expect.poll(async () => (await wallIds(page)).includes(last)).toBe(false);
  await expect.poll(async () => (await wallIds(ben)).join()).toBe((await wallIds(page)).join());

  // Undo of Ben brings back only the wall of Ben.
  await ben.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await wallIds(page)).includes(last)).toBe(true);
  expect(await wallIds(page)).not.toContain(first);
  await expect.poll(async () => (await wallIds(ben)).join()).toBe((await wallIds(page)).join());

  // The cursor of Ben shows on the plan of the first person.
  const area = (await ben.locator("#plan-2d").boundingBox())!;
  await ben.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await ben.mouse.move(area.x + area.width / 2 + 20, area.y + area.height / 2 + 10);
  await expect(page.locator("#plan-2d .person-cursor")).toHaveCount(1);

  // Ben only views, and follows the first person to another story.
  await ben.locator("#people .mode").click();
  await expect(ben.locator("body")).toHaveClass(/read-only/);
  await ben.locator("#people .person").click();
  await expect(ben.locator("body")).toHaveClass(/following/);
  await expect(ben.locator("#follow-band")).toContainText("You follow");
  const other = page.locator("#stories .story:not(.active)").first();
  const name = (await other.locator("span").first().textContent())!;
  await other.click();
  await expect(ben.locator("#stories .story.active")).toContainText(name);
  // A click in the view of Ben stops the follow.
  await ben.mouse.click(area.x + 40, area.y + area.height - 40);
  await expect(ben.locator("body")).not.toHaveClass(/following/);
  await context.close();
});
