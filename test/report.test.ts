import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { csv, CSV_DE, takeoffZip } from "../src/export/csv";
import { buildingReport } from "../src/export/report";
import { emptyBuilding } from "../src/model/building";
import { makeHouse } from "../src/model/example";
import { buildingTakeoff } from "../src/model/takeoff";
import type { Climate } from "../src/model/types";
import vienna from "./fixtures/vienna-climate.json";

const latin1 = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const number = (value: number, digits = 1) => value.toFixed(digits);

describe("quantities", () => {
  it("lists the rooms, the openings by size, the envelope, and the materials", () => {
    const takeoff = buildingTakeoff(makeHouse());
    expect(takeoff.rooms.length).toBeGreaterThan(5);
    for (const room of takeoff.rooms) {
      expect(room.netArea).toBeLessThan(room.area);
      expect(room.livingArea).toBeLessThanOrEqual(room.netArea + 1e-9);
    }
    const count = takeoff.openings.reduce((s, o) => s + o.count, 0);
    const all = makeHouse().stories.reduce((s, st) => s + st.openings.length, 0);
    expect(count).toBe(all);
    expect(takeoff.envelope.walls).toBeGreaterThan(50);
    expect(takeoff.envelope.grossFloor).toBeGreaterThan(takeoff.envelope.netFloor);
    // Each material has the area of its part times its thickness as its volume.
    for (const m of takeoff.materials) expect(m.volume).toBeCloseTo(m.area * m.thickness);
  });

  it("writes CSV with quotes, and with ';' and ',' for German", () => {
    expect(csv([["a,b", 'q"', 1.5]])).toBe('﻿"a,b","q""",1.5\r\n');
    expect(csv([["a", 1.5]], CSV_DE)).toBe("﻿a;1,5\r\n");
  });

  it("protects a text that starts like a formula, but not a number", () => {
    expect(csv([["=HYPERLINK(1)", "@x", "+1", -2]])).toBe("\uFEFF'=HYPERLINK(1),'@x,'+1,-2\r\n");
  });

  it("puts five CSV files in the ZIP", () => {
    const files = unzipSync(takeoffZip(buildingTakeoff(makeHouse())));
    expect(Object.keys(files).sort()).toEqual([
      "envelope.csv",
      "materials.csv",
      "openings.csv",
      "rooms.csv",
      "services.csv",
    ]);
    expect(strFromU8(files["rooms.csv"])).toContain("Net area");
  });
});

describe("report", () => {
  it("writes a PDF with text pages and the plan pages", () => {
    const building = makeHouse();
    building.climate = vienna as Climate;
    const pdf = latin1(
      buildingReport(building, { title: "Report", name: "Example", date: "2026-11-08", number }),
    );
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("(Areas) Tj");
    expect(pdf).toContain("(Heat loss and heating) Tj");
    expect(pdf).toContain("(Energy per year) Tj");
    // A4 text pages and the plan pages.
    const pages = [...pdf.matchAll(/\/Type \/Page /g)].length;
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(pdf).toContain("/MediaBox [0 0 595.28 841.89]");
  });

  it("breaks a long word, and gives an empty plan no plan page", () => {
    const building = makeHouse();
    building.stories[0].rooms[0].name = "W".repeat(300);
    const pdf = latin1(buildingReport(building, { title: "R", name: "N", date: "d", number }));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    const empty = latin1(
      buildingReport(emptyBuilding(), { title: "R", name: "N", date: "d", number }),
    );
    // Only the A4 text page: no plan page of an empty story.
    expect([...empty.matchAll(/\/Type \/Page /g)]).toHaveLength(1);
  });

  it("writes a report without a climate", () => {
    const pdf = latin1(
      buildingReport(makeHouse(), { title: "Report", name: "X", date: "today", number }),
    );
    expect(pdf).toContain("no climate");
  });
});
