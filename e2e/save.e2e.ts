import { expect, test, type Page } from "@playwright/test";
import { isPhone, openApp } from "./helpers";

async function delaySave(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window as unknown as {
      showSaveFilePicker: () => Promise<unknown>;
      finishSave?: () => void;
      written?: string;
    };
    state.showSaveFilePicker = async () => ({
      name: "pending.json",
      createWritable: async () => ({
        write: async (blob: Blob) => {
          state.written = await blob.text();
          await new Promise<void>((resolve) => {
            state.finishSave = resolve;
          });
        },
        close: async () => {},
      }),
    });
  });
  await page.keyboard.press("ControlOrMeta+s");
  await expect
    .poll(() =>
      page.evaluate(() => typeof (window as unknown as { finishSave?: unknown }).finishSave),
    )
    .toBe("function");
}

async function finishSave(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { finishSave: () => void }).finishSave());
}

test("keeps edits made during a file save dirty", async ({ page }) => {
  await openApp(page);
  test.skip(await isPhone(page), "Uses the desktop save shortcut.");
  await page.locator(".start-row .project-start", { hasText: "Example house" }).click();
  await delaySave(page);
  const north = page.getByRole("spinbutton", { name: "North" });
  await north.fill("25");
  await north.press("Tab");
  await finishSave(page);
  await expect(page.locator("#file-title")).toHaveText("pending.json");
  await expect(page.locator("#file-name")).toHaveClass(/dirty/);
  const written = await page.evaluate(() => (window as unknown as { written: string }).written);
  expect(JSON.parse(written).north).not.toBe(25);
});

test("does not attach a completed save to another document", async ({ page }) => {
  await openApp(page);
  test.skip(await isPhone(page), "Uses the desktop save shortcut.");
  await page.locator(".start-row .project-start", { hasText: "Example house" }).click();
  await delaySave(page);
  await page.locator("#brand").click();
  await page.locator(".project-start", { hasText: "New plan" }).click();
  await finishSave(page);
  await expect(page.locator("#file-title")).toHaveText("plan.grundriss");
  await expect(page.locator("#plan-2d .room-label")).toHaveCount(0);
});
