import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it("closes a late database connection after a blocked open and allows a fresh open", async () => {
  vi.resetModules();
  const oldDb = { close: vi.fn() };
  const newDb = { close: vi.fn() };
  const oldRequest = { result: oldDb } as unknown as IDBOpenDBRequest;
  const newRequest = { result: newDb } as unknown as IDBOpenDBRequest;
  vi.stubGlobal("indexedDB", {
    open: vi.fn().mockReturnValueOnce(oldRequest).mockReturnValueOnce(newRequest),
  });
  const { projectsAvailable, storageBlocked } = await import("../src/io/projects");
  const first = projectsAvailable();
  oldRequest.onblocked!(new Event("blocked") as IDBVersionChangeEvent);
  expect(await first).toBe(false);
  expect(storageBlocked()).toBe(true);
  oldRequest.onsuccess!(new Event("success"));
  expect(oldDb.close).toHaveBeenCalledOnce();
  const second = projectsAvailable();
  newRequest.onsuccess!(new Event("success"));
  expect(await second).toBe(true);
  expect(storageBlocked()).toBe(false);
  expect(newDb.close).not.toHaveBeenCalled();
});
