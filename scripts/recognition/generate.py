"""Synthetic floor plans with pixel labels.

The generator draws a random building: an outline, rooms, walls, doors, windows, and the clutter
of a real plan (furniture, stairs, dimension lines, text, grid axes). Then it adds the faults of
a scan. The label gives the class of each pixel: 0 background, 1 wall, 2 door, 3 window.

The training uses `sample()` on the fly. The command line writes sample images for a check:

    uv run python generate.py --out /tmp/samples --count 12
"""

from __future__ import annotations

import argparse
import math
import os
from dataclasses import dataclass

import cv2
import numpy as np

# The contract: src/recognition/contract.ts.
LONG_SIDE = 1024
TILE = 512
BACKGROUND, WALL, DOOR, WINDOW = 0, 1, 2, 3

WORDS = [
    "LIVING", "Living", "KITCHEN", "Kitchen", "BATH", "Bath", "WC", "BED", "Bedroom", "HALL",
    "Hall", "OFFICE", "Storage", "Wohnen", "Kueche", "Bad", "Schlafen", "Kind", "Flur", "Diele",
    "Abstellraum", "Essen", "Arbeiten", "Gast", "Terrasse", "Balkon", "Garage", "Technik",
    "Chambre", "Sejour", "Cuisine", "Dormitorio", "Salon", "Room 1", "Room 2", "R3", "E01",
]

FONTS = [
    cv2.FONT_HERSHEY_SIMPLEX,
    cv2.FONT_HERSHEY_PLAIN,
    cv2.FONT_HERSHEY_DUPLEX,
    cv2.FONT_HERSHEY_COMPLEX,
    cv2.FONT_HERSHEY_TRIPLEX,
    cv2.FONT_HERSHEY_COMPLEX_SMALL,
]


@dataclass
class Segment:
    """A straight wall on the center line or on the outer face, in pixels.

    The band of the wall goes from the line for `thickness` pixels to the side `normal`
    (an exterior wall), or for half the thickness to each side (an interior wall).
    """

    a: np.ndarray
    b: np.ndarray
    thickness: float
    normal: np.ndarray
    exterior: bool

    @property
    def length(self) -> float:
        return float(np.linalg.norm(self.b - self.a))

    @property
    def direction(self) -> np.ndarray:
        return (self.b - self.a) / max(self.length, 1e-9)

    def across(self) -> tuple[float, float]:
        """The range of the band across the line, along the normal."""
        if self.exterior:
            return 0.0, self.thickness
        return -self.thickness / 2, self.thickness / 2


@dataclass
class Opening:
    segment: Segment
    start: float
    end: float
    kind: int  # DOOR or WINDOW
    style: str


class Plan:
    """The geometry of one random building, in pixels of the clean drawing."""

    def __init__(self, rng: np.random.Generator):
        self.rng = rng
        self.long_side_m = rng.uniform(8, 25)
        target = LONG_SIDE * rng.uniform(0.7, 1.3)
        self.scale = target / self.long_side_m  # pixels per meter
        self.margin = int(rng.uniform(60, 160))
        self.parts: list[tuple[float, float, float, float]] = []  # rectangles in meters
        self.segments: list[Segment] = []
        self.rooms: list[tuple[int, int, int, int]] = []  # rectangles in pixels
        self.openings: list[Opening] = []
        self._outline()
        w = max(p[2] for p in self.parts)
        h = max(p[3] for p in self.parts)
        self.width = int(w * self.scale) + 2 * self.margin
        self.height = int(h * self.scale) + 2 * self.margin
        self.footprint = np.zeros((self.height, self.width), np.uint8)
        for x0, y0, x1, y1 in self.parts:
            p0 = self.px((x0, y0))
            p1 = self.px((x1, y1))
            self.footprint[p0[1] : p1[1], p0[0] : p1[0]] = 1
        self.ext_thickness = rng.uniform(0.24, 0.5) * self.scale
        self.int_thickness = rng.uniform(0.08, 0.2) * self.scale
        self._exterior_walls()
        for part in self.parts:
            self._split(part, depth=0)
        if len(self.parts) > 1 and rng.random() < 0.6:
            self._part_joints()
        self._openings()

    def px(self, p) -> np.ndarray:
        return np.array(
            [int(round(self.margin + p[0] * self.scale)), int(round(self.margin + p[1] * self.scale))]
        )

    # ----- Layout -----

    def _outline(self) -> None:
        rng = self.rng
        long = self.long_side_m
        short = long * rng.uniform(0.45, 0.9)
        horizontal = rng.random() < 0.5
        w, h = (long, short) if horizontal else (short, long)
        kind = rng.choice(["rect", "rect", "L", "T", "U"])
        if kind == "rect":
            self.parts = [(0, 0, w, h)]
        elif kind == "L":
            cw, ch = w * rng.uniform(0.35, 0.6), h * rng.uniform(0.35, 0.6)
            self.parts = [(0, 0, w, h - ch), (0, h - ch, w - cw, h)]
            if rng.random() < 0.5:  # mirror
                self.parts = [(0, 0, w, h - ch), (cw, h - ch, w, h)]
        elif kind == "T":
            stem = w * rng.uniform(0.3, 0.5)
            top = h * rng.uniform(0.35, 0.55)
            x0 = (w - stem) / 2
            self.parts = [(0, 0, w, top), (x0, top, x0 + stem, h)]
        else:  # U
            arm = w * rng.uniform(0.25, 0.35)
            base = h * rng.uniform(0.35, 0.5)
            self.parts = [(0, h - base, w, h), (0, 0, arm, h - base), (w - arm, 0, w, h - base)]

    def _exterior_walls(self) -> None:
        contours, _ = cv2.findContours(self.footprint, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contour = max(contours, key=cv2.contourArea)[:, 0, :].astype(float)
        n = len(contour)
        for i in range(n):
            a = contour[i]
            b = contour[(i + 1) % n]
            d = b - a
            length = np.linalg.norm(d)
            if length < 2:
                continue
            normal = np.array([-d[1], d[0]]) / length
            mid = (a + b) / 2 + normal * 3
            x, y = int(mid[0]), int(mid[1])
            inside = 0 <= y < self.height and 0 <= x < self.width and self.footprint[y, x]
            if not inside:
                normal = -normal
            self.segments.append(Segment(a, b, self.ext_thickness, normal, True))

    def _split(self, rect, depth: int) -> None:
        rng = self.rng
        x0, y0, x1, y1 = rect
        w, h = x1 - x0, y1 - y0
        min_room = rng.uniform(2.0, 3.2)
        can_x = w > 2 * min_room
        can_y = h > 2 * min_room
        if depth > 5 or not (can_x or can_y) or (depth > 1 and rng.random() < 0.25):
            p0, p1 = self.px((x0, y0)), self.px((x1, y1))
            self.rooms.append((p0[0], p0[1], p1[0], p1[1]))
            return
        vertical = can_x and (not can_y or w > h or rng.random() < 0.3)
        size = w if vertical else h
        if rng.random() < 0.2 and size > 2 * min_room + 1.5:
            cut = rng.choice([1.2, 1.4, 1.6]) if rng.random() < 0.5 else size - rng.choice([1.2, 1.4])
        else:
            cut = rng.uniform(min_room, size - min_room)
        cut = round(cut * 20) / 20  # plans snap to 5 cm
        if vertical:
            x = x0 + cut
            self._interior((x, y0), (x, y1))
            self._split((x0, y0, x, y1), depth + 1)
            self._split((x, y0, x1, y1), depth + 1)
        else:
            y = y0 + cut
            self._interior((x0, y), (x1, y))
            self._split((x0, y0, x1, y), depth + 1)
            self._split((x0, y, x1, y1), depth + 1)

    def _interior(self, a, b) -> None:
        pa, pb = self.px(a).astype(float), self.px(b).astype(float)
        d = pb - pa
        normal = np.array([-d[1], d[0]]) / max(np.linalg.norm(d), 1e-9)
        thickness = self.int_thickness * self.rng.uniform(0.8, 1.25)
        self.segments.append(Segment(pa, pb, thickness, normal, False))

    def _part_joints(self) -> None:
        """A wall where two parts of the outline meet, so that the parts are separate rooms."""
        for i, p in enumerate(self.parts):
            for q in self.parts[i + 1 :]:
                for a, b in _shared_edge(p, q):
                    self._interior(a, b)

    def _openings(self) -> None:
        rng = self.rng
        entrance = rng.integers(0, max(1, sum(s.exterior for s in self.segments)))
        ext_index = 0
        for seg in self.segments:
            taken: list[tuple[float, float]] = []
            usable = seg.length - 2 * self.int_thickness - 6
            if usable < 0.6 * self.scale:
                if seg.exterior:
                    ext_index += 1
                continue

            def place(width: float, kind: int, style: str) -> bool:
                if width > usable:
                    return False
                for _ in range(12):
                    start = rng.uniform(self.int_thickness + 3, seg.length - self.int_thickness - 3 - width)
                    if all(start + width + 6 < t0 or start > t1 + 6 for t0, t1 in taken):
                        taken.append((start, start + width))
                        self.openings.append(Opening(seg, start, start + width, kind, style))
                        return True
                return False

            if seg.exterior:
                if ext_index == entrance:
                    place(rng.uniform(0.9, 1.2) * self.scale, DOOR, rng.choice(["swing", "swing", "double"]))
                count = int(seg.length / (self.scale * rng.uniform(2.2, 4.5)))
                window_style = rng.choice(["two", "three", "frame", "thick", "two"])
                for _ in range(count):
                    width = rng.uniform(0.6, 2.4) * self.scale
                    if rng.random() < 0.08:
                        place(rng.uniform(0.9, 2.2) * self.scale, DOOR, "slide")
                    else:
                        place(width, WINDOW, window_style)
                ext_index += 1
            else:
                if rng.random() < 0.88:
                    style = rng.choice(
                        ["swing"] * 7 + ["double", "slide", "none", "none"]
                    )
                    width = (rng.uniform(1.3, 1.8) if style == "double" else rng.uniform(0.7, 1.05)) * self.scale
                    place(width, DOOR, style)
                if rng.random() < 0.15:
                    place(rng.uniform(0.8, 1.2) * self.scale, DOOR, "none")


def _shared_edge(p, q):
    """The edges where two rectangles touch, as pairs of points in meters."""
    edges = []
    for ax, bx in ((p[2], q[0]), (q[2], p[0])):
        if abs(ax - bx) < 1e-6:
            y0, y1 = max(p[1], q[1]), min(p[3], q[3])
            if y1 > y0:
                edges.append(((ax, y0), (ax, y1)))
    for ay, by in ((p[3], q[1]), (q[3], p[1])):
        if abs(ay - by) < 1e-6:
            x0, x1 = max(p[0], q[0]), min(p[2], q[2])
            if x1 > x0:
                edges.append(((x0, ay), (x1, ay)))
    return edges


# ----- Masks -----


def band_polygon(seg: Segment, start: float, end: float, extra: float = 0.0) -> np.ndarray:
    """The corners of the band of the wall from `start` to `end` along the segment."""
    c0, c1 = seg.across()
    d, n = seg.direction, seg.normal
    pts = [
        seg.a + d * start + n * (c0 - extra),
        seg.a + d * end + n * (c0 - extra),
        seg.a + d * end + n * (c1 + extra),
        seg.a + d * start + n * (c1 + extra),
    ]
    return np.round(np.array(pts)).astype(np.int32)


def wall_masks(plan: Plan) -> tuple[np.ndarray, np.ndarray]:
    """The mask of all wall bodies, and the label image with the openings."""
    wall = np.zeros((plan.height, plan.width), np.uint8)
    for seg in plan.segments:
        # The bands go on past the ends (an interior wall by half its thickness, an exterior wall by
        # its full thickness), so the walls fill the corners.
        ext = seg.thickness / 2 if not seg.exterior else plan.ext_thickness
        cv2.fillPoly(wall, [band_polygon(seg, -ext, seg.length + ext)], 1)
    # The walls stay inside the footprint, so an exterior band does not go out past the outline.
    wall[plan.footprint == 0] = 0
    label = wall.copy()
    for o in plan.openings:
        poly = band_polygon(o.segment, o.start, o.end, extra=0.5)
        mask = np.zeros_like(wall)
        cv2.fillPoly(mask, [poly], 1)
        label[(mask == 1) & (wall == 1)] = o.kind
    return wall, label


# ----- Drawing -----


def ink(rng, base=0, spread=60) -> int:
    return int(np.clip(base + rng.uniform(0, spread), 0, 255))


def line_width(rng, plan: Plan, factor=1.0) -> int:
    return max(1, int(round(rng.uniform(0.8, 2.2) * factor * max(1.0, plan.scale / 60))))


def draw_walls(img, plan: Plan, wall: np.ndarray, label: np.ndarray, rng) -> None:
    solid = (wall == 1) & (label == WALL)
    style = rng.choice(["solid", "solid", "gray", "hatch", "outline", "outline_fill"])
    color = ink(rng, 0, 50)
    if style == "solid":
        img[solid] = color
    elif style == "gray":
        img[solid] = ink(rng, 70, 90)
    elif style in ("hatch", "outline", "outline_fill"):
        if style == "outline_fill":
            img[solid] = ink(rng, 150, 80)
        if style == "hatch":
            hatch = np.full_like(img, 255)
            step = int(rng.uniform(4, 10))
            for k in range(-plan.height, plan.width, step):
                cv2.line(hatch, (k, 0), (k + plan.height, plan.height), color, 1)
            img[solid] = np.minimum(img[solid], hatch[solid])
        edges = cv2.morphologyEx(solid.astype(np.uint8), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
        width = line_width(rng, plan)
        if width > 1:
            edges = cv2.dilate(edges, np.ones((width, width), np.uint8))
        img[(edges == 1) & (cv2.dilate(solid.astype(np.uint8), np.ones((3, 3), np.uint8)) == 1)] = color


def draw_openings(img, plan: Plan, rng) -> None:
    thin = max(1, int(round(plan.scale / 80)))
    color = ink(rng, 0, 70)
    for o in plan.openings:
        seg = o.segment
        d, n = seg.direction, seg.normal
        c0, c1 = seg.across()
        width = o.end - o.start
        p = lambda s, c: tuple(np.round(seg.a + d * s + n * c).astype(int))  # noqa: E731
        if rng.random() < 0.5:  # jamb lines at the ends of the gap
            for s in (o.start, o.end):
                cv2.line(img, p(s, c0), p(s, c1), color, thin)
        if o.kind == WINDOW:
            if o.style == "two":
                for f in (1 / 3, 2 / 3):
                    c = c0 + (c1 - c0) * f
                    cv2.line(img, p(o.start, c), p(o.end, c), color, thin)
            elif o.style == "three":
                for f in (0.0, 0.5, 1.0):
                    c = c0 + (c1 - c0) * f
                    cv2.line(img, p(o.start, c), p(o.end, c), color, thin)
            elif o.style == "frame":
                pts = np.array([p(o.start, c0), p(o.end, c0), p(o.end, c1), p(o.start, c1)], np.int32)
                cv2.polylines(img, [pts], True, color, thin)
                c = (c0 + c1) / 2
                cv2.line(img, p(o.start, c), p(o.end, c), color, thin)
            else:  # thick
                c = (c0 + c1) / 2
                cv2.line(img, p(o.start, c), p(o.end, c), color, max(2, int((c1 - c0) / 3)))
            continue
        if o.style == "none":
            continue
        if o.style == "slide":
            for f, shift in ((0.35, 0.0), (0.65, 0.3)):
                c = c0 + (c1 - c0) * f
                cv2.line(img, p(o.start + width * shift * 0.5, c), p(o.end - width * (0.3 - shift) * 0.5, c), color, thin)
            continue
        leaves = [(o.start, o.end)] if o.style == "swing" else [(o.start, (o.start + o.end) / 2), ((o.start + o.end) / 2, o.end)]
        side = 1 if rng.random() < 0.5 else -1
        face = c1 if side == 1 else c0
        hinge_first = rng.random() < 0.5
        for k, (s0, s1) in enumerate(leaves):
            # A double door has its hinges at both outer ends.
            hinge_at_start = (k == 0) if len(leaves) == 2 else hinge_first
            h_s, o_s = (s0, s1) if hinge_at_start else (s1, s0)
            hinge = seg.a + d * h_s + n * face
            r = abs(s1 - s0)
            leaf = hinge + n * side * r
            closed = seg.a + d * o_s + n * face
            cv2.line(img, tuple(np.round(hinge).astype(int)), tuple(np.round(leaf).astype(int)), color, thin)
            a1 = math.degrees(math.atan2(*(leaf - hinge)[::-1]))
            a2 = math.degrees(math.atan2(*(closed - hinge)[::-1]))
            delta = (a2 - a1 + 540) % 360 - 180
            start, end = (a1, a1 + delta) if delta > 0 else (a1 + delta, a1)
            dashed = rng.random() < 0.25
            if dashed:
                for t in np.arange(start, end, 8):
                    cv2.ellipse(img, tuple(np.round(hinge).astype(int)), (int(r), int(r)), 0, t, t + 4, color, 1)
            else:
                cv2.ellipse(img, tuple(np.round(hinge).astype(int)), (int(r), int(r)), 0, start, end, color, 1)


def draw_furniture(img, plan: Plan, rng) -> None:
    s = plan.scale
    color = ink(rng, 40, 120)
    lw = max(1, int(round(s / 90)))
    for x0, y0, x1, y1 in plan.rooms:
        w, h = x1 - x0, y1 - y0
        margin = int(plan.int_thickness / 2 + 2)
        for _ in range(int(rng.integers(0, 5))):
            kind = rng.choice(["bed", "sofa", "table", "counter", "toilet", "tub", "box", "round", "wardrobe"])
            fw = int(rng.uniform(0.4, 2.0) * s)
            fh = int(rng.uniform(0.4, 2.2) * s)
            if fw >= w - 2 * margin or fh >= h - 2 * margin:
                continue
            # Furniture stands against a wall most of the time.
            fx = int(rng.choice([x0 + margin, x1 - margin - fw, rng.uniform(x0 + margin, x1 - margin - fw)]))
            fy = int(rng.choice([y0 + margin, y1 - margin - fh, rng.uniform(y0 + margin, y1 - margin - fh)]))
            r = (fx, fy, fx + fw, fy + fh)
            if kind == "round":
                cv2.circle(img, (fx + fw // 2, fy + fh // 2), min(fw, fh) // 2, color, lw)
                for a in range(0, 360, int(rng.choice([60, 90, 120]))):
                    cx = int(fx + fw / 2 + math.cos(math.radians(a)) * min(fw, fh) * 0.65)
                    cy = int(fy + fh / 2 + math.sin(math.radians(a)) * min(fw, fh) * 0.65)
                    q = int(0.2 * s)
                    cv2.rectangle(img, (cx - q, cy - q), (cx + q, cy + q), color, lw)
                continue
            cv2.rectangle(img, r[:2], r[2:], color, lw)
            if kind == "bed":
                pw = fw // 2 - 4
                cv2.rectangle(img, (fx + 3, fy + 3), (fx + 3 + pw, fy + int(0.35 * s)), color, lw)
                cv2.line(img, (fx, fy + int(0.6 * s)), (fx + fw, fy + int(0.6 * s)), color, lw)
            elif kind == "sofa":
                b = int(0.2 * s)
                cv2.rectangle(img, (fx, fy), (fx + fw, fy + b), color, lw)
                cv2.rectangle(img, (fx, fy), (fx + b, fy + fh), color, lw)
                cv2.rectangle(img, (fx + fw - b, fy), (fx + fw, fy + fh), color, lw)
            elif kind == "counter":
                for k in range(int(rng.integers(0, 3))):
                    c = (fx + int((k + 0.5) * fw / 3), fy + fh // 2)
                    cv2.circle(img, c, max(2, int(min(fw, fh) * 0.18)), color, lw)
            elif kind == "toilet":
                cv2.ellipse(img, (fx + fw // 2, fy + fh * 2 // 3), (fw // 2, fh // 3), 0, 0, 360, color, lw)
            elif kind == "tub":
                cv2.rectangle(img, (fx + 4, fy + 4), (fx + fw - 4, fy + fh - 4), color, lw)
                cv2.circle(img, (fx + fw // 2, fy + 10), 3, color, -1)
            elif kind == "wardrobe":
                cv2.line(img, (fx, fy), (fx + fw, fy + fh), color, lw)
                cv2.line(img, (fx + fw, fy), (fx, fy + fh), color, lw)


def draw_stairs(img, plan: Plan, rng) -> None:
    if not plan.rooms or rng.random() < 0.55:
        return
    x0, y0, x1, y1 = plan.rooms[int(rng.integers(0, len(plan.rooms)))]
    s = plan.scale
    w, h = int(rng.uniform(0.9, 1.2) * s), int(rng.uniform(2.5, 4.0) * s)
    if rng.random() < 0.5:
        w, h = h, w
    if w > x1 - x0 - 8 or h > y1 - y0 - 8:
        return
    sx, sy = int(x0 + 4 + rng.uniform(0, x1 - x0 - 8 - w)), int(y0 + 4 + rng.uniform(0, y1 - y0 - 8 - h))
    color = ink(rng, 20, 80)
    cv2.rectangle(img, (sx, sy), (sx + w, sy + h), color, 1)
    step = max(4, int(0.27 * s))
    if h > w:
        for y in range(sy + step, sy + h, step):
            cv2.line(img, (sx, y), (sx + w, y), color, 1)
        cv2.arrowedLine(img, (sx + w // 2, sy + h - step // 2), (sx + w // 2, sy + step // 2), color, 1, tipLength=0.05)
    else:
        for x in range(sx + step, sx + w, step):
            cv2.line(img, (x, sy), (x, sy + h), color, 1)
        cv2.arrowedLine(img, (sx + step // 2, sy + h // 2), (sx + w - step // 2, sy + h // 2), color, 1, tipLength=0.05)


def put_text(img, text, org, rng, scale, color, thickness=1, angle=0) -> None:
    font = int(rng.choice(FONTS))
    if angle == 0:
        cv2.putText(img, text, org, font, scale, color, thickness, cv2.LINE_AA)
        return
    (tw, th), _ = cv2.getTextSize(text, font, scale, thickness)
    patch = np.full((th * 2 + 4, tw + 4), 255, np.uint8)
    cv2.putText(patch, text, (2, th + 2), font, scale, color, thickness, cv2.LINE_AA)
    patch = cv2.rotate(patch, cv2.ROTATE_90_COUNTERCLOCKWISE)
    x, y = org
    ph, pw = patch.shape
    if 0 <= y < img.shape[0] - ph and 0 <= x < img.shape[1] - pw:
        region = img[y : y + ph, x : x + pw]
        np.minimum(region, patch, out=region)


def draw_text(img, plan: Plan, rng) -> None:
    s = plan.scale
    color = ink(rng, 0, 100)
    for x0, y0, x1, y1 in plan.rooms:
        if rng.random() < 0.2:
            continue
        scale = rng.uniform(0.25, 0.7) * max(0.6, s / 60)
        cx, cy = int((x0 + x1) / 2 + rng.uniform(-20, 20)), int((y0 + y1) / 2 + rng.uniform(-10, 10))
        put_text(img, str(rng.choice(WORDS)), (cx - 30, cy), rng, scale, color)
        if rng.random() < 0.7:
            area = (x1 - x0) * (y1 - y0) / s / s
            put_text(img, f"{area:.2f} m2" if rng.random() < 0.6 else f"{area:.1f}", (cx - 30, cy + int(22 * scale + 6)), rng, scale * 0.8, color)


def draw_dimensions(img, plan: Plan, rng) -> None:
    if rng.random() < 0.15:
        return
    color = ink(rng, 0, 100)
    ys, xs = np.nonzero(plan.footprint)
    bx0, bx1, by0, by1 = xs.min(), xs.max(), ys.min(), ys.max()
    for side in ("top", "bottom", "left", "right"):
        if rng.random() < 0.3:
            continue
        offset = int(rng.uniform(20, plan.margin - 15)) if plan.margin > 40 else 20
        cuts = sorted(set([0.0, 1.0] + list(rng.uniform(0.1, 0.9, int(rng.integers(0, 4))))))
        horizontal = side in ("top", "bottom")
        if horizontal:
            y = by0 - offset if side == "top" else by1 + offset
            xs_ = [int(bx0 + c * (bx1 - bx0)) for c in cuts]
            cv2.line(img, (xs_[0], y), (xs_[-1], y), color, 1)
            for x in xs_:
                cv2.line(img, (x, y - 6), (x, y + 6), color, 1)
                cv2.line(img, (x - 4, y + 4), (x + 4, y - 4), color, 1)
            for a, b in zip(xs_, xs_[1:]):
                put_text(img, f"{(b - a) / plan.scale:.2f}", ((a + b) // 2 - 15, y - 4), rng, 0.35, color)
        else:
            x = bx0 - offset if side == "left" else bx1 + offset
            ys_ = [int(by0 + c * (by1 - by0)) for c in cuts]
            cv2.line(img, (x, ys_[0]), (x, ys_[-1]), color, 1)
            for y in ys_:
                cv2.line(img, (x - 6, y), (x + 6, y), color, 1)
                cv2.line(img, (x - 4, y + 4), (x + 4, y - 4), color, 1)
            for a, b in zip(ys_, ys_[1:]):
                put_text(img, f"{(b - a) / plan.scale:.2f}", (x - 14, (a + b) // 2 - 20), rng, 0.35, color, angle=90)


def draw_extras(img, plan: Plan, rng) -> None:
    color = ink(rng, 30, 100)
    h, w = img.shape
    if rng.random() < 0.3:  # grid axes with bubbles
        for k in range(int(rng.integers(2, 6))):
            x = int(rng.uniform(plan.margin, w - plan.margin))
            for y in range(0, h, 24):
                cv2.line(img, (x, y), (x, min(h, y + 14)), color, 1)
                cv2.circle(img, (x, min(h - 1, y + 19)), 1, color, -1)
            cv2.circle(img, (x, 14), 10, color, 1)
            put_text(img, chr(65 + k), (x - 5, 19), rng, 0.4, color)
    if rng.random() < 0.5:  # north arrow
        cx, cy, r = int(rng.uniform(30, w - 30)), int(rng.uniform(30, 80)), int(rng.uniform(12, 25))
        cv2.circle(img, (cx, cy), r, color, 1)
        cv2.fillPoly(img, [np.array([[cx, cy - r], [cx - r // 3, cy + r // 2], [cx + r // 3, cy + r // 2]])], color)
        put_text(img, "N", (cx - 5, cy - r - 4), rng, 0.4, color)
    if rng.random() < 0.3:  # title block
        bw, bh = int(rng.uniform(150, 300)), int(rng.uniform(40, 90))
        x, y = w - bw - 5, h - bh - 5
        cv2.rectangle(img, (x, y), (x + bw, y + bh), color, 1)
        cv2.line(img, (x, y + bh // 2), (x + bw, y + bh // 2), color, 1)
        put_text(img, "GRUNDRISS EG 1:100", (x + 6, y + bh // 2 - 8), rng, 0.4, color)
        put_text(img, "Projekt 2024-117", (x + 6, y + bh - 8), rng, 0.35, color)
    if rng.random() < 0.25 and plan.rooms:  # a hatched area, for example a terrace or a tiled floor
        x0, y0, x1, y1 = plan.rooms[int(rng.integers(0, len(plan.rooms)))]
        step = int(rng.uniform(6, 16))
        mask = np.zeros_like(img)
        for k in range(x0 - (y1 - y0), x1, step):
            cv2.line(mask, (k, y1), (k + (y1 - y0), y0), 255, 1)
        if rng.random() < 0.5:
            for k in range(y0, y1, step):
                cv2.line(mask, (x0, k), (x1, k), 255, 1)
        region = np.zeros_like(img)
        region[y0:y1, x0:x1] = 1
        img[(mask == 255) & (region == 1)] = ink(rng, 120, 100)


def draw_fills(img, plan: Plan, rng) -> None:
    if rng.random() < 0.25:
        for x0, y0, x1, y1 in plan.rooms:
            if rng.random() < 0.6:
                img[y0:y1, x0:x1] = int(rng.uniform(200, 248))


def render(rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """One clean drawing of a random building, and its label."""
    plan = Plan(rng)
    img = np.full((plan.height, plan.width), 255, np.uint8)
    wall, label = wall_masks(plan)
    draw_fills(img, plan, rng)
    draw_extras(img, plan, rng)
    draw_furniture(img, plan, rng)
    draw_stairs(img, plan, rng)
    draw_walls(img, plan, wall, label, rng)
    draw_openings(img, plan, rng)
    draw_text(img, plan, rng)
    draw_dimensions(img, plan, rng)
    return img, label


# ----- The faults of a scan -----


def degrade(img: np.ndarray, label: np.ndarray, rng) -> tuple[np.ndarray, np.ndarray]:
    h, w = img.shape
    # A small rotation and a small perspective. The label moves the same way.
    angle = rng.uniform(-3, 3) if rng.random() < 0.7 else 0.0
    if rng.random() < 0.15:
        angle += 90 * int(rng.integers(1, 4))
    jitter = rng.uniform(0, 0.025) * min(w, h)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = src + rng.uniform(-jitter, jitter, src.shape).astype(np.float32)
    m = cv2.getPerspectiveTransform(src, dst)
    r = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    r = np.vstack([r, [0, 0, 1]])
    full = r @ m
    corners = cv2.perspectiveTransform(src[None], full)[0]
    x0, y0 = corners.min(0)
    x1, y1 = corners.max(0)
    shift = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]])
    full = shift @ full
    size = (int(x1 - x0), int(y1 - y0))
    img = cv2.warpPerspective(img, full, size, flags=cv2.INTER_LINEAR, borderValue=255)
    label = cv2.warpPerspective(label, full, size, flags=cv2.INTER_NEAREST, borderValue=0)

    # A gentle wave of the lines, as with a bent sheet in a scanner.
    if rng.random() < 0.3:
        hh, ww = img.shape
        amp = rng.uniform(0.5, 2.0)
        yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
        fx = (amp * np.sin(yy / rng.uniform(80, 200) + rng.uniform(0, 6))).astype(np.float32)
        fy = (amp * np.sin(xx / rng.uniform(80, 200) + rng.uniform(0, 6))).astype(np.float32)
        img = cv2.remap(img, xx + fx, yy + fy, cv2.INTER_LINEAR, borderValue=255)
        label = cv2.remap(label, xx + fx, yy + fy, cv2.INTER_NEAREST, borderValue=0)

    f = img.astype(np.float32) / 255.0
    # Faded lines and a paper color.
    if rng.random() < 0.4:
        f = 1 - (1 - f) * rng.uniform(0.45, 0.9)
    if rng.random() < 0.5:
        f = f ** rng.uniform(0.6, 1.6)
    paper = rng.uniform(0.82, 1.0)
    f = f * paper
    # Uneven light: a smooth gradient over the sheet.
    if rng.random() < 0.6:
        hh, ww = f.shape
        gx = np.linspace(-1, 1, ww)[None, :] * rng.uniform(-0.15, 0.15)
        gy = np.linspace(-1, 1, hh)[:, None] * rng.uniform(-0.15, 0.15)
        f = f * (1 + gx + gy)
        if rng.random() < 0.3:
            cx, cy = rng.uniform(0, ww), rng.uniform(0, hh)
            yy, xx = np.mgrid[0:hh, 0:ww]
            d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / max(hh, ww)
            f = f * (1 - rng.uniform(0, 0.25) * d)
    # A lower resolution, then a scale up, as with a scan at a low dpi.
    if rng.random() < 0.4:
        k = rng.uniform(0.4, 0.8)
        small = cv2.resize(f, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        f = cv2.resize(small, (f.shape[1], f.shape[0]), interpolation=cv2.INTER_LINEAR)
    if rng.random() < 0.4:
        f = cv2.GaussianBlur(f, (0, 0), rng.uniform(0.3, 1.3))
    if rng.random() < 0.6:
        f = f + rng.normal(0, rng.uniform(0.005, 0.06), f.shape)
    if rng.random() < 0.15:  # salt and pepper specks
        specks = rng.random(f.shape)
        f[specks < 0.002] = rng.uniform(0, 0.4)
        f[specks > 0.998] = 1
    f = np.clip(f, 0, 1)
    out = (f * 255).astype(np.uint8)
    if rng.random() < 0.5:
        quality = int(rng.uniform(25, 90))
        ok, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if ok:
            out = cv2.imdecode(buf, cv2.IMREAD_GRAYSCALE)
    return out, label


def crop(img: np.ndarray, label: np.ndarray, size: int, rng) -> tuple[np.ndarray, np.ndarray]:
    """A random crop of `size` pixels. Most crops show a part of the building."""
    h, w = img.shape
    if h < size or w < size:
        ph, pw = max(0, size - h), max(0, size - w)
        top, left = int(rng.integers(0, ph + 1)), int(rng.integers(0, pw + 1))
        img = cv2.copyMakeBorder(img, top, ph - top, left, pw - left, cv2.BORDER_CONSTANT, value=int(img[0, 0]))
        label = cv2.copyMakeBorder(label, top, ph - top, left, pw - left, cv2.BORDER_CONSTANT, value=0)
        h, w = img.shape
    ys, xs = np.nonzero(label)
    if len(ys) and rng.random() < 0.9:
        i = int(rng.integers(0, len(ys)))
        cy = int(np.clip(ys[i] + rng.integers(-size // 3, size // 3), size // 2, h - size // 2))
        cx = int(np.clip(xs[i] + rng.integers(-size // 3, size // 3), size // 2, w - size // 2))
        y0, x0 = cy - size // 2, cx - size // 2
    else:
        y0, x0 = int(rng.integers(0, h - size + 1)), int(rng.integers(0, w - size + 1))
    return img[y0 : y0 + size, x0 : x0 + size], label[y0 : y0 + size, x0 : x0 + size]


def sample(rng: np.random.Generator, size: int = TILE) -> tuple[np.ndarray, np.ndarray]:
    """One training sample: a gray image (uint8) and its label (uint8), both size × size."""
    img, label = render(rng)
    img, label = degrade(img, label, rng)
    return crop(img, label, size, rng)


def full_sample(rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """A whole degraded plan, scaled so that its long side is LONG_SIDE, as the app does."""
    img, label = render(rng)
    img, label = degrade(img, label, rng)
    k = LONG_SIDE / max(img.shape)
    img = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    label = cv2.resize(label, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_NEAREST)
    return img, label


PALETTE = np.array([[255, 255, 255], [40, 40, 40], [40, 160, 240], [240, 120, 40]], np.uint8)


def colorize(label: np.ndarray) -> np.ndarray:
    return PALETTE[label][:, :, ::-1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", required=True)
    parser.add_argument("--count", type=int, default=8)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--full", action="store_true", help="whole plans instead of crops")
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    rng = np.random.default_rng(args.seed)
    for i in range(args.count):
        img, label = full_sample(rng) if args.full else sample(rng)
        both = np.hstack([cv2.cvtColor(img, cv2.COLOR_GRAY2BGR), colorize(label)])
        cv2.imwrite(os.path.join(args.out, f"sample-{i:02d}.png"), both)
    print(f"wrote {args.count} samples to {args.out}")


if __name__ == "__main__":
    main()
