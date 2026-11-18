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
    ago: () => "now",
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
vi.mock("../src/i18n", () => ({
  locale: () => "en",
  t: (s: string) => s,
  errorText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
// The copies of the server plans in the browser, in memory.
const copies = new Map<string, Record<string, unknown>>();
vi.mock("../src/io/projects", () => ({
  newProjectId: () => `tab-${Math.random()}`,
  listRemoteCopies: vi.fn(async () => [...copies.values()]),
  loadRemoteCopy: vi.fn(async (_address: string, planId: string) => copies.get(planId)),
  removeRemoteCopies: vi.fn(async () => undefined),
  saveRemoteCopy: vi.fn(async () => undefined),
  saveRemoteEdits: vi.fn(async (_address: string, planId: string, edited: string | null) => {
    const copy = copies.get(planId);
    if (!copy) return;
    if (edited === null) delete copy.editedData;
    else copy.editedData = edited;
  }),
}));

import { doc } from "../src/ui/context";
import { load, remoteHooks } from "../src/ui/projects";
import { openRemote, setupRemote } from "../src/ui/remote";
import { saveRemoteEdits } from "../src/io/projects";

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
  vi.stubGlobal("document", {
    body: { classList: { toggle: vi.fn() } },
    baseURI: "https://server/app/",
  });
  vi.stubGlobal("location", {
    protocol: "https:",
    href: "https://server/app/",
    pathname: "/app/",
    search: "",
    hash: "",
  });
  // Like a browser, a new address changes the location.
  vi.stubGlobal("history", {
    replaceState: vi.fn((_state: unknown, _title: string, url: string) =>
      Object.assign(location, { href: url, pathname: new URL(url).pathname }),
    ),
  });
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
  copies.clear();
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

  it("names the open plan in the address, and the app without it", async () => {
    await openRemote("house");
    expect(history.replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "https://server/app/plans/house",
    );
    remoteHooks.end();
    expect(history.replaceState).toHaveBeenLastCalledWith(null, "", "https://server/app/");
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

  it("keeps the newer own change when an earlier send without an answer comes back", async () => {
    await openRemote("house");
    doc.editBuilding((b) => {
      b.north = 10;
    });
    // The first send gets no answer, but the server applies it later.
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Timeout"));
    await remoteHooks.save();
    const sent = vi.mocked(fetch).mock.calls.at(-1)![1]!;
    const client = (sent.headers as Record<string, string>)["X-Client"];
    doc.editBuilding((b) => {
      b.north = 20;
    });
    // The second send waits for its answer, and the first one comes back on the stream.
    const answer = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(answer.promise);
    const saving = remoteHooks.save();
    emit("revision", { id: "2", parent: "1", client, patch: north(10) });
    expect(doc.building.north).toBe(20);
    emit("revision", { id: "3", parent: "2", client, patch: north(20) });
    answer.resolve(json(info({ revision: "3" })));
    await saving;
    expect(doc.building.north).toBe(20);
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

  it("edits the copy without the network, and sends the changes when the server answers", async () => {
    copies.set("house", {
      key: "x|house",
      planId: "house",
      name: "House",
      revision: "1",
      time: 1,
      write: true,
      data: serializeBuilding(emptyBuilding()),
    });
    const original = vi.mocked(fetch).getMockImplementation()!;
    let online = false;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (!online && String(url).includes("/plans/")) throw new TypeError("No network");
      return original(url as string, init);
    });
    await openRemote("house");
    // The copy opens to edit, and the browser keeps the change.
    expect(remoteHooks.active()).toBe(true);
    expect(doc.readOnly).toBe(false);
    doc.editBuilding((b) => {
      b.north = 25;
    });
    await remoteHooks.save();
    await vi.advanceTimersByTimeAsync(600);
    expect(saveRemoteEdits).toHaveBeenCalledWith("https://server", "house", expect.any(String));
    expect(JSON.parse(String(copies.get("house")!.editedData)).north).toBe(25);
    // The network comes back: the change goes to the server as a patch on its newest revision.
    online = true;
    const onOnline = vi
      .mocked(window.addEventListener)
      .mock.calls.find(([name]) => name === "online")![1] as () => void;
    onOnline();
    await vi.advanceTimersByTimeAsync(0);
    const sent = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith("/plans/house/changes"));
    expect(sent).toBeDefined();
    expect(JSON.parse(String(sent![1]!.body)).patch).toMatchObject({
      keys: { north: { t: "set", v: 25 } },
    });
    expect(doc.building.north).toBe(25);
  });

  it("sends the changes of an earlier time without the network when the plan opens", async () => {
    const edited = emptyBuilding();
    edited.north = 40;
    copies.set("house", {
      key: "x|house",
      planId: "house",
      name: "House",
      revision: "1",
      time: 1,
      write: true,
      data: serializeBuilding(emptyBuilding()),
      editedData: serializeBuilding(edited),
    });
    await openRemote("house");
    await vi.advanceTimersByTimeAsync(0);
    expect(doc.building.north).toBe(40);
    const sent = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith("/plans/house/changes"));
    expect(JSON.parse(String(sent![1]!.body)).patch).toMatchObject({
      keys: { north: { t: "set", v: 40 } },
    });
  });

  it("moves the changes without the network onto the newer copy of the server", async () => {
    const edited = emptyBuilding();
    edited.north = 40;
    copies.set("house", {
      key: "x|house",
      planId: "house",
      name: "House",
      revision: "1",
      time: 1,
      write: true,
      data: serializeBuilding(emptyBuilding()),
      editedData: serializeBuilding(edited),
    });
    // Another person renamed the first story on the server.
    const newer = emptyBuilding();
    newer.stories[0].name = "Garden floor";
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) =>
      String(url).endsWith("/plans/house")
        ? json(info({ revision: "2", data: serializeBuilding(newer) }))
        : original(url as string, init),
    );
    await openRemote("house");
    await vi.advanceTimersByTimeAsync(0);
    // The stored changes have the newest revision as their base, so they never undo the rename.
    const stored = vi
      .mocked(saveRemoteEdits)
      .mock.calls.map(([, , data]) => data)
      .filter((data): data is string => typeof data === "string")
      .map((data) => JSON.parse(data));
    expect(stored.at(-1)).toMatchObject({ north: 40 });
    expect(stored.at(-1).stories[0].name).toBe("Garden floor");
  });
});
