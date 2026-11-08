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
  getVertex,
  removeOpening,
  removeVertex,
  removeWall,
  setWallLength,
  wallLength,
} from "../model/plan";
import { roomReadiness } from "../model/radiators";
import { editRoomInfo, findRoom, findRooms, netRoomArea } from "../model/rooms";
import {
  findFixture,
  findRun,
  fixtureType,
  RUN_KINDS,
  runKind,
  runLength,
} from "../model/services";
import type { ItemKind, Opening, OpeningKind, RoomInfo, StairKind } from "../model/types";
import { $, app, cached, doc, editor, panel, shell, showStatus } from "./context";
import { renderEnergyTopic } from "./energy";
import { renderCircuit, renderNotes } from "./notes";
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

  if (editor.tool === "calibrate") {
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
    return;
  }

  const items = editor.selection;
  if (items.length > 1) {
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
    button(t("Delete"), () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }
  const selection = items[0];
  if (selection?.kind === "dimension") {
    const dimension = findDimension(plan, selection.id);
    if (!dimension) return;
    heading(t("Dimension"), "dimension");
    stats([[`${fmt(distance(dimension.a, dimension.b), 3)} m`, t("length"), true]]);
    numberField(
      t("Offset"),
      dimension.offset,
      (value) => doc.edit((plan) => (findDimension(plan, dimension.id)!.offset = value)),
      { min: -1e6 },
    );
    paragraph(t("Drag the dimension line to change its offset."), "note");
    button(t("Delete"), () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }
  if (selection?.kind === "room") {
    const room = findRoom(plan, selection.id);
    if (!room) return;
    const key = room.key;
    const story = plan;
    const change = (edit: (info: RoomInfo) => void) =>
      doc.edit((plan) => {
        const current = findRoom(plan, key);
        if (current) editRoomInfo(plan, current, edit);
      });
    heading(t("Room"), "view2d");
    const height = room.info?.height ?? defaultWallHeight(story);
    stats([
      [`${fmt(netRoomArea(story, room))} m²`, t("area inside the walls")],
      [`${fmt(height)} m`, t("clear height")],
    ]);
    renderLivingArea(story, room);
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
            { height: fmt(defaultWallHeight(story)) },
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

    const loss = roomHeatLoss(doc.building, story, room);
    renderNotes(room.info?.note, (edit) => change((info) => (info.note = edit(info.note))));
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
    const ready = cached("readiness", () => roomReadiness(doc.building)).find(
      (r) => r.storyId === story.id && r.key === key,
    );
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
    const summer = cached("summer:false", () =>
      summerOverheating(doc.building, { blinds: false }),
    )?.find((r) => r.storyId === story.id && r.key === key);
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
    return;
  }

  if (selection?.kind === "fixture") {
    const fixture = findFixture(plan, selection.id);
    if (!fixture) return;
    const id = fixture.id;
    const type = fixtureType(fixture.type);
    const set = (key: "elevation" | "width" | "rotation" | "power") => (value: number) =>
      doc.edit((plan) => (findFixture(plan, id)![key] = value));
    heading(t(type.name), SYSTEM_ICONS[fixture.system]);
    textField(
      t("Label"),
      fixture.label,
      (value) => doc.edit((plan) => (findFixture(plan, id)!.label = value)),
      { placeholder: t("For example K1"), allowEmpty: true },
    );
    numberField(t("Height"), fixture.elevation, set("elevation"), { min: -1 });
    if (fixture.system === "heating" || fixture.system === "water") {
      numberField(t("Width"), fixture.width, set("width"), { min: 0.05 });
    }
    if (fixture.system === "heating") {
      numberField(t("Power"), fixture.power ?? 0, set("power"), { min: 0, step: 50, unit: "W" });
    }
    numberField(t("Rotation"), fixture.rotation, set("rotation"), {
      min: -360,
      step: 1,
      unit: "°",
    });
    paragraph(t("The height is the height of the center above the floor."), "note");
    renderCircuit(fixture.system, fixture.circuit, (value) =>
      doc.edit((plan) => {
        const f = findFixture(plan, id)!;
        if (value) f.circuit = value;
        else delete f.circuit;
      }),
    );
    renderNotes(fixture.note, (edit) =>
      doc.edit((plan) => {
        const f = findFixture(plan, id)!;
        f.note = edit(f.note);
      }),
    );
    button(t("Duplicate"), () => editor.duplicate(), { icon: "copy" });
    button(t("Delete"), () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }

  if (selection?.kind === "run") {
    const run = findRun(plan, selection.id);
    if (!run) return;
    const id = run.id;
    heading(t(runKind(run.kind).name), SYSTEM_ICONS[run.system]);
    stats([
      [`${fmt(runLength(run))} m`, t("length on the plan")],
      [String(run.points.length), t("points")],
    ]);
    selectField(
      t("Kind"),
      run.kind,
      RUN_KINDS.filter((k) => k.system === run.system).map((k) => [k.kind, t(k.name)]),
      (kind) => doc.edit((plan) => (findRun(plan, id)!.kind = kind)),
    );
    numberField(
      t("Height"),
      run.elevation,
      (value) => doc.edit((plan) => (findRun(plan, id)!.elevation = value)),
      { min: -1 },
    );
    renderCircuit(run.system, run.circuit, (value) =>
      doc.edit((plan) => {
        const r = findRun(plan, id)!;
        if (value) r.circuit = value;
        else delete r.circuit;
      }),
    );
    renderNotes(run.note, (edit) =>
      doc.edit((plan) => {
        const r = findRun(plan, id)!;
        r.note = edit(r.note);
      }),
    );
    button(t("Delete"), () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }

  if (selection?.kind === "roof") {
    renderRoofPanel(selection.id, null);
    return;
  }
  if (selection?.kind === "roof-corner") {
    const [roofId, index] = selection.id.split(":");
    renderRoofPanel(roofId, Number(index));
    return;
  }

  if (selection?.kind === "furniture") {
    const piece = findFurniture(plan, selection.id);
    if (!piece) return;
    const id = piece.id;
    const source = piece.source;
    const model =
      source.kind === "model"
        ? doc.building.models.find((m) => m.id === source.modelId)
        : undefined;
    const set = (key: "width" | "depth" | "height" | "elevation" | "rotation") => (value: number) =>
      doc.edit((plan) => (findFurniture(plan, id)![key] = value));
    heading(t("Furniture"), "sofa");
    textField(t("Name"), piece.name, (value) =>
      doc.edit((plan) => (findFurniture(plan, id)!.name = value)),
    );
    numberField(t("Width"), piece.width, set("width"), { min: 0.05 });
    numberField(t("Depth"), piece.depth, set("depth"), { min: 0.05 });
    numberField(t("Height"), piece.height, set("height"), { min: 0.05 });
    numberField(t("Above floor"), piece.elevation, set("elevation"), { min: -10 });
    numberField(t("Rotation"), piece.rotation, set("rotation"), { min: -360, step: 1, unit: "°" });
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
        doc.edit((plan) => {
          const p = findFurniture(plan, id)!;
          if (p.source.kind === "generic") {
            const generic = genericType(p.source.type);
            Object.assign(p, {
              width: generic.width,
              depth: generic.depth,
              height: generic.height,
            });
          } else if (model) {
            Object.assign(p, { width: model.size.x, depth: model.size.y, height: model.size.z });
          }
        }),
      { icon: "fit" },
    );
    renderNotes(piece.note, (edit) =>
      doc.edit((plan) => {
        const f = findFurniture(plan, id)!;
        f.note = edit(f.note);
      }),
    );
    button(t("Duplicate"), () => editor.duplicate(), { icon: "copy" });
    button(t("Delete"), () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }

  if (selection?.kind === "stair") {
    const stair = findStair(plan, selection.id);
    if (!stair) return;
    const shape = stairShape(stair, stairRise(doc.building, plan));
    heading(t("Stair"), "stair");
    stats([
      [String(shape.count), t("steps")],
      [`${fmt(shape.stepHeight * 100, 1)} cm`, t("step height")],
      [`${fmt(shape.stepDepth * 100, 1)} cm`, t("step depth"), true],
    ]);
    numberField(
      t("Width"),
      stair.width,
      (value) => doc.edit((plan) => (findStair(plan, stair.id)!.width = value)),
      { min: 0.4 },
    );
    numberField(
      t("Run"),
      distance(stair.a, stair.b),
      (value) =>
        doc.edit((plan) => {
          const s = findStair(plan, stair.id)!;
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
        doc.edit((plan) => {
          const s = findStair(plan, stair.id)!;
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
        (turn) => doc.edit((plan) => (findStair(plan, stair.id)!.turn = turn === "1" ? 1 : -1)),
      );
      numberField(
        t("Second run"),
        stair.run2,
        (value) => doc.edit((plan) => (findStair(plan, stair.id)!.run2 = value)),
        { min: 0.3 },
      );
    }
    paragraph(
      t(
        "The stair goes up to the floor of the next story. The run is the first flight. The landing counts as one step.",
      ),
      "note",
    );
    button(
      t("Turn around"),
      () =>
        doc.edit((plan) => {
          const s = findStair(plan, stair.id)!;
          [s.a, s.b] = [s.b, s.a];
        }),
      { icon: "flipHinge" },
    );
    renderNotes(stair.note, (edit) =>
      doc.edit((plan) => {
        const s = findStair(plan, stair.id)!;
        s.note = edit(s.note);
      }),
    );
    button(t("Delete"), () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }

  if (selection?.kind === "chimney") {
    const chimney = findChimney(plan, selection.id);
    if (!chimney) return;
    const extent = chimneyExtent(doc.building, plan, chimney);
    heading(t("Chimney"), "chimney");
    const set = (key: "width" | "depth") => (value: number) =>
      doc.edit((plan) => (findChimney(plan, chimney.id)![key] = value));
    numberField(t("Width"), chimney.width, set("width"), { min: 0.1 });
    numberField(t("Depth"), chimney.depth, set("depth"), { min: 0.1 });
    numberField(
      t("Top"),
      extent.top,
      (value) => doc.edit((plan) => (findChimney(plan, chimney.id)!.top = value)),
      { min: -1e6 },
    );
    paragraph(
      chimney.top === null
        ? t("The top is automatic: 0.8 m above the roof. Type a height to fix it.")
        : t("The top is fixed. The height is above the ground."),
      "note",
    );
    if (chimney.top !== null) {
      button(
        t("Automatic top"),
        () => doc.edit((plan) => (findChimney(plan, chimney.id)!.top = null)),
        { icon: "check" },
      );
    }
    renderNotes(chimney.note, (edit) =>
      doc.edit((plan) => {
        const c = findChimney(plan, chimney.id)!;
        c.note = edit(c.note);
      }),
    );
    button(t("Delete"), () => editor.deleteSelection(), { kind: "danger", icon: "trash" });
    return;
  }

  if (selection?.kind === "wall") {
    const wall = findWall(plan, selection.id);
    if (!wall) return;
    heading(t("Wall"), "wall");
    numberField(t("Length"), wallLength(plan, wall), (value) =>
      doc.edit((plan) => setWallLength(plan, wall.id, value)),
    );
    numberField(t("Thickness"), wall.thickness, (value) =>
      doc.edit((plan) => (findWall(plan, wall.id)!.thickness = value)),
    );
    numberField(t("Height"), wall.height, (value) =>
      doc.edit((plan) => (findWall(plan, wall.id)!.height = value)),
    );
    // The color of each side: its own color, or the color of the room or the facade there.
    const rooms = findRooms(plan);
    for (const side of [1, -1] as const) {
      const key = side === 1 ? "right" : "left";
      const room = roomOnSide(plan, wall, side, rooms);
      const own = wall.colors[key];
      colorField(
        room
          ? room.info?.name
            ? t("Side to {name}", { name: room.info.name })
            : t("Side to the room")
          : t("Outside"),
        wallSideColor(doc.building, plan, wall, side, rooms),
        (value) => doc.edit((plan) => (findWall(plan, wall.id)!.colors[key] = value)),
        own
          ? {
              title: room ? t("Color of the room") : t("Color of the facade"),
              action: () => doc.edit((plan) => (findWall(plan, wall.id)!.colors[key] = null)),
            }
          : undefined,
      );
    }
    const outer = isOuterWall(plan, wall);
    const layers = wallLayers(doc.building, wall);
    heading(t("Insulation"), "layers");
    stats([
      [outer ? t("Outer") : t("Inner"), t("wall")],
      [outer ? fmt(uValue(layers, "wall")) : "–", t("U-value W/(m²K)")],
    ]);
    if (!outer) {
      paragraph(t("An inner wall between two rooms does not lose heat."), "note");
    } else if (wall.layers === null) {
      paragraph(t("The wall has the layers of the outer walls of the building."), "note");
      button(
        t("Own layers"),
        () =>
          doc.edit(
            (plan) =>
              (findWall(plan, wall.id)!.layers = structuredClone(doc.building.envelope.wall)),
          ),
        { icon: "layers" },
      );
    } else {
      layerEditor(wall.layers, "wall", (change) =>
        doc.edit((plan) => change(findWall(plan, wall.id)!.layers!)),
      );
      button(
        t("Layers of the building"),
        () => doc.edit((plan) => (findWall(plan, wall.id)!.layers = null)),
        { icon: "layers" },
      );
    }
    renderNotes(wall.note, (edit) =>
      doc.edit((plan) => {
        const w = findWall(plan, wall.id)!;
        w.note = edit(w.note);
      }),
    );
    button(t("Delete wall"), () => doc.edit((plan) => removeWall(plan, wall.id)), {
      kind: "danger",
      icon: "trash",
    });
    return;
  }

  if (selection?.kind === "opening") {
    const opening = findOpening(plan, selection.id);
    if (!opening) return;
    heading(opening.kind === "door" ? t("Door") : t("Window"), opening.kind);
    const select = document.createElement("select");
    for (const kind of ["door", "window"] as OpeningKind[]) {
      select.append(
        new Option(kind === "door" ? t("Door") : t("Window"), kind, false, kind === opening.kind),
      );
    }
    select.addEventListener("change", () =>
      doc.edit((plan) => (findOpening(plan, opening.id)!.kind = select.value as OpeningKind)),
    );
    field(t("Kind"), select);
    const set = (key: "width" | "height" | "sill" | "offset") => (value: number) =>
      doc.edit((plan) => (findOpening(plan, opening.id)![key] = value));
    numberField(t("Width"), opening.width, set("width"), { min: 0.1 });
    numberField(t("Height"), opening.height, set("height"), { min: 0.1 });
    numberField(t("Sill"), opening.sill, set("sill"));
    numberField(t("Position"), opening.offset, set("offset"));
    if (opening.kind === "door") {
      const flip = (change: (o: Opening) => void) => () =>
        doc.edit((plan) => change(findOpening(plan, opening.id)!));
      button(
        t("Flip hinge"),
        flip((o) => (o.hinge = o.hinge === "a" ? "b" : "a")),
        {
          icon: "flipHinge",
        },
      );
      button(
        t("Flip swing"),
        flip((o) => (o.swing = o.swing === 1 ? -1 : 1)),
        {
          icon: "flipSwing",
        },
      );
    }
    renderNotes(opening.note, (edit) =>
      doc.edit((plan) => {
        const o = findOpening(plan, opening.id)!;
        o.note = edit(o.note);
      }),
    );
    button(t("Delete"), () => doc.edit((plan) => removeOpening(plan, opening.id)), {
      kind: "danger",
      icon: "trash",
    });
    return;
  }

  if (selection?.kind === "vertex") {
    const vertex = findVertex(plan, selection.id);
    if (!vertex) return;
    heading(t("Corner"), "select");
    numberField(
      "x",
      vertex.x,
      (value) => doc.edit((plan) => (getVertex(plan, vertex.id).x = value)),
      {
        min: -1e6,
      },
    );
    numberField(
      "y",
      vertex.y,
      (value) => doc.edit((plan) => (getVertex(plan, vertex.id).y = value)),
      {
        min: -1e6,
      },
    );
    button(t("Delete corner"), () => doc.edit((plan) => removeVertex(plan, vertex.id)), {
      kind: "danger",
      icon: "trash",
    });
    return;
  }

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
