import { describe, expect, it } from "vitest";
import { emptyBuilding } from "../src/model/building";
import { parseBuilding, serializeBuilding } from "../src/model/file";
import {
  areaSize,
  fenceLength,
  newArea,
  newFence,
  newTree,
  outdoorLivingArea,
} from "../src/model/outdoor";
import { copyItems, moveFromOrigin, moveOrigin, pasteClip, removeItems } from "../src/model/plan";
import { planToDxf } from "../src/export/dxf";
import { planToPdf } from "../src/export/pdf";
import { planToSvg } from "../src/export/svg";
import { withFurniture } from "../src/export/context";

const square = (size: number, x = 0, y = 0) => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
];

describe("outdoor areas, fences, and trees", () => {
  it("gives a new area the defaults of its kind, a balcony with railings on all sides", () => {
    const terrace = newArea("terrace", square(4));
    expect(terrace).toMatchObject({ kind: "terrace", level: 0, thickness: 0.2, railings: [] });
    expect(newArea("balcony", square(2)).railings).toEqual([0, 1, 2, 3]);
    expect(newArea("neighbor", square(8)).thickness).toBe(6);
    expect(areaSize(terrace)).toBeCloseTo(16);
  });

  it("counts a quarter of a terrace and a balcony as living area, and no path or lawn", () => {
    const plan = emptyBuilding().stories[0];
    plan.areas.push(newArea("terrace", square(4)), newArea("balcony", square(2, 10)));
    plan.areas.push(newArea("lawn", square(10, 20)), newArea("path", square(3, 40)));
    expect(outdoorLivingArea(plan)).toBeCloseTo((16 + 4) / 4);
  });

  it("removes a corner of an area, and keeps the railings of the other sides", () => {
    const plan = emptyBuilding().stories[0];
    const area = newArea("balcony", [...square(4), { x: -1, y: 2 }]);
    plan.areas.push(area);
    removeItems(plan, [{ kind: "area-corner", id: `${area.id}:1` }]);
    expect(plan.areas[0].points).toHaveLength(4);
    expect(plan.areas[0].railings).toEqual([0, 1, 2, 3]);
    // A triangle keeps its corners.
    removeItems(plan, [
      { kind: "area-corner", id: `${area.id}:0` },
      { kind: "area-corner", id: `${area.id}:1` },
    ]);
    expect(plan.areas[0].points.length).toBeGreaterThanOrEqual(3);
  });

  it("moves, copies, and removes areas, fences, and trees", () => {
    const plan = emptyBuilding().stories[0];
    const area = newArea("terrace", square(4));
    const fence = newFence("hedge", [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ]);
    const tree = newTree({ x: 2, y: 8 });
    plan.areas.push(area);
    plan.fences.push(fence);
    plan.trees.push(tree);
    const items = [
      { kind: "area" as const, id: area.id },
      { kind: "fence" as const, id: fence.id },
      { kind: "tree" as const, id: tree.id },
    ];
    moveFromOrigin(plan, moveOrigin(plan, items), { x: 1, y: 2 });
    expect(plan.areas[0].points[0]).toEqual({ x: 1, y: 2 });
    expect(plan.fences[0].points[1]).toEqual({ x: 6, y: 2 });
    expect(plan.trees[0]).toMatchObject({ x: 3, y: 10 });
    expect(fenceLength(plan.fences[0])).toBeCloseTo(5);
    const pasted = pasteClip(plan, copyItems(plan, items), { x: 10, y: 0 });
    expect(pasted.map((i) => i.kind)).toEqual(["area", "fence", "tree"]);
    expect(plan.areas).toHaveLength(2);
    expect(plan.areas[1].id).not.toBe(area.id);
    removeItems(plan, items);
    expect([plan.areas.length, plan.fences.length, plan.trees.length]).toEqual([1, 1, 1]);
  });

  it("keeps the outdoor parts in the file, and reads a file without them", () => {
    const building = emptyBuilding();
    const story = building.stories[0];
    story.areas.push({
      ...newArea("pool", square(3)),
      name: "Pool",
      note: { text: "Heated", photos: [] },
    });
    story.fences.push(newFence("wall", square(2)));
    story.trees.push({ ...newTree({ x: 1, y: 1 }), deciduous: false });
    const read = parseBuilding(serializeBuilding(building)).stories[0];
    expect(read.areas[0]).toMatchObject({ kind: "pool", name: "Pool", thickness: 1.5 });
    expect(read.areas[0].note?.text).toBe("Heated");
    expect(read.fences[0].kind).toBe("wall");
    expect(read.trees[0].deciduous).toBe(false);

    const old = JSON.parse(serializeBuilding(emptyBuilding()));
    for (const s of old.stories) {
      delete s.areas;
      delete s.fences;
      delete s.trees;
    }
    const plain = parseBuilding(JSON.stringify(old)).stories[0];
    expect([plain.areas, plain.fences, plain.trees]).toEqual([[], [], []]);
  });

  it("takes the defaults of the kind for broken values in a file", () => {
    const building = emptyBuilding();
    building.stories[0].areas.push(newArea("lawn", square(3)));
    const data = JSON.parse(serializeBuilding(building));
    Object.assign(data.stories[0].areas[0], { kind: "nothing", thickness: "x", railings: [7, 1] });
    const area = parseBuilding(JSON.stringify(data)).stories[0].areas[0];
    expect(area).toMatchObject({ kind: "terrace", thickness: 0.2, railings: [1] });
  });

  it("draws the outdoor parts in the exports, and fits the plan around them", () => {
    const plan = emptyBuilding().stories[0];
    plan.areas.push({ ...newArea("terrace", square(4)), name: "South terrace" });
    plan.fences.push(
      newFence("hedge", [
        { x: 0, y: 6 },
        { x: 8, y: 6 },
      ]),
    );
    plan.trees.push(newTree({ x: 20, y: 0 }));
    // The crown of the tree (5 m) is in the box of the plan.
    expect(withFurniture(null, plan)).toMatchObject({ minX: 0, maxX: 22.5, minY: -2.5 });
    const svg = planToSvg(plan, { translate: (text) => `[${text}]` });
    expect(svg).toContain('id="outdoor"');
    expect(svg).toContain("South terrace · 16");
    expect(svg).toContain('id="fences"');
    expect(svg).toContain('id="trees"');
    // Without a name, the kind names the area, in the language of the app.
    plan.areas[0].name = "";
    expect(planToSvg(plan, { translate: (text) => `[${text}]` })).toContain("[Terrace] · 16");
    const dxf = planToDxf(plan);
    for (const layer of ["OUTDOOR", "FENCES", "TREES"]) expect(dxf).toContain(layer);
    const pdf = new TextDecoder("latin1").decode(planToPdf(plan));
    expect(pdf).toContain("Terrace");
  });
});
