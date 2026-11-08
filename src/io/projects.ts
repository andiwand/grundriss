// The projects in the browser: each project is a plan in IndexedDB, with its name, its times,
// and a small picture of the plan. The data stays in this browser on this device. The app saves
// the open project after each change, so the user does not lose work on a reload.
//
// The database has two stores. "projects" has the list entries, and "plans" has the plans as the
// JSON of the file format. So the list of the projects does not load the plans with their large
// images. Version 1 had the plans in the list entries; the upgrade to version 2 moves them.
//
// A deleted project goes to the trash first: its entry gets the time of the delete. The app
// removes it for good after TRASH_DAYS.
//
// Version 3 adds the history of each project: "revisions" has the list entries (the project, the
// time, the kind, the size), and "revisionData" has their plans, so that the list loads fast. A
// project keeps its newest MAX_REVISIONS revisions.
//
// Version 4 keeps the large images of the history once, in "blobs" (src/model/blobs.ts), and the
// copies of the plans of servers for use without the network: "remoteCopies" and
// "remoteCopyData". An image goes away when no revision and no copy uses it.

import { blobRefs, dehydrate, hydrate } from "../model/blobs";

const DB_NAME = "grundriss";
const DB_VERSION = 4;
const PROJECTS = "projects";
const PLANS = "plans";
const REVISIONS = "revisions";
const REVISION_DATA = "revisionData";
const BLOBS = "blobs";
const REMOTE_COPIES = "remoteCopies";
const REMOTE_COPY_DATA = "remoteCopyData";
/** The number of revisions that each project keeps. */
export const MAX_REVISIONS = 20;
/** A deleted project stays in the trash for this many days. */
export const TRASH_DAYS = 30;

/** The list entry of a project: everything except the plan. */
export interface ProjectInfo {
  id: string;
  name: string;
  /** The times in milliseconds since 1970. */
  created: number;
  updated: number;
  /** An SVG of the first story, without the background image, or "". */
  preview: string;
  /** The time of the delete, if the project is in the trash. */
  deleted?: number;
}

/** A project with its plan as the JSON of the file format. */
export interface Project extends ProjectInfo {
  data: string;
}

let opened: Promise<IDBDatabase> | null = null;
/** True if a tab with an older version of the app blocked the last open of the database. */
let blocked = false;

/** True if another tab of an older version of the app blocks the storage. */
export const storageBlocked = (): boolean => blocked;

function database(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser cannot store projects."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let abandoned = false;
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction!;
      if (!db.objectStoreNames.contains(PROJECTS))
        db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PLANS)) db.createObjectStore(PLANS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(REVISIONS)) {
        const store = db.createObjectStore(REVISIONS, { keyPath: "key" });
        store.createIndex("project", "projectId");
      }
      if (!db.objectStoreNames.contains(REVISION_DATA)) {
        db.createObjectStore(REVISION_DATA, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: "hash" });
      if (!db.objectStoreNames.contains(REMOTE_COPIES)) {
        const store = db.createObjectStore(REMOTE_COPIES, { keyPath: "key" });
        store.createIndex("address", "address");
      }
      if (!db.objectStoreNames.contains(REMOTE_COPY_DATA)) {
        db.createObjectStore(REMOTE_COPY_DATA, { keyPath: "key" });
      }
      // Version 1 kept the plan in the list entry. Move it to the store of the plans.
      if (event.oldVersion === 1) {
        const projects = transaction.objectStore(PROJECTS);
        const plans = transaction.objectStore(PLANS);
        projects.openCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          const { data, ...info } = cursor.value as Project;
          if (typeof data === "string") {
            plans.put({ id: info.id, data });
            cursor.update(info);
          }
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // A blocked request can succeed after its caller has already received an error.
      if (abandoned) {
        db.close();
        return;
      }
      blocked = false;
      // Another tab with a newer version of the app wants to upgrade the database.
      db.onversionchange = () => {
        db.close();
        opened = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("The browser blocks the storage."));
    // A tab with an older version of the app keeps the database open, so the upgrade waits.
    request.onblocked = () => {
      abandoned = true;
      blocked = true;
      reject(new Error("Another tab of Grundriss blocks the storage."));
    };
  });
  // A failed open can work later, for example after the user allows the storage.
  opened.catch(() => (opened = null));
  return opened;
}

/** Runs the requests of `action` in one transaction, and gives its result when it is complete. */
async function run<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (transaction: IDBTransaction) => IDBRequest<T> | (() => T),
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(stores, mode);
    const result = action(transaction);
    transaction.oncomplete = () =>
      resolve(typeof result === "function" ? result() : (result as IDBRequest<T>).result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("The browser stopped the save."));
  });
}

/** True if the browser can store projects. Private windows of some browsers cannot. */
export async function projectsAvailable(): Promise<boolean> {
  try {
    await database();
    return true;
  } catch {
    return false;
  }
}

const allInfos = () =>
  run([PROJECTS], "readonly", (t) => t.objectStore(PROJECTS).getAll() as IDBRequest<ProjectInfo[]>);

/** The projects that are not in the trash, the last changed first. Without the plans. */
export async function listProjects(): Promise<ProjectInfo[]> {
  return (await allInfos()).filter((p) => !p.deleted).sort((a, b) => b.updated - a.updated);
}

/** The projects in the trash, the last deleted first. */
export async function listDeleted(): Promise<ProjectInfo[]> {
  return (await allInfos())
    .filter((p) => p.deleted)
    .sort((a, b) => (b.deleted ?? 0) - (a.deleted ?? 0));
}

export async function loadProject(id: string): Promise<Project | undefined> {
  let info: ProjectInfo | undefined;
  let plan: { data: string } | undefined;
  await run([PROJECTS, PLANS], "readonly", (t) => {
    const a = t.objectStore(PROJECTS).get(id) as IDBRequest<ProjectInfo | undefined>;
    const b = t.objectStore(PLANS).get(id) as IDBRequest<{ data: string } | undefined>;
    a.onsuccess = () => (info = a.result);
    b.onsuccess = () => (plan = b.result);
    return () => undefined;
  });
  return info && plan ? { ...info, data: plan.data } : undefined;
}

/** Saves the project: its entry and its plan, in one transaction. */
export async function saveProject(project: Project): Promise<void> {
  const { data, ...info } = project;
  await run([PROJECTS, PLANS], "readwrite", (t) => {
    t.objectStore(PROJECTS).put(info);
    t.objectStore(PLANS).put({ id: info.id, data });
    return () => undefined;
  });
}

/** Changes the entry of a project, and keeps its plan. */
async function updateInfo(id: string, change: (info: ProjectInfo) => void): Promise<void> {
  await run([PROJECTS], "readwrite", (t) => {
    const store = t.objectStore(PROJECTS);
    const request = store.get(id) as IDBRequest<ProjectInfo | undefined>;
    request.onsuccess = () => {
      if (!request.result) return;
      change(request.result);
      store.put(request.result);
    };
    return () => undefined;
  });
}

/** Puts the project in the trash. */
export async function deleteProject(id: string): Promise<void> {
  await updateInfo(id, (info) => (info.deleted = Date.now()));
}

/** Takes the project out of the trash. */
export async function restoreProject(id: string): Promise<void> {
  await updateInfo(id, (info) => delete info.deleted);
}

/** Removes the project for good, with its history. */
export async function purgeProject(id: string): Promise<void> {
  const keys = (await listRevisions(id)).map((r) => r.key);
  await run([PROJECTS, PLANS, REVISIONS, REVISION_DATA], "readwrite", (t) => {
    t.objectStore(PROJECTS).delete(id);
    t.objectStore(PLANS).delete(id);
    for (const key of keys) {
      t.objectStore(REVISIONS).delete(key);
      t.objectStore(REVISION_DATA).delete(key);
    }
    return () => undefined;
  });
  if (keys.length > 0) await collectBlobs();
}

// ----- The history of a project -----

/** Why the app kept a revision: a save to a file, the autosave, or a restore of an old one. */
export type RevisionKind = "file" | "auto" | "restore";

/** The list entry of a revision of a project. */
export interface LocalRevision {
  key: string;
  projectId: string;
  time: number;
  kind: RevisionKind;
  size: number;
  /** The hashes of the images that the revision uses. */
  blobs?: string[];
}

/** Puts the images of a dehydrated plan into the store of the blobs, in a transaction. */
function putBlobs(t: IDBTransaction, blobs: Map<string, string>): void {
  const store = t.objectStore(BLOBS);
  for (const [hash, data] of blobs) {
    const request = store.getKey(hash);
    // An image that the store has already stays as it is, so it is not written again.
    request.onsuccess = () => {
      if (request.result === undefined) store.put({ hash, data });
    };
  }
}

/** The plan with its images, from the JSON of the store. */
async function withBlobs(json: string): Promise<string> {
  const refs = blobRefs(json);
  if (refs.length === 0) return json;
  const values = await run([BLOBS], "readonly", (t) => {
    const store = t.objectStore(BLOBS);
    const found = new Map<string, string>();
    for (const hash of refs) {
      const request = store.get(hash) as IDBRequest<{ hash: string; data: string } | undefined>;
      request.onsuccess = () => request.result && found.set(hash, request.result.data);
    }
    return () => found;
  });
  return hydrate(json, (hash) => values.get(hash));
}

/** Removes the images that no revision and no copy of a server plan uses any more. */
export async function collectBlobs(): Promise<void> {
  await run([REVISIONS, REMOTE_COPIES, BLOBS], "readwrite", (t) => {
    const used = new Set<string>();
    const revisions = t.objectStore(REVISIONS).getAll() as IDBRequest<LocalRevision[]>;
    const copies = t.objectStore(REMOTE_COPIES).getAll() as IDBRequest<RemoteCopy[]>;
    copies.onsuccess = () => {
      for (const record of [...revisions.result, ...copies.result]) {
        for (const hash of record.blobs ?? []) used.add(hash);
      }
      const keys = t.objectStore(BLOBS).getAllKeys();
      keys.onsuccess = () => {
        for (const key of keys.result) {
          if (!used.has(String(key))) t.objectStore(BLOBS).delete(key);
        }
      };
    };
    return () => undefined;
  });
}

/** The revisions of a project, the newest first. Without their plans. */
export async function listRevisions(projectId: string): Promise<LocalRevision[]> {
  const list = await run(
    [REVISIONS],
    "readonly",
    (t) =>
      t.objectStore(REVISIONS).index("project").getAll(projectId) as IDBRequest<LocalRevision[]>,
  );
  return list.sort((a, b) => b.time - a.time);
}

/** The plan of a revision as the JSON of the file format. */
export async function loadRevision(key: string): Promise<string | undefined> {
  const record = await run(
    [REVISION_DATA],
    "readonly",
    (t) =>
      t.objectStore(REVISION_DATA).get(key) as IDBRequest<
        { key: string; data: string } | undefined
      >,
  );
  return record ? withBlobs(record.data) : undefined;
}

/**
 * Keeps a revision of a project, and removes the oldest ones over MAX_REVISIONS. It gives the
 * list entry of the new revision.
 */
export async function addRevision(
  projectId: string,
  data: string,
  kind: RevisionKind,
  time = Date.now(),
): Promise<LocalRevision> {
  const { json, blobs } = dehydrate(data);
  const revision: LocalRevision = {
    key: `${projectId}:${time}:${Math.random().toString(36).slice(2, 6)}`,
    projectId,
    time,
    kind,
    size: data.length,
    blobs: [...blobs.keys()],
  };
  const old = (await listRevisions(projectId)).slice(MAX_REVISIONS - 1).map((r) => r.key);
  await run([REVISIONS, REVISION_DATA, BLOBS], "readwrite", (t) => {
    putBlobs(t, blobs);
    t.objectStore(REVISIONS).put(revision);
    t.objectStore(REVISION_DATA).put({ key: revision.key, data: json });
    for (const key of old) {
      t.objectStore(REVISIONS).delete(key);
      t.objectStore(REVISION_DATA).delete(key);
    }
    return () => undefined;
  });
  if (old.length > 0) await collectBlobs();
  return revision;
}

// ----- The copies of the plans of servers -----

/** The list entry of the copy of a plan of a server, for use without the network. */
export interface RemoteCopy {
  /** The address of the token and the id of the plan. */
  key: string;
  address: string;
  planId: string;
  name: string;
  revision: string;
  time: number;
  blobs?: string[];
}

/** Keeps the state of a plan of a server, so that the app can open it without the network. */
export async function saveRemoteCopy(
  address: string,
  planId: string,
  name: string,
  revision: string,
  data: string,
): Promise<void> {
  const { json, blobs } = dehydrate(data);
  const copy: RemoteCopy = {
    key: `${address}|${planId}`,
    address,
    planId,
    name,
    revision,
    time: Date.now(),
    blobs: [...blobs.keys()],
  };
  await run([REMOTE_COPIES, REMOTE_COPY_DATA, BLOBS], "readwrite", (t) => {
    putBlobs(t, blobs);
    t.objectStore(REMOTE_COPIES).put(copy);
    t.objectStore(REMOTE_COPY_DATA).put({ key: copy.key, data: json });
    return () => undefined;
  });
}

/** The copies of the plans of a server, the newest first. Without their plans. */
export async function listRemoteCopies(address: string): Promise<RemoteCopy[]> {
  const list = await run(
    [REMOTE_COPIES],
    "readonly",
    (t) =>
      t.objectStore(REMOTE_COPIES).index("address").getAll(address) as IDBRequest<RemoteCopy[]>,
  );
  return list.sort((a, b) => b.time - a.time);
}

/** The copy of a plan of a server with its plan, or undefined. */
export async function loadRemoteCopy(
  address: string,
  planId: string,
): Promise<(RemoteCopy & { data: string }) | undefined> {
  const key = `${address}|${planId}`;
  const [copy, record] = await run([REMOTE_COPIES, REMOTE_COPY_DATA], "readonly", (t) => {
    const a = t.objectStore(REMOTE_COPIES).get(key) as IDBRequest<RemoteCopy | undefined>;
    const b = t.objectStore(REMOTE_COPY_DATA).get(key) as IDBRequest<
      { key: string; data: string } | undefined
    >;
    return () => [a.result, b.result] as const;
  });
  return copy && record ? { ...copy, data: await withBlobs(record.data) } : undefined;
}

/** Removes the copies of the plans of a server, for example when its connection goes. */
export async function removeRemoteCopies(address: string): Promise<void> {
  const keys = (await listRemoteCopies(address)).map((c) => c.key);
  await run([REMOTE_COPIES, REMOTE_COPY_DATA], "readwrite", (t) => {
    for (const key of keys) {
      t.objectStore(REMOTE_COPIES).delete(key);
      t.objectStore(REMOTE_COPY_DATA).delete(key);
    }
    return () => undefined;
  });
  await collectBlobs();
}

/** Removes the projects that are in the trash for more than TRASH_DAYS. */
export async function emptyOldTrash(now = Date.now()): Promise<void> {
  const limit = now - TRASH_DAYS * 24 * 3600 * 1000;
  for (const info of await listDeleted()) {
    if ((info.deleted ?? now) < limit) await purgeProject(info.id);
  }
}

/** Changes the name of a project, and keeps its plan. */
export async function renameProject(id: string, name: string): Promise<void> {
  await updateInfo(id, (info) => (info.name = name));
}

/** All projects that are not in the trash, with their plans, for a backup. */
export async function allProjects(): Promise<Project[]> {
  const result: Project[] = [];
  for (const info of await listProjects()) {
    const project = await loadProject(info.id);
    if (project) result.push(project);
  }
  return result;
}

/**
 * Asks the browser to keep the projects when the disk is full. Without it, a browser can delete
 * the data of a site. Safari deletes it after 7 days without a visit, unless the app is installed.
 */
export async function keepProjects(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** True if the browser keeps the projects when the disk is full. */
export async function projectsKept(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/** The storage that the site uses, and the most that it can use, in bytes, or null. */
export async function storageUse(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate?.quota) return null;
    return { usage: estimate.usage ?? 0, quota: estimate.quota };
  } catch {
    return null;
  }
}

/** A new id for a project. */
export const newProjectId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
