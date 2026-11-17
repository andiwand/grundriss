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
    $: () => ({ append: vi.fn(), addEventListener: vi.fn(), classList: { toggle: vi.fn() } }),
  };
});
vi.mock("../src/ui/projects", async () => {
  const { doc, app } = await import("../src/ui/context");
  const remoteHooks = {
    end: () => {},
    save: async () => {},
    unsaved: () => false,
    active: () => false,
  };
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
vi.mock("../src/ui/presence", () => ({
  startPresence: vi.fn(),
  endPresence: vi.fn(),
  peopleAgain: vi.fn(),
  personGone: vi.fn(),
  personSeen: vi.fn(),
  personSeenSelf: vi.fn(),
  nameDialog: vi.fn(),
}));
vi.mock("../src/i18n", () => ({ locale: () => "en", t: (s: string) => s }));

import { doc } from "../src/ui/context";
import { load, remoteHooks } from "../src/ui/projects";
import { openRemote, setupRemote } from "../src/ui/remote";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => (resolve = yes));
  return { promise, resolve };
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const info = (change: Record<string, unknown> = {}) => ({
  id: "house",
  name: "House",
  owner: "Anna",
  revision: "1",
  updated: 1,
  by: "Anna",
  write: true,
  share: true,
  delete: true,
  data: serializeBuilding(emptyBuilding()),
  ...change,
});

const session = {
  api: 2,
  version: "test",
  server: "Test",
  account: { id: "a", name: "Anna", admin: false, createPlans: true },
  grants: [],
};

let events: EventTarget;
const emit = (name: string, data: unknown) =>
  events.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));

beforeEach(async () => {
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
  vi.stubGlobal("location", {
    protocol: "https:",
    href: "https://server/app/",
    pathname: "/app/",
    search: "",
    hash: "",
  });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal(
    "confirm",
    vi.fn(() => false),
  );
  events = new EventTarget();
  Object.assign(events, { close: vi.fn() });
  vi.spyOn(ServerClient.prototype, "events").mockReturnValue(events as EventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url).split("/api/")[1];
      return json(path === "session" ? session : info());
    }),
  );
  doc.replace(emptyBuilding());
  doc.readOnly = false;
  await setupRemote();
});
afterEach(() => {
  remoteHooks.end();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const north = (v: number) => ({ t: "keys", keys: { north: { t: "set", v } } });

describe("remote sessions", () => {
  it("finds the server of the app at /api/session", () => {
    expect(fetch).toHaveBeenCalledWith("https://server/api/session", expect.anything());
  });

  it("opens a plan without secure-context UUID support", async () => {
    vi.stubGlobal("crypto", {});
    await openRemote("house");
    expect(remoteHooks.active()).toBe(true);
    expect(doc.readOnly).toBe(false);
  });

  it("opens a plan of a link that only views as read only", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(info({ write: false, share: false })));
    await openRemote("house");
    expect(doc.readOnly).toBe(true);
  });

  it("keeps unsaved work when the server refuses a change", async () => {
    await openRemote("house");
    doc.editBuilding((b) => {
      b.north = 25;
    });
    vi.mocked(fetch).mockResolvedValueOnce(json({ error: "You can only view this plan." }, 403));
    await remoteHooks.save();
    expect(doc.readOnly).toBe(true);
    expect(remoteHooks.unsaved()).toBe(true);
    expect(doc.building.north).toBe(25);
  });

  it("applies a change of another person on top of the own unsent change", async () => {
    await openRemote("house");
    doc.editBuilding((b) => {
      b.north = 25;
    });
    emit("revision", {
      id: "2",
      parent: "1",
      client: "other",
      patch: { t: "keys", keys: { location: { t: "set", v: null } } },
    });
    expect(doc.building.north).toBe(25);
    emit("revision", { id: "3", parent: "2", client: "other", patch: north(10) });
    // The own change is newer, so it stays on top.
    expect(doc.building.north).toBe(25);
    expect(remoteHooks.unsaved()).toBe(true);
  });

  it("takes the change of another person without own changes", async () => {
    await openRemote("house");
    emit("revision", { id: "2", parent: "1", client: "other", patch: north(10) });
    expect(doc.building.north).toBe(10);
    expect(remoteHooks.unsaved()).toBe(false);
  });

  it("ignores a send that answers after another document opens", async () => {
    await openRemote("house");
    doc.editBuilding((b) => {
      b.north = 25;
    });
    const answer = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(answer.promise);
    const saving = remoteHooks.save();
    load(emptyBuilding(), "Local", null);
    answer.resolve(json({ error: "You can only view this plan." }, 403));
    await saving;
    expect(remoteHooks.active()).toBe(false);
    expect(doc.readOnly).toBe(false);
  });
});
