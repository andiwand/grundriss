import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBuilding } from "../src/model/building";
import { serializeBuilding } from "../src/model/file";
import { ServerClient } from "../src/io/server";

vi.mock("../src/ui/context", async () => {
  const { PlanDocument } = await import("../src/model/history");
  return {
    doc: new PlanDocument(),
    app: { fileName: "plan.grundriss", planOpen: true },
    shell: { enterPlan: vi.fn() },
    showStatus: vi.fn(),
    $: () => ({ append: vi.fn(), addEventListener: vi.fn() }),
  };
});
vi.mock("../src/ui/projects", async () => {
  const { doc, app } = await import("../src/ui/context");
  const remoteHooks = { end: () => {}, save: async () => {}, unsaved: () => false };
  return {
    remoteHooks,
    confirmDiscard: vi.fn(async () => true),
    addProject: vi.fn(async () => "local-copy"),
    load: (
      building: ReturnType<typeof emptyBuilding>,
      name: string,
      _handle: unknown,
      kind: string,
    ) => {
      if (kind !== "remote") remoteHooks.end();
      doc.replace(building);
      app.fileName = name;
    },
    projectName: () => "Plan",
    updateTitle: vi.fn(),
    renderHome: vi.fn(),
  };
});
vi.mock("../src/ui/panel", () => ({ iconButton: vi.fn() }));
vi.mock("../src/i18n", () => ({ locale: () => "en", t: (s: string) => s }));

import { doc } from "../src/ui/context";
import { addProject, load, remoteHooks } from "../src/ui/projects";
import { openRemote, setupRemote } from "../src/ui/remote";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const info = () => ({
  id: "house",
  name: "House",
  owner: "Root",
  revision: "1",
  updated: 1,
  by: "Root",
  write: true,
  lease: null,
  data: serializeBuilding(emptyBuilding()),
});
let events: EventTarget;
const emit = (name: string, data: unknown) =>
  events.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    ...globalThis,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    addEventListener: vi.fn(),
  });
  vi.stubGlobal("document", { body: { classList: { toggle: vi.fn() } } });
  vi.stubGlobal("location", { protocol: "file:", hash: "" });
  vi.stubGlobal("localStorage", { getItem: () => "[]", setItem: vi.fn() });
  vi.stubGlobal(
    "confirm",
    vi.fn(() => false),
  );
  events = new EventTarget();
  Object.assign(events, { close: vi.fn() });
  vi.spyOn(ServerClient.prototype, "events").mockReturnValue(events as EventSource);
  // The client uses instance fields for API calls.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = url.split("/api/")[1];
      return new Response(
        JSON.stringify(
          path === "me"
            ? {
                api: 1,
                version: "test",
                server: "Test",
                mode: "full",
                token: { kind: "root", write: true },
              }
            : path.endsWith("/lease")
              ? { holder: "Root", until: Date.now() + 60_000 }
              : info(),
        ),
      );
    }),
  );
  doc.replace(emptyBuilding());
  doc.readOnly = false;
  setupRemote();
});
afterEach(() => {
  remoteHooks.end();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("remote sessions", () => {
  it("opens a plan without secure-context UUID support", async () => {
    vi.stubGlobal("crypto", {});
    await openRemote("http://lan-server/token", "house");
    expect(remoteHooks.active()).toBe(true);
    expect(doc.readOnly).toBe(false);
  });

  it("keeps the remote session and unsaved work if a conflict copy cannot be stored", async () => {
    await openRemote("https://server/token", "house");
    doc.editBuilding((b) => {
      b.north = 25;
    });
    vi.mocked(addProject).mockRejectedValueOnce(new Error("Storage full"));
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Conflict" }), { status: 409 }),
    );
    await remoteHooks.save();
    await vi.advanceTimersByTimeAsync(0);
    expect(remoteHooks.active()).toBe(true);
    expect(remoteHooks.unsaved()).toBe(true);
    expect(doc.building.north).toBe(25);
  });

  it("loads the newest revision before a waiting viewer starts editing", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    let canEdit = false;
    const latest = emptyBuilding();
    latest.north = 35;
    vi.mocked(fetch).mockImplementation((url, init) => {
      if (String(url).endsWith("/lease") && init?.method === "POST" && !canEdit) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Busy", lease: { holder: "Other" } }), {
            status: 423,
          }),
        );
      }
      if (String(url).endsWith("/plans/house") && canEdit) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ...info(), revision: "2", data: serializeBuilding(latest) }),
          ),
        );
      }
      return original(url, init);
    });
    await openRemote("https://server/token", "house");
    expect(doc.readOnly).toBe(true);
    canEdit = true;
    emit("lease", null);
    await vi.advanceTimersByTimeAsync(0);
    expect(doc.readOnly).toBe(false);
    expect(doc.building.north).toBe(35);
  });

  it("does not let an older viewer refresh replace a newer one", async () => {
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).endsWith("/plans/house"))
        return new Response(JSON.stringify({ ...info(), write: false }));
      return original(url, init);
    });
    await openRemote("https://server/token", "house");
    const older = deferred<Response>();
    const newer = emptyBuilding();
    newer.north = 35;
    vi.mocked(fetch).mockReturnValueOnce(older.promise);
    emit("revision", { id: "2", client: "other" });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ...info(), revision: "3", data: serializeBuilding(newer) })),
    );
    emit("revision", { id: "3", client: "other" });
    await vi.advanceTimersByTimeAsync(0);
    older.resolve(new Response(JSON.stringify({ ...info(), revision: "2" })));
    await vi.advanceTimersByTimeAsync(0);
    expect(doc.building.north).toBe(35);
  });

  it("keeps unsaved changes after losing the lease and receiving a newer revision", async () => {
    await openRemote("https://server/token", "house");
    doc.editBuilding((b) => {
      b.north = 25;
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Busy" }), { status: 423 }),
    );
    await remoteHooks.save();
    expect(doc.readOnly).toBe(true);
    expect(remoteHooks.unsaved()).toBe(true);
    emit("revision", { id: "2", client: "someone" });
    await Promise.resolve();
    await Promise.resolve();
    expect(doc.building.north).toBe(25);
  });

  it("blocks edits while the initial lease is pending and ignores its stale result", async () => {
    const lease = deferred<Response>();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((url, init) =>
      String(url).endsWith("/lease") && init?.method === "POST"
        ? lease.promise
        : original(url, init),
    );
    const opening = openRemote("https://server/token", "house");
    await vi.waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/lease"), expect.anything()),
    );
    expect(doc.readOnly).toBe(true);
    load(emptyBuilding(), "Local", null);
    lease.resolve(new Response(JSON.stringify({ holder: "Root", until: Date.now() + 60_000 })));
    await opening;
    await vi.advanceTimersByTimeAsync(0);
    expect(doc.readOnly).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores a failed renewal after another document opens", async () => {
    await openRemote("https://server/token", "house");
    const renewal = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(renewal.promise);
    await vi.advanceTimersByTimeAsync(20_000);
    load(emptyBuilding(), "Local", null);
    renewal.resolve(new Response(JSON.stringify({ error: "Busy" }), { status: 423 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(doc.readOnly).toBe(false);
  });

  it("ignores a save conflict after another document opens", async () => {
    await openRemote("https://server/token", "house");
    doc.editBuilding((b) => {
      b.north = 25;
    });
    const write = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(write.promise);
    const saving = remoteHooks.save();
    load(emptyBuilding(), "Local", null);
    write.resolve(new Response(JSON.stringify({ error: "Conflict" }), { status: 409 }));
    await saving;
    expect(confirm).not.toHaveBeenCalled();
    expect(doc.readOnly).toBe(false);
  });
});
