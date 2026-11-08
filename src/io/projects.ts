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

const DB_NAME = "grundriss";
const DB_VERSION = 2;
const PROJECTS = "projects";
const PLANS = "plans";
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
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction!;
      if (!db.objectStoreNames.contains(PROJECTS))
        db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PLANS)) db.createObjectStore(PLANS, { keyPath: "id" });
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

/** Removes the project for good. */
export async function purgeProject(id: string): Promise<void> {
  await run([PROJECTS, PLANS], "readwrite", (t) => {
    t.objectStore(PROJECTS).delete(id);
    t.objectStore(PLANS).delete(id);
    return () => undefined;
  });
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
