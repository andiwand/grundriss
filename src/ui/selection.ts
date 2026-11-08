// The panel: the calibration of the background, the selected objects, or the panel of the topic.
// Each kind of object has its own function. They share small helpers: `editOf` changes one
// object of the active story, `numberOf` is a number field for one property of an object, and
// `itemActions` adds the circuit, the notes, and the buttons that most objects have.

import { t } from "../i18n";
import { chimneyExtent, defaultWallHeight, stairRise, stairShape } from "../model/building";
import { DEFAULT_COLORS, roomOnSide, wallSideColor } from "../model/colors";
import { isOuterWall, roomHeatLoss, uValue, wallLayers } from "../model/energy";
import { fmt } from "../model/format";
import { findFurniture, genericType } from "../model/furniture";
import { distance } from "../model/geometry";
import { summerOverheating } from "../model/overheating";
import {
  findChimney,
  findDimension,
  findOpening,
  findStair,
  findVertex,
  findWall,
  removeOpening,
  removeVertex,
  removeWall,
  setWallLength,
  wallLength,
} from "../model/plan";
import { roomReadiness } from "../model/radiators";
import { editRoomInfo, findRoom, findRooms, netRoomArea, type Room } from "../model/rooms";
import {
  findFixture,
  findRun,
  fixtureType,
  RUN_KINDS,
  runKind,
  runLength,
} from "../model/services";
import type {
  Id,
  Item,
  ItemKind,
  Note,
  OpeningKind,
  Plan,
  RoomInfo,
  ServiceSystem,
  StairKind,
  Story,
} from "../model/types";
import { $, app, cached, doc, editor, panel, shell, showStatus } from "./context";
import { renderEnergyTopic } from "./energy";
import { renderCircuit, renderNotes, type NoteChange } from "./notes";
import {
  button,
  checkField,
  colorField,
  field,
  heading,
  layerEditor,
  numberField,
  paragraph,
  selectField,
  setColumn,
  setSection,
  stats,
  textField,
} from "./panel";
import { renderRenovationTopic } from "./renovation";
import { renderLivingArea, renderRoofPanel, renderStructurePanel } from "./structure";
import { renderTracing } from "./tracing";
import { renderInteriorPanel, renderUtilitiesPanel, SYSTEM_ICONS } from "./utilities";

// ----- Helpers -----

/** A change of one object of the active story: the function changes the object of the copy. */
type Edit<T> = (change: (item: T) => void) => void;

/**
 * The change of the object with the id in the active story. The function finds the object again
 * in the copy of the transaction, because a transaction copies the plan.
 */
function editOf<T>(find: (plan: Plan, id: Id) => T | undefined, id: Id): Edit<T> {
  return (change) =>
    doc.edit((plan) => {
      const item = find(plan, id);
      if (item) change(item);
    });
}

type NumberKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T];

/** A number field for one property of an object. */
function numberOf<T>(
  label: string,
  item: T,
  key: NumberKeys<T>,
  edit: Edit<T>,
  options?: Parameters<typeof numberField>[3],
): void {
  numberField(
    label,
    item[key] as number,
    (value) => edit((target) => ((target[key] as number) = value)),
    options,
  );
}

const deleteButton = (action = () => editor.deleteSelection(), text = t("Delete")) =>
  button(text, action, { kind: "danger", icon: "trash" });

/**
 * The end of the panel of an object: the circuit of an electric object, the notes, and the
 * buttons to duplicate and to delete it.
 */
function itemActions<T extends { note?: Note; circuit?: string }>(
  item: T,
  edit: Edit<T>,
  options: {
    system?: ServiceSystem;
    duplicate?: boolean;
    remove?: () => void;
    removeText?: string;
  } = {},
): void {
  if (options.system) {
    renderCircuit(options.system, item.circuit, (value) =>
      edit((target) => {
        if (value) target.circuit = value;
        else delete target.circuit;
      }),
    );
  }
  const notes: NoteChange = (change) => edit((target) => (target.note = change(target.note)));
  renderNotes(item.note, notes);
  if (options.duplicate) button(t("Duplicate"), () => editor.duplicate(), { icon: "copy" });
  deleteButton(options.remove, options.removeText);
}

// ----- The panel -----

/** The panel of each kind of object. The roof has its own panel in structure.ts. */
const PANELS: Partial<Record<ItemKind, (plan: Story, id: Id) => void>> = {
  dimension: renderDimension,
  room: renderRoom,
  fixture: renderFixture,
  run: renderRun,
  roof: (_plan, id) => renderRoofPanel(id, null),
  "roof-corner": (_plan, id) => {
    const [roofId, index] = id.split(":");
    renderRoofPanel(roofId, Number(index));
  },
  furniture: renderFurniture,
  stair: renderStair,
  chimney: renderChimney,
  wall: renderWall,
  opening: renderOpening,
  vertex: renderVertex,
};

export function renderPanel(): void {
  shell.updateMapCredit();
  // A field with focus gets its change event now: a new panel would else drop the typed value.
  const focused = document.activeElement;
  if (focused instanceof HTMLElement && panel.contains(focused)) focused.blur();
  panel.replaceChildren();
  setColumn(panel);
  setSection(panel);
  const plan = doc.plan;
  if (renderTracing()) return;
  // The card is only for a new plan. A tool other than "select" hides it, so that it does not
  // block the clicks of that tool.
  $<HTMLButtonElement>('[data-tool="rectify"]').disabled = !plan.background;
  $("#empty-state").hidden =
    plan.walls.length > 0 || plan.background !== null || editor.tool !== "select";

  if (editor.tool === "calibrate") return renderCalibration(plan);
  const items = editor.selection;
  if (items.length > 1) return renderMany(items);
  const selection = items[0];
  if (selection) return PANELS[selection.kind]?.(plan, selection.id);

  switch (app.topic) {
    case "overview":
      return;
    case "structure":
      return renderStructurePanel();
    case "utilities":
      return renderUtilitiesPanel();
    case "interior":
      return renderInteriorPanel();
    case "energy":
      return renderEnergyTopic();
    case "renovation":
      return renderRenovationTopic();
  }
}

/** The scale of the background: the two points of the user and the real length between them. */
function renderCalibration(plan: Story): void {
  heading(t("Set the scale"), "ruler");
  if (!plan.background) {
    paragraph(t("Load a background first."));
    button(t("Load background"), () => void shell.loadBackground(), { icon: "image" });
    return;
  }
  if (!app.calibration) {
    paragraph(t("Click two points on the background, for example the ends of a known wall."));
    return;
  }
  const measured = distance(app.calibration.a, app.calibration.b);
  paragraph(t("The line is {length} m long at the current scale.", { length: fmt(measured, 3) }));
  const { a } = app.calibration;
  const input = numberField(t("Real length"), measured, () => {}, { min: 0.001 });
  input.focus();
  input.select();
  button(
    t("Apply"),
    () => {
      const real = Number(input.value);
      if (!(real > 0) || measured === 0) return;
      const factor = real / measured;
      // The background grows about the first point, so that point stays in its place.
      doc.edit((plan) => {
        const background = plan.background!;
        background.scale *= factor;
        background.x = a.x + (background.x - a.x) * factor;
        background.y = a.y + (background.y - a.y) * factor;
      });
      editor.clearCalibration();
      shell.setTool("select");
      showStatus(t("The scale of the background is set. Now draw the walls on it."));
    },
    { kind: "primary", icon: "check" },
  );
}

/** More than one object: a count for each kind, and the actions for all of them. */
function renderMany(items: Item[]): void {
  heading(t("Selection"), "select");
  // The panel shows a count for each kind in the selection, and no count of 0.
  const kinds: [ItemKind, string, string][] = [
    ["wall", "wall", "walls"],
    ["opening", "opening", "openings"],
    ["dimension", "dimension", "dimensions"],
    ["vertex", "corner", "corners"],
    ["stair", "stair", "stairs"],
    ["chimney", "chimney", "chimneys"],
    ["room", "room", "rooms"],
    ["furniture", "furniture", "furniture"],
    ["fixture", "device", "devices"],
    ["run", "line", "lines"],
    ["roof", "roof", "roofs"],
    ["roof-corner", "roof corner", "roof corners"],
  ];
  stats(
    kinds
      .map(([kind, one, many]) => {
        const count = items.filter((i) => i.kind === kind).length;
        return [String(count), t(count === 1 ? one : many)] as [string, string];
      })
      .filter(([count]) => count !== "0"),
  );
  paragraph(t("Drag the selection or use the arrow keys to move it."), "note");
  button(t("Duplicate"), () => editor.duplicate(), { icon: "copy" });
  deleteButton();
}

function renderDimension(plan: Story, id: Id): void {
  const dimension = findDimension(plan, id);
  if (!dimension) return;
  heading(t("Dimension"), "dimension");
  stats([[`${fmt(distance(dimension.a, dimension.b), 3)} m`, t("length"), true]]);
  numberOf(t("Offset"), dimension, "offset", editOf(findDimension, id), { min: -1e6 });
  paragraph(t("Drag the dimension line to change its offset."), "note");
  deleteButton();
}

function renderRoom(plan: Story, id: Id): void {
  const room = findRoom(plan, id);
  if (!room) return;
  const key = room.key;
  const change = (edit: (info: RoomInfo) => void) =>
    doc.edit((plan) => {
      const current = findRoom(plan, key);
      if (current) editRoomInfo(plan, current, edit);
    });
  heading(t("Room"), "view2d");
  const height = room.info?.height ?? defaultWallHeight(plan);
  stats([
    [`${fmt(netRoomArea(plan, room))} m²`, t("area inside the walls")],
    [`${fmt(height)} m`, t("clear height")],
  ]);
  renderLivingArea(plan, room);
  textField(t("Name"), room.info?.name ?? "", (value) => change((info) => (info.name = value)), {
    placeholder: t("For example Kitchen"),
    allowEmpty: true,
  });
  numberField(t("Height"), height, (value) => change((info) => (info.height = value)), {
    min: 0.5,
  });
  paragraph(
    room.info?.height == null
      ? t(
          "The room has the clear height of the story: {height} m. Type a height for a lowered ceiling or a high room.",
          { height: fmt(defaultWallHeight(plan)) },
        )
      : t("The room has its own height. The 3D view shows its ceiling."),
    "note",
  );
  if (room.info?.height != null) {
    button(t("Height of the story"), () => change((info) => (info.height = null)), {
      icon: "layers",
    });
  }
  colorField(
    t("Wall color"),
    room.info?.wallColor ?? DEFAULT_COLORS.room,
    (value) => change((info) => (info.wallColor = value)),
    room.info?.wallColor
      ? { title: t("Default color"), action: () => change((info) => (info.wallColor = null)) }
      : undefined,
  );
  renderNotes(room.info?.note, (edit) => change((info) => (info.note = edit(info.note))));
  renderRoomHeating(plan, room, change);
}

/** The heating of a room: its heat loss, its heating, the heat pump, and the summer. */
function renderRoomHeating(
  story: Story,
  room: Room,
  change: (edit: (info: RoomInfo) => void) => void,
): void {
  heading(t("Heating"), "flame");
  if (!story.heated) {
    paragraph(
      t(
        "{story} is unheated, so its rooms lose no heat. Make it heated in the panel of the story or in Energy.",
        { story: t(story.name) },
      ),
      "note",
    );
    return;
  }
  const loss = roomHeatLoss(doc.building, story, room);
  checkField(t("Floor heating"), room.info?.floorHeating ?? false, (value) =>
    change((info) => (info.floorHeating = value)),
  );
  numberField(
    t("Temperature"),
    loss.temperature,
    (value) => change((info) => (info.temperature = value)),
    { min: -30, step: 0.5, unit: "°C" },
  );
  const supply = loss.heating + (loss.floorHeating?.power ?? 0);
  stats([
    [`${Math.round(loss.total)} W`, t("heat loss")],
    [`${Math.round(loss.total / Math.max(loss.area, 0.01))} W/m²`, t("per area")],
    [`${Math.round(supply)} W`, t("heating power at 75/65 °C"), true],
  ]);
  // The results of this room in the lists of the building.
  const own = <T extends { storyId: Id; key: string }>(list: T[] | null) =>
    list?.find((r) => r.storyId === story.id && r.key === room.key);
  const ready = own(cached("readiness", () => roomReadiness(doc.building)));
  if (ready && ready.readiness !== "none") {
    const words = {
      good: "good for a heat pump",
      fair: "fair for a heat pump",
      poor: "too small for a heat pump",
      none: "",
    };
    paragraph(
      ready.flow === null
        ? t("The heating of the room does not give its heat loss, even at a flow of 75 °C.")
        : t("The heating of the room needs a flow of {flow} °C: {verdict}.", {
            flow: ready.flow,
            verdict: t(words[ready.readiness]),
          }),
      ready.readiness === "poor" ? "warning" : "note",
    );
  }
  const summer = own(
    cached("summer:false", () => summerOverheating(doc.building, { blinds: false })),
  );
  if (summer) {
    paragraph(
      t(
        summer.verdict === "risk"
          ? "Summer: {hours} hours over 27 °C, at most {max} °C: too hot. Use external blinds, or smaller windows to the south and the west."
          : summer.verdict === "warning"
            ? "Summer: {hours} hours over 27 °C, at most {max} °C: warm."
            : "Summer: {hours} hours over 27 °C, at most {max} °C.",
        { hours: summer.hoursOver27, max: fmt(summer.max, 1) },
      ),
      summer.verdict === "risk" ? "warning" : "note",
    );
  }
  const parts: [string, number][] = [
    ["walls", loss.walls],
    ["windows", loss.windows],
    ["doors", loss.doors],
    ["roof", loss.roof],
    ["floor", loss.floor],
    ["ceiling", loss.ceiling],
    ["thermal bridges", loss.bridges],
    ["ventilation", loss.ventilation],
  ];
  paragraph(
    parts
      .filter(([, value]) => value > 0.5)
      .map(([name, value]) => `${t(name)} ${Math.round(value)} W`)
      .join(" · "),
    "note",
  );
  if (loss.floorHeating) {
    paragraph(
      t("Floor heating: about {power} W and {pipe} m of pipe.", {
        power: Math.round(loss.floorHeating.power),
        pipe: Math.round(loss.floorHeating.pipe),
      }),
      "note",
    );
  }
  if (supply < loss.total * 0.95) {
    paragraph(
      t("The heating power is {power} W too low. Add a radiator, or use floor heating.", {
        power: Math.round(loss.total - supply),
      }),
      "warning",
    );
  }
}

function renderFixture(plan: Story, id: Id): void {
  const fixture = findFixture(plan, id);
  if (!fixture) return;
  const edit = editOf(findFixture, id);
  heading(t(fixtureType(fixture.type).name), SYSTEM_ICONS[fixture.system]);
  textField(t("Label"), fixture.label, (value) => edit((f) => (f.label = value)), {
    placeholder: t("For example K1"),
    allowEmpty: true,
  });
  numberOf(t("Height"), fixture, "elevation", edit, { min: -1 });
  if (fixture.system === "heating" || fixture.system === "water") {
    numberOf(t("Width"), fixture, "width", edit, { min: 0.05 });
  }
  if (fixture.system === "heating") {
    numberField(t("Power"), fixture.power ?? 0, (value) => edit((f) => (f.power = value)), {
      min: 0,
      step: 50,
      unit: "W",
    });
  }
  numberOf(t("Rotation"), fixture, "rotation", edit, { min: -360, step: 1, unit: "°" });
  paragraph(t("The height is the height of the center above the floor."), "note");
  itemActions(fixture, edit, { system: fixture.system, duplicate: true });
}

function renderRun(plan: Story, id: Id): void {
  const run = findRun(plan, id);
  if (!run) return;
  const edit = editOf(findRun, id);
  heading(t(runKind(run.kind).name), SYSTEM_ICONS[run.system]);
  stats([
    [`${fmt(runLength(run))} m`, t("length on the plan")],
    [String(run.points.length), t("points")],
  ]);
  selectField(
    t("Kind"),
    run.kind,
    RUN_KINDS.filter((k) => k.system === run.system).map((k) => [k.kind, t(k.name)]),
    (kind) => edit((r) => (r.kind = kind)),
  );
  numberOf(t("Height"), run, "elevation", edit, { min: -1 });
  itemActions(run, edit, { system: run.system });
}

function renderFurniture(plan: Story, id: Id): void {
  const piece = findFurniture(plan, id);
  if (!piece) return;
  const edit = editOf(findFurniture, id);
  const source = piece.source;
  const model =
    source.kind === "model" ? doc.building.models.find((m) => m.id === source.modelId) : undefined;
  heading(t("Furniture"), "sofa");
  textField(t("Name"), piece.name, (value) => edit((p) => (p.name = value)));
  numberOf(t("Width"), piece, "width", edit, { min: 0.05 });
  numberOf(t("Depth"), piece, "depth", edit, { min: 0.05 });
  numberOf(t("Height"), piece, "height", edit, { min: 0.05 });
  numberOf(t("Above floor"), piece, "elevation", edit, { min: -10 });
  numberOf(t("Rotation"), piece, "rotation", edit, { min: -360, step: 1, unit: "°" });
  if (model) {
    const origin = { import: t("Imported model"), kenney: "Kenney", polyhaven: "Poly Haven" }[
      model.origin
    ];
    paragraph([origin, model.license, model.credit].filter(Boolean).join(" · "), "note");
  }
  button(t("Turn 90°"), () => editor.rotate(90), { icon: "rotate" });
  button(
    t("Usual size"),
    () =>
      edit((p) => {
        if (p.source.kind === "generic") {
          const { width, depth, height } = genericType(p.source.type);
          Object.assign(p, { width, depth, height });
        } else if (model) {
          Object.assign(p, { width: model.size.x, depth: model.size.y, height: model.size.z });
        }
      }),
    { icon: "fit" },
  );
  itemActions(piece, edit, { duplicate: true });
}

function renderStair(plan: Story, id: Id): void {
  const stair = findStair(plan, id);
  if (!stair) return;
  const edit = editOf(findStair, id);
  const shape = stairShape(stair, stairRise(doc.building, plan));
  heading(t("Stair"), "stair");
  stats([
    [String(shape.count), t("steps")],
    [`${fmt(shape.stepHeight * 100, 1)} cm`, t("step height")],
    [`${fmt(shape.stepDepth * 100, 1)} cm`, t("step depth"), true],
  ]);
  numberOf(t("Width"), stair, "width", edit, { min: 0.4 });
  numberField(
    t("Run"),
    distance(stair.a, stair.b),
    (value) =>
      edit((s) => {
        const length = distance(s.a, s.b);
        if (length === 0) return;
        s.b = {
          x: s.a.x + ((s.b.x - s.a.x) * value) / length,
          y: s.a.y + ((s.b.y - s.a.y) * value) / length,
        };
      }),
    { min: 0.5 },
  );
  selectField<StairKind>(
    t("Shape"),
    stair.kind,
    [
      ["straight", t("Straight")],
      ["l", t("L (quarter turn)")],
      ["u", t("U (half turn)")],
    ],
    (kind) =>
      edit((s) => {
        // A U stair comes back along the first flight, so its second flight has the same run.
        if (kind === "u" && s.kind !== "u") s.run2 = distance(s.a, s.b);
        if (kind === "l" && s.kind !== "l") s.run2 = Math.max(1, distance(s.a, s.b) / 2);
        s.kind = kind;
      }),
  );
  if (stair.kind !== "straight") {
    selectField<"1" | "-1">(
      t("Turn"),
      stair.turn === 1 ? "1" : "-1",
      [
        ["1", t("To the right")],
        ["-1", t("To the left")],
      ],
      (turn) => edit((s) => (s.turn = turn === "1" ? 1 : -1)),
    );
    numberOf(t("Second run"), stair, "run2", edit, { min: 0.3 });
  }
  paragraph(
    t(
      "The stair goes up to the floor of the next story. The run is the first flight. The landing counts as one step.",
    ),
    "note",
  );
  button(t("Turn around"), () => edit((s) => ([s.a, s.b] = [s.b, s.a])), { icon: "flipHinge" });
  itemActions(stair, edit);
}

function renderChimney(plan: Story, id: Id): void {
  const chimney = findChimney(plan, id);
  if (!chimney) return;
  const edit = editOf(findChimney, id);
  const extent = chimneyExtent(doc.building, plan, chimney);
  heading(t("Chimney"), "chimney");
  numberOf(t("Width"), chimney, "width", edit, { min: 0.1 });
  numberOf(t("Depth"), chimney, "depth", edit, { min: 0.1 });
  numberField(t("Top"), extent.top, (value) => edit((c) => (c.top = value)), { min: -1e6 });
  paragraph(
    chimney.top === null
      ? t("The top is automatic: 0.8 m above the roof. Type a height to fix it.")
      : t("The top is fixed. The height is above the ground."),
    "note",
  );
  if (chimney.top !== null) {
    button(t("Automatic top"), () => edit((c) => (c.top = null)), { icon: "check" });
  }
  itemActions(chimney, edit);
}

function renderWall(plan: Story, id: Id): void {
  const wall = findWall(plan, id);
  if (!wall) return;
  const edit = editOf(findWall, id);
  heading(t("Wall"), "wall");
  numberField(t("Length"), wallLength(plan, wall), (value) =>
    doc.edit((plan) => setWallLength(plan, id, value)),
  );
  numberOf(t("Thickness"), wall, "thickness", edit);
  numberOf(t("Height"), wall, "height", edit);
  // The color of each side: its own color, or the color of the room or the facade there.
  const rooms = findRooms(plan);
  for (const side of [1, -1] as const) {
    const key = side === 1 ? "right" : "left";
    const room = roomOnSide(plan, wall, side, rooms);
    colorField(
      room
        ? room.info?.name
          ? t("Side to {name}", { name: room.info.name })
          : t("Side to the room")
        : t("Outside"),
      wallSideColor(doc.building, plan, wall, side, rooms),
      (value) => edit((w) => (w.colors[key] = value)),
      wall.colors[key]
        ? {
            title: room ? t("Color of the room") : t("Color of the facade"),
            action: () => edit((w) => (w.colors[key] = null)),
          }
        : undefined,
    );
  }
  const outer = isOuterWall(plan, wall);
  heading(t("Insulation"), "layers");
  stats([
    [outer ? t("Outer") : t("Inner"), t("wall")],
    [outer ? fmt(uValue(wallLayers(doc.building, wall), "wall")) : "–", t("U-value W/(m²K)")],
  ]);
  if (!outer) {
    paragraph(t("An inner wall between two rooms does not lose heat."), "note");
  } else if (wall.layers === null) {
    paragraph(t("The wall has the layers of the outer walls of the building."), "note");
    button(
      t("Own layers"),
      () => edit((w) => (w.layers = structuredClone(doc.building.envelope.wall))),
      { icon: "layers" },
    );
  } else {
    layerEditor(wall.layers, "wall", (change) => edit((w) => change(w.layers!)));
    button(t("Layers of the building"), () => edit((w) => (w.layers = null)), { icon: "layers" });
  }
  itemActions(wall, edit, {
    remove: () => doc.edit((plan) => removeWall(plan, id)),
    removeText: t("Delete wall"),
  });
}

function renderOpening(plan: Story, id: Id): void {
  const opening = findOpening(plan, id);
  if (!opening) return;
  const edit = editOf(findOpening, id);
  const name = (kind: OpeningKind) => (kind === "door" ? t("Door") : t("Window"));
  heading(name(opening.kind), opening.kind);
  const select = document.createElement("select");
  for (const kind of ["door", "window"] as OpeningKind[]) {
    select.append(new Option(name(kind), kind, false, kind === opening.kind));
  }
  select.addEventListener("change", () => edit((o) => (o.kind = select.value as OpeningKind)));
  field(t("Kind"), select);
  numberOf(t("Width"), opening, "width", edit, { min: 0.1 });
  numberOf(t("Height"), opening, "height", edit, { min: 0.1 });
  numberOf(t("Sill"), opening, "sill", edit);
  numberOf(t("Position"), opening, "offset", edit);
  if (opening.kind === "door") {
    button(t("Flip hinge"), () => edit((o) => (o.hinge = o.hinge === "a" ? "b" : "a")), {
      icon: "flipHinge",
    });
    button(t("Flip swing"), () => edit((o) => (o.swing = o.swing === 1 ? -1 : 1)), {
      icon: "flipSwing",
    });
  }
  itemActions(opening, edit, { remove: () => doc.edit((plan) => removeOpening(plan, id)) });
}

function renderVertex(plan: Story, id: Id): void {
  const vertex = findVertex(plan, id);
  if (!vertex) return;
  const edit = editOf(findVertex, id);
  heading(t("Corner"), "select");
  numberOf("x", vertex, "x", edit, { min: -1e6 });
  numberOf("y", vertex, "y", edit, { min: -1e6 });
  deleteButton(() => doc.edit((plan) => removeVertex(plan, id)), t("Delete corner"));
}
