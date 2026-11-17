// The plans on the Grundriss server that serves this app (server/). The app of a server is at
// `/app/`, and the API at `/api/`; the app on GitHub Pages has no server, so this module does
// nothing there. A person logs in with an account, or opens a share link (`/s/<token>`), which
// adds the plan of the link to the session of the browser.
//
// An open plan of the server is a session. All people who can edit the plan edit it at the same
// time: the app sends the changes of its user as a patch (`src/model/patch.ts`) after a short
// wait, and the server applies the patches in their order and sends each one to the other tabs
// on a stream. Each tab applies them to the last revision that it knows (`saved`) and moves its
// own changes that the server does not have yet on top (`adopt`). A person can also only view,
// and follow another person (`presence.ts`).

import { planPreview } from "../export/preview";
import { locale, t } from "../i18n";
import {
  newProjectId,
  listRemoteCopies,
  loadRemoteCopy,
  removeRemoteCopies,
  saveRemoteEdits,
  type RemoteCopy,
  saveRemoteCopy,
} from "../io/projects";
import { icon, type IconName } from "../icons";
import {
  API_VERSION,
  ServerClient,
  ServerError,
  type Account,
  type Invite,
  type Person,
  type RemotePlan,
  type SessionInfo,
  type Share,
} from "../io/server";
import { emptyBuilding } from "../model/building";
import { parseBuilding, serializeBuilding } from "../model/file";
import { fmt } from "../model/format";
import { diffBuildings, patchBuilding, type Patch } from "../model/patch";
import type { Building } from "../model/types";
import { $, app, doc, shell, showStatus } from "./context";
import { actionButton, dialog, footer, note, row } from "./dialog";
import { remoteSource, showVersions } from "./versions";
import {
  endPresence,
  nameDialog,
  personSeenSelf,
  peopleAgain,
  personGone,
  personSeen,
  startPresence,
} from "./presence";
import {
  checkbox,
  iconButton,
  numberInput,
  pair,
  radioGroup,
  selectInput,
  textInput,
} from "./controls";
import {
  addProject,
  ago,
  confirmDiscard,
  load,
  localize,
  projectBuilding,
  projectId,
  projectName,
  remoteHooks,
  renderHome,
  trashProjectById,
  updateTitle,
} from "./projects";

// ----- The server -----

/** The server of this app: its client, and the session of this browser (null without network). */
interface ServerState {
  client: ServerClient;
  info: SessionInfo | null;
  /** The name of the server, also without the network. */
  name: string;
}

/** The server that this app knew the last time, for the copies of its plans without network. */
const KNOWN_KEY = "grundriss-server";

let server: ServerState | null = null;

const errorText = (error: unknown) => (error instanceof Error ? t(error.message) : String(error));

const account = (): Account | null => server?.info?.account ?? null;
const canCreate = () => {
  const a = account();
  return !!a && (a.admin || a.createPlans);
};

/** The size of the plans in MB, for the space of an account. */
const megabytes = (bytes: number) => {
  const mb = bytes / 1_048_576;
  return `${fmt(mb, mb >= 10 || Number.isInteger(mb) ? 0 : 1)} MB`;
};

/** The space and the plans of an account: "12.5 MB of 500 MB, 3 of 100 plans". */
function usageText(a: Account): string {
  const space =
    a.limit > 0
      ? t("{used} of {limit}", { used: megabytes(a.used), limit: megabytes(a.limit) })
      : megabytes(a.used);
  const plans =
    a.planLimit > 0
      ? t("{count} of {limit} plans", { count: a.plans, limit: a.planLimit })
      : t("{count} plans", { count: a.plans });
  return `${space} · ${plans}`;
}

/** The text of the rights of an account or an invite, for the lists. */
function rightsText(rights: { createPlans: boolean; seeAll: boolean; makeAccounts: boolean }) {
  const parts: string[] = [];
  if (rights.createPlans) parts.push(t("makes plans"));
  if (rights.seeAll) parts.push(t("sees all plans"));
  if (rights.makeAccounts) parts.push(t("invites"));
  return parts.join(" · ") || t("only shared plans");
}

const dateText = (time: number) => new Date(time).toLocaleDateString(locale());

/**
 * Finds the server of this app: the app at `/app/` asks `/api/session`. The app on GitHub Pages
 * and the dev server get no JSON there, so they have no server. Without the network, the server
 * that this app knew stays, so its copies open.
 */
async function findServer(): Promise<ServerState | null> {
  if (!/^https?:$/.test(location.protocol)) return null;
  const base = new URL("../", document.baseURI).href.replace(/\/+$/, "");
  let known: { base: string; name: string } | null = null;
  try {
    known = JSON.parse(localStorage.getItem(KNOWN_KEY) ?? "null");
  } catch {
    // Without the storage, there are no copies to show either.
  }
  let response: Response;
  try {
    response = await fetch(`${base}/api/session`, {
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    return known?.base === base
      ? { client: new ServerClient(base), info: null, name: known.name }
      : null;
  }
  if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return null;
  const info = (await response.json()) as SessionInfo;
  if (info.api !== API_VERSION) {
    showStatus(
      t(
        "The server has another version of the API ({server}; the app knows {app}). Load the page again.",
        { server: info.api, app: API_VERSION },
      ),
      true,
    );
    return null;
  }
  remember(base, info.server);
  return { client: new ServerClient(base), info, name: info.server };
}

function remember(base: string, name: string): void {
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify({ base, name }));
  } catch {
    // Without the storage, the copies do not open without the network.
  }
}

/**
 * The address of the app with a plan open (`/app/plans/<id>`), or of the app alone. The base of
 * the document is the folder of the app, also on the address of a plan (index.html).
 */
const planAddress = (planId: string | null) =>
  new URL(planId ? `plans/${encodeURIComponent(planId)}` : "./", document.baseURI).href;

/** Takes a new session of the server, for example after a login, and shows it. */
function setSession(info: SessionInfo): void {
  if (!server) return;
  server.info = info;
  server.name = info.server;
  remember(server.client.base, info.server);
  if (!app.planOpen) renderHome();
  updateRemoteState();
}

// ----- The session of an open plan -----

interface Session {
  client: ServerClient;
  planId: string;
  serverName: string;
  revision: string;
  /** True if this person can edit the plan. */
  write: boolean;
  /** True if this person can make share links of the plan. */
  share: boolean;
  /** True while this tab edits: it can write, and does not only view. */
  editing: boolean;
  /** The building of the last revision of the server. */
  saved: Building;
  saving: Promise<void> | null;
  failed: boolean;
  events: EventSource | null;
  loading: number;
  /** True for the copy of the browser, without the network: only to view. */
  offline: boolean;
  /** True if the user chose to only view the plan, although the person can edit it. */
  viewOnly: boolean;
  /** The changes of the server that wait for the ones before them, by their parent revision. */
  waiting: Map<string, Change>;
  /** The functions that wait until the session knows a revision. */
  waiters: { revision: string; done: () => void }[];
  /**
   * The patch that this tab sent and the stream did not bring back yet, and the revision that
   * the server gave it (once the answer is there). The own changes after it are the difference
   * between `saved` with this patch and the building of the document.
   */
  inflight: Patch | null;
  inflightRevision: string;
  /** The timer of the load of the whole plan when a change of the server did not come. */
  gap: number;
  /** The timer of the copy in the browser, which waits for a pause of the changes. */
  copyTimer: number;
  /**
   * The building whose changes the browser keeps for the server (`saveRemoteEdits`), so that
   * they stay without the network and after the tab closes. `saved` if there are none.
   */
  stored: Building;
  /** True if the browser keeps changes for the server. */
  edits: boolean;
  /** The timer of the changes in the browser, which waits for a pause of the changes. */
  editsTimer: number;
  /** The timer that asks the server again, without the network. */
  reconnect: number;
  /** The timer and the pause of the next try of a send that failed, in ms. */
  retry: number;
  retryDelay: number;
}

/** A change of the plan on the server: a new revision with its patch, from the stream. */
interface Change {
  id: string;
  parent: string | null;
  client: string;
  name?: string;
  /** The patch, or nothing for a save of the whole plan. */
  patch?: Patch;
}

/** Revision ids are numbers that count up. */
const revisionNumber = (id: string | null) => Number(id ?? 0);

/** Keeps the state of the plan in the browser, for use without the network. */
function storeCopy(current: Session, name: string, data: string): void {
  void saveRemoteCopy(
    current.client.base,
    current.planId,
    name,
    current.revision,
    data,
    planPreview(current.saved),
    current.write,
  ).catch(() => undefined);
}

/**
 * Keeps the changes that the server does not have in the browser, or removes them if there are
 * none: without the network, and while a send fails. The server gets them when it answers again.
 */
function storeEdits(current: Session): void {
  window.clearTimeout(current.editsTimer);
  current.editsTimer = 0;
  const building = doc.building;
  const changed = building !== current.saved && !!diffBuildings(current.saved, building);
  current.stored = building;
  if (!changed && !current.edits) return;
  current.edits = changed;
  void saveRemoteEdits(
    current.client.base,
    current.planId,
    changed ? serializeBuilding(building) : null,
  ).catch(() =>
    showStatus(t("The browser cannot keep your changes. Save a copy to a file."), true),
  );
  updateRemoteState();
}

/** Keeps the changes in the browser after a short pause, and at once when the page closes. */
function storeEditsSoon(current: Session): void {
  window.clearTimeout(current.editsTimer);
  current.editsTimer = window.setTimeout(() => {
    if (session === current) storeEdits(current);
  }, 500);
}

/** Keeps the copy in the browser after a pause of the changes of the others. */
function storeCopySoon(current: Session): void {
  window.clearTimeout(current.copyTimer);
  current.copyTimer = window.setTimeout(() => {
    if (session === current) storeCopy(current, projectName(), serializeBuilding(current.saved));
  }, 5000);
}

let session: Session | null = null;
let opening = 0;

/** True if the open plan has changes that neither the server nor the browser keeps. */
const unsaved = (current: Session) =>
  (doc.building !== current.saved && doc.building !== current.stored) || current.saving !== null;

/** True if the open plan has changes that the server does not have. */
const unsentChanges = (current: Session) =>
  doc.building !== current.saved && !!diffBuildings(current.saved, doc.building);

/** Opens a plan of the server, and starts its session. */
export async function openRemote(planId: string): Promise<void> {
  const state = server;
  if (!state) return;
  const request = ++opening;
  if (!(await confirmDiscard())) return;
  if (request !== opening) return;
  const building = doc.building;
  const generation = doc.generation;
  // Each session has its own id of the tab, so an old stream cannot change a new session.
  const client = new ServerClient(state.client.base, newProjectId());
  try {
    const plan = await client.plan(planId);
    if (request !== opening || generation !== doc.generation || building !== doc.building) return;
    const parsed = parseBuilding(plan.data);
    endSession();
    load(parsed, `${plan.name}.grundriss`, null, "remote");
    const current: Session = {
      client,
      planId,
      serverName: state.name,
      revision: plan.revision,
      write: plan.write,
      share: plan.share,
      editing: plan.write,
      saved: doc.building,
      saving: null,
      failed: false,
      events: null,
      loading: 0,
      offline: false,
      viewOnly: false,
      waiting: new Map(),
      waiters: [],
      inflight: null,
      inflightRevision: "",
      gap: 0,
      copyTimer: 0,
      stored: doc.building,
      edits: false,
      editsTimer: 0,
      reconnect: 0,
      retry: 0,
      retryDelay: 0,
    };
    session = current;
    doc.readOnly = !current.editing;
    // The changes that the person made without the network go on top of the newest revision.
    const copy = await loadRemoteCopy(state.client.base, planId).catch(() => undefined);
    if (session !== current) return;
    const own = copy?.editedData
      ? diffBuildings(parseBuilding(copy.data), parseBuilding(copy.editedData))
      : undefined;
    if (own) {
      current.edits = true;
      adopt(current, current.saved, own);
      current.stored = doc.building;
    }
    storeCopy(current, plan.name, plan.data);
    // The address names the plan, for a bookmark.
    history.replaceState(null, "", planAddress(planId));
    listen(current);
    startPresence({
      client: current.client,
      planId: current.planId,
      name: account()?.name ?? "",
      write: current.write,
      viewOnly: () => current.viewOnly,
      setViewOnly: (value) => setViewOnly(current, value),
    });
    showStatus(
      own && current.editing
        ? t("Your changes without the network go to the server now.")
        : own
          ? t(
              "You can only view this plan now. Your changes without the network stay in this browser: save a copy to keep them.",
            )
          : current.editing
            ? t('Opened "{name}" on {server}. Each change saves to the server.', {
                name: plan.name,
                server: state.name,
              })
            : t('Opened "{name}" on {server} to view.', { name: plan.name, server: state.name }),
      !!own && !current.editing,
    );
    shell.enterPlan("structure");
    if (own && current.editing) void save();
  } catch (error) {
    // Without the network, the copy of the browser opens to view.
    if (error instanceof ServerError && error.status === 0 && request === opening) {
      if (await openOffline(planId, client)) return;
    }
    showStatus(errorText(error), true);
    // A plan that this browser cannot open: perhaps after a login.
    if (error instanceof ServerError && (error.status === 401 || error.status === 404)) {
      if (!account()) loginDialog();
    }
  }
  updateRemoteState();
}

/**
 * Opens the copy of a plan of the server that the browser keeps. A person who could edit the
 * plan edits the copy: the browser keeps the changes, and they go to the server when it answers
 * again (`tryOnline`). The changes of an earlier time without the network are there too.
 */
async function openOffline(planId: string, client: ServerClient): Promise<boolean> {
  const copy = await loadRemoteCopy(client.base, planId).catch(() => undefined);
  if (!copy) return false;
  const name = server?.name ?? "";
  const write = copy.write === true;
  endSession();
  doc.readOnly = !write;
  const base = parseBuilding(copy.data);
  load(
    copy.editedData ? parseBuilding(copy.editedData) : base,
    `${copy.name}.grundriss`,
    null,
    "remote",
  );
  const current: Session = {
    client,
    planId,
    serverName: name,
    revision: copy.revision,
    write,
    share: false,
    editing: write,
    // The plan of the server, under the changes of the browser.
    saved: copy.editedData ? base : doc.building,
    saving: null,
    failed: false,
    events: null,
    loading: 0,
    offline: true,
    viewOnly: false,
    waiting: new Map(),
    waiters: [],
    inflight: null,
    inflightRevision: "",
    gap: 0,
    copyTimer: 0,
    stored: doc.building,
    edits: !!copy.editedData,
    editsTimer: 0,
    reconnect: 0,
    retry: 0,
    retryDelay: 0,
  };
  session = current;
  current.reconnect = window.setInterval(() => void tryOnline(current), RECONNECT);
  showStatus(
    write
      ? t(
          "No connection to {server}. You edit the copy of this browser from {time}. The changes go to the server when it answers again.",
          { server: name, time: ago(copy.time) },
        )
      : t(
          "No connection to {server}. You see the copy of this browser from {time}, only to view.",
          {
            server: name,
            time: ago(copy.time),
          },
        ),
    true,
  );
  shell.enterPlan("structure");
  updateRemoteState();
  return true;
}

/** How often the app asks the server again without the network, in ms. */
const RECONNECT = 20_000;

/** Asks the server again. If it answers, the session goes on with it (`goOnline`). */
async function tryOnline(current: Session): Promise<void> {
  if (session !== current || !current.offline || current.loading) return;
  current.loading++;
  let plan: RemotePlan & { data: string };
  try {
    plan = await current.client.plan(current.planId);
  } catch (error) {
    // A plan that the server removed, or a lost access: the changes stay in the browser.
    if (session === current && error instanceof ServerError && error.status !== 0) {
      window.clearInterval(current.reconnect);
      showStatus(
        t("The server does not give this plan any more. Save a copy to keep your changes."),
        true,
      );
    }
    return;
  } finally {
    current.loading = 0;
  }
  if (session === current && current.offline) goOnline(current, plan);
}

/**
 * The server answers again: the newest revision of the server comes, with the changes of the
 * browser on top, which then go to the server as a patch. Changes of different things all stay;
 * for the same field, the change of the browser comes last and wins.
 */
function goOnline(current: Session, plan: RemotePlan & { data: string }): void {
  window.clearInterval(current.reconnect);
  storeEdits(current);
  const own = diffBuildings(current.saved, doc.building);
  current.offline = false;
  current.write = plan.write;
  current.share = plan.share;
  current.editing = plan.write && !current.viewOnly;
  current.revision = plan.revision;
  current.failed = false;
  adopt(current, parseBuilding(plan.data), own);
  current.stored = doc.building;
  doc.readOnly = !current.editing;
  storeCopy(current, plan.name, plan.data);
  listen(current);
  startPresence({
    client: current.client,
    planId: current.planId,
    name: account()?.name ?? "",
    write: current.write,
    viewOnly: () => current.viewOnly,
    setViewOnly: (value) => setViewOnly(current, value),
  });
  // The session of the server, for example after a start without the network.
  if (server) void server.client.session().then(setSession, () => undefined);
  if (own && current.editing) {
    showStatus(t("The server answers again. Your changes go to it now."));
    void save();
  } else if (own) {
    showStatus(
      t(
        "You can only view this plan now. Your changes without the network stay in this browser: save a copy to keep them.",
      ),
      true,
    );
  } else {
    showStatus(t("The server answers again."));
  }
  updateRemoteState();
}

/** The stream of the plan: the changes and the people. */
function listen(current: Session): void {
  const events = current.client.events(current.planId);
  current.events = events;
  const read = (event: Event) => JSON.parse((event as MessageEvent<string>).data) as unknown;
  events.addEventListener("hello", (event) => {
    if (session !== current) return;
    // After a lost connection, the stream starts again: the server forgot this tab, and a newer
    // revision loads.
    const hello = read(event) as { revision: string | null; people?: Person[] };
    peopleAgain(hello.people ?? []);
    // Changes that failed to go to the server, for example without the network, go now.
    const resend = () => {
      if (session === current && current.editing && current.failed && unsentChanges(current)) {
        void save();
      }
    };
    if (hello.revision && hello.revision !== current.revision) void catchUp(current).then(resend);
    else resend();
  });
  events.addEventListener("revision", (event) => {
    if (session !== current) return;
    const change = read(event) as Change;
    // Each change comes once to each tab, also to the tab that sent it. A known own change is
    // in `saved` already, for example after a load of the whole plan.
    if (revisionNumber(change.id) <= revisionNumber(current.revision)) {
      if (change.client === current.client.client) current.inflight = null;
      return;
    }
    current.waiting.set(change.parent ?? "", change);
    advance(current);
  });
  events.addEventListener("presence", (event) => {
    if (session !== current) return;
    const person = read(event) as Person & { gone?: boolean };
    if (person.gone) personGone(person.client);
    else personSeen(person);
  });
  events.addEventListener("removed", () => {
    if (session !== current) return;
    current.write = false;
    current.editing = false;
    doc.readOnly = true;
    showStatus(t("The plan is gone from the server. Save a copy to keep it."), true);
    updateRemoteState();
  });
}

// ----- Live editing -----

/** The own changes that the server does not have yet, also not in the patch on its way. */
function unsent(current: Session): Patch | undefined {
  const ahead = current.inflight ? patchBuilding(current.saved, current.inflight) : current.saved;
  return diffBuildings(ahead, doc.building);
}

/**
 * Makes `next` the building of the server, and shows it with the own changes on top: the patch on
 * its way, and the changes after it. Without own changes, the document gets the building of the
 * server itself, so that the plan has no unsaved changes.
 */
function adopt(current: Session, next: Building, own: Patch | undefined): void {
  current.saved = next;
  const ahead = current.inflight ? patchBuilding(next, current.inflight) : next;
  const local = own ? patchBuilding(ahead, own) : ahead;
  if (diffBuildings(next, local)) doc.applyRemote(local);
  else {
    doc.applyRemote(next);
    doc.markSaved(next);
  }
}

/**
 * Applies the changes of the server that follow the known revision, in their order. The own
 * changes that the server does not have yet move on top of them. During a drag, the changes wait
 * until its end (`setupRemote` calls this again after it).
 */
function advance(current: Session): void {
  if (session !== current || doc.inTransaction) return;
  const own = unsent(current);
  const before = current.saved;
  let next = before;
  let whole = false;
  for (;;) {
    const change = current.waiting.get(current.revision);
    if (!change) break;
    current.waiting.delete(current.revision);
    if (!change.patch) {
      // A save of the whole plan, for example a restore of a version: load it.
      whole = true;
      break;
    }
    next = patchBuilding(next, change.patch);
    current.revision = change.id;
    // The own patch is in the building of the server now.
    if (change.client === current.client.client) current.inflight = null;
  }
  for (const key of current.waiting.keys()) {
    if (revisionNumber(key) < revisionNumber(current.revision)) current.waiting.delete(key);
  }
  if (next !== before) {
    adopt(current, next, own);
    storeCopySoon(current);
    updateRemoteState();
  }
  window.clearTimeout(current.gap);
  if (whole) void catchUp(current);
  // A change that waits for one that did not come: after a short time, load the whole plan.
  else if (current.waiting.size > 0) {
    current.gap = window.setTimeout(() => void catchUp(current), 3000);
  }
  for (const waiter of [...current.waiters]) {
    if (revisionNumber(current.revision) >= revisionNumber(waiter.revision)) {
      current.waiters.splice(current.waiters.indexOf(waiter), 1);
      waiter.done();
    }
  }
}

/**
 * Loads the last revision of the server, and moves the own changes that it does not have on
 * top of it, for example after a lost connection.
 */
async function catchUp(current: Session): Promise<void> {
  if (session !== current || current.loading) return;
  const request = ++current.loading;
  try {
    const plan = await current.client.plan(current.planId);
    if (session !== current || request !== current.loading) return;
    // A drag keeps its copy of the building: the new revision waits for its end.
    while (doc.inTransaction) {
      await new Promise((done) => window.setTimeout(done, 200));
      if (session !== current) return;
    }
    if (revisionNumber(plan.revision) <= revisionNumber(current.revision)) return;
    const own = unsent(current);
    current.revision = plan.revision;
    if (
      current.inflightRevision &&
      revisionNumber(current.inflightRevision) <= revisionNumber(plan.revision)
    ) {
      current.inflight = null;
    }
    for (const key of current.waiting.keys()) {
      if (revisionNumber(key) < revisionNumber(plan.revision)) current.waiting.delete(key);
    }
    adopt(current, parseBuilding(plan.data), own);
    storeCopy(current, plan.name, plan.data);
    app.fileName = `${plan.name}.grundriss`;
    updateTitle();
    advance(current);
  } catch (error) {
    if (session === current) showStatus(errorText(error), true);
  } finally {
    if (request === current.loading) current.loading = 0;
    updateRemoteState();
  }
}

/** Waits until the session knows the revision, or loads the whole plan after a while. */
function knows(current: Session, revision: string): Promise<void> {
  if (revisionNumber(current.revision) >= revisionNumber(revision)) return Promise.resolve();
  return new Promise((done) => {
    const waiter = { revision, done };
    current.waiters.push(waiter);
    window.setTimeout(() => {
      if (!current.waiters.includes(waiter)) return;
      void catchUp(current).finally(() => {
        current.waiters.splice(current.waiters.indexOf(waiter), 1);
        done();
      });
    }, 5000);
  });
}

/** Sends the own changes that the server does not have yet. */
async function sendChanges(current: Session): Promise<void> {
  const patch = diffBuildings(current.saved, doc.building);
  if (!patch) {
    if (doc.dirty) doc.markSaved(doc.building);
    return;
  }
  current.inflight = patch;
  current.inflightRevision = "";
  try {
    const plan = await current.client.sendChanges(
      current.planId,
      current.revision,
      patch,
      projectName(),
    );
    current.inflightRevision = plan.revision;
    current.failed = false;
    // The change comes back on the stream, with the changes of the others before it.
    await knows(current, plan.revision);
    current.retryDelay = 0;
    // The server has all changes: the browser keeps none for it any more.
    if (session === current && current.edits && !unsentChanges(current)) storeEdits(current);
  } catch (error) {
    if (session !== current) return;
    if (error instanceof ServerError && (error.status === 403 || error.status === 401)) {
      current.write = false;
      current.editing = false;
      doc.readOnly = true;
      showStatus(t("You can only view this plan now. Save a copy to keep your changes."), true);
      updateRemoteState();
      return;
    }
    if (error instanceof ServerError && error.status === 400) {
      // The server does not take the change: the plan of the server wins, the history stays.
      showStatus(
        t("The server did not take your last change: {error}", { error: errorText(error) }),
        true,
      );
      current.inflight = null;
      await catchUp(current);
      if (session === current) adopt(current, current.saved, undefined);
      return;
    }
    if (!current.failed) {
      showStatus(t("The server did not save the plan: {error}", { error: errorText(error) }), true);
    }
    current.failed = true;
    // The browser keeps the changes, also if the tab closes, until the server takes them. The
    // send tries again after a pause that grows from 2 s to 30 s.
    storeEditsSoon(current);
    current.retryDelay = Math.min(30_000, Math.max(2000, current.retryDelay * 2));
    window.clearTimeout(current.retry);
    current.retry = window.setTimeout(() => {
      if (session === current && current.failed) void save();
    }, current.retryDelay);
  } finally {
    // Without an answer, the patch may or may not be on the server: its echo or a load of the
    // whole plan decides. With the answer, `knows` waited for it.
    if (session === current && current.inflightRevision) current.inflight = null;
  }
}

/** Only view the plan, or edit it again. The changes that wait go to the server first. */
async function setViewOnly(current: Session, value: boolean): Promise<void> {
  if (session !== current || !current.write || current.viewOnly === value) return;
  if (value) {
    doc.cancel();
    while (session === current && !current.failed && unsentChanges(current)) await save();
  }
  if (session !== current) return;
  current.viewOnly = value;
  current.editing = current.write && !value;
  doc.readOnly = !current.editing;
  updateRemoteState();
}

/** Loads the current revision of the server into the open plan, and drops the own changes. */
async function reload(current: Session): Promise<boolean> {
  if (session !== current || current.saving || doc.inTransaction) return false;
  const request = ++current.loading;
  try {
    const plan = await current.client.plan(current.planId);
    if (session !== current || request !== current.loading || current.saving || doc.inTransaction)
      return false;
    const story = doc.activeStoryId;
    doc.replace(parseBuilding(plan.data));
    doc.setActiveStory(story);
    current.saved = doc.building;
    current.revision = plan.revision;
    current.waiting.clear();
    current.inflight = null;
    storeCopy(current, plan.name, plan.data);
    app.fileName = `${plan.name}.grundriss`;
    updateTitle();
    updateRemoteState();
    return true;
  } catch (error) {
    if (session === current) showStatus(errorText(error), true);
    return false;
  } finally {
    if (request === current.loading) current.loading = 0;
  }
}

/** Sends the changes of the open plan to the server. */
async function save(): Promise<void> {
  const current = session;
  if (!current || !current.editing) return;
  // Without the network, the browser keeps the changes for the server.
  if (current.offline) return storeEditsSoon(current);
  if (current.saving) return current.saving;
  if (doc.building === current.saved || doc.inTransaction) return;
  current.saving = sendChanges(current).finally(() => {
    current.saving = null;
    updateRemoteState();
    // A change during the send goes to the server after it.
    if (session === current && current.editing && !current.failed && unsentChanges(current)) {
      window.setTimeout(() => void save(), 100);
    }
  });
  updateRemoteState();
  return current.saving;
}

/** Ends the session and keeps the open plan as a new project in this browser. */
async function keepCopy(): Promise<void> {
  const current = session;
  const building = doc.building;
  const name = `${projectName()} (${t("copy")})`;
  const created = Date.now();
  try {
    const id = await addProject(building, name);
    if (session !== current || doc.building !== building) return;
    endSession();
    load(building, `${name}.grundriss`, null, { id, created });
    showStatus(t("The plan is now a copy in this browser, without the server."));
  } catch (error) {
    showStatus(errorText(error), true);
  }
}

/** Ends the session of the open plan: the stream closes, and the others see that it left. */
function endSession(): void {
  opening++;
  const current = session;
  if (!current) return;
  // Changes that wait for the browser go there now.
  if (current.editsTimer) storeEdits(current);
  session = null;
  window.clearTimeout(current.gap);
  window.clearTimeout(current.copyTimer);
  window.clearInterval(current.reconnect);
  window.clearTimeout(current.retry);
  current.events?.close();
  endPresence();
  doc.readOnly = false;
  if (location.href !== planAddress(null)) history.replaceState(null, "", planAddress(null));
  updateRemoteState();
}

// ----- The top bar -----

/** The mark of a plan of the server in the top bar, and the share button. */
function updateRemoteState(): void {
  const state = $<HTMLButtonElement>("#remote-state");
  const share = $<HTMLButtonElement>("#share");
  const current = session;
  // Share: the share links of a plan of the server; else the plan of the browser to the server.
  // The class plan-tools hides it on the Projects page.
  share.hidden = current ? !(current.share && !current.offline) : !canCreate();
  state.hidden = !current;
  document.body.classList.toggle("remote-plan", !!current);
  if (!current) return;
  const [iconName, text, tone]: [IconName, string, string] = current.offline
    ? [
        "cloud",
        current.edits
          ? t("Offline · changes wait")
          : current.editing
            ? t("Offline")
            : t("Offline copy"),
        "busy",
      ]
    : current.editing && current.failed && current.edits
      ? ["alert", t("Not sent · kept in the browser"), "bad"]
      : current.editing
        ? current.saving
          ? ["cloud", t("Saving…"), ""]
          : current.failed
            ? ["alert", t("Not saved"), "bad"]
            : ["cloud", current.serverName, ""]
        : current.viewOnly
          ? ["eye", t("Viewing"), ""]
          : ["cloud", t("View only"), "busy"];
  state.innerHTML = icon(iconName);
  state.append(text);
  state.className = `remote-state plan-tools ${tone}`;
  state.title = t("This plan is on the server {server}, revision {revision}. Click for more.", {
    server: current.serverName,
    revision: current.revision,
  });
}

// ----- Dialogs -----

/** A list of the ends of a share link: none, a few durations, or a date. */
function expiryField(parent: HTMLElement): () => number | null {
  const days = (n: number) => Date.now() + n * 86_400_000;
  const select = selectInput([
    ["", t("No end")],
    ["1", t("1 day")],
    ["7", t("7 days")],
    ["30", t("30 days")],
    ["365", t("1 year")],
    ["date", t("A date…")],
  ]);
  const date = textInput("", { type: "date" });
  date.hidden = true;
  select.addEventListener("change", () => (date.hidden = select.value !== "date"));
  row(parent, t("Ends"), pair(select, date));
  return () => {
    if (select.value === "") return null;
    if (select.value === "date") {
      // The link ends at the end of the chosen day.
      return date.value ? new Date(`${date.value}T23:59:59`).getTime() : null;
    }
    return days(Number(select.value));
  };
}

/** Shows a new link one time, with a button to copy it. */
function showNewLink(parent: HTMLElement, address: string, text: string): void {
  parent.querySelector(".new-link")?.remove();
  const box = document.createElement("div");
  box.className = "new-link";
  note(box, text, "dialog-note strong");
  const field = textInput(address);
  field.readOnly = true;
  field.addEventListener("focus", () => field.select());
  const copy = actionButton(t("Copy"), () => {
    void navigator.clipboard?.writeText(address).then(
      () => (copy.textContent = t("Copied")),
      () => field.select(),
    );
  });
  row(box, t("Link"), pair(field, copy));
  parent.prepend(box);
}

/** A row of a list: a name, a detail, and buttons. */
function listRow(name: string, detail: string, ...buttons: HTMLElement[]): HTMLElement {
  const line = document.createElement("div");
  line.className = "token-row";
  const text = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = name;
  const small = document.createElement("small");
  small.textContent = detail;
  text.append(strong, small);
  line.append(text, ...buttons);
  return line;
}

/** Fills a list from the server, or shows the error in it. */
async function fill<T>(
  list: HTMLElement,
  load: () => Promise<T[]>,
  item: (value: T) => HTMLElement,
): Promise<void> {
  try {
    const values = await load();
    list.replaceChildren(...values.map(item));
    if (values.length === 0) note(list, t("None yet."));
  } catch (error) {
    list.replaceChildren();
    note(list, errorText(error), "dialog-note warning");
  }
}

/** The fields for a name and a password, with the hints for the password manager. */
function passwordFields(body: HTMLElement, options: { name?: string; repeat: boolean }) {
  const name = textInput(options.name ?? "", { autocomplete: "username" });
  if (options.name !== undefined && options.name !== "") name.readOnly = true;
  row(body, t("Name"), name);
  const password = textInput("", {
    type: "password",
    autocomplete: options.repeat ? "new-password" : "current-password",
  });
  row(body, t("Password"), password);
  let again: HTMLInputElement | null = null;
  if (options.repeat) {
    again = textInput("", { type: "password", autocomplete: "new-password" });
    row(body, t("Password again"), again);
  }
  return {
    name,
    password,
    /** The error of the fields, or "". */
    check: () =>
      !name.value.trim()
        ? t("An account needs a name.")
        : password.value.length < 8 && options.repeat
          ? t("The password needs at least 8 characters.")
          : again && again.value !== password.value
            ? t("The two passwords are not the same.")
            : "",
  };
}

/** The login with a name and a password. */
function loginDialog(): void {
  const state = server;
  if (!state) return;
  const { element, body } = dialog(t("Log in to {server}", { server: state.name }));
  const { name, password, check } = passwordFields(body, { repeat: false });
  note(body, t("No account? Ask the admin of the server for an invite link."));
  const message = note(body, "", "dialog-note warning");
  const login = actionButton(
    t("Log in"),
    async () => {
      message.textContent = check();
      if (message.textContent) return;
      login.disabled = true;
      try {
        const info = await state.client.login(name.value.trim(), password.value);
        element.close();
        setSession(info);
        showStatus(t("Logged in as {name}.", { name: info.account?.name ?? "" }));
      } catch (error) {
        message.textContent = errorText(error);
      } finally {
        login.disabled = false;
      }
    },
    true,
  );
  for (const input of [name, password])
    input.addEventListener("keydown", (e) => e.key === "Enter" && login.click());
  footer(element, login);
  name.focus();
}

/** A link for one use: the setup of the admin, an invite, or a new password. */
async function linkDialog(kind: string, code: string): Promise<void> {
  const state = server;
  if (!state) return;
  let link: { kind: string; name: string; server: string };
  try {
    link = await state.client.link(code);
  } catch (error) {
    showStatus(errorText(error), true);
    return;
  }
  const title =
    link.kind === "setup"
      ? t("Set up {server}", { server: link.server })
      : link.kind === "reset"
        ? t("A new password")
        : t("Your account on {server}", { server: link.server });
  const { element, body } = dialog(title);
  note(
    body,
    link.kind === "setup"
      ? t("This is the first account of the server: the admin. The admin invites the others.")
      : link.kind === "reset"
        ? t("Choose a new password for {name}. The other logins of the account end.", {
            name: link.name,
          })
        : t("Choose a name and a password. The link works only once."),
  );
  const fields = passwordFields(body, {
    name: link.kind === "reset" ? link.name : undefined,
    repeat: true,
  });
  const message = note(body, "", "dialog-note warning");
  const done = actionButton(
    link.kind === "reset" ? t("Save the password") : t("Make the account"),
    async () => {
      message.textContent = fields.check();
      if (message.textContent) return;
      done.disabled = true;
      try {
        const info = await state.client.acceptLink(
          code,
          fields.name.value.trim(),
          fields.password.value,
        );
        element.close();
        setSession(info);
        showStatus(t("Logged in as {name}.", { name: info.account?.name ?? "" }));
      } catch (error) {
        message.textContent = errorText(error);
      } finally {
        done.disabled = false;
      }
    },
    true,
  );
  footer(element, done);
  void kind;
  (link.kind === "reset" ? fields.password : fields.name).focus();
}

/** The own account: the space, the password, and the logout. */
function accountDialog(): void {
  const state = server;
  const me = account();
  if (!state || !me) return;
  const { element, body } = dialog(me.name);
  note(body, t("On {server}: {usage}.", { server: state.name, usage: usageText(me) }));
  const heading = document.createElement("h3");
  heading.textContent = t("Change the password");
  body.append(heading);
  const old = textInput("", { type: "password", autocomplete: "current-password" });
  row(body, t("Old password"), old);
  const next = textInput("", { type: "password", autocomplete: "new-password" });
  row(body, t("New password"), next);
  const message = note(body, "", "dialog-note warning");
  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  actions.append(
    actionButton(t("Change the password"), async () => {
      message.textContent = "";
      if (next.value.length < 8) {
        message.textContent = t("The password needs at least 8 characters.");
        return;
      }
      try {
        await state.client.changePassword(old.value, next.value);
        old.value = next.value = "";
        showStatus(t("The password is changed. The other logins of the account ended."));
        element.close();
      } catch (error) {
        message.textContent = errorText(error);
      }
    }),
    actionButton(t("Log out"), async () => {
      try {
        endSession();
        setSession(await state.client.logout());
        // On a computer of others, the plans of the account do not stay in the browser.
        await removeRemoteCopies(state.client.base).catch(() => undefined);
        element.close();
        showStatus(t("Logged out."));
      } catch (error) {
        message.textContent = errorText(error);
      }
    }),
  );
  body.append(actions);
}

/** The dialog of the open plan of the server: its state and its actions. */
function planDialog(): void {
  const current = session;
  if (!current) return;
  const { element, body } = dialog(projectName());
  if (current.offline) {
    note(
      body,
      current.editing
        ? t(
            "No connection to {server}. You edit the copy of this browser, revision {revision}. The browser keeps your changes, and they go to the server when it answers again.",
            { server: current.serverName, revision: current.revision },
          )
        : t(
            "No connection to {server}. This is the copy of this browser, revision {revision}, only to view.",
            { server: current.serverName, revision: current.revision },
          ),
    );
    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    actions.append(
      actionButton(t("Save a copy in this browser"), () => {
        element.close();
        void keepCopy();
      }),
    );
    body.append(actions);
    footer(
      element,
      actionButton(
        t("Connect again"),
        () => {
          element.close();
          void tryOnline(current).then(() => {
            if (session === current && current.offline) {
              showStatus(t("The server does not answer yet. The app tries again by itself."), true);
            }
          });
        },
        true,
      ),
    );
    return;
  }
  note(
    body,
    t("On {server}, revision {revision}.", {
      server: current.serverName,
      revision: current.revision,
    }),
  );
  note(
    body,
    current.editing
      ? t("You edit this plan with the others who have it open. Each change saves to the server.")
      : current.viewOnly
        ? t("You only view this plan. Click Edit to change it.")
        : t("You can only view this plan."),
  );
  // The other actions are in the body. The one main action, Edit, is in the footer.
  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  actions.append(
    actionButton(t("Versions…"), () => {
      element.close();
      remoteHooks.versions();
    }),
    actionButton(t("Load again"), () => {
      if (unsaved(current) && !confirm(t("The plan has unsaved changes. Discard them?"))) return;
      element.close();
      void reload(current);
    }),
    actionButton(t("Save a copy in this browser"), () => {
      element.close();
      void keepCopy();
    }),
    actionButton(t("Your name…"), () => {
      element.close();
      nameDialog();
    }),
  );
  if (current.editing) {
    actions.append(
      actionButton(t("View only"), () => {
        element.close();
        void setViewOnly(current, true).then(() => personSeenSelf());
      }),
    );
  }
  if (current.share) {
    actions.append(
      actionButton(t("Share…"), () => {
        element.close();
        void shareDialog(current.client, current.planId, projectName());
      }),
    );
  }
  body.append(actions);
  footer(
    element,
    current.write && current.viewOnly
      ? actionButton(
          t("Edit"),
          () => {
            element.close();
            void setViewOnly(current, false).then(() => personSeenSelf());
          },
          true,
        )
      : undefined,
  );
}

/** The share links of a plan: the list, and a form for a new link. */
async function shareDialog(client: ServerClient, planId: string, name: string): Promise<void> {
  const { body } = dialog(t('Share "{name}"', { name }));
  note(
    body,
    t(
      "A link gives access to this one plan, without an account: to view it, or to edit it. It ends at its date, or when you remove it.",
    ),
  );
  const form = document.createElement("div");
  form.className = "dialog-form";
  const label = textInput("", { placeholder: t("For example: Architect") });
  row(form, t("For"), label);
  const access = selectInput([
    ["read", t("Can view")],
    ["write", t("Can edit")],
  ]);
  row(form, t("Access"), access);
  const expires = expiryField(form);
  const message = note(form, "", "dialog-note warning");
  const list = document.createElement("div");
  list.className = "token-list";
  const refresh = () =>
    fill(
      list,
      () => client.shares(planId),
      (share) => shareRow(share, refresh),
    );
  const create = actionButton(
    t("Make a link"),
    async () => {
      message.textContent = "";
      try {
        const made = await client.createShare(planId, {
          label: label.value.trim() || t("Link"),
          write: access.value === "write",
          expires: expires(),
        });
        label.value = "";
        showNewLink(
          body,
          client.address(made.path),
          t("The link, shown only now. Copy it and send it on a safe way:"),
        );
        await refresh();
      } catch (error) {
        message.textContent = errorText(error);
      }
    },
    true,
  );
  form.append(create);
  const heading = document.createElement("h3");
  heading.textContent = t("Links of this plan");
  body.append(form, heading, list);
  await refresh();
}

/** A row of a share link, with a button to remove it. */
function shareRow(share: Share, refresh: () => Promise<void>, withPlan = false): HTMLElement {
  const parts = [share.write ? t("can edit") : t("can view")];
  if (withPlan) parts.unshift(t("plan {name}", { name: share.planName }));
  parts.push(share.expires ? t("until {date}", { date: dateText(share.expires) }) : t("no end"));
  return listRow(
    share.label,
    parts.join(" · "),
    iconButton(
      "trash",
      t("Remove the access of {label}", { label: share.label }),
      async () => {
        try {
          await server!.client.deleteShare(share.id);
          await refresh();
        } catch (error) {
          showStatus(errorText(error), true);
        }
      },
      { danger: true },
    ),
  );
}

/** The checkboxes of the rights of an account. */
function rightsFields(parent: HTMLElement, value: Partial<Account>, admin: boolean) {
  const check = (text: string, checked: boolean) => {
    const { element, input } = checkbox(text, checked);
    parent.append(element);
    return input;
  };
  const me = account();
  const fields = {
    createPlans: check(t("Can make plans"), value.createPlans ?? true),
    seeAll: check(t("Sees and edits all plans"), value.seeAll ?? false),
    makeAccounts: check(t("Can invite others"), value.makeAccounts ?? false),
  };
  // An account gives at most its own rights.
  for (const key of ["createPlans", "seeAll", "makeAccounts"] as const) {
    if (!admin && !me?.[key]) fields[key].disabled = true;
  }
  return () => ({
    createPlans: fields.createPlans.checked,
    seeAll: fields.seeAll.checked,
    makeAccounts: fields.makeAccounts.checked,
  });
}

/** A field in MB for the space of an account. Empty is the default of the server. */
function quotaField(parent: HTMLElement, value: number | null, fallback: string) {
  const input = numberInput(value === null ? null : Math.round(value / 1_048_576), {
    min: 0,
    step: 1,
  });
  input.placeholder = fallback;
  row(parent, t("Space in MB"), input);
  return () => (input.value === "" ? null : Math.max(0, Number(input.value)) * 1_048_576);
}

/**
 * The accounts of the server: for the admin the settings, the accounts, the invites, and all
 * share links; for an account that invites, its invites.
 */
async function accountsDialog(): Promise<void> {
  const state = server;
  const me = account();
  if (!state || !me) return;
  const admin = me.admin;
  const client = state.client;
  const { body } = dialog(admin ? t("Server and accounts") : t("Invite others"));

  let defaults = "";
  if (admin) {
    try {
      const settings = await client.settings();
      const name = textInput(settings.name);
      row(body, t("Name of the server"), name);
      name.addEventListener("change", async () => {
        try {
          await client.saveSettings({ name: name.value });
          setSession(await client.session());
        } catch (error) {
          showStatus(errorText(error), true);
        }
      });
      defaults =
        settings.quota > 0 ? String(Math.round(settings.quota / 1_048_576)) : t("no limit");
      note(
        body,
        t(
          "Version {version}, {plans} plans, {accounts} accounts, {shares} share links. A new account gets {quota} for at most {count} plans; a link for one use works {hours} hours.",
          {
            version: settings.version,
            plans: settings.plans,
            accounts: settings.accounts,
            shares: settings.shares,
            quota: settings.quota > 0 ? megabytes(settings.quota) : t("no limit"),
            count: settings.maxPlans > 0 ? settings.maxPlans : "∞",
            hours: settings.linkHours,
          },
        ),
      );
    } catch (error) {
      note(body, errorText(error), "dialog-note warning");
    }
    const heading = document.createElement("h3");
    heading.textContent = t("Accounts");
    const accounts = document.createElement("div");
    accounts.className = "token-list";
    body.append(heading, accounts);
    const refreshAccounts = () =>
      fill(accounts, client.accounts, (a) =>
        listRow(
          a.admin ? `${a.name} · ${t("admin")}` : a.name,
          `${rightsText(a)} · ${usageText(a)}`,
          iconButton("settings", t("Change {name}", { name: a.name }), () =>
            editAccountDialog(a, defaults, refreshAccounts),
          ),
          iconButton("rename", t("A new password for {name}", { name: a.name }), async () => {
            try {
              const { path } = await client.resetLink(a.id);
              showNewLink(
                body,
                client.address(path),
                t("The link for a new password of {name}, shown only now:", { name: a.name }),
              );
              await refreshLinks();
            } catch (error) {
              showStatus(errorText(error), true);
            }
          }),
          ...(a.id === me.id
            ? []
            : [
                iconButton(
                  "trash",
                  t("Remove {name}", { name: a.name }),
                  async () => {
                    if (
                      !confirm(
                        t("Remove the account {name}? Its plans become yours.", { name: a.name }),
                      )
                    )
                      return;
                    try {
                      await client.deleteAccount(a.id);
                      await refreshAccounts();
                    } catch (error) {
                      showStatus(errorText(error), true);
                    }
                  },
                  { danger: true },
                ),
              ]),
        ),
      );
    await refreshAccounts();
  }

  // The invites.
  const inviteHeading = document.createElement("h3");
  inviteHeading.textContent = t("Invite");
  body.append(inviteHeading);
  note(
    body,
    t(
      "An invite link is for one person. It works once, and ends after some days. The person chooses a name and a password.",
    ),
  );
  const form = document.createElement("div");
  form.className = "dialog-form";
  const rights = rightsFields(form, {}, admin);
  const quota = admin ? quotaField(form, null, defaults) : () => null;
  const message = note(form, "", "dialog-note warning");
  form.append(
    actionButton(
      t("Make an invite link"),
      async () => {
        message.textContent = "";
        try {
          const { path } = await client.createInvite({ ...rights(), quota: quota() });
          showNewLink(
            body,
            client.address(path),
            t("The invite link, shown only now. Copy it and send it on a safe way:"),
          );
          await refreshLinks();
        } catch (error) {
          message.textContent = errorText(error);
        }
      },
      true,
    ),
  );
  body.append(form);
  const linksHeading = document.createElement("h3");
  linksHeading.textContent = t("Open links");
  const links = document.createElement("div");
  links.className = "token-list";
  body.append(linksHeading, links);
  const refreshLinks = () =>
    fill(links, client.invites, (invite: Invite) =>
      listRow(
        invite.kind === "reset"
          ? t("New password for {name}", { name: invite.account })
          : t("Invite"),
        [
          ...(invite.rights ? [rightsText(invite.rights)] : []),
          t("until {date}", { date: dateText(invite.expires) }),
        ].join(" · "),
        iconButton(
          "trash",
          t("Remove the link"),
          async () => {
            try {
              await client.deleteInvite(invite.id);
              await refreshLinks();
            } catch (error) {
              showStatus(errorText(error), true);
            }
          },
          { danger: true },
        ),
      ),
    );
  await refreshLinks();

  if (admin) {
    const sharesHeading = document.createElement("h3");
    sharesHeading.textContent = t("Share links");
    const shares = document.createElement("div");
    shares.className = "token-list";
    body.append(sharesHeading, shares);
    const refreshShares = (): Promise<void> =>
      fill(
        shares,
        () => client.shares(),
        (share) => shareRow(share, refreshShares, true),
      );
    await refreshShares();
  }
}

/** The rights and the limits of an account, for the admin. */
function editAccountDialog(a: Account, defaults: string, done: () => Promise<void>): void {
  const state = server;
  if (!state) return;
  const { element, body } = dialog(a.name);
  note(body, usageText(a));
  const form = document.createElement("div");
  form.className = "dialog-form";
  const rights = rightsFields(form, a, true);
  const { element: adminBox, input: adminInput } = checkbox(t("Admin"), a.admin);
  adminInput.disabled = a.id === account()?.id;
  form.append(adminBox);
  const quota = quotaField(form, a.quota, defaults);
  const plans = numberInput(a.maxPlans, { min: 0, step: 1 });
  plans.placeholder = t("default");
  row(form, t("Most plans"), plans);
  note(form, t("Empty is the default of the server, 0 is no limit."));
  const message = note(form, "", "dialog-note warning");
  body.append(form);
  footer(
    element,
    actionButton(
      t("Save"),
      async () => {
        try {
          await state.client.updateAccount(a.id, {
            ...rights(),
            admin: adminInput.checked,
            quota: quota(),
            maxPlans: plans.value === "" ? null : Math.max(0, Math.round(Number(plans.value))),
          });
          element.close();
          await done();
        } catch (error) {
          message.textContent = errorText(error);
        }
      },
      true,
    ),
  );
}

/**
 * Two radio buttons: copy or move. It gives true for move. Without the move, there is nothing to
 * choose, so the dialog shows no radio buttons and always copies.
 */
function copyOrMove(parent: HTMLElement, moveText: string, canMove = true): () => boolean {
  if (!canMove) return () => false;
  const choice = radioGroup(
    `transfer-${Math.random().toString(36).slice(2)}`,
    [
      ["copy", t("Copy: the plan stays here too")],
      ["move", moveText],
    ],
    "copy",
  );
  choice.element.classList.add("dialog-form");
  parent.append(choice.element);
  return () => choice.value() === "move";
}

/**
 * Copies or moves a plan of this browser to the server: the open plan (null), or a project of the
 * Projects page. A move puts the project of the browser into the trash, so it can come back.
 */
function uploadDialog(project: { id: string; name: string } | null): void {
  const state = server;
  if (!state) return;
  const name = project?.name ?? projectName();
  const { element, body } = dialog(t('"{name}" to {server}', { name, server: state.name }));
  note(
    body,
    t("On the server, each change saves to the server, and you can share the plan with links."),
  );
  const localId = project?.id ?? projectId;
  const isMove = copyOrMove(
    body,
    t("Move: the plan goes to the trash of this browser"),
    localId !== null,
  );
  const message = note(body, "", "dialog-note warning");
  const put = actionButton(
    t("Put on the server"),
    async () => {
      put.disabled = true;
      const current = doc.captureTarget();
      const move = isMove();
      try {
        const building = project ? await projectBuilding(project.id) : doc.building;
        const plan = await state.client.createPlan(name, serializeBuilding(building));
        if (!project && (!current() || doc.building !== building)) return;
        if (move && localId) await trashProjectById(localId);
        element.close();
        if (project) {
          showStatus(t('"{name}" is on {server} now.', { name, server: state.name }));
          renderHome();
        } else {
          await openRemote(plan.id);
        }
      } catch (error) {
        message.textContent = errorText(error);
      } finally {
        put.disabled = false;
      }
    },
    true,
  );
  footer(element, put);
}

/** Copies or moves a plan of the server to this browser. A move deletes it on the server. */
function downloadDialog(client: ServerClient, plan: RemotePlan): void {
  const { element, body } = dialog(t('"{name}" to this browser', { name: plan.name }));
  note(
    body,
    t(
      "The plan becomes a project of this browser, without the server. Its links on the server do not come with it.",
    ),
  );
  const isMove = copyOrMove(
    body,
    t("Move: the plan goes away from the server, for everybody"),
    plan.delete,
  );
  const message = note(body, "", "dialog-note warning");
  const take = actionButton(
    t("Put in this browser"),
    async () => {
      take.disabled = true;
      try {
        const remote = await client.plan(plan.id);
        await addProject(parseBuilding(remote.data), plan.name);
        if (isMove()) {
          await client.deletePlan(plan.id, remote.revision);
          if (session?.planId === plan.id) endSession();
        }
        element.close();
        showStatus(t('"{name}" is in this browser now.', { name: plan.name }));
        renderHome();
      } catch (error) {
        message.textContent = errorText(error);
      } finally {
        take.disabled = false;
      }
    },
    true,
  );
  footer(element, take);
}

// ----- The home page -----

/** The section of the server on the home page: the account, and the plans. */
function renderServers(list: HTMLElement): void {
  const state = server;
  if (!state) return;
  // The home page has no open plan, so the address names none.
  if (!app.planOpen && location.href !== planAddress(null))
    history.replaceState(null, "", planAddress(null));
  const me = account();
  const section = document.createElement("section");
  section.className = "project-section server-section";
  const head = document.createElement("div");
  head.className = "server-head";
  const heading = document.createElement("h3");
  heading.innerHTML = icon("cloud");
  heading.append(state.name);
  const who = document.createElement("small");
  who.textContent = me ? me.name : state.info ? t("Not logged in") : t("No connection");
  heading.append(who);
  const tools = document.createElement("div");
  tools.className = "project-tools";
  const client = state.client;
  if (canCreate()) {
    tools.append(
      iconButton("plus", t("New plan on this server"), async () => {
        try {
          const plan = await client.createPlan(
            t("New plan"),
            serializeBuilding(localize(emptyBuilding())),
          );
          await openRemote(plan.id);
        } catch (error) {
          showStatus(errorText(error), true);
        }
      }),
    );
  }
  if (me && (me.admin || me.makeAccounts)) {
    tools.append(
      iconButton(
        me.admin ? "settings" : "users",
        me.admin ? t("Server and accounts") : t("Invite others"),
        () => void accountsDialog(),
      ),
    );
  }
  if (me) {
    tools.append(iconButton("users", t("Your account"), accountDialog));
  } else if (state.info) {
    const login = document.createElement("button");
    login.className = "primary";
    login.textContent = t("Log in");
    login.addEventListener("click", loginDialog);
    tools.append(login);
  }
  head.append(heading, tools);
  section.append(head);
  const grid = document.createElement("div");
  grid.className = "project-grid";
  section.append(grid);
  list.append(section);
  const empty = (text: string) => {
    const element = document.createElement("p");
    element.className = "project-empty";
    element.textContent = text;
    grid.replaceWith(element);
  };
  const offline = async (error?: unknown) => {
    if (error) {
      const warning = document.createElement("p");
      warning.className = "project-warning";
      warning.textContent = errorText(error);
      grid.before(warning);
    }
    // Without the network, the copies of this browser open to view.
    const copies = await listRemoteCopies(client.base).catch(() => []);
    if (copies.length === 0) return grid.remove();
    grid.append(...copies.map(offlineCard));
  };
  if (!state.info) return void offline();
  if (!me && state.info.grants.length === 0) {
    return empty(t("Log in to see your plans on this server."));
  }
  void client.plans().then(
    (plans) => {
      if (plans.length === 0) empty(t("No plans on this server yet."));
      grid.append(...plans.map((plan) => remoteCard(client, plan)));
      // The plans with changes that the browser keeps for the server: they go when it opens.
      void listRemoteCopies(client.base).then(
        (copies) => {
          for (const copy of copies) {
            if (!copy.edited) continue;
            const card = grid.querySelector(
              `[data-plan="${CSS.escape(copy.planId)}"] .project-marks`,
            );
            const element = document.createElement("span");
            element.className = "remote-mark busy";
            element.textContent = t("Changes wait");
            element.title = t(
              "Your changes without the network go to the server when you open the plan.",
            );
            card?.append(element);
          }
        },
        () => undefined,
      );
    },
    (error) => {
      if (error instanceof ServerError && error.status === 0) return void offline(error);
      const warning = document.createElement("p");
      warning.className = "project-warning";
      warning.textContent = errorText(error);
      grid.replaceWith(warning);
    },
  );
}

/**
 * The picture of a card of the server: the plan like on a card of the browser, and a small cloud
 * in its corner that tells that the plan is on the server.
 */
function remotePicture(preview: string | undefined): HTMLElement {
  const picture = document.createElement("div");
  picture.className = "project-picture";
  if (preview) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview)}`;
    picture.append(image);
  } else {
    picture.innerHTML = icon("view2d");
  }
  const badge = document.createElement("span");
  badge.className = "remote-badge";
  badge.title = t("On a server");
  badge.innerHTML = icon("cloud");
  picture.append(badge);
  return picture;
}

/** The card of the copy of a plan of the server, without the network. */
function offlineCard(copy: RemoteCopy): HTMLElement {
  const card = document.createElement("article");
  card.className = "project remote";
  const open = document.createElement("button");
  open.className = "project-open";
  open.title = t("Open {name}", { name: copy.name });
  const picture = remotePicture(copy.preview);
  const text = document.createElement("span");
  text.className = "project-text";
  const name = document.createElement("strong");
  name.textContent = copy.name;
  const time = document.createElement("small");
  time.textContent = t("Copy from {time}", { time: ago(copy.time) });
  const marks = document.createElement("span");
  marks.className = "project-marks";
  const mark = document.createElement("span");
  mark.className = "remote-mark busy";
  mark.textContent = copy.edited ? t("Changes wait") : t("Offline copy");
  marks.append(mark);
  text.append(name, time, marks);
  open.append(picture, text);
  open.addEventListener("click", () => void openRemote(copy.planId));
  card.append(open);
  return card;
}

/** The card of a plan of the server, with its state and its tools. */
function remoteCard(client: ServerClient, plan: RemotePlan): HTMLElement {
  const card = document.createElement("article");
  card.className = "project remote";
  card.dataset.plan = plan.id;
  const open = document.createElement("button");
  open.className = "project-open";
  open.title = t("Open {name}", { name: plan.name });
  const picture = remotePicture(plan.preview);
  const text = document.createElement("span");
  text.className = "project-text";
  const name = document.createElement("strong");
  name.textContent = plan.name;
  const time = document.createElement("small");
  time.textContent = t("Changed {time} by {by}", { time: ago(plan.updated), by: plan.by });
  text.append(name, time);
  const marks = document.createElement("span");
  marks.className = "project-marks";
  const mark = (value: string, tone = "") => {
    const element = document.createElement("span");
    element.className = `remote-mark ${tone}`;
    element.textContent = value;
    marks.append(element);
  };
  if (!plan.write) mark(t("View only"), "busy");
  // A plan of another account: its owner.
  const me = account();
  if (plan.owner && plan.owner !== me?.name) mark(plan.owner);
  text.append(marks);
  open.append(picture, text);
  open.addEventListener("click", () => void openRemote(plan.id));
  const tools = document.createElement("div");
  tools.className = "project-tools";
  if (plan.share) {
    tools.append(
      iconButton("share", t("Share"), () => void shareDialog(client, plan.id, plan.name), {
        label: `${t("Share")}: ${plan.name}`,
      }),
    );
  }
  tools.append(
    iconButton("save", t("Copy or move to this browser"), () => downloadDialog(client, plan), {
      label: `${t("Copy or move to this browser")}: ${plan.name}`,
    }),
  );
  if (plan.delete) {
    tools.append(
      iconButton(
        "trash",
        t("Delete"),
        async () => {
          if (!confirm(t('Delete "{name}" on the server for everybody?', { name: plan.name })))
            return;
          try {
            await client.deletePlan(plan.id);
            renderHome();
          } catch (error) {
            showStatus(errorText(error), true);
          }
        },
        { danger: true, label: `${t("Delete")}: ${plan.name}` },
      ),
    );
  }
  card.append(open, tools);
  return card;
}

// ----- The start -----

/**
 * Sets the hooks of the projects and the buttons of the top bar, and finds the server of the app.
 * Then it opens a link for one use (`#invite=…`) or a plan (`/app/plans/<id>`) of the address.
 */
export function setupRemote(): Promise<void> {
  remoteHooks.active = () => session !== null;
  remoteHooks.save = save;
  remoteHooks.unsaved = () => !!session && unsaved(session);
  remoteHooks.end = endSession;
  remoteHooks.home = renderServers;
  remoteHooks.versions = () => {
    if (session) {
      void showVersions(
        remoteSource(session.client, session.planId, projectName(), session.editing),
      );
    }
  };
  remoteHooks.canUpload = canCreate;
  remoteHooks.toServer = uploadDialog;
  doc.onBlocked = () => {
    if (!session) return;
    showStatus(
      session.viewOnly
        ? t("You only view this plan. Click Edit at the top to change it.")
        : t("This plan is only to view. Click the mark of the server for more."),
      true,
    );
  };
  $("#remote-state").addEventListener("click", planDialog);
  $("#share").addEventListener("click", () => {
    if (session) void shareDialog(session.client, session.planId, projectName());
    else uploadDialog(null);
  });
  doc.subscribe(() => {
    updateRemoteState();
    // The changes of the others that came during a drag.
    if (session && !doc.inTransaction && session.waiting.size) advance(session);
  });
  window.addEventListener("pagehide", () => {
    // Changes that wait for the browser go there now.
    if (session?.editsTimer) storeEdits(session);
    if (session && !session.offline) session.client.leaveOnUnload(session.planId);
  });
  // The network is back: an open copy goes on with the server.
  window.addEventListener("online", () => {
    if (session?.offline) void tryOnline(session);
    else if (session?.failed) void save();
  });
  return start();
}

async function start(): Promise<void> {
  server = await findServer();
  if (!server) return;
  updateRemoteState();
  const link = /#(setup|invite|reset)=([^&]+)/.exec(location.hash);
  if (link) history.replaceState(null, "", location.pathname);
  const plan = /\/plans\/([^/]+)\/?$/.exec(location.pathname)?.[1];
  if (plan && !app.planOpen) await openRemote(decodeURIComponent(plan));
  else if (!app.planOpen) renderHome();
  if (link) return linkDialog(link[1], decodeURIComponent(link[2]));
  // A browser without a login and without a shared plan: the login is the way in.
  if (server.info && !server.info.account && server.info.grants.length === 0) loginDialog();
}
