import { currentLanguage, t } from "../i18n";
import { type IconName } from "../icons";
import { defaultWallHeight } from "../model/building";
import { isOuterWall, roomHeatLoss, uValue, wallLayers } from "../model/energy";
import { fmt } from "../model/format";
import { wallEnds } from "../model/plan";
import { defaultRack, faceInfo, FLAT_TILT, newPvField, pvLayout, pvSummary } from "../model/pv";
import { buildingQuantities, circuitQuantities } from "../model/quantities";
import { findRooms } from "../model/rooms";
import {
  FIXTURE_TYPES,
  fixtureSymbol,
  fixtureType,
  newFixture,
  RUN_KINDS,
  runKind,
  SERVICE_SYSTEMS,
  systemColor,
} from "../model/services";
import type { PvArray, ServiceSystem } from "../model/types";
import { renderConflicts } from "./conflicts";
import { $, cached, doc, editor, HINTS, shell, showStatus } from "./context";
import { pvSourceNote, renderHeatingSystem } from "./energy";
import {
  button,
  compassName,
  group,
  heading,
  kwh,
  numberField,
  paragraph,
  placeMenu,
  selectField,
  stats,
  table,
} from "./panel";
import { renderPanel } from "./selection";

export const SYSTEM_ICONS: Record<ServiceSystem, IconName> = {
  water: "drop",
  heating: "flame",
  electric: "bolt",
  comms: "antenna",
};

const SYSTEM_HINTS: Record<ServiceSystem, string> = {
  water:
    "The pipes of cold water, hot water, and waste water, with the outlets, the drains, and the hot water tank.",
  heating: "The pipes of the heating, the radiators, the manifolds, and the heat source.",
  electric: "The sockets, the switches, the lights, the cables, and the photovoltaic system.",
  comms: "The network, phone, TV, and SAT sockets and cables.",
};

/** The systems of the building services: their quantities, the heating, and the PV. */
export function renderUtilitiesPanel(): void {
  const { runs, fixtures } = buildingQuantities(doc.building);
  for (const { system, name } of SERVICE_SYSTEMS) {
    heading(t(name), SYSTEM_ICONS[system]);
    const own = {
      runs: runs.filter((q) => runKind(q.kind).system === system),
      fixtures: fixtures.filter((q) => fixtureType(q.type).system === system),
    };
    if (own.runs.length === 0 && own.fixtures.length === 0) {
      paragraph(t(SYSTEM_HINTS[system]), "note");
    } else {
      group(t("Quantities of the building"), false, () => {
        for (const run of own.runs) paragraph(`${t(run.name)}: ${fmt(run.length, 1)} m`);
        for (const fixture of own.fixtures) paragraph(`${t(fixture.name)}: ${fixture.count}`);
        if (own.runs.length > 0) {
          paragraph(t("The lengths include the drops to the devices."), "note");
        }
      });
    }
    // English writes the system in lower case after "Add". German keeps the capital of a noun.
    const word = currentLanguage() === "de" ? t(name) : name.toLowerCase();
    const add = button(t("Add {system}", { system: word }), () => openServicesMenu(system, add), {
      icon: "plus",
    });
    add.dataset.menu = "";
    if (system === "heating") renderHeatingSystem();
    if (system === "electric") {
      renderCircuits();
      renderPvPanel();
    }
  }
}

/** The distribution board: the circuits with their devices and the length of their cables. */
function renderCircuits(): void {
  const circuits = circuitQuantities(doc.building);
  if (circuits.length === 0) return;
  const named = circuits.filter((c) => c.circuit !== "").length;
  group(t("Distribution board · {count} circuits", { count: named }), false, () => {
    if (named === 0) {
      paragraph(
        t(
          "Click an electric device or a cable, and type its circuit, for example F3. The board then lists the devices and the cables of each circuit.",
        ),
        "note",
      );
    }
    table(
      [t("Circuit"), t("Devices"), t("Cable")],
      circuits.map((c) => [
        c.circuit || t("without a circuit"),
        c.fixtures.map((f) => `${f.count} × ${t(f.name)}`).join(", ") || "–",
        `${fmt(c.cable, 1)} m`,
      ]),
      ["left", "left", "right"],
    );
  });
}

/** The furniture and the rooms of the active story. */
export function renderInteriorPanel(): void {
  const plan = doc.plan;
  heading(t("Furniture"), "sofa");
  const total = doc.building.stories.reduce((sum, story) => sum + story.furniture.length, 0);
  stats([
    [String(plan.furniture.length), t("pieces on {story}", { story: t(plan.name) })],
    [String(total), t("pieces in the building")],
  ]);
  button(t("Open the furniture catalog"), () => shell.catalog.open(), {
    kind: "primary",
    icon: "sofa",
  });
  paragraph(
    t(
      "Click a piece on the plan to move it, to turn it, or to change its size. R turns a selected piece.",
    ),
    "note",
  );
  renderConflicts();
  const rooms = findRooms(plan);
  if (rooms.length === 0) return;
  heading(t("Rooms"), "view2d");
  for (const room of rooms) {
    button(room.info?.name || t("Room"), () => editor.select({ kind: "room", id: room.key }), {
      icon: "view2d",
      detail: `${fmt(room.area)} m²`,
    });
  }
  paragraph(t("Click a room to change its name, its height, and the color of its walls."), "note");
}

/** The PV fields on the faces of the roof. */
function renderPvPanel(): void {
  const building = doc.building;
  const faces = faceInfo(building);
  if (faces.length === 0) return;
  heading(t("Photovoltaic"), "sparkle");
  const total = cached("pv", () => pvSummary(doc.building));
  stats([
    [`${fmt(total.peak, 1)} kWp`, t("{count} panels", { count: total.count })],
    [kwh(total.yield), t("per year")],
  ]);
  pvSourceNote();
  building.pv.forEach((array, i) => {
    const layout = pvLayout(building, array);
    const face = faces.find((f) => f.roofId === array.roofId && f.index === array.face);
    group(
      [
        t("Field {number}", { number: i + 1 }),
        `${array.rack && face && face.tilt < FLAT_TILT ? `${t("rack")} ` : ""}${layout ? `${compassName(layout.azimuth)} ${Math.round(layout.tilt)}°` : t("no face")}`,
        t("{count} panels", { count: layout?.count ?? 0 }),
      ].join(" · "),
      false,
      () => {
        const set = (edit: (a: PvArray) => void) =>
          doc.editBuilding((b) => edit(b.pv.find((a) => a.id === array.id)!));
        if (layout) {
          paragraph(
            [
              t("{peak} kWp, about {yield} per year.", {
                peak: fmt(layout.peak),
                yield: kwh(layout.yield),
              }),
              layout.shade.factor < 0.995
                ? t(
                    "The roofs, the dormers, and the chimneys take {share} % of it with their shade (without shade: {yield}).",
                    {
                      share: Math.round((1 - layout.shade.factor) * 100),
                      yield: kwh(layout.unshadedYield),
                    },
                  )
                : t("No shade from the roofs, the dormers, or the chimneys."),
              layout.shade.source === "estimate"
                ? t("The shade is an estimate without the climate.")
                : "",
            ]
              .filter(Boolean)
              .join(" "),
            "note",
          );
        }
        selectField(
          t("Face"),
          `${array.roofId}:${array.face}`,
          faces.map((f) => [
            `${f.roofId}:${f.index}`,
            `${f.roofName} · ${compassName(f.azimuth)} · ${Math.round(f.tilt)}° · ${Math.round(f.area)} m²`,
          ]),
          (value) =>
            set((a) => {
              const [roofId, index] = value.split(":");
              a.roofId = roofId;
              a.face = Number(index);
            }),
        );
        if (face && face.tilt < FLAT_TILT) {
          const rack = array.rack;
          selectField(
            t("Mounting"),
            !rack ? "flat" : rack.eastWest ? "east-west" : "one-way",
            [
              ["flat", t("Flat on the roof")],
              ["one-way", t("Rack, one direction")],
              ["east-west", t("Rack, east-west")],
            ],
            (value) =>
              set((a) => (a.rack = value === "flat" ? null : defaultRack(value === "east-west"))),
          );
          if (rack) {
            numberField(t("Tilt"), rack.tilt, (v) => set((a) => (a.rack!.tilt = Math.min(60, v))), {
              step: 1,
              unit: "°",
            });
            numberField(
              rack.eastWest ? t("First half faces") : t("Faces"),
              rack.azimuth,
              (v) => set((a) => (a.rack!.azimuth = ((v % 360) + 360) % 360)),
              { min: -360, step: 5, unit: t("° from N") },
            );
            paragraph(
              rack.eastWest
                ? t(
                    "Two panels lean back to back: one half faces the direction, and the other half the opposite direction. 90° is east.",
                  )
                : t(
                    "180° is south. The rows keep a distance, so that a row does not shade the next row at noon on 21 December.",
                  ),
              "note",
            );
          }
        }
        numberField(t("Panel power"), array.panelPower, (v) => set((a) => (a.panelPower = v)), {
          min: 50,
          step: 5,
          unit: "W",
        });
        selectField(
          t("Orientation"),
          array.portrait ? "portrait" : "landscape",
          [
            ["portrait", t("Portrait")],
            ["landscape", t("Landscape")],
          ],
          (value) => set((a) => (a.portrait = value === "portrait")),
        );
        numberField(t("Margin"), array.margin, (v) => set((a) => (a.margin = v)));
        numberField(
          t("Most panels"),
          array.limit ?? 0,
          (v) => set((a) => (a.limit = v > 0 ? v : null)),
          {
            step: 1,
            unit: "",
          },
        );
        button(
          t("Remove"),
          () => doc.editBuilding((b) => (b.pv = b.pv.filter((a) => a.id !== array.id))),
          { kind: "danger", icon: "trash" },
        );
      },
    );
  });
  if (newPvField(building)) {
    button(
      t("Add a PV field"),
      () =>
        doc.editBuilding((b) => {
          const field = newPvField(b);
          if (field) b.pv.push(field);
        }),
      { icon: "plus" },
    );
  }
}

/** The menu of the device types and the kinds of lines, grouped by system. */
let servicesMenuSystem: ServiceSystem | null = null;

/**
 * Opens the menu of the device types and the kinds of lines of one system under the button, or
 * closes it if it is open for the same system.
 */
export function openServicesMenu(system: ServiceSystem, anchor: HTMLElement): void {
  const menu = $("#services-menu");
  if (!menu.hidden && servicesMenuSystem === system) return shell.closeMenus();
  servicesMenuSystem = system;
  menu.replaceChildren();
  const title = (text: string) => {
    const heading = document.createElement("h4");
    heading.textContent = text;
    menu.append(heading);
  };
  title(t("Devices"));
  for (const type of FIXTURE_TYPES.filter((f) => f.system === system)) {
    const item = document.createElement("button");
    item.append(fixturePicture(type.type), t(type.name));
    item.addEventListener("click", () => {
      shell.closeMenus();
      shell.setTopic("utilities");
      const ceiling = defaultWallHeight(doc.plan) - 0.05;
      editor.startFixture(newFixture(type.type, { x: 0, y: 0 }, ceiling));
      shell.markTool("fixture");
      showStatus(HINTS.fixture);
      renderPanel();
    });
    menu.append(item);
  }
  title(system === "water" || system === "heating" ? t("Pipes") : t("Cables"));
  for (const kind of RUN_KINDS.filter((k) => k.system === system)) {
    const item = document.createElement("button");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = kind.dashed
      ? `repeating-linear-gradient(90deg, ${kind.color} 0 6px, transparent 6px 10px)`
      : kind.color;
    item.append(swatch, t(kind.name));
    item.addEventListener("click", () => {
      shell.closeMenus();
      shell.setTopic("utilities");
      editor.startRun(kind.kind);
      shell.markTool("run");
      showStatus(HINTS.run);
      renderPanel();
    });
    menu.append(item);
  }
  shell.closeMenus();
  menu.hidden = false;
  placeMenu(menu, anchor);
}

/** A small SVG of the plan symbol of a device type. */
function fixturePicture(type: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const fixture = newFixture(type, { x: 0, y: 0 }, 2.4);
  const symbol = fixtureSymbol(fixture);
  const all = [...symbol.shapes, ...symbol.lines, ...symbol.filled].flat();
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0.2);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "symbol");
  svg.setAttribute("viewBox", `${cx - size * 0.6} ${cy - size * 0.6} ${size * 1.2} ${size * 1.2}`);
  const color = systemColor(fixture.system);
  const add = (list: { x: number; y: number }[][], tag: string, fill: string) => {
    for (const points of list) {
      const element = document.createElementNS(ns, tag);
      element.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
      element.setAttribute("fill", fill);
      element.setAttribute("stroke", fill === color ? "none" : color);
      element.setAttribute("stroke-width", String(size * 0.06));
      svg.append(element);
    }
  };
  add(symbol.shapes, "polygon", "none");
  add(symbol.lines, "polyline", "none");
  add(symbol.filled, "polygon", color);
  return svg;
}

/** The color of a U-value: green for good insulation, yellow, and red for poor insulation. */
function uColor(u: number): string {
  if (u <= 0.25) return "#2f9e44";
  if (u <= 0.45) return "#f08c00";
  return "#e03131";
}

/**
 * The insulation layer of the 2D editor: each outer wall in the color of its U-value, and the
 * heat loss of each room under its label.
 */
export function drawInsulation(group: SVGGElement, zoom: number): void {
  const ns = "http://www.w3.org/2000/svg";
  const story = doc.plan;
  for (const wall of story.walls) {
    if (!isOuterWall(story, wall)) continue;
    const [a, b] = wallEnds(story, wall);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("stroke", uColor(uValue(wallLayers(doc.building, wall), "wall")));
    line.setAttribute("stroke-width", String(wall.thickness * 0.6));
    line.setAttribute("class", "insulation-wall");
    group.append(line);
  }
  for (const room of findRooms(story)) {
    const loss = roomHeatLoss(doc.building, story, room);
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", String(room.labelAt.x));
    text.setAttribute("y", String(room.labelAt.y + 30 / zoom));
    text.setAttribute("font-size", String(12 / zoom));
    text.setAttribute("stroke-width", String(3 / zoom));
    text.setAttribute("class", "heat-label");
    text.textContent = story.heated ? `${Math.round(loss.total)} W` : t("unheated");
    group.append(text);
  }
}
