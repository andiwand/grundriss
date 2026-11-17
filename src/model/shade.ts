// The shade on the PV fields from the parts of the building: the faces and the gables of all
// roofs, the faces and the walls of the dormers, and the chimneys; and from the outdoor parts:
// the trees, the neighbor buildings, and the fences, hedges, and garden walls. A crown is a
// prism of eight sides; a tree that loses its leaves shades only from May to October. The panels
// of other fields are not in the model.
//
// The method:
//
// - Each panel gets sample points: its center and its four corners, moved a little toward the
//   center and a little up from the panel. A field with many panels uses only the centers, so
//   that the time stays short.
// - For each hour of the year where the sun is in front of the panels and the beam is not 0, a
//   ray goes from each sample point to the sun. If the ray hits a part of the building, the
//   sample point is in the shade in that hour. The part of the panels that the sun reaches in the
//   hour is the part of the sample points without a hit.
// - With a stored climate, `faceYear` in climate.ts calculates the yield again with that part of
//   the beam. The shade removes the beam and the circumsolar light, because both come from the
//   direction of the sun. The diffuse light of the sky and the light from the ground stay, so the
//   model does not reduce them by the part of the sky that the building hides. The factor is
//   the yield with shade divided by the yield without shade, for the year and for each hour.
// - Without a climate, there are no hours of real weather. The sun path of the latitude (of the
//   location, else 48°) and a clear sky (DNI from the air mass, after Meinel) give the weight of
//   each hour. Shade then removes the part BEAM_SHARE of the yield in the sunny hours, because
//   the beam is about that part of the yearly irradiation on a tilted face in Central Europe.
//
// The test of a ray uses the planes of the polygons and a point-in-polygon test on the plane.
// Before the hours, each sample point keeps only the polygons that can block it: a polygon must
// have a point above the sample point and a point in front of the panel.
//
// The plan uses meters, x to the right, y down (screen axes), and z up. North is `north` degrees
// clockwise from the top of the plan (−y).

import { chimneyExtent, chimneyOutline } from "./building";
import { climateSeries, climateSun, faceYear, HOURS, sunPath } from "./climate";
import { roofGeometries, type Vec3 } from "./roof";
import type { Building, Story, Tree } from "./types";

/** The part of the yearly irradiation on a tilted face that the beam gives, without a climate. */
export const BEAM_SHARE = 0.55;
/** The latitude of the sun path without a location or a climate: Central Europe. */
const DEFAULT_LATITUDE = 48;
/** A field with more sample points than this uses only the center of each panel. */
const MAX_SAMPLES = 300;
/** The corners of a panel move this part of the way to the center. */
const CORNER_INSET = 0.1;
/** The sample points are this far above the panel, in meters. */
const SAMPLE_LIFT = 0.01;
const EPS = 1e-6;

/** The shade of the panels of one field. */
export interface FieldShade {
  /** The yield with shade divided by the yield without shade, for the year (0 to 1). */
  factor: number;
  /**
   * The same factor for each hour of the typical year, for all parts of the field. Null without
   * a climate, or if no panel gets shade.
   */
  hourly: Float32Array | null;
  /** The factor for the year and for each hour (or null) of each part of the layout. */
  parts: { factor: number; hourly: Float32Array | null }[];
  /** The factor for the year of each panel, in the order of the panels. */
  panels: number[];
  /** The number of sample points. */
  samples: number;
  /** "climate" if the stored climate gives the hours, else "estimate". */
  source: "climate" | "estimate";
}

/** A polygon that can block the sun, with its plane and its projection on the plane. */
interface Blocker {
  points: Vec3[];
  /** True for a tree that loses its leaves: it blocks only in the summer half of the year. */
  summer: boolean;
  /** The unit normal and the distance of the plane: n · p = d. */
  nx: number;
  ny: number;
  nz: number;
  d: number;
  /** The axis that the projection drops: 0 for x, 1 for y, 2 for z. */
  drop: number;
  u: Float64Array;
  v: Float64Array;
  /** The box around the polygon. */
  min: Vec3;
  max: Vec3;
}

function blocker({ polygon: points, summer }: ShadePart): Blocker | null {
  if (points.length < 3) return null;
  // Newell's method gives the normal of a polygon that is not convex too.
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    nx += (p.y - q.y) * (p.z + q.z);
    ny += (p.z - q.z) * (p.x + q.x);
    nz += (p.x - q.x) * (p.y + q.y);
  }
  const length = Math.hypot(nx, ny, nz);
  if (length < 1e-9) return null;
  nx /= length;
  ny /= length;
  nz /= length;
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const az = Math.abs(nz);
  const drop = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const u = new Float64Array(points.length);
  const v = new Float64Array(points.length);
  points.forEach((p, i) => {
    u[i] = drop === 0 ? p.y : p.x;
    v[i] = drop === 2 ? p.y : p.z;
  });
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    min.x = Math.min(min.x, p.x);
    min.y = Math.min(min.y, p.y);
    min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x);
    max.y = Math.max(max.y, p.y);
    max.z = Math.max(max.z, p.z);
  }
  const p0 = points[0];
  return {
    points,
    summer,
    nx,
    ny,
    nz,
    d: nx * p0.x + ny * p0.y + nz * p0.z,
    drop,
    u,
    v,
    min,
    max,
  };
}

/** True if the ray from o in the direction (dx, dy, dz) hits the polygon. */
function hits(b: Blocker, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number) {
  const denominator = b.nx * dx + b.ny * dy + b.nz * dz;
  if (Math.abs(denominator) < 1e-12) return false;
  const t = (b.d - (b.nx * ox + b.ny * oy + b.nz * oz)) / denominator;
  if (t <= EPS) return false;
  const x = ox + t * dx;
  const y = oy + t * dy;
  const z = oz + t * dz;
  if (x < b.min.x - EPS || x > b.max.x + EPS) return false;
  if (y < b.min.y - EPS || y > b.max.y + EPS) return false;
  if (z < b.min.z - EPS || z > b.max.z + EPS) return false;
  const pu = b.drop === 0 ? y : x;
  const pv = b.drop === 2 ? y : z;
  const { u, v } = b;
  let inside = false;
  for (let i = 0, j = u.length - 1; i < u.length; j = i++) {
    if (v[i] > pv !== v[j] > pv && pu < ((u[j] - u[i]) * (pv - v[i])) / (v[j] - v[i]) + u[i]) {
      inside = !inside;
    }
  }
  return inside;
}

/** A polygon that can block the sun, and if it blocks only in the summer half of the year. */
export interface ShadePart {
  polygon: Vec3[];
  summer: boolean;
}

/** The sides, the top, and the bottom of a prism from `bottom` to `top`, of the outline. */
function prism(outline: { x: number; y: number }[], bottom: number, top: number, topScale = 1) {
  const n = outline.length;
  const c = {
    x: outline.reduce((s, p) => s + p.x, 0) / n,
    y: outline.reduce((s, p) => s + p.y, 0) / n,
  };
  const up = outline.map((p) => ({
    x: c.x + (p.x - c.x) * topScale,
    y: c.y + (p.y - c.y) * topScale,
    z: top,
  }));
  const result: Vec3[][] = outline.map((p, i) => {
    const q = outline[(i + 1) % n];
    return [{ x: p.x, y: p.y, z: bottom }, { x: q.x, y: q.y, z: bottom }, up[(i + 1) % n], up[i]];
  });
  result.push(
    up,
    outline.map((p) => ({ x: p.x, y: p.y, z: bottom })),
  );
  return result;
}

/**
 * The crown of a tree as a prism of eight sides, at the heights of the 3D view: a round crown
 * from the top of the trunk to the top of the tree, a conifer as a cone (a prism that gets
 * narrow at the top). The crown is a little smaller than its circle, because a crown lets
 * some light through.
 */
function treeCrown(tree: Tree, floor: number): Vec3[][] {
  const radius = (tree.crown / 2) * 0.85;
  const trunkTop = Math.max(0.5, tree.height - (tree.deciduous ? tree.crown : tree.height * 0.8));
  const outline = Array.from({ length: 8 }, (_, i) => ({
    x: tree.x + radius * Math.cos((i / 8) * 2 * Math.PI),
    y: tree.y + radius * Math.sin((i / 8) * 2 * Math.PI),
  }));
  return prism(outline, floor + trunkTop, floor + tree.height, tree.deciduous ? 1 : 0.15);
}

/** The outdoor parts of a story that can block the sun. */
function outdoorParts(story: Story): ShadePart[] {
  const result: ShadePart[] = [];
  const floor = story.elevation;
  for (const area of story.areas) {
    if (area.kind !== "neighbor" || area.points.length < 3) continue;
    const base = floor + area.level;
    for (const polygon of prism(area.points, base, base + area.thickness)) {
      result.push({ polygon, summer: false });
    }
  }
  for (const fence of story.fences) {
    fence.points.slice(1).forEach((q, i) => {
      const p = fence.points[i];
      result.push({
        polygon: [
          { x: p.x, y: p.y, z: floor },
          { x: q.x, y: q.y, z: floor },
          { x: q.x, y: q.y, z: floor + fence.height },
          { x: p.x, y: p.y, z: floor + fence.height },
        ],
        summer: false,
      });
    });
  }
  for (const tree of story.trees) {
    for (const polygon of treeCrown(tree, floor)) result.push({ polygon, summer: tree.deciduous });
  }
  return result;
}

/**
 * The polygons that can block the sun: the faces and the gables of all roofs, the faces and the
 * walls of the dormers, the sides and the tops of the chimneys, and the outdoor parts.
 */
export function shadeParts(building: Building): ShadePart[] {
  const result: ShadePart[] = [];
  const always = (polygon: Vec3[]) => result.push({ polygon, summer: false });
  for (const { geometry } of roofGeometries(building)) {
    for (const face of geometry.faces) always(face.polygon);
    geometry.gables.forEach(always);
    for (const dormer of geometry.dormers) [...dormer.faces, ...dormer.walls].forEach(always);
  }
  for (const story of building.stories) {
    for (const chimney of story.chimneys) {
      const { bottom, top } = chimneyExtent(building, story, chimney);
      for (const polygon of prism(chimneyOutline(chimney), bottom, top)) {
        // The bottom of a chimney is inside the house, so it blocks nothing.
        if (polygon.every((p) => p.z === bottom)) continue;
        always(polygon);
      }
    }
    result.push(...outdoorParts(story));
  }
  return result.filter((part) => part.polygon.length >= 3);
}

/** The polygons of `shadeParts`, without the season. */
export function shadePolygons(building: Building): Vec3[][] {
  return shadeParts(building).map((part) => part.polygon);
}

/**
 * True for each hour of the typical year from May to October, when a tree has its leaves: from
 * day 120 (May 1) to day 303 (October 31) of a year of 365 days.
 */
const SUMMER = (() => {
  const result = new Uint8Array(HOURS);
  for (let h = 0; h < HOURS; h++) {
    const day = Math.floor(h / 24);
    result[h] = day >= 120 && day <= 303 ? 1 : 0;
  }
  return result;
})();

/** The unit normal of a panel in plan coordinates, pointing up. */
function panelNormal(quad: Vec3[]): Vec3 {
  const [a, b, , d] = quad;
  const e = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const f = { x: d.x - a.x, y: d.y - a.y, z: d.z - a.z };
  let n = { x: e.y * f.z - e.z * f.y, y: e.z * f.x - e.x * f.z, z: e.x * f.y - e.y * f.x };
  const length = Math.hypot(n.x, n.y, n.z) || 1;
  n = { x: n.x / length, y: n.y / length, z: n.z / length };
  return n.z < 0 ? { x: -n.x, y: -n.y, z: -n.z } : n;
}

/** The sun path without a climate, by latitude. The direction of the sun does not need weather. */
const estimatePaths = new Map<number, Float64Array>();

function estimatePath(latitude: number): Float64Array {
  const key = Math.round(latitude * 10) / 10;
  let path = estimatePaths.get(key);
  if (!path) {
    // The longitude only moves the clock time, so 0 gives the same directions.
    path = sunPath(key, 0);
    if (estimatePaths.size > 8) estimatePaths.clear();
    estimatePaths.set(key, path);
  }
  return path;
}

/** The DNI of a clear sky in W/m² for the cosine of the zenith angle (Meinel). */
function clearSkyDni(up: number): number {
  if (up <= 0) return 0;
  const airMass = 1 / Math.max(up, 0.05);
  return 1361 * 0.7 ** (airMass ** 0.678);
}

/**
 * The results for each sun path (one per climate, and one per latitude without a climate), by
 * the text of the inputs. A transaction copies the building, so the key is the geometry, not
 * the objects.
 */
const cache = new WeakMap<Float64Array, Map<string, FieldShade>>();
const CACHE_SIZE = 50;

const round = (n: number) => Math.round(n * 1000);
const polygonKey = (polygon: Vec3[]) =>
  polygon.map((p) => `${round(p.x)},${round(p.y)},${round(p.z)}`).join(";");

/**
 * The shade on the panels of a field. `panels` are the corners of the panels (from `pvLayout`),
 * `parts` the groups of panels with one direction, and `partOf` the index in `parts` of each
 * panel. A field without parts of the building in the way gets the factor 1.
 */
export function panelShade(
  building: Building,
  panels: Vec3[][],
  parts: { tilt: number; azimuth: number; peak: number }[],
  partOf: number[],
): FieldShade {
  const climate = building.climate;
  const latitude = building.location?.latitude ?? DEFAULT_LATITUDE;
  const sun = climate ? climateSun(climate) : estimatePath(latitude);
  const polygons = shadeParts(building);

  let entries = cache.get(sun);
  if (!entries) {
    entries = new Map();
    cache.set(sun, entries);
  }
  const key = [
    building.north,
    parts.map((p) => `${p.tilt}:${p.azimuth}:${p.peak}`).join("|"),
    partOf.join(","),
    panels.map(polygonKey).join("|"),
    polygons.map((part) => `${part.summer ? "s" : ""}${polygonKey(part.polygon)}`).join("|"),
  ].join("#");
  const hit = entries.get(key);
  if (hit) return hit;
  const result = computeShade(building, sun, polygons, panels, parts, partOf);
  if (entries.size >= CACHE_SIZE) entries.clear();
  entries.set(key, result);
  return result;
}

function computeShade(
  building: Building,
  sun: Float64Array,
  polygons: ShadePart[],
  panels: Vec3[][],
  parts: { tilt: number; azimuth: number; peak: number }[],
  partOf: number[],
): FieldShade {
  const climate = building.climate;
  const series = climate ? climateSeries(climate) : null;
  const blockers = polygons.map(blocker).filter((b): b is Blocker => b !== null);

  // The direction to the sun in plan coordinates for each hour. The compass direction A is the
  // plan direction (sin(A + north), −cos(A + north)).
  const angle = (building.north * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dir = new Float64Array(HOURS * 3);
  for (let h = 0; h < HOURS; h++) {
    const east = sun[h * 3];
    const north = sun[h * 3 + 1];
    dir[h * 3] = east * cos + north * sin;
    dir[h * 3 + 1] = east * sin - north * cos;
    dir[h * 3 + 2] = sun[h * 3 + 2];
  }

  // The sample points of each panel.
  const centersOnly = panels.length * 5 > MAX_SAMPLES;
  const samplesPerPanel = centersOnly ? 1 : 5;
  const normals = panels.map(panelNormal);
  const samples: { panel: number; p: Vec3 }[] = [];
  panels.forEach((quad, panel) => {
    const n = normals[panel];
    const c = {
      x: quad.reduce((s, p) => s + p.x, 0) / quad.length,
      y: quad.reduce((s, p) => s + p.y, 0) / quad.length,
      z: quad.reduce((s, p) => s + p.z, 0) / quad.length,
    };
    const points = centersOnly ? [c] : [c, ...quad];
    for (const q of points) {
      samples.push({
        panel,
        p: {
          x: q.x + (c.x - q.x) * CORNER_INSET + n.x * SAMPLE_LIFT,
          y: q.y + (c.y - q.y) * CORNER_INSET + n.y * SAMPLE_LIFT,
          z: q.z + (c.z - q.z) * CORNER_INSET + n.z * SAMPLE_LIFT,
        },
      });
    }
  });

  // The weight of the beam in each hour for each part: 0 if the sun is behind the panels.
  const partNormals = parts.map((_, i) => {
    const panel = partOf.indexOf(i);
    return panel >= 0 ? normals[panel] : null;
  });
  const weights = partNormals.map((n) => {
    const weight = new Float64Array(HOURS);
    if (!n) return weight;
    for (let h = 0; h < HOURS; h++) {
      const up = dir[h * 3 + 2];
      if (up <= 0) continue;
      const incidence = dir[h * 3] * n.x + dir[h * 3 + 1] * n.y + up * n.z;
      if (incidence <= 0) continue;
      const dni = series ? Math.max(0, series.dni[h]) : clearSkyDni(up);
      weight[h] = dni * incidence;
    }
    return weight;
  });
  const sunny = weights.map((weight) => {
    const hours: number[] = [];
    for (let h = 0; h < HOURS; h++) if (weight[h] > 0) hours.push(h);
    return hours;
  });

  // The number of sample points in the shade, per hour, for each part and each panel.
  const partShaded = parts.map(() => new Uint16Array(HOURS));
  const panelShaded = new Map<number, Uint16Array>();
  for (const { panel, p } of samples) {
    const part = partOf[panel];
    const n = normals[panel];
    const candidates = blockers.filter(
      (b) =>
        b.max.z > p.z + EPS &&
        b.points.some((q) => (q.x - p.x) * n.x + (q.y - p.y) * n.y + (q.z - p.z) * n.z > EPS),
    );
    if (candidates.length === 0) continue;
    const counts = partShaded[part];
    for (const h of sunny[part]) {
      const dx = dir[h * 3];
      const dy = dir[h * 3 + 1];
      const dz = dir[h * 3 + 2];
      for (const b of candidates) {
        if (b.summer && !SUMMER[h]) continue;
        if (!hits(b, p.x, p.y, p.z, dx, dy, dz)) continue;
        counts[h]++;
        let own = panelShaded.get(panel);
        if (!own) panelShaded.set(panel, (own = new Uint16Array(HOURS)));
        own[h]++;
        break;
      }
    }
  }

  const source = series ? "climate" : "estimate";
  const panelFactors = panels.map(() => 1);
  if (panelShaded.size === 0) {
    return {
      factor: 1,
      hourly: null,
      parts: parts.map(() => ({ factor: 1, hourly: null })),
      panels: panelFactors,
      samples: samples.length,
      source,
    };
  }

  // The count of sample points of each part.
  const partSamples = parts.map(() => 0);
  for (const { panel } of samples) partSamples[partOf[panel]]++;
  const lit = (shaded: Uint16Array, count: number) => {
    const result = new Float32Array(HOURS).fill(1);
    for (let h = 0; h < HOURS; h++) if (shaded[h] > 0) result[h] = 1 - shaded[h] / count;
    return result;
  };

  if (series && climate) {
    // The yield with and without shade from the climate, per kWp.
    const partResults = parts.map((part, i) => {
      const shaded = partShaded[i];
      if (!shaded.some((count) => count > 0)) return null;
      const free = faceYear(series, sun, part.tilt, part.azimuth);
      const lessSun = faceYear(series, sun, part.tilt, part.azimuth, lit(shaded, partSamples[i]));
      return { free, lessSun };
    });
    for (const [panel, shaded] of panelShaded) {
      const part = parts[partOf[panel]];
      const result = partResults[partOf[panel]];
      if (!result || result.free.yield <= 0) continue;
      const lessSun = faceYear(series, sun, part.tilt, part.azimuth, lit(shaded, samplesPerPanel));
      panelFactors[panel] = lessSun.yield / result.free.yield;
    }
    const partShade = partResults.map((result) => {
      if (!result) return { factor: 1, hourly: null };
      const { free, lessSun } = result;
      const hourly = new Float32Array(HOURS).fill(1);
      for (let h = 0; h < HOURS; h++) {
        if (free.hourly[h] > 0) hourly[h] = lessSun.hourly[h] / free.hourly[h];
      }
      return { factor: free.yield > 0 ? lessSun.yield / free.yield : 1, hourly };
    });
    // The whole field: the parts weighted by their peak power.
    let free = 0;
    let lessSun = 0;
    const freeHours = new Float64Array(HOURS);
    const lessHours = new Float64Array(HOURS);
    parts.forEach((part, i) => {
      const result = partResults[i] ?? null;
      const freeYear = result ? result.free : faceYear(series, sun, part.tilt, part.azimuth);
      const lessYear = result ? result.lessSun : freeYear;
      free += part.peak * freeYear.yield;
      lessSun += part.peak * lessYear.yield;
      for (let h = 0; h < HOURS; h++) {
        freeHours[h] += part.peak * freeYear.hourly[h];
        lessHours[h] += part.peak * lessYear.hourly[h];
      }
    });
    const hourly = new Float32Array(HOURS).fill(1);
    for (let h = 0; h < HOURS; h++) if (freeHours[h] > 0) hourly[h] = lessHours[h] / freeHours[h];
    return {
      factor: free > 0 ? lessSun / free : 1,
      hourly,
      parts: partShade,
      panels: panelFactors,
      samples: samples.length,
      source,
    };
  }

  // Without a climate: the shade removes BEAM_SHARE of the weighted sunny hours.
  const loss = (shaded: Uint16Array, count: number, weight: Float64Array) => {
    let all = 0;
    let lost = 0;
    for (let h = 0; h < HOURS; h++) {
      all += weight[h];
      lost += (weight[h] * shaded[h]) / count;
    }
    return all > 0 ? BEAM_SHARE * (lost / all) : 0;
  };
  for (const [panel, shaded] of panelShaded) {
    panelFactors[panel] = 1 - loss(shaded, samplesPerPanel, weights[partOf[panel]]);
  }
  const partShade = parts.map((_, i) => ({
    factor: 1 - loss(partShaded[i], Math.max(1, partSamples[i]), weights[i]),
    hourly: null,
  }));
  const peak = parts.reduce((sum, p) => sum + p.peak, 0);
  const factor =
    peak > 0 ? parts.reduce((sum, p, i) => sum + p.peak * partShade[i].factor, 0) / peak : 1;
  return {
    factor,
    hourly: null,
    parts: partShade,
    panels: panelFactors,
    samples: samples.length,
    source,
  };
}
