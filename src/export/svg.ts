// Exports the plan as a standalone SVG file. The units of the drawing are meters, and the styles
// are inline, so the file looks the same in each program.

import {
  chimneySymbol,
  dimensionShape,
  northArrow,
  openingShape,
  planBounds,
  stairDrawing,
  wallOutline,
} from "../model/drawing";
import { furnitureSymbol } from "../model/furniture";
import { fixtureSymbol, runKind, SERVICE_SYSTEMS } from "../model/services";
import { grow, riseOf, withFurniture, type StoryExtras } from "./context";
import { findRooms, roomLabel } from "../model/rooms";

import type { Plan, Point, ServiceSystem } from "../model/types";

const MARGIN = 0.5;
/** The colors of the devices of each system. The lines use the colors of their kinds. */
export const SERVICE_COLORS = Object.fromEntries(
  SERVICE_SYSTEMS.map((s) => [s.system, s.color]),
) as Record<ServiceSystem, string>;

const COLORS = {
  wall: "#262c38",
  room: "#f1e6d2",
  roomText: "#7a6542",
  glass: "#3a8ee6",
  dimension: "#2f6bff",
  paper: "#ffffff",
  stair: "#4b5363",
  furniture: "#5b6474",
  /** The fill of the box of a piece, so that it covers the room fill. */
  furnitureFill: "#fbfaf7",
  furnitureDetail: "#eceae4",
  /** A chimney of a story below that passes through. */
  through: "#9aa1ad",
};

const n = (value: number) => String(Math.round(value * 1e4) / 1e4);
const points = (polygon: Point[]) => polygon.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The height of the text in meters. It grows with the plan, so that a large plan stays legible. */
export function textSize(plan: Plan): number {
  const box = planBounds(plan);
  if (!box) return 0.2;
  const size = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  return Math.min(0.6, Math.max(0.15, size / 60));
}

export interface SvgOptions extends StoryExtras {
  background?: boolean;
}

export function planToSvg(plan: Plan, options: SvgOptions = {}): string {
  const through = options.through ?? [];
  const background = options.background ? plan.background : null;
  const corners = background
    ? [
        { x: background.x, y: background.y },
        {
          x: background.x + background.width * background.scale,
          y: background.y + background.height * background.scale,
        },
      ]
    : [];
  const box = grow(withFurniture(planBounds(plan), plan), [
    ...through.flatMap((chimney) => chimneySymbol(chimney).outline),
    ...corners,
  ]) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const font = textSize(plan);
  const line = font / 12;
  // The north arrow stands in a column on the right of the plan.
  const arrowSize = font * 3;
  if (options.north !== undefined) box.maxX += arrowSize * 2;
  const plainRight = box.maxX - (options.north !== undefined ? arrowSize * 2 : 0);
  const x = box.minX - MARGIN;
  const y = box.minY - MARGIN;
  const width = box.maxX - box.minX + 2 * MARGIN;
  const height = box.maxY - box.minY + 2 * MARGIN;
  const out: string[] = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(x)} ${n(y)} ${n(width)} ${n(height)}" ` +
      `width="${n(width * 100)}cm" height="${n(height * 100)}cm" ` +
      `font-family="Helvetica, Arial, sans-serif">`,
  );
  out.push(`<title>Grundriss plan</title>`);
  out.push(
    `<rect x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" fill="${COLORS.paper}"/>`,
  );
  if (background) {
    out.push(
      `<image href="${escape(background.image)}" x="${n(background.x)}" y="${n(background.y)}" ` +
        `width="${n(background.width * background.scale)}" ` +
        `height="${n(background.height * background.scale)}" ` +
        `opacity="${n(background.opacity)}" preserveAspectRatio="none"/>`,
    );
  }

  const rooms = findRooms(plan);
  out.push(`<g id="rooms" fill="${COLORS.room}" stroke="none">`);
  for (const room of rooms) out.push(`<polygon points="${points(room.polygon)}"/>`);
  out.push(`</g>`);

  // The furniture is above the rooms and below the walls.
  if (plan.furniture.length > 0) {
    out.push(
      `<g id="furniture" stroke="${COLORS.furniture}" stroke-width="${n(line)}" ` +
        `stroke-linejoin="round">`,
    );
    for (const piece of plan.furniture) {
      const symbol = furnitureSymbol(piece);
      symbol.shapes.forEach((shape, i) => {
        const fill = i === 0 ? COLORS.furnitureFill : COLORS.furnitureDetail;
        out.push(`<polygon points="${points(shape)}" fill="${fill}"/>`);
      });
      for (const [a, b] of symbol.lines) {
        out.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}"/>`);
      }
      // A piece with a model has no plan symbol, so its name tells what it is.
      if (piece.source.kind === "model" && piece.name) {
        out.push(
          `<text x="${n(piece.x)}" y="${n(piece.y)}" stroke="none" fill="${COLORS.furniture}" ` +
            `font-size="${n(font * 0.7)}" text-anchor="middle" dominant-baseline="middle">` +
            `${escape(piece.name)}</text>`,
        );
      }
    }
    out.push(`</g>`);
  }

  out.push(`<g id="walls" fill="${COLORS.wall}" stroke="none">`);
  for (const wall of plan.walls) {
    const outline = wallOutline(plan, wall);
    if (outline.length > 0) out.push(`<polygon points="${points(outline)}"/>`);
  }
  out.push(`</g>`);

  out.push(
    `<g id="openings" fill="none" stroke="${COLORS.wall}" stroke-width="${n(line)}" ` +
      `stroke-linecap="round">`,
  );
  for (const opening of plan.openings) {
    const shape = openingShape(plan, opening);
    if (!shape) continue;
    out.push(`<polygon points="${points(shape.gap)}" fill="${COLORS.paper}"/>`);
    if (shape.kind === "door") {
      const { hinge, leaf, arc } = shape;
      out.push(
        `<line x1="${n(hinge.x)}" y1="${n(hinge.y)}" x2="${n(leaf.x)}" y2="${n(leaf.y)}" ` +
          `stroke-width="${n(line * 1.5)}"/>`,
      );
      out.push(
        `<path d="M ${n(arc.from.x)} ${n(arc.from.y)} A ${n(arc.radius)} ${n(arc.radius)} 0 0 ` +
          `${arc.sweep} ${n(arc.to.x)} ${n(arc.to.y)}" stroke-dasharray="${n(line * 4)} ${n(line * 3)}"/>`,
      );
    } else {
      const [s, e] = shape.glass;
      out.push(
        `<line x1="${n(s.x)}" y1="${n(s.y)}" x2="${n(e.x)}" y2="${n(e.y)}" ` +
          `stroke="${COLORS.glass}" stroke-width="${n(line * 2)}"/>`,
      );
    }
  }
  out.push(`</g>`);

  out.push(
    `<g id="room-labels" fill="${COLORS.roomText}" font-size="${n(font)}" text-anchor="middle" ` +
      `dominant-baseline="middle">`,
  );
  for (const room of rooms) {
    const lines = roomLabel(room);
    lines.forEach((text, i) => {
      // The lines stack around the label point, one line height apart.
      const y = room.labelAt.y + (i - (lines.length - 1) / 2) * font * 1.25;
      out.push(`<text x="${n(room.labelAt.x)}" y="${n(y)}">${escape(text)}</text>`);
    });
  }
  out.push(`</g>`);

  // The building services are above the furniture, the walls, and the room labels, and below
  // the dimensions. Each line has the color of its kind.
  if (plan.runs.length > 0 || plan.fixtures.length > 0) {
    out.push(
      `<g id="services" fill="none" stroke-width="${n(line * 1.5)}" stroke-linecap="round" ` +
        `stroke-linejoin="round">`,
    );
    for (const run of plan.runs) {
      if (run.points.length < 2) continue;
      const kind = runKind(run.kind);
      const dash = kind.dashed ? ` stroke-dasharray="${n(line * 6)} ${n(line * 4)}"` : "";
      out.push(`<polyline points="${points(run.points)}" stroke="${kind.color}"${dash}/>`);
    }
    for (const fixture of plan.fixtures) {
      const color = SERVICE_COLORS[fixture.system];
      const symbol = fixtureSymbol(fixture);
      out.push(`<g class="fixture ${escape(fixture.type)}" stroke="${color}">`);
      for (const shape of symbol.shapes) {
        out.push(`<polygon points="${points(shape)}" fill="${COLORS.paper}"/>`);
      }
      for (const polyline of symbol.lines) out.push(`<polyline points="${points(polyline)}"/>`);
      for (const shape of symbol.filled) {
        out.push(`<polygon points="${points(shape)}" fill="${color}"/>`);
      }
      out.push(`</g>`);
    }
    out.push(`</g>`);
  }

  out.push(
    `<g id="dimensions" stroke="${COLORS.dimension}" stroke-width="${n(line)}" ` +
      `fill="${COLORS.dimension}" font-size="${n(font * 0.9)}" text-anchor="middle">`,
  );
  for (const dimension of plan.dimensions) {
    const shape = dimensionShape(dimension);
    const segments = [shape.line, ...shape.extensions, ...shape.ticks];
    for (const [s, e] of segments) {
      out.push(`<line x1="${n(s.x)}" y1="${n(s.y)}" x2="${n(e.x)}" y2="${n(e.y)}"/>`);
    }
    // The text stands on the side of the line that is away from the measured points.
    const at = {
      x: shape.textAt.x + shape.normal.x * font * 0.6,
      y: shape.textAt.y + shape.normal.y * font * 0.6,
    };
    out.push(
      `<text x="${n(at.x)}" y="${n(at.y)}" stroke="none" dominant-baseline="middle" ` +
        `transform="rotate(${n(shape.angle)} ${n(at.x)} ${n(at.y)})">${escape(shape.text)}</text>`,
    );
  }
  out.push(`</g>`);

  if (plan.stairs.length > 0) {
    out.push(
      `<g id="stairs" fill="none" stroke="${COLORS.stair}" stroke-width="${n(line)}" ` +
        `stroke-linecap="round" stroke-linejoin="round">`,
    );
    for (const stair of plan.stairs) {
      const shape = stairDrawing(stair, riseOf(plan, stair, options));
      out.push(`<polygon points="${points(shape.outline)}" fill="${COLORS.paper}"/>`);
      for (const step of shape.steps) out.push(`<polygon points="${points(step)}"/>`);
      out.push(`<polyline points="${points(shape.arrow)}" stroke-width="${n(line * 1.5)}"/>`);
      for (const [a, b] of shape.head) {
        out.push(
          `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" ` +
            `stroke-width="${n(line * 1.5)}"/>`,
        );
      }
    }
    out.push(`</g>`);
  }

  const chimneys = [
    ...through.map((chimney) => ({ chimney, color: COLORS.through })),
    ...plan.chimneys.map((chimney) => ({ chimney, color: COLORS.wall })),
  ];
  if (chimneys.length > 0) {
    out.push(`<g id="chimneys" stroke-width="${n(line * 1.5)}">`);
    for (const { chimney, color } of chimneys) {
      const symbol = chimneySymbol(chimney);
      out.push(
        `<polygon points="${points(symbol.outline)}" fill="${COLORS.paper}" stroke="${color}"/>`,
      );
      for (const [a, b] of symbol.diagonals) {
        out.push(
          `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${color}"/>`,
        );
      }
    }
    out.push(`</g>`);
  }

  if (options.north !== undefined) {
    const at = { x: plainRight + arrowSize, y: box.minY + arrowSize };
    const shape = northArrow(at, arrowSize, options.north);
    out.push(
      `<g id="north" fill="${COLORS.wall}" font-size="${n(font)}" text-anchor="middle" ` +
        `dominant-baseline="middle">`,
    );
    out.push(`<polygon points="${points(shape.arrow)}"/>`);
    out.push(`<text x="${n(shape.label.x)}" y="${n(shape.label.y)}">N</text>`);
    out.push(`</g>`);
  }

  out.push(`</svg>`);
  return out.join("\n") + "\n";
}
