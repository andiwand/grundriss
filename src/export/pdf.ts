// Exports the plan as a vector PDF at a standard scale. A small writer makes the PDF, so the app
// needs no PDF library. The page is A4 or A3, in portrait or landscape.

import { centroid } from "../model/geometry";
import { dimensionShape, openingShape, planBounds, wallOutline, type Arc } from "../model/drawing";
import { findRooms } from "../model/rooms";
import type { Plan, Point } from "../model/types";

const MM = 72 / 25.4;
const MARGIN = 15 * MM;
/** The space for the title line at the bottom of the page. */
const FOOTER = 10 * MM;
const PAPERS = [
  { name: "A4", width: 210 * MM, height: 297 * MM },
  { name: "A3", width: 297 * MM, height: 420 * MM },
];
export const SCALES = [20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/** The font size in points of the room areas and of the dimensions. */
const TEXT_SIZE = 8;
const TITLE_SIZE = 9;

export interface PageLayout {
  paper: string;
  landscape: boolean;
  /** The page size in points. */
  width: number;
  height: number;
  /** The scale is 1 : denominator. */
  denominator: number;
}

/**
 * Finds the page and the scale for a plan of the given size in meters. It takes the largest
 * standard scale that fits on A4. If A4 needs a scale smaller than 1:100 and A3 gives a larger
 * scale, it takes A3.
 */
export function chooseLayout(width: number, height: number): PageLayout {
  const best = (paper: (typeof PAPERS)[number]): PageLayout => {
    let result: PageLayout | null = null;
    for (const landscape of [false, true]) {
      const pageWidth = landscape ? paper.height : paper.width;
      const pageHeight = landscape ? paper.width : paper.height;
      const room = { x: pageWidth - 2 * MARGIN, y: pageHeight - 2 * MARGIN - FOOTER };
      // 1 m on the page at 1:N is 1000 / N millimeters.
      const denominator =
        SCALES.find(
          (d) => (width * 1000 * MM) / d <= room.x && (height * 1000 * MM) / d <= room.y,
        ) ?? SCALES[SCALES.length - 1];
      if (!result || denominator < result.denominator) {
        result = {
          paper: paper.name,
          landscape,
          width: pageWidth,
          height: pageHeight,
          denominator,
        };
      }
    }
    return result!;
  };
  const a4 = best(PAPERS[0]);
  const a3 = best(PAPERS[1]);
  return a4.denominator > 100 && a3.denominator < a4.denominator ? a3 : a4;
}

/** The widths of the Helvetica glyphs in 1/1000 of the font size. Other glyphs use 556. */
const WIDTHS: Record<string, number> = {
  " ": 278,
  ".": 278,
  ",": 278,
  ":": 278,
  "·": 278,
  "²": 333,
  m: 833,
  i: 222,
  l: 222,
  r: 333,
  s: 500,
  "(": 333,
  ")": 333,
};
const textWidth = (text: string, size: number) =>
  ([...text].reduce((sum, c) => sum + (WIDTHS[c] ?? 556), 0) * size) / 1000;

const n = (value: number) => String(Math.round(value * 100) / 100);

/** Puts a text into a PDF string literal. The characters must be in Latin-1 (WinAnsi). */
const literal = (text: string) => `(${text.replace(/[\\()]/g, (c) => `\\${c}`)})`;

/** A path of up to 90 degrees as one cubic Bézier curve. It gives the curve after the move. */
function arcCurve(arc: Arc, map: (p: Point) => Point): string {
  const a0 = Math.atan2(arc.from.y - arc.center.y, arc.from.x - arc.center.x);
  let a1 = Math.atan2(arc.to.y - arc.center.y, arc.to.x - arc.center.x);
  // Sweep 1 turns to larger angles in the plan axes.
  if (arc.sweep === 1 && a1 < a0) a1 += 2 * Math.PI;
  if (arc.sweep === 0 && a1 > a0) a1 -= 2 * Math.PI;
  const k = (4 / 3) * Math.tan((a1 - a0) / 4);
  const r = arc.radius;
  const c1 = {
    x: arc.from.x - k * r * Math.sin(a0),
    y: arc.from.y + k * r * Math.cos(a0),
  };
  const c2 = {
    x: arc.to.x + k * r * Math.sin(a1),
    y: arc.to.y - k * r * Math.cos(a1),
  };
  const [p1, p2, p3] = [c1, c2, arc.to].map(map);
  return `${n(p1.x)} ${n(p1.y)} ${n(p2.x)} ${n(p2.y)} ${n(p3.x)} ${n(p3.y)} c`;
}

export function planToPdf(plan: Plan): Uint8Array {
  const box = planBounds(plan) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const planWidth = box.maxX - box.minX;
  const planHeight = box.maxY - box.minY;
  const layout = chooseLayout(planWidth, planHeight);
  const k = (1000 * MM) / layout.denominator;
  // The plan is in the middle of the drawing area. The PDF y axis points up.
  const areaWidth = layout.width - 2 * MARGIN;
  const areaHeight = layout.height - 2 * MARGIN - FOOTER;
  const left = MARGIN + (areaWidth - planWidth * k) / 2;
  const top = layout.height - MARGIN - (areaHeight - planHeight * k) / 2;
  const map = (p: Point): Point => ({
    x: left + (p.x - box.minX) * k,
    y: top - (p.y - box.minY) * k,
  });

  const ops: string[] = [];
  const polygon = (points: Point[]) => {
    const [first, ...rest] = points.map(map);
    ops.push(`${n(first.x)} ${n(first.y)} m`);
    for (const p of rest) ops.push(`${n(p.x)} ${n(p.y)} l`);
    ops.push("h");
  };
  const line = (a: Point, b: Point) => {
    const [p, q] = [map(a), map(b)];
    ops.push(`${n(p.x)} ${n(p.y)} m ${n(q.x)} ${n(q.y)} l S`);
  };
  const text = (at: Point, value: string, size: number, angle = 0) => {
    // The angle is in the plan axes (y down), so the PDF rotation has the other sign.
    const p = map(at);
    const rad = (-angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const half = textWidth(value, size) / 2;
    // The text starts at the left of its center, and its middle is on the point.
    const x = p.x - cos * half + sin * size * 0.35;
    const y = p.y - sin * half - cos * size * 0.35;
    ops.push(
      `BT /F1 ${size} Tf ${n(cos)} ${n(sin)} ${n(-sin)} ${n(cos)} ${n(x)} ${n(y)} Tm ` +
        `${literal(value)} Tj ET`,
    );
  };

  const rooms = findRooms(plan);
  ops.push("0.945 0.902 0.824 rg");
  for (const room of rooms) {
    polygon(room.polygon);
    ops.push("f");
  }

  ops.push("0.149 0.173 0.220 rg");
  for (const wall of plan.walls) {
    const outline = wallOutline(plan, wall);
    if (outline.length === 0) continue;
    polygon(outline);
    ops.push("f");
  }

  ops.push("1 g 0.149 0.173 0.220 RG 0.5 w 1 J");
  for (const opening of plan.openings) {
    const shape = openingShape(plan, opening);
    if (!shape) continue;
    polygon(shape.gap);
    ops.push("B");
    if (shape.kind === "door") {
      ops.push("0.8 w");
      line(shape.hinge, shape.leaf);
      ops.push("0.4 w [2 1.5] 0 d");
      const from = map(shape.arc.from);
      ops.push(`${n(from.x)} ${n(from.y)} m ${arcCurve(shape.arc, map)} S`);
      ops.push("[] 0 d 0.5 w");
    } else {
      ops.push("0.227 0.557 0.902 RG 1 w");
      line(...shape.glass);
      ops.push("0.149 0.173 0.220 RG 0.5 w");
    }
  }

  ops.push("0.478 0.396 0.259 rg");
  for (const room of rooms) text(centroid(room.polygon), `${room.area.toFixed(2)} m²`, TEXT_SIZE);

  ops.push("0.184 0.420 1 RG 0.184 0.420 1 rg 0.4 w");
  for (const dimension of plan.dimensions) {
    const shape = dimensionShape(dimension);
    for (const [a, b] of [shape.line, ...shape.extensions, ...shape.ticks]) line(a, b);
    // The text stands on the side of the line that is away from the measured points.
    const gap = (TEXT_SIZE * 0.8) / k;
    const at = {
      x: shape.textAt.x + shape.normal.x * gap,
      y: shape.textAt.y + shape.normal.y * gap,
    };
    text(at, shape.text, TEXT_SIZE, shape.angle);
  }

  const title = `Grundriss · 1:${layout.denominator} · ${layout.paper}`;
  ops.push(`0.4 g BT /F1 ${TITLE_SIZE} Tf ${n(MARGIN)} ${n(MARGIN)} Td ${literal(title)} Tj ET`);

  return writePdf(ops.join("\n"), layout.width, layout.height);
}

/** Writes a PDF with one page and the font Helvetica. The text must be in Latin-1. */
export function writePdf(content: string, width: number, height: number): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] ` +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  // The header has a comment with bytes above 127, so that programs treat the file as binary.
  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Each character is one byte in Latin-1, so the string length is the byte offset.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
