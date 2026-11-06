import { describe, expect, it } from "vitest";
import { planToDxf } from "../src/export/dxf";
import { chooseLayout, planToPdf } from "../src/export/pdf";
import { planToSvg } from "../src/export/svg";
import { addDimension, addOpening, addVertex, addWall, emptyPlan } from "../src/model/plan";
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
