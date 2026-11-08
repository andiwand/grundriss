import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBuilding } from "../src/model/building";

vi.mock("../src/ui/context", async () => {
  const { PlanDocument } = await import("../src/model/history");
  return {
    doc: new PlanDocument(),
    app: { planOpen: true, fileName: "plan.grundriss", topic: "overview" },
    editor: { clearCalibration: vi.fn(), select: vi.fn() },
    shell: { enterPlan: vi.fn() },
    showStatus: vi.fn(),
    $: () => ({ textContent: "", classList: { toggle: vi.fn() } }),
  };
});
vi.mock("../src/ui/energy", () => ({ resetLocation: vi.fn() }));
vi.mock("../src/ui/tracing", () => ({ setSuggestions: vi.fn() }));
vi.mock("../src/ui/panel", () => ({ iconButton: vi.fn() }));
vi.mock("../src/i18n", () => ({ locale: () => "en", t: (s: string) => s }));
vi.mock("../src/io/projects", () => ({
  projectsAvailable: vi.fn(async () => true),
  emptyOldTrash: vi.fn(async () => {}),
  keepProjects: vi.fn(async () => true),
  saveProject: vi.fn(async () => {}),
  storageUse: vi.fn(async () => null),
  newProjectId: vi.fn(() => "project"),
}));

import { saveProject } from "../src/io/projects";
import { app, doc, showStatus } from "../src/ui/context";
import {
  confirmDiscard,
  hasUnsavedChanges,
  load,
  startProjects,
  storeProject,
} from "../src/ui/projects";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(saveProject).mockResolvedValue(undefined);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", { title: "" });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal(
    "confirm",
    vi.fn(() => false),
  );
  app.planOpen = true;
  load(emptyBuilding());
  await startProjects();
});

afterEach(() => vi.unstubAllGlobals());

describe("project autosave", () => {
  it("does not hang or save without a lock when the lock request fails", async () => {
    vi.stubGlobal("navigator", {
      locks: { request: vi.fn().mockRejectedValue(new Error("Lock denied")) },
    });
    load(emptyBuilding(), "shared.grundriss", null, { id: "shared", created: 1 });
    doc.editBuilding((b) => {
      b.north = 15;
    });
    await storeProject();
    expect(saveProject).not.toHaveBeenCalled();
    expect(hasUnsavedChanges()).toBe(true);
    expect(showStatus).toHaveBeenCalledWith("Lock denied", true);
  });

  it("waits for an in-flight save before leaving the plan", async () => {
    const write = deferred();
    vi.mocked(saveProject).mockReturnValue(write.promise);
    doc.editBuilding((b) => {
      b.north = 15;
    });
    const save = storeProject();
    let left = false;
    const leaving = confirmDiscard().then((ok) => {
      left = ok;
    });
    await vi.waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    expect(left).toBe(false);
    expect(hasUnsavedChanges()).toBe(true);
    write.resolve();
    await Promise.all([save, leaving]);
    expect(left).toBe(true);
    expect(hasUnsavedChanges()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks before leaving if the pending save fails, then retries", async () => {
    const write = deferred();
    vi.mocked(saveProject).mockReturnValue(write.promise);
    doc.editBuilding((b) => {
      b.north = 15;
    });
    const leaving = confirmDiscard();
    await vi.waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    write.reject(new Error("Storage is full"));
    expect(await leaving).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(showStatus).toHaveBeenCalled();
    expect(hasUnsavedChanges()).toBe(true);
    vi.mocked(saveProject).mockResolvedValue(undefined);
    await storeProject();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("does not store an unfinished drag", async () => {
    doc.begin();
    doc.updateBuilding((b) => {
      b.north = 15;
    });
    await storeProject();
    expect(saveProject).not.toHaveBeenCalled();
    doc.cancel();
    await storeProject();
    expect(saveProject).not.toHaveBeenCalled();
  });

  it("waits for the project lock and warns about edits in a second tab", async () => {
    let answer!: (lock: null) => void;
    vi.stubGlobal("navigator", {
      locks: {
        request: (_name: string, _options: unknown, callback: (lock: null) => void) => {
          answer = callback;
          return Promise.resolve();
        },
      },
    });
    load(emptyBuilding(), "shared.grundriss", null, { id: "shared", created: 1 });
    doc.editBuilding((b) => {
      b.north = 15;
    });
    const save = storeProject();
    await Promise.resolve();
    expect(saveProject).not.toHaveBeenCalled();
    answer(null);
    await save;
    expect(saveProject).not.toHaveBeenCalled();
    expect(hasUnsavedChanges()).toBe(true);
    expect(await confirmDiscard()).toBe(false);
  });
});
