// Exports the plan as a vector PDF at a standard scale. A small writer makes the PDF, so the app
// needs no PDF library. The page is A4 or A3, in portrait or landscape. A building gets one page
// for each story, all at the same scale on the same paper.

import {
  chimneySymbol,
  dimensionShape,
  northArrow,
  openingShape,
  planBounds,
  stairDrawing,
  wallOutline,
  type Arc,
} from "../model/drawing";
import { findRooms, roomLabel } from "../model/rooms";
import type { Building, Plan, Point } from "../model/types";
import { furnitureSymbol } from "../model/furniture";
import { fixtureSymbol, runKind } from "../model/services";
import { SERVICE_COLORS } from "./svg";
import {
  grow,
  isEmptyStory,
  riseOf,
  storyExtras,
  withFurniture,
  type Box,
  type StoryExtras,
} from "./context";

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

/** The PDF color operands "r g b" of a CSS hex color like "#e03131". */
export function rgb(hex: string): string {
  const value = parseInt(hex.replace("#", ""), 16);
  const channel = (shift: number) => n(((value >> shift) & 255) / 255);
  return `${channel(16)} ${channel(8)} ${channel(0)}`;
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
/**
 * The widths of the characters 32 to 126 of Helvetica and Helvetica-Bold, in 1/1000 of the font
 * size (the AFM files of the standard fonts). A letter with an accent has the width of its base
 * letter, and the other characters of WinAnsi have their own entry in EXTRA_WIDTHS.
 */
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
const EXTRA_WIDTHS: Record<string, number> = {
  "·": 278,
  "²": 333,
  "³": 333,
  "°": 400,
  "€": 556,
  "–": 556,
  "—": 1000,
  "…": 1000,
  "×": 584,
  ß: 611,
  "„": 333,
  "“": 333,
  µ: 556,
};

/** The width of a text in points, in Helvetica or in Helvetica-Bold. */
export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? BOLD : REGULAR;
  let sum = 0;
  for (const c of text) {
    const base = c.normalize("NFD")[0];
    const code = base.codePointAt(0)!;
    sum += EXTRA_WIDTHS[c] ?? (code >= 32 && code <= 126 ? table[code - 32] : 556);
  }
  return (sum * size) / 1000;
}

export const n = (value: number) => String(Math.round(value * 100) / 100);

/** The characters at the codes 0x80 to 0x9F of WinAnsi. "\0" marks a code without a character. */
const WIN_ANSI = "€\0‚ƒ„…†‡ˆ‰Š‹Œ\0Ž\0\0‘’“”•–—˜™š›œ\0žŸ";

/**
 * Puts a text into a PDF string literal in WinAnsi, with one byte for each character. The font
 * has no glyph for other characters, so they become "?".
 */
export const literal = (text: string) => {
  const bytes = [...text].map((c) => {
    const code = c.codePointAt(0)!;
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) return c;
    const index = WIN_ANSI.indexOf(c);
    return index >= 0 ? String.fromCharCode(0x80 + index) : "?";
  });
  return `(${bytes.join("").replace(/[\\()]/g, (c) => `\\${c}`)})`;
};

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

/** The box around the plan and around the chimneys that pass through it. */
function storyBounds(plan: Plan, extras: StoryExtras): Box | null {
  return grow(
    withFurniture(planBounds(plan), plan),
    (extras.through ?? []).flatMap((c) => chimneySymbol(c).outline),
  );
}

/** Exports one story as a PDF with one page. */
export function planToPdf(plan: Plan, extras: StoryExtras = {}): Uint8Array {
  const box = storyBounds(plan, extras) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const layout = chooseLayout(box.maxX - box.minX, box.maxY - box.minY);
  const title = `Grundriss · 1:${layout.denominator} · ${layout.paper}`;
  const content = pageContent(plan, extras, box, layout, title);
  return writePdf([{ content, width: layout.width, height: layout.height }]);
}

/**
 * Exports the building as a PDF with one page for each story, from the bottom to the top. All
 * pages have the same scale and paper, and the same place on the page for the same point of the
 * plan. A story without objects gets no page, but the PDF has at least one page.
 */
export function buildingToPdf(building: Building): Uint8Array {
  const { contents, width, height } = planPages(building);
  return writePdf(contents.map((content) => ({ content, width, height })));
}

/** The plan pages of the building: one for each story, all at one scale on one paper. */
export function planPages(building: Building): {
  contents: string[];
  width: number;
  height: number;
} {
  const pages = building.stories
    .map((story) => ({ story, extras: storyExtras(building, story) }))
    .filter(({ story, extras }) => !isEmptyStory(story, extras));
  if (pages.length === 0) {
    const story = building.stories[0];
    pages.push({ story, extras: storyExtras(building, story) });
  }
  const corners = pages.flatMap(({ story, extras }) => {
    const b = storyBounds(story, extras);
    return b
      ? [
          { x: b.minX, y: b.minY },
          { x: b.maxX, y: b.maxY },
        ]
      : [];
  });
  const box = grow(null, corners) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const layout = chooseLayout(box.maxX - box.minX, box.maxY - box.minY);
  const contents = pages.map(({ story, extras }) =>
    pageContent(
      story,
      extras,
      box,
      layout,
      `Grundriss · ${story.name} · 1:${layout.denominator} · ${layout.paper}`,
    ),
  );
  return { contents, width: layout.width, height: layout.height };
}

/** The content stream of one page: the plan in the box, at the scale of the layout. */
function pageContent(
  plan: Plan,
  extras: StoryExtras,
  box: Box,
  layout: PageLayout,
  title: string,
): string {
  const planWidth = box.maxX - box.minX;
  const planHeight = box.maxY - box.minY;
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

  // The furniture is above the rooms and below the walls. The box of a piece is nearly white, so
  // that it covers the room fill.
  if (plan.furniture.length > 0) {
    ops.push("0.357 0.392 0.455 RG 0.3 w 1 j");
    for (const piece of plan.furniture) {
      const symbol = furnitureSymbol(piece);
      symbol.shapes.forEach((shape, i) => {
        ops.push(i === 0 ? "0.984 0.98 0.969 rg" : "0.925 0.918 0.894 rg");
        polygon(shape);
        ops.push("B");
      });
      for (const [a, b] of symbol.lines) line(a, b);
      // A piece with a model has no plan symbol, so its name tells what it is.
      if (piece.source.kind === "model" && piece.name) {
        ops.push("0.357 0.392 0.455 rg");
        text(piece, piece.name, TEXT_SIZE * 0.75);
      }
    }
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
  for (const room of rooms) {
    const lines = roomLabel(room, plan);
    lines.forEach((t, i) => {
      // The y of the plan points down, so a later line has a larger y.
      // TEXT_SIZE is in points, so the division by k gives meters on the plan.
      const y = room.labelAt.y + ((i - (lines.length - 1) / 2) * TEXT_SIZE * 1.3) / k;
      text({ x: room.labelAt.x, y }, t, TEXT_SIZE);
    });
  }

  // The building services are above the room labels and below the dimensions.
  const polyline = (points: Point[]) => {
    const [first, ...rest] = points.map(map);
    ops.push(`${n(first.x)} ${n(first.y)} m`);
    for (const p of rest) ops.push(`${n(p.x)} ${n(p.y)} l`);
    ops.push("S");
  };
  if (plan.runs.length > 0 || plan.fixtures.length > 0) {
    ops.push("0.6 w 1 J 1 j");
    for (const run of plan.runs) {
      if (run.points.length < 2) continue;
      const kind = runKind(run.kind);
      ops.push(`${rgb(kind.color)} RG ${kind.dashed ? "[3 2] 0 d" : "[] 0 d"}`);
      polyline(run.points);
    }
    ops.push("[] 0 d 0.4 w");
    for (const fixture of plan.fixtures) {
      const color = rgb(SERVICE_COLORS[fixture.system]);
      const symbol = fixtureSymbol(fixture);
      ops.push(`${color} RG 1 g`);
      for (const shape of symbol.shapes) {
        polygon(shape);
        ops.push("B");
      }
      for (const points of symbol.lines) polyline(points);
      ops.push(`${color} rg`);
      for (const shape of symbol.filled) {
        polygon(shape);
        ops.push("f");
      }
    }
  }

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

  if (plan.stairs.length > 0) {
    ops.push("0.294 0.325 0.388 RG 0.4 w 1 j");
    for (const stair of plan.stairs) {
      const shape = stairDrawing(stair, riseOf(plan, stair, extras));
      ops.push("1 g");
      polygon(shape.outline);
      ops.push("B");
      for (const step of shape.steps) {
        polygon(step);
        ops.push("S");
      }
      ops.push("0.6 w");
      for (let i = 1; i < shape.arrow.length; i++) line(shape.arrow[i - 1], shape.arrow[i]);
      for (const [a, b] of shape.head) line(a, b);
      ops.push("0.4 w");
    }
  }

  const chimneys = [
    ...(extras.through ?? []).map((chimney) => ({ chimney, color: "0.604 0.631 0.678" })),
    ...plan.chimneys.map((chimney) => ({ chimney, color: "0.149 0.173 0.220" })),
  ];
  for (const { chimney, color } of chimneys) {
    const symbol = chimneySymbol(chimney);
    ops.push(`1 g ${color} RG 0.7 w`);
    polygon(symbol.outline);
    ops.push("B");
    for (const [a, b] of symbol.diagonals) line(a, b);
  }

  if (extras.north !== undefined) {
    // The north arrow is 12 mm long, in the top right corner of the drawing area.
    const size = (12 * MM) / k;
    const corner = {
      x: box.minX + (layout.width - MARGIN - left) / k - size,
      y: box.minY + (top - (layout.height - MARGIN)) / k + size,
    };
    const shape = northArrow(corner, size, extras.north);
    ops.push("0.149 0.173 0.220 rg");
    polygon(shape.arrow);
    ops.push("f");
    text(shape.label, "N", TITLE_SIZE);
  }

  ops.push(`0.4 g BT /F1 ${TITLE_SIZE} Tf ${n(MARGIN)} ${n(MARGIN)} Td ${literal(title)} Tj ET`);

  return ops.join("\n");
}

/** A page of a PDF: its content stream and its size in points. */
export interface PdfPage {
  content: string;
  width: number;
  height: number;
}

/**
 * Writes a PDF with one page for each content stream, each with its own size, and the fonts
 * Helvetica and Helvetica-Bold. Each character of the contents must be one byte (see `literal`).
 */
export function writePdf(pages: PdfPage[]): Uint8Array {
  const contents = pages.map((p) => p.content);
  // Object 1 is the catalog, 2 the page tree, 3 the font, and 4 the bold font. Each page has two
  // objects after that: the page and its content stream.
  const pageId = (i: number) => 5 + 2 * i;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${contents.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] ` +
      `/Count ${contents.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  contents.forEach((content, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pages[i].width)} ${n(pages[i].height)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId(i) + 1} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });
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
