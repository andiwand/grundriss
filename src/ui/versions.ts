// The versions of a plan: the history of a project in this browser (IndexedDB), or the revisions
// of a plan on a server. A version opens as a copy in this browser, or comes back as the current
// state: in the open plan as one change that undo takes back, else as the new state of the
// project. Before a restore in the browser, the current state goes into the history too.

import { locale, t } from "../i18n";
import { icon } from "../icons";
import { addRevision, listRevisions, loadProject, loadRevision, saveProject } from "../io/projects";
import type { ServerClient } from "../io/server";
import { parseBuilding } from "../model/file";
import type { Building } from "../model/types";
import { doc, showStatus } from "./context";
import { actionButton, dialog, note } from "./dialog";
import { addProject, ago, projectId, renderHome } from "./projects";

/** A version in the list. */
interface Version {
  key: string;
  title: string;
  detail: string;
  /** True for the version that the plan has now. */
  current: boolean;
  load: () => Promise<string>;
}

/** Where the versions come from, and what a restore does. */
interface Source {
  name: string;
  list: () => Promise<Version[]>;
  /** Null if the user cannot restore, for example on a server without the right to edit. */
  restore: ((data: string) => Promise<void>) | null;
}

const errorText = (error: unknown) => (error instanceof Error ? t(error.message) : String(error));

/** The size of a version in kB or MB. */
function sizeText(bytes: number): string {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} kB`;
}

/** Gives the open plan the state of an old version, as one change of the history. */
function restoreOpen(building: Building): void {
  doc.editBuilding((b) => {
    // The file of the plan stays the same file, so the plan keeps its revision of the file.
    const revision = b.revision;
    Object.assign(b, building);
    b.revision = revision;
  });
}

/** The history of a project in this browser. */
export function localSource(id: string, name: string): Source {
  return {
    name,
    list: async () => {
      const revisions = await listRevisions(id);
      const kind = {
        file: t("Saved to a file"),
        auto: t("Saved in the browser"),
        restore: t("Before a restore"),
      };
      return revisions.map((r) => ({
        key: r.key,
        title: kind[r.kind],
        detail: `${ago(r.time)} · ${new Date(r.time).toLocaleString(locale())} · ${sizeText(r.size)}`,
        current: false,
        load: async () => {
          const data = await loadRevision(r.key);
          if (!data) throw new Error("The version is not in the browser any more.");
          return data;
        },
      }));
    },
    restore: async (data) => {
      // The state of now goes into the history first, so the restore can go back.
      const project = await loadProject(id);
      if (project) await addRevision(id, project.data, "restore");
      if (id === projectId) {
        restoreOpen(parseBuilding(data));
      } else if (project) {
        await saveProject({ ...project, data, updated: Date.now() });
        renderHome();
      }
    },
  };
}

/** The revisions of a plan on a server. `canEdit` is true while this tab has the lease. */
export function remoteSource(
  client: ServerClient,
  planId: string,
  name: string,
  canEdit: boolean,
): Source {
  return {
    name,
    list: async () => {
      const revisions = await client.revisions(planId);
      const last = revisions.at(-1)?.id;
      return revisions.reverse().map((r) => ({
        key: r.id,
        title: t("Revision {number}", { number: r.id }),
        detail: `${ago(r.time)} · ${r.by} · ${sizeText(r.size)}`,
        current: r.id === last,
        load: async () => (await client.revision(planId, r.id)).data,
      }));
    },
    // A restore is a change of the open plan, so the autosave makes it a new revision.
    restore: canEdit ? async (data) => restoreOpen(parseBuilding(data)) : null,
  };
}

/** The dialog with the versions of a plan, the newest first. */
export async function showVersions(source: Source): Promise<void> {
  const { element, body } = dialog(t('Versions of "{name}"', { name: source.name }));
  note(
    body,
    source.restore
      ? t(
          "Restore gives the plan the state of a version; undo takes it back. Open as a copy makes a new plan in this browser.",
        )
      : t("Open as a copy makes a new plan in this browser."),
  );
  const list = document.createElement("div");
  list.className = "token-list";
  body.append(list);
  let versions: Version[];
  try {
    versions = await source.list();
  } catch (error) {
    note(list, errorText(error), "dialog-note warning");
    return;
  }
  if (versions.length === 0) {
    note(
      list,
      t(
        "No versions yet. The browser keeps one at each save to a file, and one every few minutes while you edit.",
      ),
    );
  }
  for (const version of versions) {
    const line = document.createElement("div");
    line.className = "token-row";
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.innerHTML = icon("history");
    title.append(version.title);
    if (version.current) title.append(` · ${t("current")}`);
    const detail = document.createElement("small");
    detail.textContent = version.detail;
    text.append(title, detail);
    const actions = document.createElement("span");
    actions.className = "dialog-actions";
    const run = (action: (data: string) => Promise<void>) => async () => {
      try {
        await action(await version.load());
      } catch (error) {
        showStatus(errorText(error), true);
      }
    };
    actions.append(
      actionButton(
        t("Open as a copy"),
        run(async (data) => {
          await addProject(parseBuilding(data), `${source.name} (${version.title})`);
          showStatus(t("The version is a new plan in this browser now."));
          renderHome();
        }),
      ),
    );
    const restore = source.restore;
    if (restore && !version.current) {
      actions.append(
        actionButton(
          t("Restore"),
          run(async (data) => {
            await restore(data);
            element.close();
            showStatus(
              t('The plan has the state of "{version}" again.', { version: version.title }),
            );
          }),
        ),
      );
    }
    line.append(text, actions);
    list.append(line);
  }
}
