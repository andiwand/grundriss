// The website of Grundriss: a scroll story that builds one house. A sticky stage behind the
// chapters shows the scan, the plan, or the house in 3D. The scroll progress of each chapter
// drives the picture, and the cards show live numbers from the engine of the app.

import { icon, type IconName } from "../../src/icons";
import { livingArea, roofIsCeiling } from "../../src/model/attic";
import { stairRise, stairShape } from "../../src/model/building";
import { buildingHeatLoss } from "../../src/model/energy";
import { pvSummary } from "../../src/model/pv";
import { fixtureQuantities, runQuantities } from "../../src/model/quantities";
import { roofGeometryOf } from "../../src/model/roof";
import { findRooms } from "../../src/model/rooms";
import { makeHouse, partOf } from "../../src/model/example";
import { planSvg, sketchSvg } from "./plan2d";
import { Stage3D, type Mood, type Shot } from "./stage3d";

const house = makeHouse();
const [ground, attic] = house.stories;
const roof = house.roofs[0];

// ----- The stage -----

const MOODS: Record<string, Mood> = {
  day: { sun: 2.6, sunColor: "#fff3df", sky: "#dfe8ff", ground: "#b8a88c", sunAzimuth: 35 },
  morning: { sun: 2.4, sunColor: "#ffe9c9", sky: "#e4ecff", ground: "#a99d88", sunAzimuth: 70 },
  golden: { sun: 3.0, sunColor: "#ffc98f", sky: "#ffe0c2", ground: "#8f7a62", sunAzimuth: -55 },
  dusk: { sun: 1.9, sunColor: "#ff9a66", sky: "#b9b7e8", ground: "#5b5462", sunAzimuth: -80 },
};

const parts = {
  shell: partOf(house, {}),
  attic: partOf(house, { attic: true }),
  roofed: partOf(house, { attic: true, roof: true }),
  furnished: partOf(house, { furniture: true }),
  solar: partOf(house, { attic: true, roof: true, pv: true }),
  full: partOf(house, { attic: true, roof: true, pv: true, furniture: true }),
};

const center = (z: number): [number, number, number] => [6, 4.5, z];
const SHOTS: Record<string, Shot> = {
  hero: shot("full", null, 0, 0, 32, 15, 50, center(7.4), "golden"),
  walls: shot(null, "shell", -0.1, 2.9, 28, 40, 31, center(1), "morning"),
  stories: shot(null, "attic", 2.6, 5.7, 40, 27, 33, center(2.6), "morning"),
  roof: shot(null, "roofed", 2.75, 10.5, -32, 22, 35, center(3.4), "day"),
  furnish: shot("shell", "furnished", -0.05, 2.4, 18, 56, 30, center(0), "day"),
  energy: shot("roofed", "solar", 6, 10.5, -8, 30, 31, center(3.6), "golden"),
  finale: shot("full", null, 0, 0, -40, 18, 38, center(2.8), "dusk"),
};

function shot(
  base: string | null,
  grow: string | null,
  from: number,
  to: number,
  azimuth: number,
  elevation: number,
  distance: number,
  target: [number, number, number],
  mood: string,
): Shot {
  return { base, grow, from, to, azimuth, elevation, distance, target, mood: MOODS[mood] };
}

const stage = new Stage3D(document.getElementById("three")!, parts);

// The 2D pictures. The paper shows the sketch or the plan, the blueprint shows the plan in white
// on blue.
const paper = document.getElementById("paper")!;
const sketch = sketchSvg(ground);
const plan = planSvg(house, partOf(house, { furniture: true, services: true }).stories[0]);
paper.append(sketch, plan);
const blueprint = document.getElementById("blueprint")!;
blueprint.append(planSvg(house, ground));
const chips = document.createElement("div");
chips.className = "chips";
for (const [name, note] of [
  ["PDF", "1:50 · 1:100"],
  ["SVG", "vector"],
  ["DXF", "CAD"],
  ["glTF", "3D"],
  [".grundriss", "everything"],
]) {
  const chip = document.createElement("span");
  chip.innerHTML = `<strong>${name}</strong> ${note}`;
  chips.append(chip);
}
blueprint.append(chips);

// ----- The readouts: live numbers from the engine -----

const m2 = (v: number) => `${v.toFixed(1)} m²`;
const rows = (list: [string, string][]) =>
  `<dl>${list.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

const groundRooms = findRooms(ground);
const doors = ground.openings.filter((o) => o.kind === "door").length;
const windows = ground.openings.length - doors;
const stair = ground.stairs[0];
const steps = stairShape(stair, stairRise(house, ground)).steps.length;
const roofGeometry = roofGeometryOf(house, roof);
const loss = buildingHeatLoss(house);
const pv = pvSummary(house);
const atticArea = roofIsCeiling(house, attic)
  ? findRooms(attic).reduce(
      (sum, room) => {
        const area = livingArea(house, attic, room);
        return { floor: sum.floor + area.floor, living: sum.living + area.living };
      },
      { floor: 0, living: 0 },
    )
  : null;
const pieces = house.stories.reduce((sum, s) => sum + s.furniture.length, 0);
const runs = runQuantities([ground]);
const fixtures = fixtureQuantities([ground]);
const length = (kinds: string[]) =>
  runs.filter((r) => kinds.includes(r.kind)).reduce((sum, r) => sum + r.length, 0);
const count = (types: string[]) =>
  fixtures.filter((f) => types.includes(f.type)).reduce((sum, f) => sum + f.count, 0);

/** The readouts. A readout gets the progress, so that its numbers can count up. */
const READOUTS: Record<string, (p: number) => string> = {
  scan: (p) => {
    const t = Math.min(1, p * 1.4);
    return rows([
      ["Walls found", String(Math.round(ground.walls.length * t))],
      ["Doors", String(Math.round(doors * t))],
      ["Windows", String(Math.round(windows * t))],
    ]);
  },
  plan: () =>
    rows(
      groundRooms
        .filter((r) => r.info?.name)
        .sort((a, b) => b.area - a.area)
        .slice(0, 4)
        .map((r) => [r.info!.name, m2(r.area)] as [string, string])
        .concat([["Ground floor", m2(groundRooms.reduce((s, r) => s + r.area, 0))]]),
    ),
  walls: (p) =>
    rows([
      ["Walls", String(ground.walls.length)],
      ["Openings", String(ground.openings.length)],
      ["Height", `${(2.5 * Math.min(1, p * 1.3)).toFixed(2)} m`],
    ]),
  stories: () =>
    rows([
      [ground.name, "±0.00 m"],
      [attic.name, `+${attic.elevation.toFixed(2)} m`],
      ["Stair", `L-shaped · ${steps} steps`],
    ]),
  roof: (p) =>
    rows([
      ["Pitch", `${roof.sides[0].pitch}°`],
      ["Ridge", `${(roofGeometry.top * Math.min(1, 0.4 + p)).toFixed(2)} m`],
      ["Dormer · windows", `${roof.dormers.length} · ${roof.windows.length}`],
      ...(atticArea
        ? ([["Attic living area", `${m2(atticArea.living)} of ${m2(atticArea.floor)}`]] as [
            string,
            string,
          ][])
        : []),
    ]),
  furnish: (p) =>
    rows([
      ["Pieces", String(Math.round(pieces * Math.min(1, p * 1.3)))],
      ["Sources", "Generic · Kenney · Poly Haven · glTF"],
    ]),
  services: () =>
    rows([
      ["Sockets · switches", `${count(["socket", "socket-double"])} · ${count(["switch"])}`],
      ["Cable", `${length(["cable", "light-cable", "data-cable"]).toFixed(1)} m`],
      ["Heating pipe", `${length(["flow", "return"]).toFixed(1)} m`],
      ["Radiators", String(count(["radiator"]))],
    ]),
  energy: (p) =>
    rows([
      ["Heat loss", `${(loss.total / 1000).toFixed(1)} kW · ${Math.round(loss.perArea)} W/m²`],
      ["Solar panels", String(Math.round(pv.count * Math.min(1, p * 1.3)))],
      ["Peak power", `${pv.peak.toFixed(1)} kWp`],
      ["Yield", `${Math.round(pv.yield).toLocaleString("en")} kWh / year`],
    ]),
  export: () => rows([["Formats", "PDF · SVG · DXF · glTF · package"]]),
};

// ----- The chapters and the scroll -----

const sections = [...document.querySelectorAll<HTMLElement>("[data-chapter]")].filter(
  (s) => s.tagName === "SECTION",
);
const readouts = new Map(
  [...document.querySelectorAll<HTMLElement>("[data-readout]")].map((e) => [e.dataset.readout!, e]),
);

const rail = document.getElementById("rail")!;
const railButtons = sections
  .filter((s) => s.dataset.icon)
  .map((section) => {
    const button = document.createElement("button");
    button.innerHTML = icon(section.dataset.icon as IconName);
    button.title = section.querySelector("h2")?.textContent ?? "";
    button.dataset.target = section.dataset.chapter;
    button.addEventListener("click", () => {
      // The middle of the chapter shows its picture best.
      const top = section.offsetTop + section.offsetHeight / 2 - innerHeight / 2;
      scrollTo({ top, behavior: "smooth" });
    });
    rail.append(button);
    return button;
  });

let lastChapter = "";
let lastShot: Shot = SHOTS.hero;
function update(): void {
  const middle = scrollY + innerHeight / 2;
  let current = sections[0];
  for (const section of sections) if (section.offsetTop <= middle) current = section;
  const chapter = current.dataset.chapter!;
  // The progress goes from 0 when the chapter enters to 1 when its end reaches the middle.
  const span = Math.max(1, current.offsetHeight - innerHeight / 2);
  const progress = Math.min(1, Math.max(0, (middle - current.offsetTop) / span));

  if (chapter !== lastChapter) {
    document.body.dataset.chapter = chapter;
    for (const button of railButtons) {
      button.classList.toggle("active", button.dataset.target === chapter);
    }
    lastChapter = chapter;
  }
  document.body.style.setProperty("--p", progress.toFixed(4));
  // A 2D chapter keeps the last 3D shot behind its picture.
  const next = SHOTS[chapter];
  if (next) lastShot = next;
  stage.set(lastShot, next ? progress : 1, chapter === "hero" || chapter === "finale");
  const readout = readouts.get(chapter);
  const fill = READOUTS[chapter];
  if (readout && fill) readout.innerHTML = fill(progress);
}

addEventListener("scroll", update, { passive: true });
addEventListener("resize", update);
update();
document.body.classList.add("ready");
