import { t } from "../i18n";
import { icon, type IconName } from "../icons";
import { findStory } from "../model/building";
import { fmt } from "../model/format";
import { pvSummary } from "../model/pv";
import { findRooms } from "../model/rooms";
import { SERVICE_SYSTEMS } from "../model/services";
import type { Item, ItemKind } from "../model/types";
import { $, app, cached, doc, editor, shell, Topic } from "./context";
import { projectName } from "./projects";
import { SYSTEM_ICONS } from "./utilities";

/** Opens the topic of an item, makes its story active, and selects it. */
function showItems(storyId: string, items: Item[], itemTopic: Topic): void {
  shell.setTopic(itemTopic);
  doc.setActiveStory(storyId);
  // A change of the story clears the selection in the next frame, unless it knows the story.
  app.shownStoryId = doc.activeStoryId;
  editor.select(items);
}

/** The tree of the contents of the open plan: the stories with their parts, and the building. */
export function renderContents(): void {
  const root = $("#contents");
  root.replaceChildren();
  const building = doc.building;
  const head = document.createElement("p");
  head.className = "contents-title";
  head.textContent = t(
    building.stories.length === 1 ? "{name} · {count} story" : "{name} · {count} stories",
    {
      name: projectName(),
      count: building.stories.length,
    },
  );
  root.append(head);

  const node = (parent: HTMLElement, title: string, count: number | null, open = false) => {
    const details = document.createElement("details");
    details.open = open;
    const summary = document.createElement("summary");
    summary.textContent = title;
    if (count !== null) {
      const badge = document.createElement("span");
      badge.className = "count";
      badge.textContent = String(count);
      summary.append(badge);
    }
    details.append(summary);
    parent.append(details);
    return details;
  };
  const leaf = (
    parent: HTMLElement,
    title: string,
    detail: string,
    action: (() => void) | null,
    iconName?: IconName,
  ) => {
    const element = document.createElement(action ? "button" : "div");
    element.className = "leaf";
    if (iconName) element.innerHTML = icon(iconName);
    const label = document.createElement("span");
    label.textContent = title;
    element.append(label);
    if (detail) {
      const small = document.createElement("small");
      small.textContent = detail;
      element.append(small);
    }
    if (action) element.addEventListener("click", action);
    parent.append(element);
  };

  // The highest story first, as in the list of the stories.
  const stories = [...building.stories].sort((a, b) => b.elevation - a.elevation);
  for (const story of stories) {
    const sign = story.elevation >= 0 ? "+" : "−";
    const storyNode = node(
      root,
      `${t(story.name)} (${sign}${fmt(Math.abs(story.elevation))} m)`,
      null,
      story.id === doc.activeStoryId,
    );
    storyNode.classList.add("story-node");
    const show = (items: Item[], itemTopic: Topic) => () => showItems(story.id, items, itemTopic);
    const all = (kind: ItemKind, list: { id: string }[]) => list.map((x) => ({ kind, id: x.id }));
    const rooms = findRooms(story);
    if (rooms.length > 0) {
      const group = node(storyNode, t("Rooms"), rooms.length);
      for (const room of rooms) {
        leaf(
          group,
          room.info?.name || t("Room"),
          `${fmt(room.area)} m²`,
          show([{ kind: "room", id: room.key }], "structure"),
          "view2d",
        );
      }
    }
    const counts: [string, Item[], IconName][] = [
      [t("Walls"), all("wall", story.walls), "wall"],
      [
        t("Doors"),
        all(
          "opening",
          story.openings.filter((o) => o.kind === "door"),
        ),
        "door",
      ],
      [
        t("Windows"),
        all(
          "opening",
          story.openings.filter((o) => o.kind === "window"),
        ),
        "window",
      ],
      [t("Stairs"), all("stair", story.stairs), "stair"],
      [t("Chimneys"), all("chimney", story.chimneys), "chimney"],
      [t("Dimensions"), all("dimension", story.dimensions), "dimension"],
    ];
    for (const [title, items, iconName] of counts) {
      if (items.length > 0) {
        leaf(storyNode, title, `${items.length}`, show(items, "structure"), iconName);
      }
    }
    if (story.background) {
      leaf(storyNode, t("Background image"), "", show([], "structure"), "image");
    }
    if (story.furniture.length > 0) {
      const group = node(storyNode, t("Furniture"), story.furniture.length);
      for (const piece of story.furniture) {
        leaf(
          group,
          piece.name ? t(piece.name) : t("Piece"),
          "",
          show([{ kind: "furniture", id: piece.id }], "interior"),
          "sofa",
        );
      }
    }
    for (const { system, name } of SERVICE_SYSTEMS) {
      const fixtures = story.fixtures.filter((f) => f.system === system);
      const runs = story.runs.filter((r) => r.system === system);
      if (fixtures.length + runs.length === 0) continue;
      const parts = [
        fixtures.length > 0
          ? t(fixtures.length === 1 ? "{count} device" : "{count} devices", {
              count: fixtures.length,
            })
          : "",
        runs.length > 0
          ? t(runs.length === 1 ? "{count} line" : "{count} lines", { count: runs.length })
          : "",
      ];
      leaf(
        storyNode,
        t(name),
        parts.filter(Boolean).join(", "),
        show([...all("fixture", fixtures), ...all("run", runs)], "utilities"),
        SYSTEM_ICONS[system],
      );
    }
    if (storyNode.childElementCount === 1) {
      leaf(storyNode, t("Empty"), "", null);
    }
  }

  const buildingNode = node(root, t("Building"), null, true);
  if (building.roofs.length > 0) {
    const group = node(buildingNode, t("Roofs"), building.roofs.length);
    for (const roof of building.roofs) {
      const story = findStory(building, roof.storyId);
      leaf(
        group,
        t(roof.name),
        story ? t("on {story}", { story: t(story.name) }) : "",
        story ? () => showItems(story.id, [{ kind: "roof", id: roof.id }], "structure") : null,
        "roof",
      );
    }
  }
  if (building.pv.length > 0) {
    const total = cached("pv", () => pvSummary(doc.building));
    leaf(
      buildingNode,
      t("Photovoltaic"),
      t(building.pv.length === 1 ? "{count} field, {peak} kWp" : "{count} fields, {peak} kWp", {
        count: building.pv.length,
        peak: fmt(total.peak, 1),
      }),
      () => shell.setTopic("utilities"),
      "bolt",
    );
  }
  if (building.models.length > 0) {
    leaf(
      buildingNode,
      t("3D models"),
      `${building.models.length}`,
      () => shell.setTopic("interior"),
      "sofa",
    );
  }
  leaf(
    buildingNode,
    t("Location"),
    building.location
      ? building.location.name ||
          t("{latitude}, {longitude}", {
            latitude: fmt(building.location.latitude),
            longitude: fmt(building.location.longitude),
          })
      : t("not set"),
    () => shell.setTopic("energy"),
    "pin",
  );
  leaf(
    buildingNode,
    t("Climate"),
    building.climate
      ? t("{first} to {last}", {
          first: building.climate.firstYear,
          last: building.climate.lastYear,
        })
      : t("not loaded"),
    () => shell.setTopic("energy"),
    "gauge",
  );
}
