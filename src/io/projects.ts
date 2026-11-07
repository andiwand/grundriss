// The projects in the browser: each project is a plan in IndexedDB, with its name, its times,
// and a small picture of the plan. The data stays in this browser on this device. The app saves
// the open project after each change, so the user does not lose work on a reload.

const DB_NAME = "grundriss";
const DB_VERSION = 1;
const STORE = "projects";

/** The list entry of a project: everything except the plan. */
export interface ProjectInfo {
  id: string;
  name: string;
  /** The times in milliseconds since 1970. */
  created: number;
  updated: number;
  /** An SVG of the first story, without the background image, or "". */
  preview: string;
}

/** A project with its plan as the JSON of the file format. */
export interface Project extends ProjectInfo {
  data: string;
}

let opened: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser cannot store projects."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The browser blocks the storage."));
  });
  // A failed open can work later, for example after the user allows the storage.
  opened.catch(() => (opened = null));
  return opened;
}

/** Runs one request in a transaction and gives its result when the transaction is complete. */
async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? request.error);
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

/** All projects, the last changed first. The list does not contain the plans. */
export async function listProjects(): Promise<ProjectInfo[]> {
  const all = await run("readonly", (store) => store.getAll() as IDBRequest<Project[]>);
  return all.map(({ data: _data, ...info }) => info).sort((a, b) => b.updated - a.updated);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return run("readonly", (store) => store.get(id) as IDBRequest<Project | undefined>);
}

export async function saveProject(project: Project): Promise<void> {
  await run("readwrite", (store) => store.put(project));
}

export async function deleteProject(id: string): Promise<void> {
  await run("readwrite", (store) => store.delete(id));
}

/** Changes the name of a project, and keeps its plan. */
export async function renameProject(id: string, name: string): Promise<void> {
  const project = await loadProject(id);
  if (project) await saveProject({ ...project, name });
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

/** A new id for a project. */
export const newProjectId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
