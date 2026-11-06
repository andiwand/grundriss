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
import { riseOf, type StoryExtras } from "./context";
import { findRooms, roomLabel } from "../model/rooms";

import type { Plan, Point } from "../model/types";

const MARGIN = 0.5;
const COLORS = {
  wall: "#262c38",
  room: "#f1e6d2",
  roomText: "#7a6542",
  glass: "#3a8ee6",
  dimension: "#2f6bff",
  paper: "#ffffff",
  stair: "#4b5363",
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
  const box = planBounds(plan) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const through = options.through ?? [];
  for (const chimney of through) {
    for (const p of chimneySymbol(chimney).outline) {
      box.minX = Math.min(box.minX, p.x);
      box.minY = Math.min(box.minY, p.y);
      box.maxX = Math.max(box.maxX, p.x);
      box.maxY = Math.max(box.maxY, p.y);
    }
  }
  const background = options.background ? plan.background : null;
  if (background) {
    box.minX = Math.min(box.minX, background.x);
    box.minY = Math.min(box.minY, background.y);
    box.maxX = Math.max(box.maxX, background.x + background.width * background.scale);
    box.maxY = Math.max(box.maxY, background.y + background.height * background.scale);
  }
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
