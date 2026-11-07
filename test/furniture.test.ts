import { describe, expect, it } from "vitest";
import { emptyBuilding } from "../src/model/building";
import { parseBuilding, serializeBuilding } from "../src/model/file";
import {
  furnitureOutline,
  furnitureSymbol,
  GENERIC_TYPES,
  genericBlocks,
  insideFurniture,
  newFurniture,
  snapToWall,
  toLocal,
  toPlan,
  wallFaces,
} from "../src/model/furniture";
import {
  addVertex,
  addWall,
  copyItems,
  emptyPlan,
  moveFromOrigin,
  moveOrigin,
  pasteClip,
  removeItems,
} from "../src/model/plan";
import type { Furniture, Plan } from "../src/model/types";

const sofa = (x = 0, y = 0, rotation = 0): Furniture => ({
  ...newFurniture({ kind: "generic", type: "sofa" }, { x, y }),
  rotation,
});

/** A room of 6 m × 4 m with walls of 0.2 m. Its top wall is on y = 0. */
function room(): Plan {
  const plan = emptyPlan();
  const v = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 4 },
    { x: 0, y: 4 },
  ].map((p) => addVertex(plan, p));
  for (let i = 0; i < 4; i++) addWall(plan, v[i].id, v[(i + 1) % 4].id);
  return plan;
}

describe("the frame of a piece", () => {
  it("turns a local point to the plan and back", () => {
    const piece = sofa(3, 2, 37);
    const local = { x: 0.4, y: -0.3 };
    const back = toLocal(piece, toPlan(piece, local));
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
  });

  it("turns clockwise on the plan", () => {
    // A rotation of 90° turns the local +x axis to the plan +y axis (down on the screen).
    const p = toPlan(sofa(0, 0, 90), { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  it("gives the box and finds the points inside it", () => {
    const piece = sofa(1, 1, 90);
    const outline = furnitureOutline(piece);
    expect(outline).toHaveLength(4);
    // Turned by 90°, the sofa of 2.2 × 0.9 m covers 0.9 m in x and 2.2 m in y.
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2.2);
    expect(insideFurniture(piece, { x: 1, y: 2 })).toBe(true);
    expect(insideFurniture(piece, { x: 2, y: 1 })).toBe(false);
  });
});

describe("symbols and blocks", () => {
  it("starts each symbol with the box of the piece", () => {
    for (const type of ["sofa", "bed-double", "toilet", "hob", "wardrobe", "box"]) {
      const piece = newFurniture({ kind: "generic", type }, { x: 2, y: 3 });
      const symbol = furnitureSymbol(piece);
      const box = symbol.shapes[0];
      const xs = box.map((p) => p.x);
      const ys = box.map((p) => p.y);
      expect(Math.min(...xs), type).toBeCloseTo(2 - piece.width / 2);
      expect(Math.max(...xs), type).toBeCloseTo(2 + piece.width / 2);
      // A toilet starts with its tank, which is at the back of the box.
      if (type !== "toilet") expect(Math.max(...ys), type).toBeCloseTo(3 + piece.depth / 2);
      expect(Math.min(...ys), type).toBeCloseTo(3 - piece.depth / 2);
    }
  });

  it("keeps the 3D blocks of each generic type inside the box", () => {
    for (const t of GENERIC_TYPES) {
      const blocks = genericBlocks(t.type, t.width, t.depth, t.height);
      expect(blocks.length, t.type).toBeGreaterThan(0);
      for (const b of blocks) {
        const where = `${t.type}: ${JSON.stringify(b)}`;
        expect(b.x0, where).toBeGreaterThanOrEqual(-t.width / 2 - 1e-9);
        expect(b.x1, where).toBeLessThanOrEqual(t.width / 2 + 1e-9);
        expect(b.y0, where).toBeGreaterThanOrEqual(-t.depth / 2 - 1e-9);
        expect(b.y1, where).toBeLessThanOrEqual(t.depth / 2 + 1e-9);
        expect(b.z0, where).toBeGreaterThanOrEqual(-1e-9);
        expect(b.z1, where).toBeLessThanOrEqual(t.height + 1e-9);
        expect(b.x1, where).toBeGreaterThan(b.x0);
        expect(b.y1, where).toBeGreaterThan(b.y0);
        expect(b.z1, where).toBeGreaterThan(b.z0);
      }
    }
  });
});

describe("snap to a wall", () => {
  it("puts the back of a sofa against the top wall", () => {
    const plan = room();
    const piece = sofa();
    const snap = snapToWall(piece, { x: 3, y: 0.6 }, wallFaces(plan), 0.5)!;
    expect(snap).not.toBeNull();
    // The face of the top wall is at y = 0.1. The sofa is 0.9 m deep, so its center is at 0.55.
    expect(snap.x).toBeCloseTo(3);
    expect(snap.y).toBeCloseTo(0.55);
    // The front (+y) of the sofa points into the room, so it needs no rotation.
    expect(((snap.rotation % 360) + 360) % 360).toBeCloseTo(0);
    const moved = { ...piece, ...snap };
    const top = Math.min(...furnitureOutline(moved).map((p) => p.y));
    expect(top).toBeCloseTo(0.1);
  });

  it("turns the back of a piece to the right wall", () => {
    const snap = snapToWall(sofa(), { x: 5.5, y: 2 }, wallFaces(room()), 0.5)!;
    // The front must point to -x, into the room: the local +y axis turns to (-1, 0).
    const front = toPlan({ ...sofa(), x: 0, y: 0, rotation: snap.rotation }, { x: 0, y: 1 });
    expect(front.x).toBeCloseTo(-1);
    expect(front.y).toBeCloseTo(0);
    expect(snap.x).toBeCloseTo(6 - 0.1 - 0.45);
  });

  it("does not snap to a wall from behind it, or far from it", () => {
    const faces = wallFaces(room());
    // Outside the room, above the top wall: the inner face is behind the point, and the outer
    // face takes it. The piece must then stand outside, with its front up.
    const outside = snapToWall(sofa(), { x: 3, y: -0.4 }, faces, 0.5)!;
    expect(outside.y).toBeLessThan(-0.1);
    expect(snapToWall(sofa(), { x: 3, y: 2 }, faces, 0.5)).toBeNull();
  });
});

describe("furniture in the plan", () => {
  it("copies, pastes, moves, and removes furniture", () => {
    const plan = room();
    const piece = sofa(2, 2, 30);
    plan.furniture.push(piece);
    const items = [{ kind: "furniture" as const, id: piece.id }];
    const clip = copyItems(plan, items);
    expect(clip.furniture).toHaveLength(1);
    const pasted = pasteClip(plan, clip, { x: 1, y: 0 });
    expect(plan.furniture).toHaveLength(2);
    expect(plan.furniture[1]).toMatchObject({ x: 3, y: 2, rotation: 30, name: "Sofa" });
    expect(plan.furniture[1].id).not.toBe(piece.id);

    moveFromOrigin(plan, moveOrigin(plan, items), { x: 0, y: 1 });
    expect(plan.furniture[0]).toMatchObject({ x: 2, y: 3 });
    removeItems(plan, pasted);
    expect(plan.furniture).toHaveLength(1);
  });

  it("reads what it writes, with furniture and a model", () => {
    const building = emptyBuilding();
    building.models.push({
      id: "m1",
      name: "Lamp",
      origin: "polyhaven",
      ref: "lamp_01",
      data: "data:model/gltf-binary;base64,AAAA",
      size: { x: 0.3, y: 0.3, z: 1.6 },
      license: "CC0",
      credit: "Poly Haven",
    });
    const story = building.stories[0];
    story.furniture.push(sofa(1, 1, 90));
    story.furniture.push({
      ...newFurniture({ kind: "model", modelId: "m1" }, { x: 2, y: 2 }, building.models[0]),
      elevation: 0.2,
    });
    expect(parseBuilding(serializeBuilding(building))).toEqual(building);
  });

  it("rejects furniture with a model that does not exist", () => {
    const building = emptyBuilding();
    building.stories[0].furniture.push(
      newFurniture({ kind: "model", modelId: "missing" }, { x: 0, y: 0 }),
    );
    expect(() => parseBuilding(serializeBuilding(building))).toThrow("does not exist");
  });
});
