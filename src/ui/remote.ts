// The plans on a Grundriss server (server/). The app keeps the addresses of its connections in
// the browser. A connection is the address of a token: root and users see a list of plans, and
// a plan token (a share link) gives one plan.
//
// An open plan of a server is a session: the app takes the edit lease of the plan if the token
// can write, saves each change to the server after a short wait, and gets the saves of the
// others from a stream. Without the lease, the plan only reads (`doc.readOnly`). A save starts
// from the last known revision, so it never replaces a revision that this tab did not see.

import { locale, t } from "../i18n";
import {
  newProjectId,
  listRemoteCopies,
  loadRemoteCopy,
  removeRemoteCopies,
  type RemoteCopy,
  saveRemoteCopy,
} from "../io/projects";
import { icon, type IconName } from "../icons";
import {
  API_VERSION,
  normalizeAddress,
  ServerClient,
  ServerError,
  type Me,
  type RemotePlan,
  type TokenInfo,
} from "../io/server";
import { emptyBuilding } from "../model/building";
import { parseBuilding, serializeBuilding } from "../model/file";
import type { Building } from "../model/types";
import { $, app, doc, shell, showStatus } from "./context";
import { actionButton, dialog, note, row } from "./dialog";
import { remoteSource, showVersions } from "./versions";
import { iconButton } from "./panel";
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

// ----- Connections -----

/** A connection of the browser: the address of a token, and what the server told about it. */
interface Connection {
  address: string;
  /** The name of the server. */
  name: string;
  token: TokenInfo | null;
}

const STORE_KEY = "grundriss-servers";
/** The lease lasts 60 s on the server; the tab renews it well before. */
const RENEW = 20_000;

function connections(): Connection[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]") as Connection[];
    return Array.isArray(list) ? list.filter((c) => typeof c.address === "string") : [];
  } catch {
    return [];
  }
}

function saveConnections(list: Connection[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    showStatus(t("The browser cannot keep the connection."), true);
  }
}

/**
 * The address of a token from a text that the user pastes: the address itself, with or without
 * a slash at the end, or a link of this app with `#connect=` and the address.
 */
export function parseAddress(text: string): string {
  let value = text.trim();
  const fragment = /#connect=([^&]+)/.exec(value);
  if (fragment) value = decodeURIComponent(fragment[1]);
  value = normalizeAddress(value).replace(/\/api(\/.*)?$/, "");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Not a web address.");
  return value;
}

/** Checks the address with the server, and keeps it. */
async function addConnection(address: string): Promise<{ connection: Connection; me: Me }> {
  const me = await new ServerClient(address).me();
  if (me.api !== API_VERSION) {
    throw new Error(
      t(
        "The server has another version of the API ({server}; the app knows {app}). Update the older one.",
        {
          server: me.api,
          app: API_VERSION,
        },
      ),
    );
  }
  const connection: Connection = { address, name: me.server, token: me.token };
  const list = connections().filter((c) => c.address !== address);
  list.push(connection);
  saveConnections(list);
  return { connection, me };
}

function removeConnection(address: string): void {
  saveConnections(connections().filter((c) => c.address !== address));
  // The copies of its plans belong to the connection.
  void removeRemoteCopies(address).catch(() => undefined);
}

/** Updates the stored name and rights of a connection after a call of `me`. */
function refreshConnection(address: string, me: Me): void {
  const list = connections();
  const connection = list.find((c) => c.address === address);
  if (!connection) return;
  connection.name = me.server;
  connection.token = me.token;
  saveConnections(list);
}

const errorText = (error: unknown) => (error instanceof Error ? t(error.message) : String(error));

/** The text of the rights of a token, for the lists. */
function rightsText(token: TokenInfo): string {
  const parts = [token.write ? t("can edit") : t("can view")];
  // A share link in the list of all links names its plan.
  if (token.kind === "plan" && token.planName) {
    parts.unshift(t("plan {name}", { name: token.planName }));
  }
  if (token.kind === "user") {
    if (token.createPlans) parts.push(t("makes plans"));
    if (token.seeAll) parts.push(t("sees all plans"));
    if (token.makeUsers) parts.push(t("adds users"));
  }
  parts.push(
    token.expires
      ? t("until {date}", { date: new Date(token.expires).toLocaleDateString(locale()) })
      : t("no end"),
  );
  return parts.join(" · ");
}

const kindText = (token: TokenInfo | null) =>
  !token
    ? ""
    : token.kind === "root"
      ? t("Root")
      : token.kind === "plan"
        ? t("Shared plan")
        : token.label;

// ----- The session of an open plan -----

interface Session {
  address: string;
  client: ServerClient;
  planId: string;
  serverName: string;
  me: Me;
  revision: string;
  /** True if the token can write the plan. */
  write: boolean;
  /** True while this tab has the lease. */
  editing: boolean;
  /** The person who has the lease, if another tab has it. */
  holder: string | null;
  /** The building of the last revision of the server. */
  saved: Building;
  saving: Promise<void> | null;
  failed: boolean;
  events: EventSource | null;
  renew: number;
  taking: Promise<void> | null;
  loading: number;
  /** True for the copy of the browser, without the network: only to view. */
  offline: boolean;
}

/** Keeps the state of the plan in the browser, for use without the network. */
function storeCopy(current: Session, name: string, data: string): void {
  void saveRemoteCopy(current.address, current.planId, name, current.revision, data).catch(
    () => undefined,
  );
}

let session: Session | null = null;
let opening = 0;

const unsaved = (current: Session) => doc.building !== current.saved || current.saving !== null;

/** Opens a plan of a server, and starts its session. */
export async function openRemote(address: string, planId: string): Promise<void> {
  const request = ++opening;
  if (!(await confirmDiscard())) return;
  if (request !== opening) return;
  const building = doc.building;
  const generation = doc.generation;
  // Each session owns its lease, so an old release cannot release a new session's lease.
  const client = new ServerClient(address, newProjectId());
  try {
    const [me, plan] = await Promise.all([client.me(), client.plan(planId)]);
    if (request !== opening || generation !== doc.generation || building !== doc.building) return;
    refreshConnection(address, me);
    const parsed = parseBuilding(plan.data);
    endSession();
    doc.readOnly = true;
    load(parsed, `${plan.name}.grundriss`, null, "remote");
    const current: Session = {
      address,
      client,
      planId,
      serverName: me.server,
      me,
      revision: plan.revision,
      write: plan.write,
      editing: false,
      holder: plan.lease?.holder ?? null,
      saved: doc.building,
      saving: null,
      failed: false,
      events: null,
      renew: 0,
      taking: null,
      loading: 0,
      offline: false,
    };
    session = current;
    storeCopy(current, plan.name, plan.data);
    if (current.write) current.renew = window.setInterval(() => void renewLease(current), RENEW);
    await startEditing(current);
    if (session !== current) return;
    listen(current);
    showStatus(
      session.editing
        ? t('Opened "{name}" on {server}. Each change saves to the server.', {
            name: plan.name,
            server: me.server,
          })
        : session.holder
          ? t("{holder} edits this plan. You see it, and it updates itself.", {
              holder: session.holder,
            })
          : t('Opened "{name}" on {server} to view.', { name: plan.name, server: me.server }),
    );
    shell.enterPlan("structure");
  } catch (error) {
    // Without the network, the copy of the browser opens to view.
    if (error instanceof ServerError && error.status === 0 && request === opening) {
      if (await openOffline(address, planId, client)) return;
    }
    showStatus(errorText(error), true);
  }
  updateRemoteState();
}

/** Opens the copy of a plan of a server that the browser keeps, only to view. */
async function openOffline(
  address: string,
  planId: string,
  client: ServerClient,
): Promise<boolean> {
  const copy = await loadRemoteCopy(address, planId).catch(() => undefined);
  if (!copy) return false;
  const connection = connections().find((c) => c.address === address);
  endSession();
  doc.readOnly = true;
  load(parseBuilding(copy.data), `${copy.name}.grundriss`, null, "remote");
  session = {
    address,
    client,
    planId,
    serverName: connection?.name ?? "",
    me: {
      api: API_VERSION,
      version: "",
      server: connection?.name ?? "",
      mode: "full",
      token: connection?.token ?? ({ kind: "plan", write: false } as TokenInfo),
    },
    revision: copy.revision,
    write: false,
    editing: false,
    holder: null,
    saved: doc.building,
    saving: null,
    failed: false,
    events: null,
    renew: 0,
    taking: null,
    loading: 0,
    offline: true,
  };
  showStatus(
    t("No connection to {server}. You see the copy of this browser from {time}, only to view.", {
      server: connection?.name ?? "",
      time: ago(copy.time),
    }),
    true,
  );
  shell.enterPlan("structure");
  updateRemoteState();
  return true;
}

/** Takes the edit lease, if the token can write and nobody else has it. */
async function startEditing(current = session): Promise<void> {
  if (!current || session !== current || !current.write || current.editing) return;
  if (current.taking) return current.taking;
  current.taking = (async () => {
    try {
      await current.client.takeLease(current.planId);
      if (session !== current) {
        void current.client.releaseLease(current.planId).catch(() => undefined);
        return;
      }
      // Load changes made before we acquired the lease, but never replace our own unsaved work.
      if (!unsaved(current) && !(await reload(current))) return;
      if (session !== current) return;
      current.editing = true;
      current.holder = null;
    } catch (error) {
      if (session !== current) return;
      current.editing = false;
      if (error instanceof ServerError && error.status === 423) {
        current.holder =
          (error.body as { lease?: { holder?: string } } | null)?.lease?.holder ?? t("Somebody");
      }
    } finally {
      current.taking = null;
      if (session === current) {
        doc.readOnly = !current.editing;
        updateRemoteState();
      }
    }
  })();
  return current.taking;
}

async function renewLease(current: Session): Promise<void> {
  if (session !== current) return;
  if (!current.editing) return startEditing(current);
  try {
    await current.client.takeLease(current.planId);
  } catch (error) {
    if (session !== current) return;
    current.editing = false;
    doc.readOnly = true;
    if (error instanceof ServerError && error.status === 423) {
      showStatus(t("Somebody else edits the plan now. Save a copy to keep your changes."), true);
    } else {
      showStatus(errorText(error), true);
    }
    updateRemoteState();
  }
}

/** The stream of the plan: the saves and the lease of the others. */
function listen(current: Session): void {
  const events = current.client.events(current.planId);
  current.events = events;
  const read = (event: Event) => JSON.parse((event as MessageEvent<string>).data) as unknown;
  events.addEventListener("hello", (event) => {
    if (session !== current) return;
    // After a lost connection, the stream starts again; a newer revision loads.
    const hello = read(event) as {
      revision: string | null;
      lease?: { client: string; holder: string } | null;
    };
    if (hello.lease && hello.lease.client !== current.client.client) {
      current.holder = hello.lease.holder;
      current.editing = false;
      doc.readOnly = true;
      updateRemoteState();
    }
    if (hello.revision && hello.revision !== current.revision && !current.editing) {
      void reload(current);
    }
  });
  events.addEventListener("revision", (event) => {
    const revision = read(event) as { id: string; client: string };
    if (revision.client === current.client.client || session !== current) return;
    if (!current.editing) void reload(current);
  });
  events.addEventListener("lease", (event) => {
    const lease = read(event) as { holder: string; client: string } | null;
    if (session !== current) return;
    if (!lease) {
      current.holder = null;
      // The plan is free: a tab that can write takes it.
      if (current.write && !current.editing) void startEditing(current);
    } else if (lease.client !== current.client.client) {
      current.holder = lease.holder;
      current.editing = false;
      doc.readOnly = true;
    }
    updateRemoteState();
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

/** Loads the current revision of the server into the open plan. */
async function reload(current: Session, discard = false): Promise<boolean> {
  if (session !== current || current.saving || doc.inTransaction || (!discard && unsaved(current)))
    return false;
  const building = doc.building;
  const request = ++current.loading;
  try {
    const plan = await current.client.plan(current.planId);
    if (
      session !== current ||
      request !== current.loading ||
      building !== doc.building ||
      current.saving ||
      doc.inTransaction
    )
      return false;
    if (!discard && plan.revision === current.revision) return true;
    const story = doc.activeStoryId;
    doc.replace(parseBuilding(plan.data));
    doc.setActiveStory(story);
    current.saved = doc.building;
    current.revision = plan.revision;
    storeCopy(current, plan.name, plan.data);
    app.fileName = `${plan.name}.grundriss`;
    updateTitle();
    updateRemoteState();
    return true;
  } catch (error) {
    if (session === current) showStatus(errorText(error), true);
    return false;
  }
}

/** Saves the open plan to the server, if it changed. */
async function save(): Promise<void> {
  const current = session;
  if (!current || !current.editing) return;
  if (current.saving) return current.saving;
  const building = doc.building;
  if (building === current.saved || doc.inTransaction) return;
  const data = serializeBuilding(building);
  current.saving = (async () => {
    try {
      const plan = await current.client.savePlan(
        current.planId,
        current.revision,
        data,
        projectName(),
      );
      current.revision = plan.revision;
      current.saved = building;
      current.failed = false;
      storeCopy(current, plan.name, data);
      // The plan is safe on the server, so the title shows no unsaved changes.
      if (session === current) doc.markSaved(building);
    } catch (error) {
      if (session !== current) return;
      if (error instanceof ServerError && error.status === 409) return conflict(current);
      if (error instanceof ServerError && error.status === 423) {
        current.editing = false;
        doc.readOnly = true;
        showStatus(t("Somebody else edits the plan now. Save a copy to keep your changes."), true);
        return;
      }
      if (!current.failed) {
        showStatus(
          t("The server did not save the plan: {error}", { error: errorText(error) }),
          true,
        );
      }
      current.failed = true;
    }
  })().finally(() => {
    current.saving = null;
    updateRemoteState();
    // A change during the save goes to the server after it.
    if (
      session === current &&
      current.editing &&
      doc.building !== current.saved &&
      !current.failed
    ) {
      window.setTimeout(() => void save(), 300);
    }
  });
  updateRemoteState();
  return current.saving;
}

/** A newer revision came first: load it, or keep this version as a copy in the browser. */
function conflict(current: Session): void {
  if (session !== current) return;
  current.editing = false;
  doc.readOnly = true;
  updateRemoteState();
  const reloadIt = confirm(
    t(
      "Somebody saved a newer version of this plan. OK loads it. Cancel keeps your version as a copy in this browser.",
    ),
  );
  if (reloadIt) {
    // The save clears its pending promise before the replacement starts.
    window.setTimeout(() => {
      void reload(current, true).then((loaded) => {
        if (loaded) return startEditing(current);
      });
    }, 0);
  } else {
    void keepCopy();
  }
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

/** Ends the session of the open plan: the lease goes back, and the stream closes. */
function endSession(): void {
  opening++;
  const current = session;
  if (!current) return;
  session = null;
  window.clearInterval(current.renew);
  current.events?.close();
  if (current.write) void current.client.releaseLease(current.planId).catch(() => undefined);
  doc.readOnly = false;
  updateRemoteState();
}

// ----- The top bar -----

/** The mark of a plan of a server in the top bar, and the share button. */
function updateRemoteState(): void {
  const state = $<HTMLButtonElement>("#remote-state");
  const share = $<HTMLButtonElement>("#share");
  const current = session;
  // Share: the share links of a plan of a server, if the token can make them; else the move of
  // the plan of the browser to a server.
  // The class plan-tools hides it on the Projects page.
  share.hidden = current
    ? !(current.write && canShare(current.me.token))
    : !connections().some((c) => canCreate(c.token));
  state.hidden = !current;
  document.body.classList.toggle("remote-plan", !!current);
  if (!current) return;
  const [iconName, text, tone]: [IconName, string, string] = current.offline
    ? ["cloud", t("Offline copy"), "busy"]
    : current.editing
      ? current.saving
        ? ["cloud", t("Saving…"), ""]
        : current.failed
          ? ["alert", t("Not saved"), "bad"]
          : ["cloud", current.serverName, ""]
      : current.holder
        ? ["users", t("{holder} edits", { holder: current.holder }), "busy"]
        : ["cloud", t("View only"), "busy"];
  state.innerHTML = icon(iconName);
  state.append(text);
  state.className = `remote-state plan-tools ${tone}`;
  state.title = t("This plan is on the server {server}, revision {revision}. Click for more.", {
    server: current.serverName,
    revision: current.revision,
  });
}

const canCreate = (token: TokenInfo | null) =>
  !!token && (token.kind === "root" || (token.kind === "user" && token.write && token.createPlans));
const canShare = (token: TokenInfo | null) =>
  !!token && (token.kind === "root" || (token.kind === "user" && token.write));
const canManageUsers = (token: TokenInfo | null) =>
  !!token && (token.kind === "root" || (token.kind === "user" && token.write && token.makeUsers));

// ----- Dialogs -----

/** A list of the ends of a token: none, a few durations, or a date. */
function expiryField(parent: HTMLElement): () => number | null {
  const select = document.createElement("select");
  const days = (n: number) => Date.now() + n * 86_400_000;
  const options: [string, string][] = [
    ["", t("No end")],
    ["1", t("1 day")],
    ["7", t("7 days")],
    ["30", t("30 days")],
    ["365", t("1 year")],
    ["date", t("A date…")],
  ];
  for (const [value, text] of options) select.append(new Option(text, value));
  const date = document.createElement("input");
  date.type = "date";
  date.hidden = true;
  select.addEventListener("change", () => (date.hidden = select.value !== "date"));
  const box = document.createElement("span");
  box.className = "dialog-pair";
  box.append(select, date);
  row(parent, t("Ends"), box);
  return () => {
    if (select.value === "") return null;
    if (select.value === "date") {
      // The token ends at the end of the chosen day.
      return date.value ? new Date(`${date.value}T23:59:59`).getTime() : null;
    }
    return days(Number(select.value));
  };
}

/** Shows a new link one time, with buttons to copy it. */
function showNewLink(parent: HTMLElement, client: ServerClient, token: string): void {
  const box = document.createElement("div");
  box.className = "new-link";
  note(
    box,
    t("The link, shown only now. Copy it and send it on a safe way:"),
    "dialog-note strong",
  );
  const links: [string, string][] = [[t("Link"), `${client.tokenAddress(token)}/`]];
  // An app on another site than the server opens the link with its own address too.
  const server = new URL(client.base).origin;
  const ownAddress = normalizeAddress(new URL(".", location.href).href);
  // Only the public app paths may be shared. A token path stays private even if browser
  // storage is unavailable, or a #connect link bypassed the connection to this app's server.
  const publicPath = location.pathname === "/" || location.pathname.endsWith("/app/");
  if (
    server !== location.origin &&
    publicPath &&
    !connections().some((c) => c.address === ownAddress)
  ) {
    const here = `${location.origin}${location.pathname}#connect=${encodeURIComponent(client.tokenAddress(token))}`;
    links.push([t("Link for this app"), here]);
  }
  for (const [label, value] of links) {
    const field = document.createElement("input");
    field.readOnly = true;
    field.value = value;
    field.addEventListener("focus", () => field.select());
    const copy = actionButton(t("Copy"), () => {
      void navigator.clipboard?.writeText(value).then(
        () => (copy.textContent = t("Copied")),
        () => field.select(),
      );
    });
    const line = document.createElement("span");
    line.className = "dialog-pair";
    line.append(field, copy);
    row(box, label, line);
  }
  parent.prepend(box);
}

/** The dialog to connect a server: the address of a token. */
function connectDialog(): void {
  const { element, body } = dialog(t("Connect a server"));
  note(
    body,
    t(
      "Paste the link that you got from the owner of a Grundriss server, for example https://example.org/abc…. The link is your access, so keep it like a password.",
    ),
  );
  const input = document.createElement("input");
  input.type = "url";
  input.placeholder = "https://…";
  row(body, t("Link"), input);
  const message = note(body, "", "dialog-note warning");
  const connect = actionButton(
    t("Connect"),
    async () => {
      message.textContent = "";
      connect.disabled = true;
      try {
        const address = parseAddress(input.value);
        const { connection, me } = await addConnection(address);
        element.close();
        showStatus(t("Connected to {server}.", { server: connection.name }));
        if (me.token.kind === "plan" && me.token.planId) await openRemote(address, me.token.planId);
        else renderHome();
      } catch (error) {
        message.textContent = errorText(error);
      } finally {
        connect.disabled = false;
      }
    },
    true,
  );
  input.addEventListener("keydown", (e) => e.key === "Enter" && connect.click());
  body.append(connect);
  input.focus();
}

/** The dialog of the open plan of a server: its state and its actions. */
function planDialog(): void {
  const current = session;
  if (!current) return;
  const { element, body } = dialog(projectName());
  if (current.offline) {
    note(
      body,
      t(
        "No connection to {server}. This is the copy of this browser, revision {revision}, only to view.",
        { server: current.serverName, revision: current.revision },
      ),
    );
    body.append(
      actionButton(
        t("Connect again"),
        () => {
          element.close();
          void openRemote(current.address, current.planId);
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
      ? t("You edit this plan. Each change saves to the server.")
      : current.holder
        ? t("{holder} edits this plan. You see it, and it updates itself.", {
            holder: current.holder,
          })
        : current.write
          ? t("Nobody edits this plan.")
          : t("Your link can only view this plan."),
  );
  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  if (current.write && !current.editing && !current.holder) {
    actions.append(
      actionButton(
        t("Edit"),
        () => {
          element.close();
          void startEditing();
        },
        true,
      ),
    );
  }
  actions.append(
    actionButton(t("Versions…"), () => {
      element.close();
      remoteHooks.versions();
    }),
    actionButton(t("Load again"), () => {
      if (unsaved(current) && !confirm(t("The plan has unsaved changes. Discard them?"))) return;
      element.close();
      void reload(current, true);
    }),
    actionButton(t("Save a copy in this browser"), () => {
      element.close();
      void keepCopy();
    }),
  );
  if (canShare(current.me.token) && current.write) {
    actions.append(
      actionButton(t("Share…"), () => {
        element.close();
        void shareDialog(current.client, current.planId, projectName());
      }),
    );
  }
  body.append(actions);
}

/** The share links of a plan: the list, and a form for a new link. */
async function shareDialog(client: ServerClient, planId: string, name: string): Promise<void> {
  const { body } = dialog(t('Share "{name}"', { name }));
  const me = await client.me().catch(() => null);
  note(
    body,
    t(
      "A link gives access to this one plan, without an account: to view it, or to edit it. It ends at its date, or when you remove it.",
    ),
  );
  const form = document.createElement("div");
  form.className = "dialog-form";
  const label = document.createElement("input");
  label.placeholder = t("For example: Architect");
  row(form, t("For"), label);
  const access = document.createElement("select");
  access.append(new Option(t("Can view"), "read"));
  if (me?.token.write) access.append(new Option(t("Can edit"), "write"));
  row(form, t("Access"), access);
  const expires = expiryField(form);
  const message = note(form, "", "dialog-note warning");
  const list = document.createElement("div");
  list.className = "token-list";
  const create = actionButton(
    t("Make a link"),
    async () => {
      message.textContent = "";
      try {
        const made = await client.createToken({
          kind: "plan",
          planId,
          label: label.value.trim() || t("Link"),
          write: access.value === "write",
          expires: expires(),
        });
        label.value = "";
        showNewLink(body, client, made.token);
        await fillTokens(list, client, planId);
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
  await fillTokens(list, client, planId);
}

/** The list of tokens with their rights and a button to remove each. */
async function fillTokens(
  list: HTMLElement,
  client: ServerClient,
  planId?: string,
  kind?: TokenInfo["kind"],
): Promise<void> {
  list.replaceChildren();
  try {
    const tokens = (await client.tokens(planId)).filter((x) => !kind || x.kind === kind);
    if (tokens.length === 0) note(list, t("None yet."));
    for (const token of tokens) {
      const line = document.createElement("div");
      line.className = "token-row";
      const text = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = token.label;
      const small = document.createElement("small");
      small.textContent = rightsText(token);
      text.append(strong, small);
      line.append(text);
      if (token.kind !== "root") {
        line.append(
          iconButton(
            "trash",
            t("Remove the access of {label}", { label: token.label }),
            async () => {
              try {
                await client.deleteToken(token.id);
                await fillTokens(list, client, planId, kind);
              } catch (error) {
                showStatus(errorText(error), true);
              }
            },
            { danger: true },
          ),
        );
      }
      list.append(line);
    }
  } catch (error) {
    note(list, errorText(error), "dialog-note warning");
  }
}

/** The settings of a server for root, and its users for root and users that add users. */
async function settingsDialog(connection: Connection): Promise<void> {
  const client = new ServerClient(connection.address);
  const root = connection.token?.kind === "root";
  const { body } = dialog(root ? t("Server settings") : t("Users"));
  if (root) {
    try {
      const settings = await client.settings();
      const name = document.createElement("input");
      name.value = settings.name;
      row(body, t("Name of the server"), name);
      name.addEventListener("change", async () => {
        try {
          await client.saveSettings({ name: name.value });
          refreshConnection(connection.address, await client.me());
          renderHome();
        } catch (error) {
          showStatus(errorText(error), true);
        }
      });
      note(
        body,
        t("Version {version}, mode {mode}, {plans} plans, {tokens} tokens.", {
          version: settings.version,
          mode: settings.mode,
          plans: settings.plans,
          tokens: settings.tokens,
        }),
      );
    } catch (error) {
      note(body, errorText(error), "dialog-note warning");
    }
  }
  const heading = document.createElement("h3");
  heading.textContent = t("Users");
  body.append(heading);
  note(
    body,
    t(
      "Each user gets an own link. A user sees the own plans, and the plans of others only with the right to see all plans. Removing a user also removes the links that the user made.",
    ),
  );
  const form = document.createElement("div");
  form.className = "dialog-form";
  const label = document.createElement("input");
  label.placeholder = t("For example: Anna");
  row(form, t("Name"), label);
  const check = (text: string, value: boolean) => {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = value;
    const element = document.createElement("label");
    element.className = "dialog-check";
    element.append(input, text);
    form.append(element);
    return input;
  };
  const write = check(t("Can edit"), true);
  const create = check(t("Can make plans"), true);
  const seeAll = check(t("Sees all plans"), false);
  const makeUsers = check(t("Can add users"), false);
  const expires = expiryField(form);
  const message = note(form, "", "dialog-note warning");
  const list = document.createElement("div");
  list.className = "token-list";
  form.append(
    actionButton(
      t("Add the user"),
      async () => {
        message.textContent = "";
        if (!label.value.trim()) {
          message.textContent = t("A user needs a name.");
          return;
        }
        try {
          const made = await client.createToken({
            kind: "user",
            label: label.value.trim(),
            write: write.checked,
            createPlans: create.checked,
            seeAll: seeAll.checked,
            makeUsers: makeUsers.checked,
            expires: expires(),
          });
          label.value = "";
          showNewLink(body, client, made.token);
          await fillTokens(list, client, undefined, "user");
        } catch (error) {
          message.textContent = errorText(error);
        }
      },
      true,
    ),
  );
  body.append(form, list);
  await fillTokens(list, client, undefined, "user");
  // All share links that this token can see: root sees all of them.
  const linksHeading = document.createElement("h3");
  linksHeading.textContent = t("Share links");
  const links = document.createElement("div");
  links.className = "token-list";
  body.append(linksHeading, links);
  await fillTokens(links, client, undefined, "plan");
}

/** Two radio buttons: copy or move. It gives true for move. */
function copyOrMove(parent: HTMLElement, moveText: string, canMove = true): () => boolean {
  const name = `transfer-${Math.random().toString(36).slice(2)}`;
  const box = document.createElement("div");
  box.className = "dialog-form";
  const option = (value: string, text: string, checked: boolean) => {
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.checked = checked;
    const element = document.createElement("label");
    element.className = "dialog-check";
    element.append(input, text);
    box.append(element);
    return input;
  };
  option("copy", t("Copy: the plan stays here too"), true);
  const move = canMove ? option("move", moveText, false) : null;
  parent.append(box);
  return () => move?.checked === true;
}

/**
 * Copies or moves a plan of this browser to a server: the open plan (null), or a project of the
 * Projects page. A move puts the project of the browser into the trash, so it can come back.
 */
function uploadDialog(project: { id: string; name: string } | null): void {
  const targets = connections().filter((c) => canCreate(c.token));
  const name = project?.name ?? projectName();
  const { element, body } = dialog(t('"{name}" to a server', { name }));
  note(
    body,
    t("On a server, each change saves to the server, and you can share the plan with links."),
  );
  const select = document.createElement("select");
  for (const c of targets) select.append(new Option(`${c.name} · ${kindText(c.token)}`, c.address));
  row(body, t("Server"), select);
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
      const address = select.value;
      const move = isMove();
      try {
        const building = project ? await projectBuilding(project.id) : doc.building;
        const client = new ServerClient(address);
        const plan = await client.createPlan(name, serializeBuilding(building));
        if (!project && (!current() || doc.building !== building)) return;
        if (move && localId) await trashProjectById(localId);
        element.close();
        if (project) {
          showStatus(
            t('"{name}" is on {server} now.', { name, server: select.selectedOptions[0].text }),
          );
          renderHome();
        } else {
          await openRemote(address, plan.id);
        }
      } catch (error) {
        message.textContent = errorText(error);
      } finally {
        put.disabled = false;
      }
    },
    true,
  );
  body.append(put);
}

/** Copies or moves a plan of a server to this browser. A move deletes it on the server. */
function downloadDialog(client: ServerClient, plan: RemotePlan, canDelete: boolean): void {
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
    canDelete,
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
          if (session?.planId === plan.id && session.address === client.base) endSession();
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
  body.append(take);
}

// ----- The home page -----

/** The sections of the servers on the home page, with their plans. */
function renderServers(list: HTMLElement): void {
  for (const connection of connections()) {
    const section = document.createElement("section");
    section.className = "project-section server-section";
    const head = document.createElement("div");
    head.className = "server-head";
    const heading = document.createElement("h3");
    heading.innerHTML = icon("cloud");
    heading.append(connection.name);
    const who = document.createElement("small");
    who.textContent = kindText(connection.token);
    heading.append(who);
    const tools = document.createElement("div");
    tools.className = "project-tools";
    const client = new ServerClient(connection.address);
    if (canCreate(connection.token)) {
      tools.append(
        iconButton("plus", t("New plan on this server"), async () => {
          try {
            const plan = await client.createPlan(
              t("New plan"),
              serializeBuilding(localize(emptyBuilding())),
            );
            await openRemote(connection.address, plan.id);
          } catch (error) {
            showStatus(errorText(error), true);
          }
        }),
      );
    }
    if (connection.token?.kind === "root" || canManageUsers(connection.token)) {
      tools.append(
        iconButton(
          connection.token?.kind === "root" ? "settings" : "users",
          connection.token?.kind === "root" ? t("Server settings") : t("Users"),
          () => void settingsDialog(connection),
        ),
      );
    }
    tools.append(
      iconButton("close", t("Remove the connection"), () => {
        if (
          !confirm(
            t("Remove the connection to {server}? Keep its link to connect again.", {
              server: connection.name,
            }),
          )
        ) {
          return;
        }
        removeConnection(connection.address);
        renderHome();
      }),
    );
    head.append(heading, tools);
    section.append(head);
    const grid = document.createElement("div");
    grid.className = "project-grid";
    section.append(grid);
    list.append(section);
    void client.plans().then(
      (plans) => {
        if (plans.length === 0) {
          const empty = document.createElement("p");
          empty.className = "project-empty";
          empty.textContent = t("No plans on this server yet.");
          grid.replaceWith(empty);
        }
        grid.append(...plans.map((plan) => remoteCard(connection, client, plan)));
      },
      async (error) => {
        const warning = document.createElement("p");
        warning.className = "project-warning";
        warning.textContent = errorText(error);
        grid.before(warning);
        // Without the network, the copies of this browser open to view.
        if (!(error instanceof ServerError && error.status === 0)) return grid.remove();
        const copies = await listRemoteCopies(connection.address).catch(() => []);
        if (copies.length === 0) return grid.remove();
        grid.append(...copies.map((copy) => offlineCard(connection, copy)));
      },
    );
  }
}

/** The card of the copy of a plan of a server, without the network. */
function offlineCard(connection: Connection, copy: RemoteCopy): HTMLElement {
  const card = document.createElement("article");
  card.className = "project remote";
  const open = document.createElement("button");
  open.className = "project-open";
  open.title = t("Open {name}", { name: copy.name });
  const picture = document.createElement("div");
  picture.className = "project-picture";
  picture.innerHTML = icon("cloud");
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
  mark.textContent = t("Offline copy");
  marks.append(mark);
  text.append(name, time, marks);
  open.append(picture, text);
  open.addEventListener("click", () => void openRemote(connection.address, copy.planId));
  card.append(open);
  return card;
}

/** The card of a plan of a server, with its state and its tools. */
function remoteCard(connection: Connection, client: ServerClient, plan: RemotePlan): HTMLElement {
  const card = document.createElement("article");
  card.className = "project remote";
  const open = document.createElement("button");
  open.className = "project-open";
  open.title = t("Open {name}", { name: plan.name });
  const picture = document.createElement("div");
  picture.className = "project-picture";
  picture.innerHTML = icon("cloud");
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
  mark(t("Server"));
  if (!plan.write) mark(t("View only"), "busy");
  if (plan.lease) mark(t("{holder} edits", { holder: plan.lease.holder }), "busy");
  text.append(marks);
  open.append(picture, text);
  open.addEventListener("click", () => void openRemote(connection.address, plan.id));
  const tools = document.createElement("div");
  tools.className = "project-tools";
  if (plan.write && canShare(connection.token)) {
    tools.append(
      iconButton("share", t("Share"), () => void shareDialog(client, plan.id, plan.name), {
        label: `${t("Share")}: ${plan.name}`,
      }),
    );
  }
  const token = connection.token;
  const canDelete =
    !!token &&
    (token.kind === "root" || (token.kind === "user" && token.write && plan.owner === token.label));
  tools.append(
    iconButton(
      "save",
      t("Copy or move to this browser"),
      () => downloadDialog(client, plan, canDelete),
      { label: `${t("Copy or move to this browser")}: ${plan.name}` },
    ),
  );
  if (canDelete) {
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
 * Sets the hooks of the projects, the buttons of the top bar, and the connections of the start:
 * a link with `#connect=`, and the server that serves this app under the path of a token.
 */
export function setupRemote(): void {
  remoteHooks.active = () => session !== null;
  remoteHooks.save = save;
  remoteHooks.unsaved = () => !!session && unsaved(session);
  remoteHooks.end = endSession;
  remoteHooks.home = renderServers;
  remoteHooks.connect = connectDialog;
  remoteHooks.versions = () => {
    if (session) {
      void showVersions(
        remoteSource(session.client, session.planId, projectName(), session.editing),
      );
    }
  };
  remoteHooks.canUpload = () => connections().some((c) => canCreate(c.token));
  remoteHooks.toServer = uploadDialog;
  doc.onBlocked = () => {
    if (!session) return;
    showStatus(
      session.holder
        ? t("{holder} edits this plan, so you can only view it.", { holder: session.holder })
        : t("This plan is only to view. Click the mark of the server for more."),
      true,
    );
  };
  $("#remote-state").addEventListener("click", planDialog);
  $("#share").addEventListener("click", () => {
    if (session) void shareDialog(session.client, session.planId, projectName());
    else uploadDialog(null);
  });
  doc.subscribe(() => updateRemoteState());
  window.addEventListener("pagehide", () => {
    if (session?.editing) session.client.releaseOnUnload(session.planId);
  });
  void connectAtStart();
}

async function connectAtStart(): Promise<void> {
  // A link of the form …/app/#connect=<address>.
  const fragment = /#connect=([^&]+)/.exec(location.hash);
  if (fragment) {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    try {
      const address = parseAddress(decodeURIComponent(fragment[1]));
      const { connection, me } = await addConnection(address);
      showStatus(t("Connected to {server}.", { server: connection.name }));
      if (me.token.kind === "plan" && me.token.planId) return openRemote(address, me.token.planId);
      renderHome();
    } catch (error) {
      showStatus(errorText(error), true);
    }
    return;
  }
  // The app under the path of a token on a server: the API is next to it.
  if (!/^https?:$/.test(location.protocol)) return;
  try {
    const response = await fetch(new URL("api/me", location.href), { cache: "no-store" });
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("json")) return;
    const address = normalizeAddress(new URL(".", location.href).href);
    const { me } = await addConnection(address);
    if (me.token.kind === "plan" && me.token.planId && !app.planOpen) {
      return openRemote(address, me.token.planId);
    }
    if (!app.planOpen) renderHome();
  } catch {
    // No server next to the app: the app works as before.
  }
}
