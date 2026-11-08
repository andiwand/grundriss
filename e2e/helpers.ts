// Helpers of the browser tests.

import type { Page } from "@playwright/test";

/**
 * Opens the app without a file picker: the tests use the download of the browser, because a
 * test cannot use the picker of the File System Access API.
 */
export async function openApp(page: Page, language: "en" | "de" = "en"): Promise<void> {
  await page.addInitScript((lang) => {
    // @ts-expect-error The tests remove the picker, so the app downloads the files.
    delete window.showSaveFilePicker;
    // @ts-expect-error The same for the open picker.
    delete window.showOpenFilePicker;
    localStorage.setItem("grundriss-language", lang);
  }, language);
  await page.goto("/");
  await page.locator("#project-list").waitFor();
}

/** True if the page uses the layout for a phone. */
export const isPhone = (page: Page) =>
  page.evaluate(() => document.body.classList.contains("compact"));

/** Clicks a point of the 2D plan, in pixels from the top left corner of the 2D pane. */
export async function clickPlan(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator("#plan-2d svg").first().boundingBox())!;
  await page.mouse.click(box.x + x, box.y + y);
}

/** The number of projects in the store of the browser (IndexedDB, version 2 of src/io/projects.ts). */
export const projectCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const request = indexedDB.open("grundriss");
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("projects")) return resolve(0);
          const count = db.transaction("projects").objectStore("projects").count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
        };
        request.onerror = () => resolve(0);
      }),
  );
