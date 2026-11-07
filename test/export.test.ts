import { describe, expect, it } from "vitest";
import { buildingExports } from "../src/export/building";
import { slug, storyExtras } from "../src/export/context";
import { buildingToDxf, layerPrefix, planToDxf } from "../src/export/dxf";
import { buildingToPdf, chooseLayout, planToPdf } from "../src/export/pdf";
import { planToSvg } from "../src/export/svg";
import { addStoryOnTop, emptyBuilding } from "../src/model/building";
import {
  addChimney,
  addDimension,
  addOpening,
  addStair,
  addVertex,
  addWall,
  emptyPlan,
} from "../src/model/plan";
import { newFurniture } from "../src/model/furniture";
import { newFixture, newRun, runKind } from "../src/model/services";
import type { Plan } from "../src/model/types";

/** A room of 4 m × 3 m with a door, a window, and a dimension line. */
function room(): Plan {
  const plan = emptyPlan();
  const v = [
    addVertex(plan, { x: 0, y: 0 }),
    addVertex(plan, { x: 4, y: 0 }),
    addVertex(plan, { x: 4, y: 3 }),
    addVertex(plan, { x: 0, y: 3 }),
  ];
  const walls = v.map((p, i) => addWall(plan, p.id, v[(i + 1) % 4].id)!);
  addOpening(plan, walls[0].id, "door", 1);
  addOpening(plan, walls[1].id, "window", 1.5);
  addDimension(plan, { x: 0, y: 0 }, { x: 4, y: 0 }, -0.6);
  return plan;
}

const latin1 = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe("SVG export", () => {
  it("writes the walls, the openings, the room, and the dimensions", () => {
    const svg = planToSvg(room());
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    expect(svg.match(/<polygon/g)!.length).toBe(1 + 4 + 2);
    expect(svg).toContain("12.00 m²");
    expect(svg).toContain("4.00 m");
    expect(svg).toContain(" A 0.9 0.9 0 0 0 ");
    expect(svg).not.toContain("<image");
  });

  it("adds the background on request", () => {
    const plan = room();
    plan.background = {
      image: "data:image/png;base64,AAAA",
      width: 100,
      height: 100,
      x: -1,
      y: -1,
      scale: 0.1,
      opacity: 0.5,
    };
    expect(planToSvg(plan, { background: true })).toContain('href="data:image/png;base64,AAAA"');
    expect(planToSvg(plan)).not.toContain("<image");
  });
});

describe("PDF export", () => {
  it("chooses a standard scale and a page", () => {
    expect(chooseLayout(4, 3)).toMatchObject({ paper: "A4", denominator: 20 });
    expect(chooseLayout(12, 8)).toMatchObject({ paper: "A4", denominator: 50 });
    expect(chooseLayout(30, 15)).toMatchObject({ paper: "A3", denominator: 100 });
  });

  it("writes a valid structure", () => {
    const text = latin1(planToPdf(room()));
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.endsWith("%%EOF\n")).toBe(true);
    const startxref = Number(/startxref\n(\d+)\n/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(5);
    entries.forEach((offset, i) => {
      expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true);
    });
    const length = Number(/\/Length (\d+) >>\nstream\n/.exec(text)![1]);
    const start = text.indexOf("stream\n") + "stream\n".length;
    expect(text.slice(start + length, start + length + 10)).toBe("\nendstream");
    expect(text).toContain("(12.00 m²) Tj");
    expect(text).toContain("1:25 · A4");
  });
});

describe("DXF export", () => {
  it("writes R12 with layers and flips y", () => {
    const dxf = planToDxf(room());
    const lines = dxf.trim().split("\n");
    expect(lines.length % 2).toBe(0);
    expect(dxf).toContain("$ACADVER\n1\nAC1009");
    expect(lines.slice(-2)).toEqual(["0", "EOF"]);
    for (const layer of ["WALLS", "OPENINGS", "ROOMS", "DIMENSIONS", "TEXT"]) {
      expect(dxf).toContain(`0\nLAYER\n2\n${layer}\n`);
    }
    expect(dxf).toContain("0\nARC\n8\nOPENINGS\n");
    expect(dxf).toContain("12.00 m2");
    // The corner at plan y = 3 is at DXF y = -3.
    expect(dxf).toContain("\n20\n-3\n");
    // The door swings into the room (plan y > 0, DXF y < 0): the arc goes from -90 to 0 degrees.
    expect(dxf).toMatch(/\n50\n-90\n51\n0\n/);
  });
});

describe("exports of a building", () => {
  function house() {
    const building = emptyBuilding();
    const ground = building.stories[0];
    const v = [
      addVertex(ground, { x: 0, y: 0 }),
      addVertex(ground, { x: 8, y: 0 }),
      addVertex(ground, { x: 8, y: 6 }),
      addVertex(ground, { x: 0, y: 6 }),
    ];
    v.forEach((p, i) => addWall(ground, p.id, v[(i + 1) % 4].id));
    addStair(ground, { x: 1, y: 1 }, { x: 4, y: 1 });
    addChimney(ground, { x: 6, y: 4 });
    const upper = addStoryOnTop(building);
    const u = [addVertex(upper, { x: 0, y: 0 }), addVertex(upper, { x: 8, y: 0 })];
    addWall(upper, u[0].id, u[1].id);
    // The attic has no walls, but the chimney goes up through it.
    addStoryOnTop(building, true);
    building.north = 90;
    return building;
  }

  it("draws stairs, chimneys, and the north arrow in the SVG of a story", () => {
    const building = house();
    const [ground, upper] = building.stories;
    const svg = planToSvg(ground, storyExtras(building, ground));
    expect(svg).toContain('<g id="stairs"');
    expect(svg).toContain('<g id="chimneys"');
    expect(svg).toContain('<g id="north"');
    // 2.75 m of rise with steps of about 18 cm give 15 steps, plus the outline.
    const stairs = svg.slice(svg.indexOf('<g id="stairs"'), svg.indexOf('<g id="chimneys"'));
    expect(stairs.match(/<polygon/g)).toHaveLength(16);
    // The chimney of the ground floor passes through the story above in a lighter color.
    const above = planToSvg(upper, storyExtras(building, upper));
    expect(above).toContain('stroke="#9aa1ad"');
    expect(planToSvg(ground)).not.toContain('<g id="north"');
  });

  it("writes one PDF page for each story with objects, at one scale", () => {
    const pdf = latin1(buildingToPdf(house()));
    expect(pdf).toContain("/Count 3");
    expect(pdf).toContain("(Grundriss · Attic · 1:");
    expect(pdf).toContain("(Grundriss · Ground floor · 1:");
    expect(pdf).toContain("(Grundriss · First floor · 1:");
    const scales = [...pdf.matchAll(/· 1:(\d+) ·/g)].map((m) => m[1]);
    expect(new Set(scales).size).toBe(1);
    // The offsets in the cross-reference table point at the objects.
    const xref = pdf.slice(pdf.lastIndexOf("xref"));
    const offsets = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((offset, i) => expect(pdf.startsWith(`${i + 1} 0 obj`, offset)).toBe(true));
  });

  it("writes an empty building as one page, and skips empty stories", () => {
    expect(latin1(buildingToPdf(emptyBuilding()))).toContain("/Count 1");
    const building = emptyBuilding();
    const ground = building.stories[0];
    addWall(ground, addVertex(ground, { x: 0, y: 0 }).id, addVertex(ground, { x: 3, y: 0 }).id);
    addStoryOnTop(building);
    const pdf = latin1(buildingToPdf(building));
    expect(pdf).toContain("/Count 1");
    expect(pdf).not.toContain("First floor");
  });

  it("puts each story on its own DXF layers", () => {
    const dxf = buildingToDxf(house());
    expect(dxf).toContain("\nGROUND_FLOOR_WALLS\n");
    expect(dxf).toContain("\nFIRST_FLOOR_WALLS\n");
    expect(dxf).toContain("\nGROUND_FLOOR_STAIRS\n");
    expect(dxf).toContain("\nFIRST_FLOOR_CHIMNEYS\n");
    // JavaScript writes "ß" in upper case as "SS".
    expect(layerPrefix("Erdgeschoß 1")).toBe("ERDGESCHOSS_1_");
  });

  it("names the files of the package", () => {
    const files = buildingExports(house(), new Uint8Array([1]));
    expect(Object.keys(files).sort()).toEqual([
      "attic.svg",
      "first-floor.svg",
      "ground-floor.svg",
      "model.glb",
      "plan.dxf",
      "plan.pdf",
    ]);
    expect(Object.keys(buildingExports(house()))).not.toContain("model.glb");
    expect(slug("Erdgeschoß")).toBe("erdgescho");
  });
});

describe("furniture in the exports", () => {
  function furnished(): Plan {
    const plan = room();
    plan.furniture.push(
      { ...newFurniture({ kind: "generic", type: "bed-double" }, { x: 2, y: 1.5 }), id: "f-bed" },
      {
        ...newFurniture({ kind: "model", modelId: "m1" }, { x: 6, y: 1 }),
        id: "f-model",
        name: "Lamp & Co",
      },
    );
    return plan;
  }

  it("draws the furniture in the SVG between the rooms and the walls", () => {
    const svg = planToSvg(furnished());
    const furniture = svg.indexOf('<g id="furniture"');
    expect(furniture).toBeGreaterThan(svg.indexOf('<g id="rooms"'));
    expect(furniture).toBeLessThan(svg.indexOf('<g id="walls"'));
    // Only a piece with a model shows its name, and the name is escaped.
    expect(svg).toContain(">Lamp &amp; Co</text>");
    expect(svg).not.toContain(">Double bed</text>");
    // The model piece is outside the walls, so the view box must reach x = 6.5.
    const [x, , width] = /viewBox="([^"]+)"/.exec(svg)![1].split(" ").map(Number);
    expect(x + width).toBeGreaterThan(6.5);
  });

  it("draws the furniture in the PDF and the DXF", () => {
    const pdf = latin1(planToPdf(furnished()));
    expect(pdf).toContain("(Lamp & Co) Tj");
    const dxf = planToDxf(furnished());
    expect(dxf).toContain("FURNITURE");
    const building = emptyBuilding();
    building.stories[0].furniture.push(...furnished().furniture);
    expect(buildingToDxf(building)).toContain("GROUND_FLOOR_FURNITURE");
  });

  it("does not skip a story with only furniture", () => {
    const building = emptyBuilding();
    const upper = addStoryOnTop(building);
    upper.furniture.push(newFurniture({ kind: "generic", type: "sofa" }, { x: 0, y: 0 }));
    const pdf = latin1(buildingToPdf(building));
    expect(pdf).toContain("First floor");
  });
});

describe("building services in the exports", () => {
  function serviced(): Plan {
    const plan = room();
    plan.fixtures.push(newFixture("socket", { x: 1, y: 0.1 }, 2.4));
    plan.fixtures.push(newFixture("radiator", { x: 2, y: 2.9 }, 2.4));
    plan.runs.push(
      newRun("cable", [
        { x: 1, y: 0.1 },
        { x: 3, y: 0.1 },
      ]),
    );
    plan.runs.push(
      newRun("return", [
        { x: 0.5, y: 2.8 },
        { x: 2, y: 2.8 },
      ]),
    );
    return plan;
  }

  it("draws the lines in their colors and the devices in the SVG, above the walls", () => {
    const svg = planToSvg(serviced());
    expect(svg).toContain(`stroke="${runKind("cable").color}"`);
    // A dashed kind gets a dash pattern.
    expect(svg).toMatch(new RegExp(`stroke="${runKind("return").color}" stroke-dasharray`));
    expect(svg).toContain('class="fixture socket"');
    expect(svg).toContain('class="fixture radiator"');
    expect(svg.indexOf('id="services"')).toBeGreaterThan(svg.indexOf('id="walls"'));
    expect(svg.indexOf('id="services"')).toBeLessThan(svg.indexOf('id="dimensions"'));
  });

  it("draws the services in the PDF, and puts them on their layers in the DXF", () => {
    const pdf = latin1(planToPdf(serviced()));
    // The color of the cable (#e8590c) as PDF stroke color.
    expect(pdf).toContain("0.91 0.35 0.05 RG");
    const dxf = planToDxf(serviced());
    expect(dxf).toContain("\nELECTRIC\n");
    expect(dxf).toContain("\nHEATING\n");
    const building = emptyBuilding();
    building.stories[0].fixtures.push(newFixture("switch", { x: 0, y: 0 }, 2.4));
    expect(buildingToDxf(building)).toContain(`${layerPrefix("Ground floor")}ELECTRIC`);
  });

  it("does not skip a story with only services", () => {
    const building = emptyBuilding();
    building.stories[0].runs.push(
      newRun("flow", [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ]),
    );
    const upper = addStoryOnTop(building);
    upper.fixtures.push(newFixture("light-ceiling", { x: 1, y: 1 }, 2.4));
    const pdf = latin1(buildingToPdf(building));
    expect(pdf).toContain("Ground floor");
    expect(pdf).toContain("First floor");
  });
});

describe("text outside ASCII in the exports", () => {
  function named(): Plan {
    const plan = room();
    plan.furniture.push({
      ...newFurniture({ kind: "model", modelId: "m1" }, { x: 2, y: 1.5 }),
      name: "Küche € – Ж\nzwei",
    });
    return plan;
  }

  it("writes the PDF text in WinAnsi, with one byte for each character", () => {
    const pdf = latin1(planToPdf(named()));
    // "ü" has the same code in Latin-1 and WinAnsi. "€" is 0x80 and "–" is 0x96 in WinAnsi.
    // Helvetica has no "Ж", so it becomes "?".
    expect(pdf).toContain("(Küche \x80 \x96 ?\nzwei) Tj");
  });

  it("writes the DXF text as ASCII on one line", () => {
    const dxf = planToDxf(named());
    expect(dxf).toContain("\n1\nK\\U+00FCche \\U+20AC \\U+2013 \\U+0416 zwei\n");
    expect(dxf.trim().split("\n").length % 2).toBe(0);
  });
});
