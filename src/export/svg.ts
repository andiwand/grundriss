// Exports the plan as a standalone SVG file. The units of the drawing are meters, and the styles
// are inline, so the file looks the same in each program.

import { centroid } from "../model/geometry";
import { dimensionShape, openingShape, planBounds, wallOutline } from "../model/drawing";
import { findRooms } from "../model/rooms";
import type { Plan, Point } from "../model/types";

const MARGIN = 0.5;
const COLORS = {
  wall: "#262c38",
  room: "#f1e6d2",
  roomText: "#7a6542",
  glass: "#3a8ee6",
  dimension: "#2f6bff",
  paper: "#ffffff",
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

export function planToSvg(plan: Plan, options: { background?: boolean } = {}): string {
  const box = planBounds(plan) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const background = options.background ? plan.background : null;
  if (background) {
    box.minX = Math.min(box.minX, background.x);
    box.minY = Math.min(box.minY, background.y);
    box.maxX = Math.max(box.maxX, background.x + background.width * background.scale);
    box.maxY = Math.max(box.maxY, background.y + background.height * background.scale);
  }
  const x = box.minX - MARGIN;
  const y = box.minY - MARGIN;
  const width = box.maxX - box.minX + 2 * MARGIN;
  const height = box.maxY - box.minY + 2 * MARGIN;
  const font = textSize(plan);
  const line = font / 12;
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
    const c = centroid(room.polygon);
    out.push(`<text x="${n(c.x)}" y="${n(c.y)}">${room.area.toFixed(2)} m²</text>`);
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

  out.push(`</svg>`);
  return out.join("\n") + "\n";
}
