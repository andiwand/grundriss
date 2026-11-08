// The website of Grundriss: a scroll story that builds one house. A sticky stage behind the
// chapters shows the scan, the plan, a tablet, or the house in 3D. The scroll progress of each
// chapter drives the picture, and the cards show live numbers from the engine of the app. The
// page gives the language in <html lang>, and all words come from i18n.ts.

import { icon, type IconName } from "../../src/icons";
import { livingArea, roofIsCeiling } from "../../src/model/attic";
import { stairRise, stairShape } from "../../src/model/building";
import { buildingHeatLoss } from "../../src/model/energy";
import { makeHouse, partOf } from "../../src/model/example";
import { pvSummary } from "../../src/model/pv";
import { fixtureQuantities, runQuantities } from "../../src/model/quantities";
import { designFlow, roomReadiness } from "../../src/model/radiators";
import { subsidyEstimate, variantCost } from "../../src/model/renovation";
import { roofGeometryOf } from "../../src/model/roof";
import { findRooms } from "../../src/model/rooms";
import type { Building, Variant } from "../../src/model/types";
import { MEASURES, addMeasure, variantOf, withVariant } from "../../src/model/variants";
import { LANG_KEY, LANGS, TEXTS, fill, type Lang } from "./i18n";
import { planSvg, sketchSvg } from "./plan2d";
import { Stage3D, type Mood, type Shot } from "./stage3d";

const lang: Lang = LANGS.find((l) => l === document.documentElement.lang) ?? LANGS[0];
const t = TEXTS[lang];
const locale = lang === "de" ? "de-DE" : "en-US";

// The example house, with the names of its stories and rooms in the language of the page.
const house = makeHouse();
const rename = (name: string) => t.names[name] ?? name;
for (const story of house.stories) {
  story.name = rename(story.name);
  for (const room of story.rooms) room.name = rename(room.name);
}
const [ground, attic] = house.stories;
const roof = house.roofs[0];

// ----- The stage -----

const MOODS: Record<string, Mood> = {
  day: { sun: 2.6, sunColor: "#fff3df", sky: "#dfe8ff", ground: "#b8a88c", sunAzimuth: 35 },
  morning: { sun: 2.4, sunColor: "#ffe9c9", sky: "#e4ecff", ground: "#a99d88", sunAzimuth: 70 },
  golden: { sun: 3.0, sunColor: "#ffc98f", sky: "#ffe0c2", ground: "#8f7a62", sunAzimuth: -55 },
  dusk: { sun: 1.9, sunColor: "#ff9a66", sky: "#b9b7e8", ground: "#5b5462", sunAzimuth: -80 },
};

// Each part is a part of the house, and whether its roofs show. The attic without its roof keeps
// the roof in the building, so that its walls stop at the slope like in the finished house.
const parts = {
  shell: { building: partOf(house, {}), roofs: false },
  attic: { building: partOf(house, { attic: true, roof: true }), roofs: false },
  roofed: { building: partOf(house, { attic: true, roof: true }), roofs: true },
  furnished: { building: partOf(house, { furniture: true }), roofs: false },
  solar: { building: partOf(house, { attic: true, roof: true, pv: true }), roofs: true },
  full: {
    building: partOf(house, { attic: true, roof: true, pv: true, furniture: true }),
    roofs: true,
  },
};

const center = (z: number): [number, number, number] => [6, 4.5, z];
const SHOTS: Record<string, Shot> = {
  hero: shot("full", null, 0, 0, 32, 15, 50, center(7.4), "golden"),
  uses: shot("full", null, 0, 0, 32, 15, 50, center(7.4), "golden"),
  walls: shot(null, "shell", -0.1, 2.9, 28, 40, 31, center(1), "morning"),
  stories: shot(null, "attic", 2.6, 5.7, 40, 27, 33, center(2.6), "morning"),
  roof: shot(null, "roofed", 2.75, 10.5, -32, 22, 35, center(3.4), "day"),
  furnish: shot("shell", "furnished", -0.05, 2.4, 18, 56, 30, center(0), "day"),
  sun: shot("roofed", "solar", 6, 10.5, -8, 30, 31, center(3.6), "golden"),
  renovate: shot("full", null, 0, 0, 24, 20, 44, center(1.2), "day"),
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

// ----- The numbers of the engine -----

const number = (v: number, digits = 0) =>
  v.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const m2 = (v: number) => `${number(v, 1)} m²`;
const kw = (w: number) => `${number(w / 1000, 1)} kW`;
const euro = (v: number) =>
  // An estimate needs no more precision than 100 €.
  (Math.round(v / 100) * 100).toLocaleString(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

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

// The heat pump readiness of the rooms: the flow temperature that their radiators need.
const readiness = roomReadiness(house, loss);
const flow = designFlow(readiness);
const heated = readiness.filter((r) => r.readiness !== "none");
const ready = heated.filter((r) => r.readiness === "good" || r.readiness === "fair");

// The variants of the renovation: each measure of the envelope alone, and all of them together.
const ENVELOPE_MEASURES = ["walls", "roof", "windows"] as const;
function variantWith(ids: readonly string[]): Variant {
  const variant = variantOf(house, ids.join("+"));
  for (const id of ids) {
    const measure = MEASURES.find((m) => m.id === id);
    if (measure) addMeasure(house, variant, measure);
  }
  return variant;
}
const variants = [
  { label: t.compare.plan, building: house as Building, variant: null as Variant | null },
  ...[...ENVELOPE_MEASURES.map((id) => [id]), [...ENVELOPE_MEASURES]].map((ids) => {
    const variant = variantWith(ids);
    const label = ids.length > 1 ? t.compare.all : t.compare[ids[0]];
    return { label, building: withVariant(house, variant), variant };
  }),
].map((v) => ({ ...v, loss: buildingHeatLoss(v.building).total }));
const renovation = variants[variants.length - 1];
const inRegion = (region: "AT" | "DE"): Building => ({
  ...house,
  finance: { ...house.finance, region },
});
const costAT = variantCost(inRegion("AT"), renovation.variant!);
const costDE = variantCost(inRegion("DE"), renovation.variant!);
const subsidy = subsidyEstimate(inRegion("DE"), renovation.variant!)?.amount ?? 0;
const flowAfter = designFlow(roomReadiness(renovation.building));
const celsius = (v: number | null) => (v === null ? "–" : `${v} °C`);

// ----- The 2D pictures -----

// The paper shows the sketch, the plan, or the readiness map. The blueprint shows the plan in
// white on blue.
const paper = document.getElementById("paper")!;
const sketch = sketchSvg(ground);
const plan = planSvg(house, partOf(house, { furniture: true, services: true }).stories[0]);
plan.classList.add("main");

// The readiness map: the export of the plan, with each room in the color of its readiness. The
// polygons of the rooms in the export have the order of `findRooms`.
const heatmap = planSvg(house, partOf(house, {}).stories[0]);
heatmap.classList.add("heatmap");
const polygons = heatmap.querySelectorAll("#rooms polygon");
groundRooms.forEach((room, i) => {
  const r = readiness.find((x) => x.storyId === ground.id && x.key === room.key);
  polygons[i]?.setAttribute("class", `ready-${r?.readiness ?? "none"}`);
});
const legend = document.createElement("div");
legend.className = "legend";
legend.innerHTML =
  `<strong>${t.legend.title}</strong>` +
  (["good", "fair", "poor", "none"] as const)
    .map((k) => `<span><i class="ready-${k}"></i>${t.legend[k]}</span>`)
    .join("");
paper.append(sketch, plan, heatmap, legend);

const blueprint = document.getElementById("blueprint")!;
blueprint.append(planSvg(house, ground));
const chips = document.createElement("div");
chips.className = "chips";
for (const [name, note] of t.chips) {
  const chip = document.createElement("span");
  chip.innerHTML = `<strong>${name}</strong> ${note}`;
  chips.append(chip);
}
blueprint.append(chips);

// The tablet: the furnished plan with numbered notes on rooms, as in the app.
const screen = document.querySelector<HTMLElement>("#device .screen")!;
const tabletPlan = planSvg(house, partOf(house, { furniture: true }).stories[0]);
const SVG = "http://www.w3.org/2000/svg";
const notes = document.createElement("ol");
notes.className = "notes";
t.pins.forEach(([room, text], i) => {
  const info = ground.rooms.find((r) => r.name === rename(room));
  if (!info) return;
  const pin = document.createElementNS(SVG, "g");
  pin.classList.add("pin");
  pin.style.setProperty("--i", String(i));
  pin.setAttribute("transform", `translate(${info.at.x + 0.9} ${info.at.y - 0.9})`);
  pin.innerHTML = `<circle r="0.42"/><text dy="0.17">${i + 1}</text>`;
  tabletPlan.append(pin);
  const item = document.createElement("li");
  item.style.setProperty("--i", String(i));
  item.innerHTML = `<b>${i + 1}</b><span>${text}</span>`;
  notes.append(item);
});
screen.append(tabletPlan, notes);

// The comparison of the variants: one bar for each, as long as its heat loss.
const compare = document.getElementById("compare")!;
const most = Math.max(...variants.map((v) => v.loss));
compare.innerHTML =
  `<strong>${t.compare.title}</strong>` +
  variants
    .map(
      (v, i) =>
        `<div class="bar" style="--w:${(v.loss / most).toFixed(3)};--i:${i}">` +
        `<span>${v.label}</span><i></i><b>${kw(v.loss)}</b></div>`,
    )
    .join("");

// ----- The readouts: live numbers from the engine -----

const r = t.readout;
const rows = (list: [string, string][]) =>
  `<dl>${list.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

/** The readouts. A readout gets the progress, so that its numbers can count up. */
const READOUTS: Record<string, (p: number) => string> = {
  scan: (p) => {
    const f = Math.min(1, p * 1.4);
    return rows([
      [r.wallsFound, String(Math.round(ground.walls.length * f))],
      [r.doors, String(Math.round(doors * f))],
      [r.windows, String(Math.round(windows * f))],
    ]);
  },
  plan: () =>
    rows(
      groundRooms
        .filter((room) => room.info?.name)
        .sort((a, b) => b.area - a.area)
        .slice(0, 4)
        .map((room) => [room.info!.name, m2(room.area)] as [string, string])
        .concat([[r.groundFloor, m2(groundRooms.reduce((s, room) => s + room.area, 0))]]),
    ),
  walls: (p) =>
    rows([
      [r.walls, String(ground.walls.length)],
      [r.openings, String(ground.openings.length)],
      [r.height, `${number(2.5 * Math.min(1, p * 1.3), 2)} m`],
    ]),
  stories: () =>
    rows([
      [ground.name, `±${number(0, 2)} m`],
      [attic.name, `+${number(attic.elevation, 2)} m`],
      [r.stair, fill(r.stairValue, { kind: r.stairKinds[stair.kind], n: steps })],
    ]),
  roof: (p) =>
    rows([
      [r.pitch, `${roof.sides[0].pitch}°`],
      [r.ridge, `${number(roofGeometry.top * Math.min(1, 0.4 + p), 2)} m`],
      [r.dormerWindows, `${roof.dormers.length} · ${roof.windows.length}`],
      ...(atticArea
        ? ([
            [
              r.attic,
              fill(r.atticValue, { living: m2(atticArea.living), floor: m2(atticArea.floor) }),
            ],
          ] as [string, string][])
        : []),
    ]),
  furnish: (p) =>
    rows([
      [r.pieces, String(Math.round(pieces * Math.min(1, p * 1.3)))],
      [r.sources, r.sourcesValue],
    ]),
  services: () =>
    rows([
      [r.socketsSwitches, `${count(["socket", "socket-double"])} · ${count(["switch"])}`],
      [r.cable, `${number(length(["cable", "light-cable", "data-cable"]), 1)} m`],
      [r.heatingPipe, `${number(length(["flow", "return"]), 1)} m`],
      [r.radiators, String(count(["radiator"]))],
    ]),
  heat: () =>
    rows([
      [r.heatLoss, `${kw(loss.total)} · ${Math.round(loss.perArea)} W/m²`],
      [r.flow, celsius(flow)],
      [r.readyRooms, fill(r.readyValue, { n: ready.length, total: heated.length })],
    ]),
  sun: (p) =>
    rows([
      [r.panels, String(Math.round(pv.count * Math.min(1, p * 1.3)))],
      [r.peak, `${number(pv.peak, 1)} kWp`],
      [r.yield, fill(r.perYear, { n: number(Math.round(pv.yield)) })],
    ]),
  renovate: () =>
    rows([
      [r.heatLoss, `${number(loss.total / 1000, 1)} → ${kw(renovation.loss)}`],
      [r.flow, `${celsius(flow)} → ${celsius(flowAfter)}`],
      [r.costAT, euro(costAT)],
      [r.costDE, euro(costDE)],
      [r.subsidy, euro(subsidy)],
    ]),
  visit: () =>
    rows([
      [r.offline, r.offlineValue],
      [r.account, r.accountValue],
      [r.saves, r.savesValue],
      [r.backup, r.backupValue],
    ]),
  export: () =>
    rows([
      [r.formats, r.formatsValue],
      [r.report, r.reportValue],
    ]),
};

// ----- The chapters and the scroll -----

const sections = [...document.querySelectorAll<HTMLElement>("[data-chapter]")].filter(
  (s) => s.tagName === "SECTION",
);
const readouts = new Map(
  [...document.querySelectorAll<HTMLElement>("[data-readout]")].map((e) => [e.dataset.readout!, e]),
);

/** Scrolls to a chapter. The middle of a chapter shows its picture best. */
function scrollToChapter(section: HTMLElement): void {
  const middle = section.classList.contains("chapter");
  const top = middle
    ? section.offsetTop + section.offsetHeight / 2 - innerHeight / 2
    : section.offsetTop;
  scrollTo({ top, behavior: "smooth" });
}

const rail = document.getElementById("rail")!;
const railButtons = sections
  .filter((s) => s.dataset.icon)
  .map((section) => {
    const button = document.createElement("button");
    button.innerHTML = icon(section.dataset.icon as IconName);
    button.title = section.querySelector("h2")?.textContent ?? "";
    button.setAttribute("aria-label", button.title);
    button.dataset.target = section.dataset.chapter;
    button.addEventListener("click", () => scrollToChapter(section));
    rail.append(button);
    return button;
  });

// The links inside the page, for example of the use cases, go to the middle of their chapter.
for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
  link.addEventListener("click", (event) => {
    const section = document.getElementById(link.hash.slice(1));
    if (!section) return;
    event.preventDefault();
    history.replaceState(null, "", link.hash);
    scrollToChapter(section);
  });
}

let lastChapter = "";

// The language switch keeps the choice, so that the root page does not send the visitor away
// again. The link takes the current chapter along.
for (const link of document.querySelectorAll<HTMLAnchorElement>(".langs a")) {
  link.addEventListener("click", () => {
    try {
      localStorage.setItem(LANG_KEY, link.dataset.lang!);
    } catch {
      // Without storage, the switch still works for this visit.
    }
    const chapter = document.getElementById(lastChapter);
    if (chapter && chapter.id) link.hash = chapter.id;
  });
}

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
    for (const section of sections) section.classList.toggle("current", section === current);
    for (const button of railButtons) {
      button.classList.toggle("active", button.dataset.target === chapter);
    }
    lastChapter = chapter;
  }
  document.body.style.setProperty("--p", progress.toFixed(4));
  // A 2D chapter keeps the last 3D shot behind its picture.
  const next = SHOTS[chapter];
  if (next) lastShot = next;
  const spin = chapter === "hero" || chapter === "uses" || chapter === "finale";
  stage.set(lastShot, next ? progress : 1, spin);
  const readout = readouts.get(chapter);
  const fillReadout = READOUTS[chapter];
  if (readout && fillReadout) readout.innerHTML = fillReadout(progress);
}

addEventListener("scroll", update, { passive: true });
addEventListener("resize", update);
update();
document.body.classList.add("ready");
