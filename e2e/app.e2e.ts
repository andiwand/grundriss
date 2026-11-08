// The main paths of the app in a browser: the projects, a new plan with walls, the autosave, the
// topics, the exports, the backup, the layout for a phone, and the German interface.

import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { clickPlan, isPhone, openApp, projectCount } from "./helpers";

test("opens the example house in the Structure topic", async ({ page }) => {
  await openApp(page);
  await page.locator(".start-row .project-start", { hasText: "Example house" }).click();
  await expect(page.locator("body")).not.toHaveClass(/no-plan/);
  await expect(page.locator('[data-topic-tab="structure"]')).toHaveClass(/active/);
  await expect(page.locator("#plan-2d .room-label").first()).toBeVisible();
});

test("draws a room, saves it in the browser, and opens it again after a reload", async ({
  page,
}) => {
  await openApp(page);
  test.skip(await isPhone(page), "The test draws with a mouse, so it runs on the desktop only.");
  await page.locator(".project-start", { hasText: "New plan" }).click();
  // The start card of an empty plan starts the wall tool.
  await page.locator("#empty-wall").click();
  // Four corners and back to the first one close the room.
  for (const [x, y] of [
    [150, 250],
    [450, 250],
    [450, 500],
    [150, 500],
    [150, 250],
  ]) {
    await clickPlan(page, x, y);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator("#plan-2d .room-label")).toHaveCount(1);
  // The autosave runs after a short wait: the project shows up in the store of the browser.
  await expect.poll(() => projectCount(page)).toBe(1);
  await page.reload();
  await page.locator("#project-list").waitFor();
  await page.locator("#project-list .project-open", { hasText: "plan" }).first().click();
  await expect(page.locator("#plan-2d .room-label")).toHaveCount(1);
});

test("shows each topic with its panel", async ({ page }) => {
  await openApp(page);
  await page.locator(".start-row .project-start", { hasText: "Example house" }).click();
  for (const topic of ["utilities", "interior", "energy", "renovation"]) {
    await page.locator(`[data-topic-tab="${topic}"]`).click();
    await expect(page.locator("#panel h2").first()).toBeVisible();
  }
  await page.locator('[data-topic-tab="overview"]').click();
  await expect(page.locator("#contents")).toBeVisible();
});

test("opens a variant with another floor plan, and goes back to the plan", async ({ page }) => {
  await openApp(page);
  test.skip(await isPhone(page), "The test deletes a wall with the keyboard.");
  await page.locator(".start-row .project-start", { hasText: "Example house" }).click();
  await page.locator('[data-topic-tab="renovation"]').click();
  await page.locator('select[aria-label="Add a variant"]').selectOption("layout");
  // The new variant is open in the structure, and the switch shows it.
  await expect(page.locator("#variant-switch")).toHaveClass(/open/);
  await expect(page.locator('[data-topic-tab="structure"]')).toHaveClass(/active/);
  const labels = page.locator("#plan-2d .room-label");
  const rooms = await labels.count();
  // A wall of the variant goes away, so a room is no longer closed.
  // A click near the end of the wall, away from its window.
  const box = (await page.locator('#plan-2d [data-kind="wall"]').first().boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.keyboard.press("Delete");
  await expect.poll(() => labels.count()).toBeLessThan(rooms);
  await page.locator("#variant-switch").selectOption("");
  await expect(page.locator("#variant-switch")).not.toHaveClass(/open/);
  await expect(labels).toHaveCount(rooms);
});

test("exports the report and the quantities", async ({ page }) => {
  await openApp(page);
  await page.locator(".start-row .project-start", { hasText: "Example house" }).click();
  for (const kind of ["pdf", "csv"]) {
    if (await isPhone(page)) await page.locator("#more-button").click();
    else await page.locator("#export").click();
    if (await isPhone(page)) await page.locator('[data-more="export"]').click();
    const download = page.waitForEvent("download");
    await page.locator(`[data-report="${kind}"]`).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(kind === "pdf" ? /report\.pdf$/ : /quantities\.zip$/);
    // The file has content: a PDF starts with "%PDF", and a ZIP with "PK".
    const bytes = readFileSync((await file.path())!);
    expect(bytes.subarray(0, 4).toString("latin1")).toBe(
      kind === "pdf" ? "%PDF" : "PK\u0003\u0004",
    );
  }
});

test("moves a project to the trash and restores it", async ({ page }) => {
  await openApp(page);
  // A project goes into the store of the browser, as an autosave would put it: the list entry
  // and the plan (src/io/projects.ts, version 2 of the database).
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("grundriss", 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(["projects", "plans"], "readwrite");
          const now = Date.now();
          transaction.objectStore("projects").put({
            id: "e2e-trash",
            name: "Trash test",
            created: now,
            updated: now,
            preview: "",
          });
          transaction.objectStore("plans").put({
            id: "e2e-trash",
            data: JSON.stringify({ format: "grundriss", version: 1, vertices: [], walls: [] }),
          });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
  await page.reload();
  await page.locator('#project-list button[aria-label="Delete: Trash test"]').click();
  // The trash opens from the link at the end of the page.
  await page.locator(".home-links button", { hasText: "Trash" }).click();
  await page
    .locator(".trash-item", { hasText: "Trash test" })
    .getByRole("button", { name: "Restore" })
    .click();
  await expect(
    page.locator("#project-list .project-open", { hasText: "Trash test" }),
  ).toBeVisible();
});

test("uses the layout for a phone with the topics at the bottom", async ({ page }) => {
  await openApp(page);
  test.skip(!(await isPhone(page)), "Only on the phone.");
  await page.locator(".start-row .project-start", { hasText: "Example house" }).click();
  await expect(page.locator("#bottom-bar #topics")).toBeVisible();
  await expect(page.locator("#layers-button")).toBeHidden();
  // A tap on the handle opens the sheet of the panel.
  const height = async () => (await page.locator("#panel").boundingBox())!.height;
  const before = await height();
  await page.locator("#sheet-handle").tap();
  // The sheet grows with an animation.
  await expect.poll(height).toBeGreaterThan(before + 100);
  // A tap on the 3D button shows the 3D view alone.
  await page.locator('[data-view="3d"]').tap();
  await expect(page.locator("#plan-3d")).toBeVisible();
  await expect(page.locator("#plan-2d")).toBeHidden();
});

test("shows the interface in German", async ({ page }) => {
  await openApp(page, "de");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.locator(".start-row .project-start").last().click();
  await expect(page.locator('[data-topic-tab="overview"]')).toContainText("Übersicht");
});

test("draws a room with taps of a finger on the phone", async ({ page }) => {
  await openApp(page);
  test.skip(!(await isPhone(page)), "Only on the phone.");
  await page.locator(".project-start", { hasText: "New plan" }).tap();
  await page.locator("#empty-wall").tap();
  const box = (await page.locator("#plan-2d svg.editor2d").boundingBox())!;
  for (const [x, y] of [
    [80, 160],
    [300, 160],
    [300, 360],
    [80, 360],
    [80, 160],
  ]) {
    await page.touchscreen.tap(box.x + x, box.y + y);
  }
  await expect(page.locator("#plan-2d .room-label")).toHaveCount(1);
  // The Done button ends the tool, in place of Esc.
  await page.locator("#tool-done").tap();
  await expect(page.locator('#tools [data-tool="select"]')).toHaveClass(/active/);
});
