// The 2D pictures of the website: a sketch on paper like a scan, with the walls that the
// recognition finds, and the plan from the SVG export of the app. The website shows their layers
// one after the other with the scroll.

import { storyExtras } from "../../src/export/context";
import { planToSvg } from "../../src/export/svg";
import { planBounds, wallOutline } from "../../src/model/drawing";
import { wallEnds } from "../../src/model/plan";
import type { Building, Story } from "../../src/model/types";

const SVG = "http://www.w3.org/2000/svg";

/** A random number generator with a seed, so that the sketch looks the same on each visit. */
function random(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * A sketch of the walls, drawn by hand with a pencil, and the walls that the recognition finds
 * on it. Each found wall has `pathLength="1"`, so CSS can draw it with the scroll.
 */
export function sketchSvg(story: Story): SVGSVGElement {
  const box = planBounds(story)!;
  const pad = 1.2;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute(
    "viewBox",
    `${box.minX - pad} ${box.minY - pad} ${box.maxX - box.minX + 2 * pad} ${box.maxY - box.minY + 2 * pad}`,
  );
  svg.classList.add("sketch");
  const rand = random(7);
  const jitter = (v: number) => v + (rand() - 0.5) * 0.06;

  const pencil = document.createElementNS(SVG, "g");
  pencil.classList.add("pencil");
  for (const wall of story.walls) {
    const outline = wallOutline(story, wall);
    // Each side of the wall twice, a little off, as a hand draws it.
    for (let pass = 0; pass < 2; pass++) {
      const d = outline
        .map((p, i) => `${i === 0 ? "M" : "L"}${jitter(p.x).toFixed(3)} ${jitter(p.y).toFixed(3)}`)
        .join(" ");
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("d", `${d} Z`);
      pencil.append(path);
    }
  }
  // Door arcs and window marks in pencil.
  for (const opening of story.openings) {
    const wall = story.walls.find((w) => w.id === opening.wallId)!;
    const [a, b] = wallEnds(story, wall);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const at = (s: number, n: number) => ({
      x: a.x + ux * s - uy * n,
      y: a.y + uy * s + ux * n,
    });
    const s0 = opening.offset - opening.width / 2;
    const s1 = opening.offset + opening.width / 2;
    const path = document.createElementNS(SVG, "path");
    if (opening.kind === "door") {
      const hinge = at(s0, 0);
      const end = at(s0, -opening.width);
      const tip = at(s1, 0);
      path.setAttribute(
        "d",
        `M${hinge.x} ${hinge.y} L${end.x} ${end.y} A${opening.width} ${opening.width} 0 0 1 ${tip.x} ${tip.y}`,
      );
    } else {
      const p = at(s0, 0);
      const q = at(s1, 0);
      path.setAttribute("d", `M${p.x} ${p.y} L${q.x} ${q.y}`);
      path.classList.add("glass");
    }
    pencil.append(path);
  }
  // Handwritten room names.
  const names: [string, number, number][] = [
    ["Küche", 2, 2.2],
    ["Wohnen", 3.4, 6.6],
    ["Bad", 10.7, 2.6],
    ["Schlafen", 9.6, 7.1],
  ];
  for (const [text, x, y] of names) {
    const label = document.createElementNS(SVG, "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(y));
    label.textContent = text;
    pencil.append(label);
  }
  svg.append(pencil);

  // The walls that the recognition finds: center lines, drawn one after the other.
  const found = document.createElementNS(SVG, "g");
  found.classList.add("found");
  story.walls.forEach((wall, i) => {
    const [a, b] = wallEnds(story, wall);
    const line = document.createElementNS(SVG, "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("pathLength", "1");
    line.style.setProperty("--i", String(i / story.walls.length));
    found.append(line);
    for (const p of [a, b]) {
      const dot = document.createElementNS(SVG, "circle");
      dot.setAttribute("cx", String(p.x));
      dot.setAttribute("cy", String(p.y));
      dot.setAttribute("r", "0.12");
      dot.style.setProperty("--i", String(i / story.walls.length));
      found.append(dot);
    }
  });
  svg.append(found);
  return svg;
}

/** The plan of a story from the SVG export of the app, as an element. */
export function planSvg(building: Building, story: Story): SVGSVGElement {
  const text = planToSvg(story, storyExtras(building, story));
  const svg = new DOMParser().parseFromString(text, "image/svg+xml")
    .documentElement as unknown as SVGSVGElement;
  // The export has a size in centimeters for print. On the page, CSS sets the size.
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.classList.add("plan");
  return document.importNode(svg, true);
}
