import { t } from "../i18n";
import { livingArea, roofIsCeiling } from "../model/attic";
import { findStory, sortStories } from "../model/building";
import { fmt } from "../model/format";
import { newId } from "../model/plan";
import { newRoof, roofBase, roofGeometryOf } from "../model/roof";
import { halfHipHeight, presetSides } from "../model/roofshape";
import type { Room } from "../model/rooms";
import { findRooms, planOutline } from "../model/rooms";
import type { Dormer, Roof, RoofKind, RoofSide, RoofWindow, Story } from "../model/types";
import { doc, editor, shell, showStatus } from "./context";
import {
  button,
  checkField,
  colorField,
  group,
  heading,
  numberField,
  paragraph,
  rangeField,
  section,
  selectField,
  stats,
  textField,
} from "./panel";
import {
  cleanBackground,
  cleanStrength,
  recognizePlan,
  setCleanStrength,
  suggestWalls,
} from "./tracing";

/** The scan or the photo of a plan under the active story, and the assisted tracing. */
function renderBackgroundPanel(): void {
  const plan = doc.plan;
  heading(t("Background"), "image");
  if (plan.background) {
    rangeField(t("Opacity"), plan.background.opacity, (value) =>
      doc.edit((plan) => (plan.background!.opacity = value)),
    );
    button(t("Set scale"), () => shell.setTool("calibrate"), { icon: "ruler" });
    button(t("Remove"), () => doc.edit((plan) => (plan.background = null)), {
      kind: "danger",
      icon: "trash",
    });
    heading(t("Assisted tracing"), "wand");
    paragraph(t("These steps load OpenCV (about 10 MB) the first time."), "note");
    button(t("Straighten"), () => shell.setTool("rectify"), { icon: "crop" });
    rangeField(t("Clean-up strength"), cleanStrength, setCleanStrength);
    button(t("Clean up"), cleanBackground, { icon: "wand" });
    button(t("Suggest walls"), suggestWalls, { icon: "wand" });
    button(t("Recognize plan"), recognizePlan, { kind: "primary", icon: "sparkle" });
    paragraph(
      t(
        "Recognize plan finds walls, doors, and windows with a neural network that runs in the browser. It needs about 15 MB the first time.",
      ),
      "note",
    );
  } else {
    paragraph(t("Load a scan or a photo of a plan as the background, and draw the walls on it."));
    button(t("Load background"), () => void shell.loadBackground(), { icon: "image" });
  }
}

/** The story, the walls and the rooms of the plan, the orientation, and the roofs. */
export function renderStructurePanel(): void {
  const plan = doc.plan;
  renderStoryPanel();
  heading(t("Plan"), "view2d");
  const rooms = findRooms(plan);
  const area = rooms.reduce((sum, room) => sum + room.area, 0);
  stats([
    [String(plan.walls.length), t("walls")],
    [String(plan.openings.length), t("openings")],
    [String(rooms.length), t("rooms")],
    [`${fmt(area, 1)} m²`, t("area")],
  ]);
  paragraph(t("The area is inside the center lines of the walls."), "note");
  // Before the first wall, the background comes first, because the tracing starts with it.
  if (plan.walls.length === 0) {
    renderBackgroundPanel();
    renderBuildingPanel();
  } else {
    renderBuildingPanel();
    renderBackgroundPanel();
  }
}

/**
 * The living area by the WoFlV of a room under a roof: the floor area with a clear height of
 * 2 m or more counts fully, 1 m to 2 m counts half. A room that the roof does not cut shows
 * nothing.
 */
export function renderLivingArea(story: Story, room: Room): void {
  const area = livingArea(doc.building, story, room);
  if (area.living >= area.floor - 0.005 && !roofIsCeiling(doc.building, story)) return;
  stats([
    [
      t("{living} m² of {floor} m²", { living: fmt(area.living, 1), floor: fmt(area.floor, 1) }),
      t("living area (WoFlV)"),
      true,
    ],
  ]);
  paragraph(
    t(
      "The roof is over the room. {full} m² have a clear height of 2 m or more and count fully. {half} m² have 1 m to 2 m and count half. The area under 1 m does not count. The 2D editor shows the lines of 1 m and 2 m.",
      { full: fmt(area.full, 1), half: fmt(area.half, 1) },
    ),
    "note",
  );
}

/** The living area by the WoFlV of all rooms of a story, if a roof cuts a room of it. */
function renderStoryLivingArea(story: Story): void {
  const areas = findRooms(story).map((room) => livingArea(doc.building, story, room));
  const floor = areas.reduce((sum, a) => sum + a.floor, 0);
  const living = areas.reduce((sum, a) => sum + a.living, 0);
  if (areas.length === 0 || (living >= floor - 0.005 && !roofIsCeiling(doc.building, story))) {
    return;
  }
  stats([
    [
      t("{living} m² of {floor} m²", { living: fmt(living, 1), floor: fmt(floor, 1) }),
      t("living area (WoFlV)"),
      true,
    ],
  ]);
}

/** The values of the active story. A change of its height moves the stories above with it. */
function renderStoryPanel(): void {
  const story = doc.plan;
  const id = story.id;
  heading(t("Story"), "layers");
  textField(t("Name"), story.name, (value) =>
    doc.editBuilding((b) => (findStory(b, id)!.name = value)),
  );
  numberField(
    t("Floor level"),
    story.elevation,
    (value) =>
      doc.editBuilding((b) => {
        findStory(b, id)!.elevation = value;
        sortStories(b);
      }),
    { min: -1e6 },
  );
  numberField(
    t("Story height"),
    story.height,
    (value) =>
      doc.editBuilding((b) => {
        const s = findStory(b, id)!;
        const delta = value - s.height;
        for (const other of b.stories) if (other.elevation > s.elevation) other.elevation += delta;
        s.height = value;
      }),
    { min: 0.5 },
  );
  checkField(t("Heated"), story.heated, (value) =>
    doc.editBuilding((b) => (findStory(b, id)!.heated = value)),
  );
  renderStoryLivingArea(story);
  if (doc.building.stories.length > 1) {
    button(
      t("Delete story"),
      () => {
        doc.editBuilding((b) => {
          b.stories = b.stories.filter((s) => s.id !== id);
          // A roof on the deleted story goes away with its PV fields.
          const gone = new Set(b.roofs.filter((r) => r.storyId === id).map((r) => r.id));
          b.roofs = b.roofs.filter((r) => !gone.has(r.id));
          b.pv = b.pv.filter((a) => !gone.has(a.roofId));
        });
      },
      { kind: "danger", icon: "trash" },
    );
  }
}

/** The orientation and the roofs of the building. */
function renderBuildingPanel(): void {
  const building = doc.building;
  heading(t("Building"), "roof");
  numberField(
    t("North"),
    building.north,
    (value) => doc.editBuilding((b) => (b.north = ((value % 360) + 360) % 360)),
    { min: -360, step: 1, unit: "°" },
  );
  colorField(t("Facade"), building.facade, (value) => doc.editBuilding((b) => (b.facade = value)));
  heading(t("Roofs"), "roof");
  for (const roof of building.roofs) {
    const story = findStory(building, roof.storyId);
    button(
      t(roof.name),
      () => {
        if (story && story.id !== doc.activeStoryId) doc.setActiveStory(story.id);
        editor.select({ kind: "roof", id: roof.id });
      },
      { icon: "roof", detail: story ? t(story.name) : t("No story") },
    );
  }
  paragraph(
    t(
      "Add a roof on the walls of {story}. Then click it to change its sides, its outline, and its dormers.",
      { story: t(doc.plan.name) },
    ),
    "note",
  );
  for (const [preset, name] of [
    ["gable", "Gable roof"],
    ["half-hip", "Half-hip roof"],
    ["hip", "Hip roof"],
    ["shed", "Shed roof"],
    ["flat", "Flat roof"],
  ] as const) {
    button(t(name), () => addRoof(preset), { icon: "plus" });
  }
}

/** Adds a roof on the outline of the walls of the active story. */
function addRoof(preset: RoofKind): void {
  const roof = newRoof(doc.building, doc.plan, preset);
  if (!roof) {
    showStatus(
      t("The walls of this story close no outline, so the roof has no outline yet."),
      true,
    );
    return;
  }
  doc.editBuilding((b) => b.roofs.push(roof));
  editor.select({ kind: "roof", id: roof.id });
  showStatus(t("Added the roof. Drag its corners, or drag a + to add a corner."));
}

/** The panel of a roof: its settings, its sides, its dormers, and its windows. */
export function renderRoofPanel(roofId: string, corner: number | null): void {
  const building = doc.building;
  const roof = building.roofs.find((r) => r.id === roofId);
  if (!roof) return;
  const change = (edit: (roof: Roof) => void) =>
    doc.editBuilding((b) => edit(b.roofs.find((r) => r.id === roofId)!));
  const geometry = roofGeometryOf(building, roof);
  const story = findStory(building, roof.storyId);

  if (corner !== null) {
    const point = roof.outline[corner];
    heading(t("{roof} · corner {corner}", { roof: t(roof.name), corner: corner + 1 }), "roof");
    numberField("x", point.x, (v) => change((r) => (r.outline[corner].x = v)), { min: -1e6 });
    numberField("y", point.y, (v) => change((r) => (r.outline[corner].y = v)), { min: -1e6 });
    paragraph(t("Drag the corner on the plan. Delete removes it."), "note");
    button(t("Whole roof"), () => editor.select({ kind: "roof", id: roofId }), { icon: "roof" });
    return;
  }

  heading(t(roof.name), "roof");
  stats([
    [`${fmt(geometry.top)} m`, t("top above ground")],
    [String(roof.outline.length), t("sides")],
  ]);
  textField(t("Name"), roof.name, (v) => change((r) => (r.name = v)));
  colorField(t("Color"), roof.color, (v) => change((r) => (r.color = v)));
  colorField(t("Underside"), roof.underside, (v) => change((r) => (r.underside = v)));
  selectField(
    t("On story"),
    roof.storyId,
    building.stories.map((s) => [s.id, t(s.name)]),
    (storyId) => change((r) => (r.storyId = storyId)),
  );
  numberField(
    t("Eave height"),
    roof.base ?? (story ? roofBase(building, story) : 0),
    (v) => change((r) => (r.base = v)),
    { min: -100 },
  );
  if (roof.base !== null) {
    button(t("Usual eave height"), () => change((r) => (r.base = null)), {
      icon: "layers",
    });
  }
  checkField(t("Flat roof"), roof.flat, (v) => change((r) => (r.flat = v)));
  paragraph(t("Presets for all sides:"), "note");
  for (const [preset, name] of [
    ["gable", "Gable roof"],
    ["half-hip", "Half-hip roof"],
    ["hip", "Hip roof"],
    ["shed", "Shed roof"],
  ] as const) {
    button(
      t(name),
      () =>
        change((r) => {
          const pitch = r.sides.find((side) => side.kind === "eave")?.pitch ?? 35;
          const overhang = r.sides[0]?.overhang ?? 0.4;
          r.sides = presetSides(r.outline, preset, pitch, overhang);
          r.flat = false;
        }),
      { icon: "roof" },
    );
  }
  button(
    t("Outline from the walls"),
    () => {
      const outline = story ? planOutline(story) : null;
      if (!outline) {
        showStatus(t("The walls of the story close no outline."), true);
        return;
      }
      change((r) => {
        const pitch = r.sides.find((side) => side.kind === "eave")?.pitch ?? 35;
        r.outline = outline;
        r.sides = presetSides(outline, "gable", pitch, r.sides[0]?.overhang ?? 0.4);
        r.dormers = [];
        r.windows = [];
      });
    },
    { icon: "fit" },
  );

  const sideLength = (i: number) => {
    const p = roof.outline[i];
    const q = roof.outline[(i + 1) % roof.outline.length];
    return Math.hypot(q.x - p.x, q.y - p.y);
  };
  group(t("Sides"), true, () => {
    roof.sides.forEach((side, i) => {
      const row = document.createElement("div");
      row.className = "side-row";
      const label = document.createElement("span");
      label.textContent = String(i + 1);
      const kind = document.createElement("select");
      kind.append(
        new Option(t("Eave"), "eave", false, side.kind === "eave"),
        new Option(t("Gable"), "gable", false, side.kind === "gable"),
        new Option(t("Half hip"), "half-hip", false, side.kind === "half-hip"),
      );
      kind.addEventListener("change", () =>
        change((r) => {
          const next = r.sides[i];
          next.kind = kind.value as RoofSide["kind"];
          if (next.kind === "half-hip") {
            next.gableHeight ??= halfHipHeight(sideLength(i), next.pitch);
          } else delete next.gableHeight;
        }),
      );
      const pitch = document.createElement("input");
      pitch.type = "number";
      pitch.min = "1";
      pitch.max = "85";
      pitch.value = String(side.pitch);
      pitch.title = t("Pitch in degrees");
      pitch.disabled = side.kind === "gable";
      pitch.addEventListener("change", () => {
        const v = Number(pitch.value);
        if (v > 0 && v < 90) change((r) => (r.sides[i].pitch = v));
      });
      const overhang = document.createElement("input");
      overhang.type = "number";
      overhang.step = "0.05";
      overhang.min = "0";
      overhang.value = String(side.overhang);
      overhang.title = t("Overhang in meters");
      overhang.addEventListener("change", () => {
        const v = Number(overhang.value);
        if (v >= 0) change((r) => (r.sides[i].overhang = v));
      });
      row.append(label, kind, pitch, overhang);
      section.append(row);
      if (side.kind === "half-hip") {
        numberField(
          t("Side {side}: gable wall", { side: i + 1 }),
          side.gableHeight ?? 0,
          (v) => change((r) => (r.sides[i].gableHeight = v)),
          { step: 0.05, unit: "m" },
        );
      }
    });
    paragraph(
      t(
        "Each row: the kind, the pitch in °, and the overhang in m. A half-hip side has a gable wall up to its height, and a small hip face above it.",
      ),
      "note",
    );
  });

  const eaves = roof.sides
    .map((side, i) => ({ side, i }))
    .filter(({ side }) => side.kind === "eave")
    .map(({ i }) => i);
  // A new dormer or window goes on the longest eave side. The copy keeps `eaves` in side order.
  const longest = [...eaves].sort((a, b) => sideLength(b) - sideLength(a))[0];

  const misfit = (id: string) => {
    if (geometry.misfits.includes(id)) {
      paragraph(
        t(
          "It does not fit on the roof face of its side, so the 3D view does not show it. Move it nearer to the eave, or make it smaller.",
        ),
        "warning",
      );
    }
  };
  const hasMisfit = (items: { id: string }[]) => items.some((i) => geometry.misfits.includes(i.id));

  group(t("Dormers · {count}", { count: roof.dormers.length }), hasMisfit(roof.dormers), () => {
    roof.dormers.forEach((dormer) => {
      const set = (edit: (d: Dormer) => void) =>
        change((r) => edit(r.dormers.find((d) => d.id === dormer.id)!));
      paragraph(t("Dormer on side {side}", { side: dormer.side + 1 }));
      misfit(dormer.id);
      selectField(
        t("Side"),
        String(dormer.side),
        eaves.map((i) => [String(i), t("Side {side}", { side: i + 1 })]),
        (v) => set((d) => (d.side = Number(v))),
      );
      selectField(
        t("Kind"),
        dormer.kind,
        [
          ["gable", t("Gable")],
          ["shed", t("Shed")],
          ["flat", t("Flat")],
        ],
        (v) => set((d) => (d.kind = v)),
      );
      numberField(t("Position"), dormer.offset, (v) => set((d) => (d.offset = v)));
      numberField(t("From eave"), dormer.distance, (v) => set((d) => (d.distance = v)));
      numberField(t("Width"), dormer.width, (v) => set((d) => (d.width = v)), { min: 0.4 });
      numberField(t("Wall height"), dormer.height, (v) => set((d) => (d.height = v)), { min: 0.3 });
      if (dormer.kind !== "flat") {
        numberField(t("Pitch"), dormer.pitch, (v) => set((d) => (d.pitch = v)), {
          min: 1,
          step: 1,
          unit: "°",
        });
      }
      button(
        t("Remove"),
        () => change((r) => (r.dormers = r.dormers.filter((d) => d.id !== dormer.id))),
        {
          kind: "danger",
          icon: "trash",
        },
      );
    });
    if (longest !== undefined && !roof.flat) {
      button(
        t("Add a dormer"),
        () =>
          change((r) =>
            r.dormers.push({
              id: newId("dm"),
              side: longest,
              offset: sideLength(longest) / 2,
              distance: 1,
              width: 1.8,
              height: 1.2,
              kind: "gable",
              pitch: 25,
            }),
          ),
        { icon: "plus" },
      );
    }
  });

  group(
    t("Roof windows · {count}", { count: roof.windows.length }),
    hasMisfit(roof.windows),
    () => {
      roof.windows.forEach((window) => {
        const set = (edit: (w: RoofWindow) => void) =>
          change((r) => edit(r.windows.find((w) => w.id === window.id)!));
        paragraph(t("Window on side {side}", { side: window.side + 1 }));
        misfit(window.id);
        selectField(
          t("Side"),
          String(window.side),
          eaves.map((i) => [String(i), t("Side {side}", { side: i + 1 })]),
          (v) => set((w) => (w.side = Number(v))),
        );
        numberField(t("Position"), window.offset, (v) => set((w) => (w.offset = v)));
        numberField(t("From eave"), window.distance, (v) => set((w) => (w.distance = v)));
        numberField(t("Width"), window.width, (v) => set((w) => (w.width = v)), { min: 0.3 });
        numberField(t("Length"), window.length, (v) => set((w) => (w.length = v)), { min: 0.3 });
        button(
          t("Remove"),
          () => change((r) => (r.windows = r.windows.filter((w) => w.id !== window.id))),
          {
            kind: "danger",
            icon: "trash",
          },
        );
      });
      if (longest !== undefined && !roof.flat) {
        button(
          t("Add a roof window"),
          () =>
            change((r) =>
              r.windows.push({
                id: newId("rw"),
                side: longest,
                offset: sideLength(longest) / 3,
                distance: 1.5,
                width: 0.78,
                length: 1.4,
              }),
            ),
          { icon: "plus" },
        );
      }
    },
  );

  paragraph(t("Drag the corners of the outline on the plan. Drag a + to add a corner."), "note");
  button(t("Delete roof"), () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
}
