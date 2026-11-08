// The report of the building as a PDF: the areas of the rooms, the envelope, the heat loss and the
// heat pump readiness of each room, the energy per year, the summer, the renovation, and the
// building services, then the plans of the stories. A homeowner gives it to an energy advisor,
// a bank, or with an application for a subsidy.
//
// The text pages are A4 in portrait. A small layout engine puts the headings, the paragraphs,
// and the tables on the pages, and starts a new page when the space ends. The font is Helvetica
// with the WinAnsi encoding, so the text replaces the few characters that it does not have.

import { energyBalance } from "../model/balance";
import { buildingHeatLoss, uValue } from "../model/energy";
import { HEATING_KINDS, heatingEnergy } from "../model/heating";
import { material } from "../model/insulation";
import { summerOverheating } from "../model/overheating";
import { pvSummary } from "../model/pv";
import { designFlow, roomReadiness } from "../model/radiators";
import { variantCost, variantEconomy } from "../model/renovation";
import { buildingTakeoff } from "../model/takeoff";
import type { Building, Layer } from "../model/types";
import { literal, n, planPages, textWidth, writePdf, type PdfPage } from "./pdf";

const MM = 72 / 25.4;
const A4 = { width: 210 * MM, height: 297 * MM };
const MARGIN = 18 * MM;
const BODY = 9;
const SMALL = 7.5;
const LINE = 1.35;

/** The texts of the report. The app gives them in the language of the user. */
export interface ReportOptions {
  title: string;
  name: string;
  date: string;
  /** Formats a number with the decimal mark of the language. */
  number: (value: number, digits?: number) => string;
  /** Translates a text of the report. Without it, the report is in English. */
  t?: (text: string) => string;
}

/** Characters that Helvetica in WinAnsi does not have, and their replacements. */
const REPLACE: [RegExp, string][] = [
  [/₂/g, "2"],
  [/−/g, "-"],
  [/Δ/g, "d"],
  [/[  ]/g, " "],
  [/≥/g, ">="],
  [/≤/g, "<="],
];
const clean = (text: string) => REPLACE.reduce((s, [from, to]) => s.replace(from, to), text);

/** The layout engine: it writes lines from the top of the page down, and adds pages. */
class Writer {
  pages: string[] = [];
  private ops: string[] = [];
  y = A4.height - MARGIN;
  readonly width = A4.width - 2 * MARGIN;

  constructor(private footer: string) {}

  private get bottom() {
    return MARGIN + 8 * MM;
  }

  text(x: number, y: number, text: string, size = BODY, bold = false, gray = false) {
    const font = bold ? "/F2" : "/F1";
    const color = gray ? "0.45 g" : "0 g";
    this.ops.push(
      `BT ${color} ${font} ${n(size)} Tf ${n(x)} ${n(y)} Td ${literal(clean(text))} Tj ET`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.4) {
    this.ops.push(`0.7 G ${n(width)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
  }

  /** Starts a new page if less than `space` points are left. */
  need(space: number) {
    if (this.y - space < this.bottom) this.page();
  }

  page() {
    this.finish();
    this.y = A4.height - MARGIN;
  }

  private finish() {
    if (this.ops.length === 0) return;
    const number = this.pages.length + 1;
    this.text(MARGIN, MARGIN, this.footer, SMALL, false, true);
    const label = String(number);
    this.text(A4.width - MARGIN - textWidth(label, SMALL), MARGIN, label, SMALL, false, true);
    this.pages.push(this.ops.join("\n"));
    this.ops = [];
  }

  /**
   * The lines of a text that fit in the width, broken at spaces. A word that is wider than the
   * width breaks between its characters.
   */
  wrap(text: string, width: number, size: number): string[] {
    const lines: string[] = [];
    let current = "";
    for (let word of clean(text).split(/\s+/)) {
      while (textWidth(word, size) > width && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && textWidth(word.slice(0, cut), size) > width) cut--;
        if (current) lines.push(current);
        lines.push(word.slice(0, cut));
        current = "";
        word = word.slice(cut);
      }
      const next = current ? `${current} ${word}` : word;
      if (textWidth(next, size) > width && current) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
    return lines;
  }

  /** The text, shorter with "…" at its end if it is wider than the width. */
  fit(text: string, width: number, size: number, bold = false): string {
    let value = clean(text);
    while (value.length > 1 && textWidth(value, size, bold) > width)
      value = `${value.slice(0, -2)}…`;
    return value;
  }

  title(text: string, sub: string) {
    this.text(MARGIN, this.y - 18, text, 18, true);
    this.y -= 30;
    this.text(MARGIN, this.y - 10, sub, BODY, false, true);
    this.y -= 22;
  }

  /** A heading. It starts a new page if its block would not start on this page. */
  heading(text: string) {
    // The heading takes 34 points, and the first lines of its block need about 40 more.
    this.need(74);
    this.y -= 10;
    this.text(MARGIN, this.y - 11, text, 11.5, true);
    this.y -= 16;
    this.line(MARGIN, this.y, MARGIN + this.width, this.y, 0.6);
    this.y -= 8;
  }

  paragraph(text: string, size = BODY, gray = false) {
    for (const line of this.wrap(text, this.width, size)) {
      this.need(size * LINE);
      this.text(MARGIN, this.y - size, line, size, false, gray);
      this.y -= size * LINE;
    }
    this.y -= 4;
  }

  /** Pairs of a label and a value, in two columns. */
  values(pairs: [string, string][]) {
    const column = this.width / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      this.need(BODY * LINE);
      pairs.slice(i, i + 2).forEach(([label, value], k) => {
        const x = MARGIN + k * column;
        // A long label or value gets shorter, so that it does not run into the next one.
        this.text(x, this.y - BODY, this.fit(label, column * 0.55 - 6, BODY), BODY, false, true);
        const fitted = this.fit(value, column * 0.45 - 6, BODY, true);
        this.text(x + column * 0.55, this.y - BODY, fitted, BODY, true);
      });
      this.y -= BODY * LINE + 2;
    }
    this.y -= 4;
  }

  /**
   * A table with a header line. `widths` are the parts of the width for the columns, and `right`
   * marks the columns of numbers. A cell that is too long gets shorter with "…".
   */
  table(headers: string[], rows: string[][], widths: number[], right: boolean[] = []) {
    const total = widths.reduce((s, w) => s + w, 0);
    const xs: number[] = [];
    let x = MARGIN;
    for (const w of widths) {
      xs.push(x);
      x += (w / total) * this.width;
    }
    const cell = (text: string, i: number, size: number, bold: boolean, y: number) => {
      // A text column after a number column keeps a gap from the numbers.
      const gap = !right[i] && i > 0 && right[i - 1] ? 8 : 0;
      const width = (widths[i] / total) * this.width - 4 - gap;
      const value = this.fit(text, width, size, bold);
      const left = right[i] ? xs[i] + width - textWidth(value, size, bold) : xs[i] + gap;
      this.text(left, y, value, size, bold);
    };
    const header = () => {
      this.need(SMALL * LINE * 3);
      headers.forEach((h, i) => cell(h, i, SMALL, true, this.y - SMALL));
      this.y -= SMALL * LINE + 2;
      this.line(MARGIN, this.y, MARGIN + this.width, this.y);
      this.y -= 3;
    };
    header();
    for (const row of rows) {
      if (this.y - SMALL * LINE < this.bottom) {
        this.page();
        header();
      }
      row.forEach((text, i) => cell(text, i, SMALL, false, this.y - SMALL));
      this.y -= SMALL * LINE + 1;
    }
    this.y -= 6;
  }

  done(): string[] {
    this.finish();
    return this.pages;
  }
}

/** The PDF of the report, with the plan pages after the text. */
export function buildingReport(building: Building, options: ReportOptions): Uint8Array {
  const t = options.t ?? ((text: string) => text);
  const num = options.number;
  const m2 = (v: number) => `${num(v, 1)} m²`;
  const kwh = (v: number) => `${num(v, 0)} kWh`;
  const euro = (v: number) => `${num(v, 0)} €`;
  const w = new Writer(`${options.title} · ${options.name} · ${options.date}`);

  w.title(options.title, `${options.name} · ${options.date}`);
  if (building.location) {
    w.paragraph(
      `${t("Location")}: ${building.location.name || `${num(building.location.latitude, 4)}, ${num(building.location.longitude, 4)}`}`,
    );
  }

  // The areas.
  const takeoff = buildingTakeoff(building);
  const loss = buildingHeatLoss(building);
  w.heading(t("Areas"));
  const living = takeoff.rooms.reduce((s, r) => s + r.livingArea, 0);
  w.values([
    [t("Gross floor area (heated)"), m2(takeoff.envelope.grossFloor)],
    [t("Net floor area (heated)"), m2(takeoff.envelope.netFloor)],
    [t("Living area (WoFlV), all rooms"), m2(living)],
    [t("Heated volume"), `${num(takeoff.envelope.volume, 0)} m³`],
    [t("Stories"), String(building.stories.length)],
    [t("Rooms"), String(takeoff.rooms.length)],
  ]);
  w.table(
    [t("Story"), t("Room"), t("Net area"), t("Living area"), t("Height"), t("Heated")],
    takeoff.rooms.map((r) => [
      t(r.story),
      r.name || t("Room"),
      m2(r.netArea),
      m2(r.livingArea),
      `${num(r.height, 2)} m`,
      r.heated ? t("yes") : t("no"),
    ]),
    [2, 3, 1.6, 1.6, 1.2, 1],
    [false, false, true, true, true, false],
  );

  // The envelope.
  const envelope = building.envelope;
  const layers = (list: Layer[]) =>
    list.map((l) => `${t(material(l.material).name)} ${num(l.thickness * 100, 1)} cm`).join(", ");
  w.heading(t("Envelope"));
  w.table(
    [t("Part"), t("Layers from the inside"), t("U-value"), t("Area")],
    [
      [
        t("Outer walls"),
        layers(envelope.wall),
        num(uValue(envelope.wall, "wall"), 2),
        m2(takeoff.envelope.walls),
      ],
      [
        t("Roof"),
        layers(envelope.roof),
        num(uValue(envelope.roof, "roof"), 2),
        m2(takeoff.envelope.roof),
      ],
      [
        t("Floor on the ground"),
        layers(envelope.floor),
        num(uValue(envelope.floor, "floor"), 2),
        m2(takeoff.envelope.floor),
      ],
      [
        t("Slab to an unheated story"),
        layers(envelope.ceiling),
        num(uValue(envelope.ceiling, "floor"), 2),
        m2(takeoff.envelope.slabs),
      ],
      [t("Windows"), "", num(envelope.windowU, 2), m2(takeoff.envelope.windows)],
    ],
    [2.2, 5, 1.1, 1.3],
    [false, false, true, true],
  );
  w.paragraph(
    `${t("Thermal bridges")}: ΔU ${num(envelope.thermalBridge, 2)} W/(m²K). ${t("Air change")}: ${num(envelope.ventilation.airChange, 2)} 1/h, n50 ${num(envelope.ventilation.n50, 1)} 1/h, ${t("heat recovery")} ${num(envelope.ventilation.heatRecovery * 100, 0)} %. ${t("Design temperatures")}: ${num(envelope.outside, 0)} °C / ${num(envelope.inside, 0)} °C.`,
    SMALL,
    true,
  );
  if (takeoff.openings.length > 0) {
    w.table(
      [t("Kind"), t("Width"), t("Height"), t("Sill"), t("Count"), t("Stories")],
      takeoff.openings.map((o) => [
        o.kind === "door" ? t("Door") : t("Window"),
        `${num(o.width, 2)} m`,
        `${num(o.height, 2)} m`,
        `${num(o.sill, 2)} m`,
        String(o.count),
        o.stories.map((story) => t(story)).join(", "),
      ]),
      [1.4, 1, 1, 1, 0.8, 3],
      [false, true, true, true, true, false],
    );
  }

  // The heat loss and the heat pump readiness.
  w.heading(t("Heat loss and heating"));
  const readiness = roomReadiness(building, loss);
  const flow = designFlow(readiness);
  const heating = envelope.heating;
  w.values([
    [t("Heat loss (design)"), `${num(loss.total / 1000, 1)} kW`],
    [
      t("Per gross floor area"),
      `${num(loss.grossArea > 0 ? loss.total / loss.grossArea : 0, 0)} W/m²`,
    ],
    [t("Heating"), t(HEATING_KINDS[heating.kind].name)],
    [t("Flow that the radiators need"), flow === null ? "–" : `${flow} °C`],
  ]);
  const verdict = { good: t("good"), fair: t("fair"), poor: t("too small"), none: t("no heating") };
  w.table(
    [t("Room"), t("Heat loss"), t("Radiators 75/65"), t("At 45 °C"), t("Needs"), t("Heat pump")],
    readiness.map((r) => [
      r.name || t("Room"),
      `${num(r.loss, 0)} W`,
      r.radiators > 0 ? `${num(r.radiators, 0)} W` : "–",
      r.readiness === "none" ? "–" : `${num(r.at45, 0)} W`,
      r.flow === null ? "–" : `${r.flow} °C`,
      verdict[r.readiness],
    ]),
    [3, 1.3, 1.5, 1.3, 1, 1.4],
    [false, true, true, true, true, false],
  );

  // The energy per year.
  const energy = heatingEnergy(building);
  const balance = energyBalance(building);
  w.heading(t("Energy per year"));
  if (!energy || !balance) {
    w.paragraph(t("The plan has no climate, so the report has no energy per year."));
  } else {
    const info = HEATING_KINDS[heating.kind];
    const pairs: [string, string][] = [
      [t("Heat demand"), kwh(energy.demand)],
      [t("Per gross floor area"), `${num(energy.perArea, 0)} kWh/m²`],
      [t("Class (an estimate)"), energy.efficiencyClass],
      [t("Final energy of the heating"), `${kwh(energy.final)} ${t(info.energy)}`],
      [t("Hot water"), kwh(energy.hotWaterFinal)],
      [t("CO₂ of heating and hot water"), `${num(energy.co2 / 1000, 1)} t`],
    ];
    if (energy.spf != null) pairs.push([t("Seasonal performance factor"), num(energy.spf, 1)]);
    pairs.push(
      [t("Electricity of the building"), kwh(balance.load)],
      [t("PV yield"), kwh(balance.pv)],
      [t("Electricity from the grid"), kwh(balance.imported)],
      [t("Energy cost per year"), euro(balance.cost)],
    );
    w.values(pairs);
    const pv = pvSummary(building);
    if (pv.count > 0) {
      w.paragraph(
        `${t("PV")}: ${pv.count} ${t("panels")}, ${num(pv.peak, 1)} kWp. ${t("Self-consumption")}: ${num(balance.selfConsumption * 100, 0)} %. ${t("Self-sufficiency")}: ${num(balance.selfSufficiency * 100, 0)} %.`,
      );
    }
    const summer = summerOverheating(building);
    if (summer && summer.length > 0) {
      w.heading(t("Summer"));
      const words = { ok: t("ok"), warning: t("warm"), risk: t("too hot") };
      w.table(
        [t("Room"), t("Glass per floor"), t("Hours > 27 °C"), t("Highest"), t("Verdict")],
        summer.map((r) => [
          r.name || t("Room"),
          `${num(r.glazingRatio * 100, 0)} %`,
          String(r.hoursOver27),
          `${num(r.max, 1)} °C`,
          words[r.verdict],
        ]),
        [3, 1.4, 1.4, 1.2, 1.2],
        [false, true, true, true, false],
      );
    }
  }

  // The renovation.
  if (building.variants.length > 0) {
    w.heading(t("Renovation"));
    w.table(
      [t("Variant"), t("Cost"), t("Subsidy"), t("Energy cost"), t("Saving"), t("Payback")],
      building.variants.map((v) => {
        const economy = variantEconomy(building, v, balance);
        return [
          v.name,
          euro(variantCost(building, v)),
          euro(v.subsidy),
          economy ? euro(economy.balance.cost) : "–",
          economy ? euro(economy.saving) : "–",
          economy?.payback == null ? "–" : `${num(economy.payback, 0)} ${t("years")}`,
        ];
      }),
      [3.4, 1.3, 1.3, 1.4, 1.2, 1.1],
      [false, true, true, true, true, true],
    );
  }

  // The building services.
  const services = takeoff.services;
  if (services.runs.length + services.fixtures.length > 0) {
    w.heading(t("Building services"));
    w.table(
      [t("Kind"), t("Quantity")],
      [
        ...services.runs.map((r) => [t(r.name), `${num(r.length, 1)} m`]),
        ...services.fixtures.map((f) => [t(f.name), String(f.count)]),
      ],
      [4, 1],
      [false, true],
    );
  }

  w.paragraph(
    t(
      "The values are estimates for planning. They are not a calculation by a standard and not an energy certificate.",
    ),
    SMALL,
    true,
  );

  const text: PdfPage[] = w.done().map((content) => ({ content, ...A4 }));
  // An empty plan has no plan pages.
  if (building.stories.every((story) => story.walls.length === 0)) return writePdf(text);
  const plans = planPages(building);
  return writePdf([
    ...text,
    ...plans.contents.map((content) => ({ content, width: plans.width, height: plans.height })),
  ]);
}
