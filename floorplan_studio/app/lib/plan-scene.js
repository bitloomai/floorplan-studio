/**
 * plan-scene.js — composes a floor into a flat SCENE DESCRIPTION.
 *
 * Returns primitives ({tag, attrs, text}), never DOM and never a string. Two
 * thin backends consume it: the editor turns primitives into live SVG elements
 * it can hit-test and drag, the exporter turns them into an SVG file. All the
 * geometry exists exactly once, so what you edit and what you export cannot
 * disagree.
 *
 * Composition order, and why:
 *
 *   sheet      the page
 *   flooring   per-room fill (pattern) + field texture, clipped to the room
 *   grid       editor only
 *   daylight   ambient wash + sun beams, UNDER everything physical, because
 *              daylight lands on the floor, not on the furniture
 *   boundaries walls / railings / grills, split into runs by openings
 *   openings   doors (live, if sensored), windows, arches
 *   furniture  real object outlines from shapes.js
 *   scrim      one flat dim over the whole plate, strongest at night
 *   lampWash   per-room artificial light, ABOVE the scrim — this is the layer
 *              that lifts a lit room back out of the dark
 *   glow       lamp pools, sized from each fitting's real wattage
 *   markers    device icons, always on top so they stay tappable
 *   labels     room names
 *
 * The scrim/lampWash pair is why turning a light on is legible from across the
 * room instead of needing a marker inspected. Daylight stays below the walls
 * because sun lands on the floor; lamplight sits above them because at night
 * you are looking at what is lit, not at what is there.
 *
 * Anything a type declares `aboveDaylight` for is lifted out of `furniture`
 * into `overDaylight` — solar panels are the case that matters: they are
 * near-black glass that stays dark *because* it is absorbing light, so washing
 * them with a sun patch is backwards.
 *
 * Runs unmodified in Node and the browser.
 */
(function (root, factory) {
  const api = factory(function req(name) {
    if (typeof module === 'object' && module.exports) return require('./' + name);
    const globals = { flooring: 'Flooring', shapes: 'Shapes', sun: 'SunModel', controls: 'Controls', lighting: 'Lighting' };
    return root[globals[name]];
  });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlanScene = api;
}(typeof self !== 'undefined' ? self : this, function (req) {
  'use strict';

  let _F, _S, _Sun, _L;
  const Flooring = () => (_F = _F || req('flooring'));
  const Shapes = () => (_S = _S || req('shapes'));
  const Sun = () => (_Sun = _Sun || req('sun'));
  const Light = () => (_L = _L || req('lighting'));

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const RAD = Math.PI / 180;

  /* Resolve a colour reference. '@token' looks up the theme; anything else is a
   * literal, so a one-off colour still works without inventing a token. */
  function colour(ref, theme, fallback) {
    if (ref === undefined || ref === null) return fallback;
    if (typeof ref === 'string' && ref[0] === '@') return theme[ref.slice(1)] || fallback;
    return ref;
  }

  function makeProjector(project) {
    const ppf = num(project.ppf, 22);
    const ox = (project.origin && project.origin[0]) || 0;
    const oy = (project.origin && project.origin[1]) || 0;
    return {
      ppf,
      X: (ft) => ox + ft * ppf, Y: (ft) => oy + ft * ppf, S: (ft) => ft * ppf,
      invX: (px) => (px - ox) / ppf, invY: (px) => (px - oy) / ppf,
    };
  }

  /* ---------------------------------------------------------- room geometry */

  /* An arc between two corners, as points.
   *
   * A point may be written `[x, y, r]`, where `r` bows the segment ARRIVING at
   * it into an arc of that radius — the sign picks which side it bows. That is
   * the whole notation: rooms are still a list of corners, and a curved wall is
   * one of them with a radius on it.
   *
   * It is FLATTENED here rather than carried through as a path command, because
   * every other thing the geometry does — hit-testing, wall runs, openings,
   * centroids, clip paths, the cove that traces the outline — is polygon
   * arithmetic. One flattening at the source keeps all of it working, and at
   * plan scale a dozen segments is a smooth curve. */
  function arcTo(a, b, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy);
    const R = Math.abs(r);
    /* A radius smaller than half the span cannot reach: draw the straight line
     * rather than an arc of imaginary radius. */
    if (!d || !isFinite(R) || R < d / 2 - 1e-9) return [[b[0], b[1]]];
    const h = Math.sqrt(Math.max(0, R * R - (d / 2) * (d / 2))) * (r < 0 ? -1 : 1);
    const cx = (a[0] + b[0]) / 2 + (-dy / d) * h;
    const cy = (a[1] + b[1]) / 2 + (dx / d) * h;
    const a0 = Math.atan2(a[1] - cy, a[0] - cx);
    let sweep = Math.atan2(b[1] - cy, b[0] - cx) - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    const n = Math.max(2, Math.min(64, Math.ceil(Math.abs(sweep) / 0.16)));
    const out = [];
    for (let i = 1; i <= n; i++) {
      const t = a0 + sweep * (i / n);
      out.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]);
    }
    return out;
  }

  /* Flattening is memoised on the points array itself: `roomPoints` is called
   * by hit-testing, edges, centroid and clipping, and re-flattening a curved
   * room on every one of those would be the most expensive thing here. */
  const flatCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  function flattenOutline(points) {
    if (!points.some((p) => p.length > 2 && p[2])) return points;
    if (flatCache && flatCache.has(points)) return flatCache.get(points);
    const out = [];
    /* Which ORIGINAL corner each flattened point arrived at.
     *
     * Without this a curve loses its identity the moment it is flattened: a
     * bowed east wall becomes six short diagonal segments, none of which is
     * horizontal or vertical, so every one comes back with `wall: null`. A
     * boundary already on that wall then resolves to nothing and stops being
     * drawn — silently — and the wall picker cannot offer the wall at all,
     * which makes a curved wall a wall you can never give a treatment.
     *
     * Carried as a property on the array rather than a third element of each
     * point, because the third element already means something on the way IN
     * (the radius) and every reader indexes p[0] and p[1]. */
    const src = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i - 1 + points.length) % points.length];
      const p = points[i];
      if (p.length > 2 && p[2]) {
        for (const q of arcTo(prev, p, p[2])) { out.push(q); src.push(i); }
      } else { out.push([p[0], p[1]]); src.push(i); }
    }
    out.src = src;
    if (flatCache) flatCache.set(points, out);
    return out;
  }

  function roomPoints(room) {
    if (room.shape === 'poly' && Array.isArray(room.points) && room.points.length > 2) {
      return flattenOutline(room.points);
    }
    const [x, y, w, h] = room.rect || [0, 0, 1, 1];
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  }

  /* A polygon pulled inward by `d` feet, edge by edge — each edge offset along
   * its own inward normal and consecutive offsets intersected. Moving every
   * corner toward the centroid instead would inset a long thin room far more
   * across its width than along its length, which is exactly the room a cove
   * runs around. Degenerate corners fall back to the original point rather than
   * flying off to infinity. */
  function insetPolygon(points, d) {
    const n = points.length;
    if (n < 3 || !d) return points;
    const area = polygonArea(points);
    const sign = area < 0 ? -1 : 1;          // inward depends on winding
    const lines = [];
    for (let i = 0; i < n; i++) {
      const a = points[i], b = points[(i + 1) % n];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = (dy / len) * sign, ny = (-dx / len) * sign;
      lines.push({ px: a[0] - nx * d, py: a[1] - ny * d, dx, dy });
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = lines[(i - 1 + n) % n], q = lines[i];
      const den = p.dx * q.dy - p.dy * q.dx;
      if (Math.abs(den) < 1e-9) { out.push(points[i]); continue; }
      const t = ((q.px - p.px) * q.dy - (q.py - p.py) * q.dx) / den;
      out.push([p.px + p.dx * t, p.py + p.dy * t]);
    }
    return out;
  }

  function polygonArea(points) {
    let a = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }

  function roomBBox(room) {
    const pts = roomPoints(room);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0, y0, x1 - x0, y1 - y0];
  }

  function roomCentroid(room) {
    const pts = roomPoints(room);
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      const f = x0 * y1 - x1 * y0;
      a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    if (Math.abs(a) < 1e-9) { const b = roomBBox(room); return [b[0] + b[2] / 2, b[1] + b[3] / 2]; }
    a *= 0.5;
    return [cx / (6 * a), cy / (6 * a)];
  }

  function pointInRoom(room, x, y) {
    const pts = roomPoints(room);
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* First match wins: a room listed earlier and geometrically inside a larger
   * one (a pump alcove inside a car park) must beat its container. */
  function roomAt(floor, x, y) {
    for (const r of floor.rooms || []) if (pointInRoom(r, x, y)) return r;
    return null;
  }

  /* The room a room reports to, for part_of merging. */
  function primaryRoom(floor, room) {
    if (!room || !room.part_of) return room;
    return (floor.rooms || []).find((r) => r.id === room.part_of) || room;
  }

  /* Every library key is `<kind>.<name>`, so an item that recorded its kind —
   * which every item the editor writes does — resolves on the first line. The
   * alias table below it is for items that predate that, or that came in from a
   * spec using an older name. Kind-scoped aliases are consulted before bare
   * ones, and a bare name two kinds both claim (`solar`, `water`) is absent
   * from the table on purpose: guessing which was meant is precisely the bug
   * the kind field exists to prevent. */
  function resolveType(library, item) {
    const types = (library && library.types) || {};
    const aliases = (library && library.aliases) || {};
    const name = item.type;
    if (!name) return null;
    if (item.kind) {
      const scoped = item.kind + '.' + name;
      if (types[scoped]) return types[scoped];
      if (aliases[scoped] && types[aliases[scoped]]) return types[aliases[scoped]];
    }
    if (types[name]) return types[name];
    if (aliases[name] && types[aliases[name]]) return types[aliases[name]];
    return null;
  }

  /* ------------------------------------------------------------- boundaries */

  /* Each room edge as a 1-D interval so overrides and openings can be applied
   * by interval arithmetic rather than by special-casing each shape. */
  function roomEdges(room) {
    const pts = roomPoints(room);
    const box = roomBBox(room);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const horizontal = Math.abs(a[1] - b[1]) < 1e-6;
      const vertical = Math.abs(a[0] - b[0]) < 1e-6;
      /* Which original corner this segment belongs to. For a straight outline
       * that is just its own index; for a curve it is the corner the arc was
       * bowed toward, so every segment of one bowed wall shares a source. */
      const src = pts.src ? pts.src[(i + 1) % pts.length] : i;
      if (!horizontal && !vertical) {
        /* A segment of a curve is still part of a WALL, and the wall it is part
         * of is the straight chord between the two original corners. Classify
         * that instead, so a bowed east wall still answers to "east" and keeps
         * whatever treatment it was given. */
        let wall = null;
        const srcPts = room.points;
        if (srcPts && srcPts.length) {
          const p1 = srcPts[(src - 1 + srcPts.length) % srcPts.length], p2 = srcPts[src];
          if (p1 && p2) {
            if (Math.abs(p1[1] - p2[1]) < 1e-6) wall = Math.abs(p1[1] - box[1]) < 1e-6 ? 'n' : 's';
            else if (Math.abs(p1[0] - p2[0]) < 1e-6) wall = Math.abs(p1[0] - box[0]) < 1e-6 ? 'w' : 'e';
          }
        }
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        out.push({ a, b, wall, diagonal: true, curved: !!(pts.src), src, index: i,
          horizontal: false, fixed: null, lo: 0, hi: segLen });
        continue;
      }
      const wall = horizontal
        ? (Math.abs(a[1] - box[1]) < 1e-6 ? 'n' : 's')
        : (Math.abs(a[0] - box[0]) < 1e-6 ? 'w' : 'e');
      const lo = horizontal ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]);
      const hi = horizontal ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
      const fixed = horizontal ? a[1] : a[0];
      out.push({ a, b, wall, horizontal, lo, hi, fixed, index: i, src });
    }
    return out;
  }

  /* Outward normal of an edge, in SCREEN degrees clockwise from up. */
  const WALL_NORMAL = { n: 0, e: 90, s: 180, w: 270 };

  /* A position along an edge. Axis-aligned edges measure in plan coordinates —
   * `t` IS the x or the y — which is what makes an opening's `at` an absolute
   * number. A curve segment has no single axis, so it measures from its own
   * start instead and is parameterised 0..length. */
  function pointOn(edge, t) {
    if (edge.diagonal) {
      const len = Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]) || 1;
      const k = clamp(t, 0, len) / len;
      return [edge.a[0] + (edge.b[0] - edge.a[0]) * k, edge.a[1] + (edge.b[1] - edge.a[1]) * k];
    }
    return edge.horizontal ? [t, edge.fixed] : [edge.fixed, t];
  }

  /* WHICH edge does this opening sit on?
   *
   * `wall` is a letter, and a letter is not unique: an L-shaped room has six
   * edges and only four letters, so two of them are `e` and two are `s`. Every
   * place that resolved an opening picked `edges.find(e => e.wall === ...)` —
   * the FIRST match — while the code that cut the hole in the wall matched by
   * letter and so cut BOTH. The result was a gap in a wall with no door in it.
   *
   * `edge` (an index) addresses one exactly, the same way a boundary already
   * could. Falling back to the letter keeps every existing plan working. */
  function openingEdgeOf(room, op) {
    const edges = roomEdges(room);
    if (op.edge !== undefined && op.edge !== null) {
      return edges.find((e) => e.index === op.edge) || null;
    }
    return edges.find((e) => e.wall === op.wall) || null;
  }

  /* Do two rooms' edges describe the same physical wall? Same orientation, same
   * position, and an overlapping span. */
  function edgesCoincide(a, b) {
    if (!a || !b) return false;
    if (!!a.horizontal !== !!b.horizontal) return false;
    if (Math.abs(a.fixed - b.fixed) > 1e-6) return false;
    return Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > 1e-6;
  }

  /* Every opening that interrupts this edge — the room's own, and the
   * neighbour's where the two rooms share the wall.
   *
   * A door between two rooms belongs to exactly one of them. Without the second
   * half of this, the other room drew its wall straight across the doorway
   * (proved: room B emitted one unbroken run over room A's window) and its
   * light zone had no way through, so a lamp lit one direction only. Which side
   * an opening happens to be filed under is bookkeeping; the hole in the wall
   * is physical and belongs to both. */
  function openingsOnEdge(floor, room, edge) {
    const out = [];
    for (const op of floor.openings || []) {
      if (op.overhead) continue;
      const owner = (floor.rooms || []).find((r) => r.id === op.room);
      if (!owner) continue;
      const oe = openingEdgeOf(owner, op);
      if (!oe) continue;
      if (owner.id === room.id) { if (oe.index === edge.index) out.push(op); }
      else if (edgesCoincide(oe, edge)) out.push(op);
    }
    return out;
  }

  /* Cut an edge into runs. Overrides set a boundary type over a sub-range;
   * openings remove a range entirely (they are drawn by the opening layer). */
  function edgeRuns(edge, room, floor, defaults, isExterior) {
    const base = isExterior ? defaults.exterior : defaults.interior;
    const marks = [{ at: edge.lo }, { at: edge.hi }];
    const overrides = (floor.boundaries || []).filter((b) =>
      b.room === room.id && (b.wall === edge.wall || b.edge === edge.index || b.edge === edge.src));
    for (const o of overrides) {
      marks.push({ at: clamp(num(o.from, edge.lo), edge.lo, edge.hi) });
      marks.push({ at: clamp(num(o.to, edge.hi), edge.lo, edge.hi) });
    }
    const holes = openingsOnEdge(floor, room, edge);
    for (const o of holes) {
      marks.push({ at: clamp(num(o.at, edge.lo), edge.lo, edge.hi) });
      marks.push({ at: clamp(num(o.at, edge.lo) + num(o.w, 2.5), edge.lo, edge.hi) });
    }
    const cuts = [...new Set(marks.map((m) => Math.round(m.at * 10000) / 10000))].sort((a, b) => a - b);

    const runs = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const from = cuts[i], to = cuts[i + 1];
      if (to - from < 1e-4) continue;
      const mid = (from + to) / 2;
      if (holes.some((o) => mid > num(o.at, 0) && mid < num(o.at, 0) + num(o.w, 2.5))) continue;
      const ov = overrides.find((o) => mid >= num(o.from, edge.lo) && mid <= num(o.to, edge.hi));
      runs.push({ from, to, type: (ov && ov.type) || base, props: (ov && ov.props) || null });
    }
    return runs;
  }

  /* Light times material: what a lamp's colour becomes after crossing a tinted
   * surface. Multiplied per channel, which is how a filter actually works — a
   * warm lamp behind blue-green glass comes out muted and cool, not simply
   * repainted in the glass's colour. Anything unparseable falls back to the
   * light's own colour, because a bad tint should not blank the wash. */
  function mixColour(light, tintCol) {
    const rgb = (s) => {
      if (!s || typeof s !== 'string') return null;
      let m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
      if (m) return [+m[1], +m[2], +m[3]];
      m = /^#([0-9a-f]{6})/i.exec(s.trim());
      if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
      m = /^#([0-9a-f]{3})$/i.exec(s.trim());
      if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16));
      return null;
    };
    const a = rgb(light), b = rgb(tintCol);
    if (!a) return light;
    if (!b) return light;
    return `rgb(${a.map((v, i) => Math.round((v * b[i]) / 255)).join(',')})`;
  }

  /* Every run on a room's edges that light actually gets through.
   *
   * A boundary type has carried a `transmission` from the beginning — a glass
   * railing is 0.85, a grill or a louvre something in between, an `open_edge`,
   * `threshold` or `stepdown` a full 1 — and until now nothing read it. Only
   * `floor.openings` fed the daylight model and the light zones, so a balcony
   * walled in glass got no daylight through it, and a car park split into four
   * rects by invisible lines had light stop dead at each one.
   *
   * That is the same mistake as a property nothing renders: the number was
   * declared, documented and dead. This turns it into the one thing the two
   * light models already understand — an aperture with an area and a
   * transmission — so a glass wall, a grill, an open edge and a window stop
   * being four cases and become one.
   *
   * A solid wall is transmission 0 and drops out here, which is why an existing
   * plan that declares no boundaries behaves exactly as it did.
   */
  function transmissiveRuns(room, floor, bDoc, defaults, onExtent) {
    const out = [];
    for (const edge of roomEdges(room)) {
      if (edge.diagonal) continue;
      const isExterior = onExtent(edge.a[0], edge.a[1]) && onExtent(edge.b[0], edge.b[1]);
      for (const run of edgeRuns(edge, room, floor, defaults, isExterior)) {
        const def = (bDoc.types || {})[run.type] || {};
        const t = clamp(num(def.transmission, 0), 0, 1);
        if (t <= 0.02) continue;
        const width = run.to - run.from;
        if (width < 1e-4) continue;
        out.push({
          edge,
          from: run.from,
          to: run.to,
          width,
          /* How tall the gap is. A railing declares its own height; anything
           * that does not is treated as a full-height opening, which is what an
           * unwalled edge actually is. */
          height: num(def.heightFt, 7),
          transmission: t,
          type: run.type,
          /* Whether this run is a BARRIER at all. A glass wall, a grill or a
           * railing encloses, so the sun can shaft through it and land on the
           * floor. An `open_edge`, `threshold` or `stepdown` is the absence of
           * a barrier — there is nothing for a beam to come through, and a car
           * park cut into rectangles by invisible lines would otherwise throw a
           * sunbeam at every one of them. Both kinds still let light in; only
           * the enclosing kind casts a shaft. */
          encloses: def.encloses !== false,
          /* What light BECOMES on the way through. A material's own colour,
           * so it sits beside `transmission` rather than in `render`: both
           * light models read it, and neither reads `render`. Tinted glass
           * throws a blue-green wash into the next room; clear glass has no
           * tint and throws the lamp's own colour, unchanged. */
          tint: def.tint || null,
        });
      }
    }
    return out;
  }

  function boundaryNodes(run, edge, bDoc, theme, P) {
    const def = (bDoc.types || {})[run.type] || (bDoc.types || {}).wall_partition || {};
    const r = Object.assign({}, def.render || {}, run.props || {});
    if (r.style === 'none') return [];
    const a = pointOn(edge, run.from), b = pointOn(edge, run.to);
    const x1 = P.X(a[0]), y1 = P.Y(a[1]), x2 = P.X(b[0]), y2 = P.Y(b[1]);
    const col = colour(r.color, theme, theme.wallThin);
    const w = num(r.widthPx, 2);
    const nodes = [];

    /* The wall's own body.
     *
     * A wall on a plan is a band with a thickness, not a hairline, and every
     * type already declares `thicknessFt`. `render.fill` paints that band —
     * a token, a hex, or a hex with alpha for anything translucent. It goes
     * down FIRST so the style's own strokes still read on top, and a type that
     * sets no fill draws exactly as it always did. */
    if (r.fill) {
      const half = P.S(num(r.thicknessFt, num(def.thicknessFt, 0.3))) / 2;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const nx = -uy * half, ny = ux * half;

      /* Mitre the corners.
       *
       * The band is half a thickness wide either side of the wall line, but it
       * used to stop dead ON the corner point — so where two thick walls meet,
       * neither covered the little square outside their intersection and every
       * corner of the plan had a notch bitten out of it. At 0.75 ft and a
       * normal zoom that is a visibly ragged outline.
       *
       * Running each band half a thickness PAST a corner makes the two overlap
       * and fills it, which is what a square linecap does for the hairline
       * stroke below and why that one never looked wrong.
       *
       * Only at real corners. A run also ends wherever a door interrupts it or
       * a sub-range boundary starts, and extending there would push wall into
       * the doorway it is supposed to stop at. `edge.lo`/`edge.hi` are the
       * edge's own ends, so a run touching them is at a corner and anything
       * else is a join with something on the same wall. */
      const atLo = Math.abs(run.from - edge.lo) < 1e-6 ? half : 0;
      const atHi = Math.abs(run.to - edge.hi) < 1e-6 ? half : 0;
      const ax = x1 - ux * atLo, ay = y1 - uy * atLo;
      const bx = x2 + ux * atHi, by = y2 + uy * atHi;
      nodes.push({
        tag: 'path',
        attrs: {
          d: `M ${ax - nx} ${ay - ny} L ${bx - nx} ${by - ny} L ${bx + nx} ${by + ny} L ${ax + nx} ${ay + ny} Z`,
          fill: colour(r.fill, theme, theme.wallThin),
          'fill-opacity': r.fillOpacity === undefined ? null : num(r.fillOpacity, 1),
          stroke: 'none',
        },
      });
    }

    switch (r.style) {
      case 'solid':
        nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: col, 'stroke-width': w, 'stroke-linecap': 'square' } });
        break;
      case 'dashed':
        nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: col, 'stroke-width': w, 'stroke-dasharray': r.dash || '6 4' } });
        break;
      case 'dotted':
        nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: col, 'stroke-width': w, 'stroke-dasharray': r.dash || '2 2' } });
        break;
      case 'double': {
        const g = num(r.gapPx, 2.5) / 2;
        const nx = edge.horizontal ? 0 : 1, ny = edge.horizontal ? 1 : 0;
        nodes.push({ tag: 'line', attrs: { x1: x1 - nx * g, y1: y1 - ny * g, x2: x2 - nx * g, y2: y2 - ny * g, stroke: col, 'stroke-width': w } });
        nodes.push({ tag: 'line', attrs: { x1: x1 + nx * g, y1: y1 + ny * g, x2: x2 + nx * g, y2: y2 + ny * g, stroke: col, 'stroke-width': w } });
        break;
      }
      case 'glass': {
        nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: col, 'stroke-width': w, opacity: 0.75 } });
        const pitch = P.S(num(r.postEveryFt, 4));
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ux = (x2 - x1) / (len || 1), uy = (y2 - y1) / (len || 1);
        const nx = -uy, ny = ux;
        for (let d = 0; d <= len + 0.001; d += pitch) {
          const px = x1 + ux * d, py = y1 + uy * d;
          nodes.push({ tag: 'line', attrs: { x1: px - nx * 2.6, y1: py - ny * 2.6, x2: px + nx * 2.6, y2: py + ny * 2.6, stroke: col, 'stroke-width': 1.6 } });
        }
        break;
      }
      case 'bars': {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ux = (x2 - x1) / (len || 1), uy = (y2 - y1) / (len || 1);
        const nx = -uy, ny = ux;
        if (r.rail !== false) {
          nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: col, 'stroke-width': Math.max(1, w * 0.6), opacity: 0.9 } });
        }
        const pitch = Math.max(3, P.S(num(r.pitchFt, 0.45)));
        for (let d = 0; d <= len + 0.001; d += pitch) {
          const px = x1 + ux * d, py = y1 + uy * d;
          nodes.push({ tag: 'line', attrs: { x1: px - nx * 2.4, y1: py - ny * 2.4, x2: px + nx * 2.4, y2: py + ny * 2.4, stroke: col, 'stroke-width': 1.2 } });
        }
        break;
      }
      /* Turned balusters — a cast stone or concrete balustrade. `bars` draws a
       * tick per member, which is right for a rod and wrong for a baluster:
       * these are fat enough to read as their own footprint on a plan, which
       * is exactly what distinguishes the two at a glance. */
      case 'balusters': {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ux = (x2 - x1) / (len || 1), uy = (y2 - y1) / (len || 1);
        nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: col, 'stroke-width': Math.max(1, w * 0.5), opacity: 0.9 } });
        const pitch = Math.max(4, P.S(num(r.pitchFt, 0.6)));
        const rad = Math.max(1.4, num(r.radiusPx, 2.2));
        for (let d = 0; d <= len + 0.001; d += pitch) {
          nodes.push({ tag: 'circle', attrs: { cx: x1 + ux * d, cy: y1 + uy * d, r: rad, fill: col, stroke: 'none' } });
        }
        break;
      }
      case 'hatchAngle': {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ux = (x2 - x1) / (len || 1), uy = (y2 - y1) / (len || 1);
        const ang = num(r.angleDeg, 35) * RAD;
        const hx = Math.cos(ang) * 4, hy = Math.sin(ang) * 4;
        nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: col, 'stroke-width': 1.1, opacity: 0.8 } });
        const pitch = Math.max(3, P.S(num(r.pitchFt, 0.4)));
        for (let d = 0; d <= len + 0.001; d += pitch) {
          const px = x1 + ux * d, py = y1 + uy * d;
          nodes.push({ tag: 'line', attrs: { x1: px - hx, y1: py - hy, x2: px + hx, y2: py + hy, stroke: col, 'stroke-width': 1 } });
        }
        break;
      }
      case 'scallop': {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ux = (x2 - x1) / (len || 1), uy = (y2 - y1) / (len || 1);
        const nx = -uy, ny = ux;
        const step = 8;
        let d = `M ${x1} ${y1}`;
        for (let s = step; s <= len + 0.001; s += step) {
          const px = x1 + ux * s, py = y1 + uy * s;
          d += ` Q ${px - ux * step / 2 + nx * 4} ${py - uy * step / 2 + ny * 4} ${px} ${py}`;
        }
        nodes.push({ tag: 'path', attrs: { d, fill: 'none', stroke: colour(r.accent, theme, col), 'stroke-width': num(r.widthPx, 3), opacity: 0.85 } });
        break;
      }
      default:
        nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: col, 'stroke-width': w } });
    }
    return nodes;
  }

  /* ---------------------------------------------------------------- openings */

  /* Is this opening open right now? 'off' is closed; EVERYTHING else — including
   * unavailable, unknown, a flat battery, a deleted entity — is open, because a
   * dead sensor should degrade to the drawn default rather than claim a door is
   * shut when nothing knows. Unsensored openings use the type's defaultOpen. */
  function openingIsOpen(op, typeDef, states) {
    if (op.sensor && states) {
      const st = states[op.sensor];
      if (st) return st.state !== 'off';
    }
    if (op.open !== undefined) return !!op.open;
    return typeDef.defaultOpen !== false;
  }

  function openingNodes(op, room, floor, bDoc, theme, P, states, arcDefault) {
    const edges = roomEdges(room);
    const edge = openingEdgeOf(room, op);
    if (!edge) return [];
    const typeDef = (bDoc.openingTypes || {})[op.type] || {};
    const style = (typeDef.render && typeDef.render.style) || 'cased';
    const w = num(op.w, (typeDef.props && typeDef.props.w) || 2.5);
    const at = num(op.at, edge.lo);
    const a = pointOn(edge, at), b = pointOn(edge, at + w);
    const x1 = P.X(a[0]), y1 = P.Y(a[1]), x2 = P.X(b[0]), y2 = P.Y(b[1]);
    const nodes = [];
    const glass = theme.apertureGlass;
    const line = theme.wallThin;
    const open = openingIsOpen(op, typeDef, states);

    // The reveal: floor colour laid over where the wall would have run, so the
    // opening reads as a gap rather than a line drawn on top of a wall.
    nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: theme.aperture, 'stroke-width': 6, 'stroke-linecap': 'butt' } });

    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    // Inward normal: away from the wall, into the room.
    const outward = WALL_NORMAL[op.wall] ?? 0;
    const inAng = (outward + 180) * RAD;
    const ix = Math.sin(inAng), iy = -Math.cos(inAng);
    const swingSign = op.swing === 'out' ? -1 : 1;
    const hingeAtStart = (op.hinge || 'start') === 'start';
    const swingArc = op.arc !== undefined ? op.arc !== false : arcDefault !== false;

    switch (style) {
      case 'glazed': {
        nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: glass, 'stroke-width': 3.2 } });
        if (num(op.curtain, 1) < 1) {
          nodes.push({ tag: 'line', attrs: { x1: x1 + ix * 3, y1: y1 + iy * 3, x2: x2 + ix * 3, y2: y2 + iy * 3, stroke: line, 'stroke-width': 1.4, 'stroke-dasharray': '3 2', opacity: 0.7 } });
        }
        break;
      }
      case 'bay': {
        const proj = P.S(num(op.projectFt, 1.5)) * -1;
        nodes.push({
          tag: 'path',
          attrs: {
            d: `M ${x1} ${y1} L ${x1 + ix * proj + ux * len * 0.18} ${y1 + iy * proj + uy * len * 0.18} L ${x2 + ix * proj - ux * len * 0.18} ${y2 + iy * proj - uy * len * 0.18} L ${x2} ${y2}`,
            fill: 'none', stroke: glass, 'stroke-width': 2.6,
          },
        });
        break;
      }
      case 'bars': {
        nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: line, 'stroke-width': 1.2 } });
        const pitch = Math.max(3, P.S(0.35));
        for (let d = 0; d <= len + 0.001; d += pitch) {
          const px = x1 + ux * d, py = y1 + uy * d;
          nodes.push({ tag: 'line', attrs: { x1: px - iy * 0, y1: py, x2: px + ix * 3, y2: py + iy * 3, stroke: line, 'stroke-width': 0.9 } });
        }
        break;
      }
      case 'arch': {
        const r = len / 2;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        nodes.push({ tag: 'path', attrs: { d: `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`, fill: 'none', stroke: line, 'stroke-width': 1.2, opacity: 0.75, transform: `rotate(0 ${mx} ${my})` } });
        break;
      }
      case 'slide':
      case 'pocket': {
        // Closed: leaf across the opening. Open: leaf parked beside it (pocket
        // slides into the wall, so it simply disappears).
        if (!open) {
          nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: line, 'stroke-width': 3, 'stroke-linecap': 'butt' } });
        } else if (style === 'slide') {
          const px = x1 - ux * len, py = y1 - uy * len;
          nodes.push({ tag: 'line', attrs: { x1: px + ix * 2, y1: py + iy * 2, x2: x1 + ix * 2, y2: y1 + iy * 2, stroke: line, 'stroke-width': 2.4, opacity: 0.75 } });
        }
        nodes.push({ tag: 'line', attrs: { x1: x1 + ix * 5, y1: y1 + iy * 5, x2: x2 + ix * 5, y2: y2 + iy * 5, stroke: line, 'stroke-width': 0.9, 'stroke-dasharray': '4 3', opacity: 0.5 } });
        break;
      }
      case 'fold': {
        const leaves = Math.max(2, num(op.leaves, 4));
        if (!open) {
          nodes.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: line, 'stroke-width': 2.6 } });
        } else {
          const seg = len / leaves;
          let px = x1, py = y1;
          for (let i = 0; i < leaves; i++) {
            const dir = i % 2 ? -1 : 1;
            const nx2 = px + ux * seg * 0.5 + ix * seg * 0.5 * dir * swingSign;
            const ny2 = py + uy * seg * 0.5 + iy * seg * 0.5 * dir * swingSign;
            nodes.push({ tag: 'line', attrs: { x1: px, y1: py, x2: nx2, y2: ny2, stroke: line, 'stroke-width': 2 } });
            px = nx2; py = ny2;
          }
        }
        break;
      }
      case 'swing':
      default: {
        const leaves = Math.max(1, num(op.leaves, 1));
        const leafLen = len / leaves;
        for (let i = 0; i < leaves; i++) {
          // Hinge at the outer end of each leaf, so a double door opens from
          // the middle outward the way real ones do.
          const flip = leaves > 1 && i === leaves - 1;
          const hingeT = (flip || !hingeAtStart) ? (i + 1) * leafLen : i * leafLen;
          const hx = x1 + ux * hingeT, hy = y1 + uy * hingeT;
          const dirAlong = (flip || !hingeAtStart) ? -1 : 1;
          if (open) {
            const ex = hx + ix * leafLen * swingSign, ey = hy + iy * leafLen * swingSign;
            nodes.push({ tag: 'line', attrs: { x1: hx, y1: hy, x2: ex, y2: ey, stroke: line, 'stroke-width': 2 } });
            /* The dashed quarter-circle the leaf sweeps through. It is the
             * drawing convention rather than information — the leaf already
             * says which way the door opens — so it is switchable: a plan with
             * many doors close together can read better without it. Narrowest
             * answer first, exactly like coverage: this opening, then the
             * floor, then the house, then on. */
            if (swingArc !== false) {
              const ax = hx + ux * leafLen * dirAlong, ay = hy + uy * leafLen * dirAlong;
              /* The arc has to turn about the HINGE — that is the whole meaning
               * of a swing symbol, and what makes the dashed curve the path the
               * leaf edge actually travels.
               *
               * Of the two 90-degree arcs through these endpoints, one is
               * centred on the hinge and the other on the opposite corner. The
               * wrong one is still a quarter circle, still the right radius and
               * still on the room's side of the wall — so it reads as
               * almost-right, and a check asserting only span and side passes
               * it. The centre is the only thing that separates them.
               *
               * Which flag lands on the hinge depends on the handedness of
               * (along the wall) x (into the room), and THAT FLIPS BETWEEN
               * WALLS: north and east wind one way, south and west the other.
               * The old expression was a constant and so was right on exactly
               * half of them. Compute the turn direction from the two vectors
               * instead — tip about the hinge, round to the closed jamb — and
               * every wall follows from the same arithmetic.
               *
               * `y` grows downward here, so a positive cross product is a
               * clockwise turn on screen, which is SVG's sweep flag 1. */
              const turn = (ix * swingSign) * (uy * dirAlong) - (iy * swingSign) * (ux * dirAlong);
              const sweep = turn > 0 ? 1 : 0;
              nodes.push({
                tag: 'path',
                attrs: { d: `M ${ex} ${ey} A ${leafLen} ${leafLen} 0 0 ${sweep} ${ax} ${ay}`, fill: 'none', stroke: line, 'stroke-width': 1, opacity: 0.55, 'stroke-dasharray': '3 3' },
              });
            }
          } else {
            const ax = hx + ux * leafLen * dirAlong, ay = hy + uy * leafLen * dirAlong;
            nodes.push({ tag: 'line', attrs: { x1: hx, y1: hy, x2: ax, y2: ay, stroke: line, 'stroke-width': 2.6 } });
          }
        }
        break;
      }
      case 'cased':
        break;   // the reveal above is the whole drawing
    }

    // A sensored opening gets a small state pip, so you can see at a glance
    // which doors are actually being tracked.
    if (op.sensor) {
      const mx = (x1 + x2) / 2 + ix * 7, my = (y1 + y2) / 2 + iy * 7;
      nodes.push({ tag: 'circle', attrs: { cx: mx, cy: my, r: 2.6, fill: open ? theme.alertRim : theme.powerRim, opacity: 0.9 } });
    }
    return nodes;
  }

  /* Effective light transmission of an opening: the boundary it sits in times
   * its own type times its curtain. One number, so the daylight model never has
   * to know what a grill is. */
  /* How open a covering is, 0 (shut) .. 1 (out of the way).
   *
   * Bound to a cover entity it follows that live, on Home Assistant's own
   * scale: `current_position` where the cover reports one, its open/closed
   * state where it does not. Unbound it is whatever the opening was set to by
   * hand. An unavailable cover reads as OPEN, the same rule the doors use —
   * a dead motor should degrade to the drawn default rather than claim the
   * room is dark when nothing knows. */
  function coveringOpenness(op, states) {
    const c = op.covering;
    if (!c) return 1;
    if (c.entity) {
      const st = states && states[c.entity];
      if (st) {
        const p = st.attributes && st.attributes.current_position;
        if (typeof p === 'number') return clamp(p / 100, 0, 1);
        if (st.state === 'closed' || st.state === 'closing') return 0;
        if (st.state === 'open' || st.state === 'opening') return 1;
      }
      /* Bound but silent: fall through to the hand-set position, which is the
       * last thing anybody actually said about it. */
    }
    return clamp(num(c.position, 100) / 100, 0, 1);
  }

  /* What a covering lets through at its current position. */
  function coveringTransmission(op, bDoc, states) {
    const c = op.covering;
    if (!c || !c.type || c.type === 'none') return 1;
    const spec = (bDoc.coverings || {})[c.type];
    if (!spec) return 1;
    const openness = coveringOpenness(op, states);
    const lo = num(spec.closed, 0.1), hi = num(spec.open, 1);
    return clamp(lo + (hi - lo) * openness, 0, 1);
  }

  function openingTransmission(op, bDoc, boundaryType, states) {
    const t = (bDoc.openingTypes || {})[op.type] || {};
    const b = (bDoc.types || {})[boundaryType] || {};
    const own = num(op.transmission, num(t.transmission, 1));
    /* `curtain` is the flat factor this predates coverings with. Both apply:
     * a document that set one keeps working, and a covering is the richer way
     * to say the same thing. */
    const thru = num(op.curtain, 1) * coveringTransmission(op, bDoc, states);
    const wall = num(b.transmission, 0);
    // An opening is a hole: it is at least as transmissive as its own type,
    // never limited by the wall it is cut into. The wall's own transmission
    // only matters for the runs BESIDE the opening.
    void wall;
    return clamp(own * thru, 0, 1);
  }

  /* ---------------------------------------------------------------- markers */

  /* `onRule` per type, because "on" means three different things:
   *
   *   default   state === 'on'      — a light, a switch, a contact
   *   notOff    anything but 'off'  — a climate entity reports an hvac_mode and
   *                                   is never literally "on"
   *   numeric   a parseable number  — a meter. Its state IS the reading, so it
   *                                   is never any of the words above, and
   *                                   without this rule a solar array reporting
   *                                   4 kW draws in the OFF style with its
   *                                   readout suppressed. A meter that is
   *                                   reporting is a meter that is working.
   *   momentary no on-state at all   — a scene, a button. Its state is the last
   *                                   time it fired, so `unknown` is its normal
   *                                   resting value and must NOT draw as dead:
   *                                   a scene nobody has run yet is fine, not
   *                                   broken.
   *
   * `offStates` beats all of them. Where a domain's off-states are simply a
   * list of words — closed, locked, idle — saying so is plainer than inventing
   * a rule name for each one.
   */
  function stateOf(type, st) {
    const momentary = type.onRule === 'momentary' || type.onRule === 'never';
    if (!st || st.state === undefined || (!momentary && (st.state === 'unavailable' || st.state === 'unknown'))) {
      return { key: momentary && st ? 'off' : 'unavailable', on: false, dead: !(momentary && st) };
    }
    let on;
    if (Array.isArray(type.offStates)) on = !type.offStates.includes(st.state);
    else if (momentary) on = false;
    else if (type.onRule === 'notOff') on = st.state !== 'off';
    else if (type.onRule === 'numeric') on = isFinite(parseFloat(st.state));
    else on = st.state === 'on';
    return { key: on ? 'on' : 'off', on, dead: false };
  }

  function badgeText(kind, st, item, share) {
    if (!st) return '';
    const a = st.attributes || {};
    switch (kind) {
      case 'percentage': return a.percentage != null && st.state === 'on' ? `${Math.round(a.percentage)}%` : '';
      case 'temperature': return a.temperature != null ? `${a.temperature}°` : '';
      /* The state itself, for the things whose state IS a word worth reading —
       * a timer that is `active`, a dropdown sitting on `Night`. Truncated
       * rather than wrapped: a marker is 17px across and a long option name
       * would draw over the room next door. */
      case 'state': {
        const s = String(st.state);
        if (s === 'unavailable' || s === 'unknown') return '';
        const pretty = s.replace(/_/g, ' ');
        return pretty.length > 12 ? pretty.slice(0, 11) + '…' : pretty;
      }
      case 'value': {
        const raw = parseFloat(st.state);
        if (!isFinite(raw)) return '';
        const scaled = raw * num(item.props && item.props.scale, num(share, 1));
        const unit = a.unit_of_measurement || '';
        if (unit === 'W' && Math.abs(scaled) >= 1000) return `${(scaled / 1000).toFixed(2)}kW`;
        return `${Math.round(scaled)}${unit}`;
      }
      default: return '';
    }
  }

  /* A label is intentionally a small interpolation language, not executable
   * JavaScript or a second Home Assistant template engine. It is safe in the
   * editor, SVG export, and generated card because the result remains a scene
   * node's textContent all the way through. */
  function labelText(template, st, item) {
    const attrs = (st && st.attributes) || {};
    const raw = st && st.state !== undefined ? String(st.state) : '—';
    const source = String(template || '{{ value }}');
    const scalar = (value) => {
      if (value === undefined || value === null) return '';
      if (typeof value === 'object') {
        try { return JSON.stringify(value); } catch { return ''; }
      }
      return String(value);
    };
    return source.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, token) => {
      const key = token.trim();
      if (key === 'value' || key === 'state') return raw;
      if (key === 'unit') return scalar(attrs.unit_of_measurement);
      if (key === 'name') return scalar(attrs.friendly_name || item.name || item.entity);
      if (key === 'entity') return scalar(item.entity);
      if (key.startsWith('attr.') || key.startsWith('attributes.')) {
        const path = key.replace(/^(?:attr|attributes)\./, '').split('.').filter(Boolean);
        let value = attrs;
        for (const part of path) value = value && typeof value === 'object' ? value[part] : undefined;
        return scalar(value);
      }
      return whole;
    });
  }

  function thresholdColour(value, rules, theme, fallback) {
    const reading = Number.parseFloat(value);
    if (!Number.isFinite(reading) || !Array.isArray(rules)) return fallback;
    const match = rules
      .map((rule) => ({ at: Number(rule && rule.at), color: rule && rule.color }))
      .filter((rule) => Number.isFinite(rule.at) && rule.color)
      .sort((a, b) => b.at - a.at)
      .find((rule) => reading >= rule.at);
    return match ? colour(match.color, theme, fallback) : fallback;
  }

  function labelMetrics(item, type, text) {
    const props = (item && item.props) || {};
    const defs = (type && type.defaults) || {};
    const fontSize = num(props.fontSize, num(defs.fontSize, 12));
    const padX = num(props.paddingX, num(defs.paddingX, 7));
    const padY = num(props.paddingY, num(defs.paddingY, 4));
    const glyphs = Math.max(1, Array.from(String(text || '')).length);
    return {
      fontSize,
      padX,
      padY,
      width: Math.max(fontSize + padX * 2, glyphs * fontSize * 0.62 + padX * 2),
      height: fontSize * 1.25 + padY * 2,
    };
  }

  /* Splitting one meter across several arrays.
   *
   * A house with two solar arrays usually has ONE inverter sensor, so both
   * markers bind the same entity and both would otherwise print the whole
   * house's output — twice, in two places, which reads as double the real
   * generation. The split is by installed capacity, `cols x rows x wattPerPanel`,
   * because that is what actually determines how much of the total each array
   * contributed and it is a number already on the marker for drawing reasons.
   *
   * An explicit `share` wins, and an explicit `scale` wins over both: a
   * string-level monitor that genuinely reports per-array should not be divided
   * by anything. One marker on an entity gets 1, which is why nothing changes
   * for the ordinary single-array case. */
  function shareMap(items, library) {
    const byEntity = new Map();
    for (const item of items || []) {
      const type = resolveType(library, item);
      if (!type || !item.entity) continue;
      const d = type.defaults || {}, p = item.props || {};
      if (p.wattPerPanel === undefined && d.wattPerPanel === undefined) continue;
      const kwp = Math.max(1,
        num(p.cols, num(d.cols, 1)) * num(p.rows, num(d.rows, 1)) * num(p.wattPerPanel, num(d.wattPerPanel, 1)));
      if (!byEntity.has(item.entity)) byEntity.set(item.entity, []);
      byEntity.get(item.entity).push({ id: item.id, kwp, declared: p.share });
    }
    const out = {};
    for (const [, list] of byEntity) {
      /* A declared share is taken off the top and the REST is split by
       * capacity, so the pieces still add up to the meter's own reading. The
       * naive version — declared shares alongside capacity fractions of the
       * whole — makes the markers sum to more than the house generated, which
       * is the one number on the plan somebody will check against their bill. */
      const declared = list.filter((x) => x.declared !== undefined);
      const rest = list.filter((x) => x.declared === undefined);
      const claimed = clamp(declared.reduce((n, x) => n + num(x.declared, 0), 0), 0, 1);
      const pool = list.length > 1 ? 1 - claimed : 1;
      const total = rest.reduce((n, x) => n + x.kwp, 0) || 1;
      for (const x of declared) out[x.id] = x.declared;
      for (const x of rest) out[x.id] = (x.kwp / total) * pool;
    }
    return out;
  }

  /* Lamp colour, in the order a real light actually tells you about itself.
   *
   * The last resort is the fixture's OWN declared colour temperature rather
   * than a single theme warm-white, so a 2200 K festoon and a 4000 K tube in
   * the same room still read as different lamps when neither can report. The
   * kelvin ramp lives in `lighting.js` so a pool and its marker cannot end up
   * disagreeing about the colour of the same bulb. */
  function lampColour(st, theme, fallbackKelvin) {
    const a = (st && st.attributes) || {};
    if (Array.isArray(a.rgb_color) && a.rgb_color.length === 3) return `rgb(${a.rgb_color.join(',')})`;
    if (typeof a.color_temp_kelvin === 'number') return Light().kelvinColour(a.color_temp_kelvin);
    if (Array.isArray(a.hs_color) && a.hs_color.length === 2) return `hsl(${a.hs_color[0]},${a.hs_color[1]}%,60%)`;
    if (typeof fallbackKelvin === 'number') return Light().kelvinColour(fallbackKelvin);
    return theme.lampWarm;                       // even a plain on/off lamp reads as lit
  }

  /* Motion.
   *
   * Emitted as a <style> node in `defs`, so the editor and the exported file
   * get exactly the same rules from the same place — the alternative is a
   * stylesheet in the editor and a duplicate string in the exporter, which is
   * the drift this whole module exists to prevent.
   *
   * Every animation is state-driven and stops when the state does: blades turn
   * only while a fan is running, a siren pulses only while it is sounding. The
   * reduced-motion query is honoured because a plan that throbs is unusable for
   * some people and merely decorative for everyone else. */
  const MOTION_CSS = [
    '@keyframes fpsSpin{to{transform:rotate(360deg)}}',
    '@keyframes fpsPulse{0%,100%{opacity:.16}50%{opacity:.42}}',
    '@keyframes fpsRipple{0%{opacity:.5;transform:scale(.35)}100%{opacity:0;transform:scale(1)}}',
    '@keyframes fpsDrift{0%{opacity:0}25%{opacity:.6}100%{opacity:0;transform:translateX(9px)}}',
    '@keyframes fpsBreathe{0%,100%{opacity:.55}50%{opacity:1}}',
    /* A command in flight. Deliberately faster than every other animation here
     * (0.75s against 1.4-3s) so "working on it" cannot be read as the steady
     * breathing of a sensor that is simply live. */
    '@keyframes fpsPending{0%,100%{opacity:.34}50%{opacity:1}}',
    '.fps-spin{animation:fpsSpin var(--fps-d,1.4s) linear infinite;transform-box:view-box;transform-origin:var(--fps-o,50% 50%)}',
    '.fps-pulse{animation:fpsPulse 2.2s ease-in-out infinite}',
    '.fps-ripple{animation:fpsRipple 2.4s ease-out infinite;transform-box:fill-box;transform-origin:center}',
    '.fps-drift{animation:fpsDrift 2.6s ease-out infinite}',
    '.fps-breathe{animation:fpsBreathe 3s ease-in-out infinite}',
    '.fps-pending{animation:fpsPending .75s ease-in-out infinite}',
    /* Step lighting that climbs. Real progressive stair light runs up the
     * flight rather than switching on together, so each step's delay is its own
     * index — `--fps-i` — and the loop is long enough to read as a climb rather
     * than a flicker. */
    '@keyframes fpsStep{0%,70%,100%{opacity:.35}12%{opacity:1}}',
    '.fps-step{animation:fpsStep 2.6s ease-in-out infinite;animation-delay:calc(var(--fps-i,0) * .13s)}',
    /* Pending is the one animation that still has to say something with the
     * motion switched off: the others are decoration over a state you can
     * already read, this one IS the state. So it degrades to a static dashed,
     * half-lit marker rather than to nothing. */
    '@media (prefers-reduced-motion:reduce){.fps-spin,.fps-pulse,.fps-ripple,.fps-drift,.fps-breathe,.fps-step{animation:none}'
      + '.fps-pending{animation:none;opacity:.62;stroke-dasharray:2 2}}',
  ].join('');

  /* Coverage shapes — what a device reaches, drawn from its own numbers.
   *
   * `style` is the only thing that varies, and it comes from the library, so a
   * new device type gets coverage by declaring `render.cone.style` rather than
   * by anything being added here. All five share the same inputs: where the
   * marker is, which way it faces, how wide, how far.
   *
   * Angles follow the same screen frame as everything else: 0 deg points UP the
   * screen, and positive turns clockwise, which is what someone dragging a
   * rotation handle expects. */
  function coneNodes(cone, o) {
    const style = (typeof cone === 'string' ? cone : cone.style) || 'vision';
    const opacity = num(typeof cone === 'object' ? cone.opacity : null, 0.16);
    const R = o.P.S(Math.max(0.5, o.range));
    const half = clamp(o.fov, 5, 360) / 2;
    const anim = (cls) => (o.live && o.motion ? cls : null);
    const at = (deg, rad) => [o.cx + Math.sin(deg * RAD) * rad, o.cy - Math.cos(deg * RAD) * rad];

    /* An arc/wedge as a path. `sweep` over 180 needs the large-arc flag, which
     * is the one piece of SVG arc syntax that silently draws the wrong half. */
    const wedge = (rad, from, to) => {
      const [x1, y1] = at(from, rad), [x2, y2] = at(to, rad);
      const large = to - from > 180 ? 1 : 0;
      return `M ${o.cx} ${o.cy} L ${x1} ${y1} A ${rad} ${rad} 0 ${large} 1 ${x2} ${y2} Z`;
    };
    const arc = (rad, from, to) => {
      const [x1, y1] = at(from, rad), [x2, y2] = at(to, rad);
      const large = to - from > 180 ? 1 : 0;
      return `M ${x1} ${y1} A ${rad} ${rad} 0 ${large} 1 ${x2} ${y2}`;
    };

    const from = o.facing - half, to = o.facing + half;
    const n = [];
    const base = { fill: o.colour, opacity, 'pointer-events': 'none' };

    if (style === 'vision') {
      n.push({ tag: 'path', attrs: Object.assign({ d: wedge(R, from, to), class: anim('fps-pulse') }, base) });
      n.push({ tag: 'path', attrs: { d: arc(R, from, to), fill: 'none', stroke: o.colour, 'stroke-width': 1, opacity: opacity * 2.2, 'pointer-events': 'none' } });
    } else if (style === 'sound') {
      for (let i = 1; i <= 3; i++) {
        n.push({
          tag: 'path',
          attrs: {
            d: arc(R * (i / 3), from, to), fill: 'none', stroke: o.colour,
            'stroke-width': 1.6, 'stroke-linecap': 'round',
            opacity: opacity * (3.4 - i * 0.6), class: anim('fps-breathe'),
            'pointer-events': 'none',
          },
        });
      }
    } else if (style === 'signal') {
      for (let i = 1; i <= 3; i++) {
        n.push({
          tag: 'circle',
          attrs: {
            cx: o.cx, cy: o.cy, r: R * (i / 3), fill: 'none', stroke: o.colour,
            'stroke-width': 1.2, 'stroke-dasharray': '3 5',
            opacity: opacity * (3 - i * 0.5), class: anim('fps-breathe'),
            'pointer-events': 'none',
          },
        });
      }
    } else if (style === 'air') {
      // Three chevrons marching away from the unit along its facing.
      for (let i = 1; i <= 3; i++) {
        const rad = R * (i / 3.4);
        const [ax, ay] = at(o.facing - half * 0.8, rad);
        const [bx, by] = at(o.facing, rad * 1.16);
        const [dx2, dy2] = at(o.facing + half * 0.8, rad);
        n.push({
          tag: 'path',
          attrs: {
            d: `M ${ax} ${ay} L ${bx} ${by} L ${dx2} ${dy2}`, fill: 'none', stroke: o.colour,
            'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
            opacity: opacity * (3.2 - i * 0.55), class: anim('fps-drift'),
            'pointer-events': 'none',
          },
        });
      }
    } else if (style === 'screen') {
      // The glass itself, plus the soft cone of what it is pointed at.
      const wpx = o.P.S(Math.max(0.8, o.range * 0.22));
      const [lx, ly] = at(o.facing - 90, wpx / 2), [rx2, ry2] = at(o.facing + 90, wpx / 2);
      n.push({ tag: 'path', attrs: Object.assign({ d: wedge(R, from, to) }, base, { opacity: opacity * 0.8 }) });
      n.push({ tag: 'line', attrs: { x1: lx, y1: ly, x2: rx2, y2: ry2, stroke: o.colour, 'stroke-width': 2.6, 'stroke-linecap': 'round', opacity: 0.9, 'pointer-events': 'none' } });
    }
    return n;
  }

  /* Wrap a run of nodes in a rotation about a point, or return them untouched
   * when there is nothing to turn — a `transform="rotate(0 ...)"` on every
   * marker in the house is noise in the exported file and one more thing to
   * read past in a diff. */
  function rotated(nodes, deg, cx, cy) {
    if (!deg) return nodes;
    return [{ tag: 'g', attrs: { transform: `rotate(${deg} ${cx} ${cy})`, 'pointer-events': 'none' }, children: nodes }];
  }

  /* Which variant this item draws. The item's own choice wins, then the type's
   * preferred one, then the family's default — so a library that gains a nicer
   * default improves every plan that never expressed a preference, and changes
   * nothing for one that did. */
  function variantOf(item, type) {
    const r = (type && type.render) || {};
    const p = (item && item.props) || {};
    return p.variant || r.variant || Shapes().MARKER_DEFAULT[r.family] || null;
  }

  /* Per-gang state for a multi-gang marker, one boolean per gang.
   *
   * A 3-gang wall plate is three Home Assistant entities behind one piece of
   * plastic, so `props.channels` binds one entity per gang — the same array
   * `device.extension` already uses for its outlets. The fallback is the point
   * of the function: a gang with no channel bound follows the marker's OWN
   * entity, so a switch is useful the moment it is placed and gets more
   * truthful as gangs are bound to it, instead of drawing nothing until all N
   * exist. `gangs` is clamped to the same cap `shapes.js` draws to, so a
   * hand-edited project asking for 40 gangs gets a plate, not a smear.
   *
   * Returns null when the item is not ganged at all, which every family that
   * does not read gangs treats as absent.
   */
  function gangStates(item, states, fallbackOn) {
    const p = (item && item.props) || {};
    if (p.gangs === undefined && !Array.isArray(p.channels)) return null;
    const chans = Array.isArray(p.channels) ? p.channels : [];
    const n = clamp(Math.round(num(p.gangs, chans.length || 1)), 1, Shapes().SWITCH_MAX_GANGS);
    const out = [];
    for (let i = 0; i < n; i++) {
      const ch = chans[i];
      const st = ch && ch.entity && states ? states[ch.entity] : null;
      out.push(st ? st.state === 'on' : !!fallbackOn);
    }
    return out;
  }

  /* How big the marker is DRAWN, in px.
   *
   * `render.resize` names the property the edge handles drag and the unit it is
   * in. `ft` means the thing has a real footprint — a ceiling fan's sweep, an
   * AC's width — and is drawn to the plan's scale, so zooming keeps it honest
   * against the room. `px` means it does not: a smoke detector drawn to true
   * scale is a 4-inch dot nobody can tap, so its marker size is simply a
   * drawing decision and is stored as one.
   *
   * Exported because the canvas draws its resize handles from this. A handle
   * that sits somewhere other than the edge it resizes is worse than no handle.
   */
  function markerRadius(item, type, P) {
    const r = (type && type.render) || {};
    const p = (item && item.props) || {};
    const d = (type && type.defaults) || {};
    const rz = r.resize;
    if (rz && rz.prop) {
      const v = num(p[rz.prop], num(d[rz.prop], null));
      if (v !== null && v > 0) {
        return rz.unit === 'ft'
          ? Math.max(3, P.S(v) / 2)
          : Math.max(3, v);
      }
    }
    return num(r.size, 8.5);
  }

  function markerNodes(item, type, theme, P, states, ctx) {
    const r = type.render || {};
    const [fx, fy] = item.at || [0, 0];
    const cx = P.X(fx), cy = P.Y(fy);
    const st = item.entity && states ? states[item.entity] : null;
    const sk = stateOf(type, st);
    const sty = (type.states && (type.states[sk.key] || type.states.off)) || {};
    const isLamp = (item.kind || type.kind) === 'fixture';
    const out = isLamp ? Light().lampOutput(item, type, st, (ctx && ctx.lightCfg) || null) : null;
    const litColour = isLamp && sk.on ? lampColour(st, theme, out && out.kelvin) : null;
    const fill = litColour || colour(sty.fill, theme, theme.offFill);
    const stroke = litColour ? colour('@lampRim', theme, theme.offRim) : colour(sty.stroke, theme, theme.offRim);
    const nodes = [];
    const shape = r.shape || 'disc';
    const props = item.props || {};
    const defs = type.defaults || {};
    const facing = num(props.rot, num(defs.rot, 0));
    /* A dumb on/off switch cannot report a level, so it counts as full — the
     * same "cannot report -> full" rule `lampOutput` already applies to the
     * lumens total applies here too, so a marker's own bulbs never look dimmer
     * than the room they are supposedly lighting. Only a real dimmer's
     * `brightness` attribute pulls this below 1. */
    const bright = out ? clamp(out.brightness, 0.15, 1) : 1;

    /* The pool is sized from the lamp's actual output now, not a fixed
     * per-type spread: a 20 W tube pools wider than a 1.5 W step light without
     * either of them being special-cased. `render.glow.spread` still wins if a
     * type sets one, because a cove that traces a wall is not a point source
     * and its own number is the better answer. */
    if (sk.on && r.glow && r.glow.enabled) {
      const ft = r.glow.spread !== undefined
        ? num(r.glow.spread, 2.4) * (0.6 + 0.4 * bright)
        : (out ? out.poolFt : 2.4);
      nodes.push({
        tag: 'circle', layer: 'glow',
        attrs: {
          cx, cy, r: P.S(ft),
          fill: 'url(#fpsGlow)', opacity: num(theme.glowOpacity, 0.5) * bright,
          'pointer-events': 'none',
        },
      });
    }

    /* Coverage: what a camera sees, what a speaker throws, where an AC blows.
     * One code path for all of them, driven entirely by the type's declared
     * `render.cone.style` plus the item's own fov/range/rot — so adding it to a
     * new device is a library entry, never a branch here.
     *
     * Whether it is drawn at all is THREE answers, narrowest first: this item's
     * own `cone` prop, else the type's `defaults.cone`, else on. A type that
     * declares neither behaves exactly as it always has, which is what lets
     * `device.pir` and `device.camera` default to OFF without touching the
     * speaker, the AC or the router. The reasoning is the same one that made
     * coverage a per-floor setting: a house whose sensors sit close together
     * ends up with more wedge than plan, and a detection cone is the worst
     * offender because vision sensors cluster at doors and corners.
     *
     * `fov` and `range` are still read and still stored while it is off — they
     * are what the wedge is drawn FROM, so turning it back on costs nothing. */
    const coneOn = props.cone !== undefined ? props.cone !== false : defs.cone !== false;
    if (r.cone && coneOn && (!ctx || ctx.coverage !== false)) {
      for (const n of coneNodes(r.cone, {
        cx, cy, P, theme, facing, live: sk.on,
        fov: num(props.fov, num(defs.fov, 90)),
        range: num(props.range, num(defs.range, 14)),
        colour: sk.on ? (litColour || colour(sty.stroke, theme, theme.offRim)) : colour('@glyphOff', theme, '#9aa4b6'),
        motion: !ctx || ctx.motion !== false,
      })) nodes.push(n);
    }

    /* A type that names a FAMILY draws itself from the marker registry, and the
     * item may pick which variant of it. This branch comes first so `family`
     * wins over `shape`; a type that names none falls through to the shape
     * chain below exactly as before, which is what makes this additive rather
     * than a migration everything had to be dragged through at once. */
    const family = r.family;
    if (family && Shapes().MARKERS[family]) {
      const a2 = (st && st.attributes) || {};
      /* One number the variants that show a LEVEL can read — a tank's fill, a
       * battery's charge, a blind's position, a fan's speed. Each domain calls
       * it something different and none of them is worth a branch inside a
       * drawing function. */
      const pct = num(a2.percentage, num(a2.current_position, num(a2.battery_level, num(parseFloat(st && st.state), 60))));
      const nodes2 = Shapes().marker(family, variantOf(item, type), {
        cx, cy, R: markerRadius(item, type, P),
        fill, line: stroke, glyph: colour(sty.glyph, theme, theme.glyphOff),
        accent: litColour || colour('@fanRim', theme, '#2fb5a4'),
        facing, on: sk.on, pct,
        /* Only lamp families read this — a dimmed light's own bulbs should look
         * dimmed, not just the room glow around them. Every other family
         * ignores it, so it is harmless to always pass. */
        bright: isLamp ? bright : 1,
        spin: sk.on && (!ctx || ctx.motion !== false),
        period: sk.on ? `${(2.6 - 2.15 * (clamp(num(a2.percentage, 100), 0, 100) / 100)).toFixed(2)}s` : null,
        /* Only the multi-gang families read this — a wall switch's gangs are
         * separate entities behind one plate. Passed always, like `bright`,
         * because a family that ignores it costs nothing. */
        gangs: gangStates(item, states, sk.on),
        p: props,
      });
      for (const n of nodes2) nodes.push(n);
      /* `sense` is the fallback family — a plain body with no detail of its
       * own — so the type's icon still has to go inside it. Every other family
       * draws the object itself and a glyph on top would be a second opinion. */
      if (family === 'sense' && r.icon) {
        const spin2 = r.rotateIcon ? facing : 0;
        nodes.push(...rotated(Shapes().icon(r.icon, cx, cy, colour(sty.glyph, theme, theme.glyphOff), num(r.iconScale, 0.8)), spin2, cx, cy));
      }
    } else if (shape === 'label') {
      const text = labelText(props.template || defs.template, st, item);
      const metrics = labelMetrics(item, type, text);
      const baseText = colour(props.color || defs.color, theme, theme.wallThick || '#20242b');
      const baseBorder = colour(props.borderColor || defs.borderColor, theme, baseText);
      const rules = props.thresholds || defs.thresholds;
      const thresholdText = thresholdColour(st && st.state, rules, theme, baseText);
      const thresholdBorder = thresholdColour(st && st.state, rules, theme, baseBorder);
      const target = props.thresholdTarget || defs.thresholdTarget || 'text';
      const textColor = target === 'border' ? baseText : thresholdText;
      const borderColor = target === 'text' ? baseBorder : thresholdBorder;
      const borderStyle = props.borderStyle || defs.borderStyle || 'solid';
      const borderWidth = borderStyle === 'none' ? 0 : num(props.borderWidth, num(defs.borderWidth, 1));
      nodes.push({
        tag: 'rect',
        attrs: {
          x: cx - metrics.width / 2, y: cy - metrics.height / 2,
          width: metrics.width, height: metrics.height,
          rx: num(props.borderRadius, num(defs.borderRadius, 4)),
          fill: colour(props.backgroundColor || defs.backgroundColor, theme, 'transparent'),
          stroke: borderColor, 'stroke-width': borderWidth,
          'stroke-dasharray': borderStyle === 'dashed' ? `${Math.max(2, borderWidth * 3)} ${Math.max(2, borderWidth * 2)}` : null,
          transform: facing ? `rotate(${facing} ${cx} ${cy})` : null,
        },
      });
      nodes.push({
        tag: 'text', text,
        attrs: {
          x: cx, y: cy + metrics.fontSize * 0.35,
          'font-size': metrics.fontSize, 'font-weight': num(props.fontWeight, num(defs.fontWeight, 600)),
          'text-anchor': 'middle', fill: textColor, 'pointer-events': 'none',
          transform: facing ? `rotate(${facing} ${cx} ${cy})` : null,
        },
      });
    } else if (shape === 'line') {
      const len = num(item.props && item.props.len, num(r.len, 4));
      const rot = num(item.props && item.props.rot, 0) * RAD;
      const hx = (Math.cos(rot) * len) / 2, hy = (Math.sin(rot) * len) / 2;
      nodes.push({ tag: 'line', attrs: { x1: P.X(fx - hx), y1: P.Y(fy - hy), x2: P.X(fx + hx), y2: P.Y(fy + hy), stroke: litColour || stroke, 'stroke-width': num(r.thickness, 4), 'stroke-linecap': 'round' } });
    } else if (shape === 'fan') {
      /* Blade count and sweep are the item's, not the type's, so a 4-blade
       * exhaust fan and a 3-blade ceiling fan are one type with two settings.
       * A fan reporting no `percentage` while on is a fan that cannot report,
       * not a stopped one — it spins at its rated speed. */
      const a = (st && st.attributes) || {};
      const pct = sk.on ? clamp(num(a.percentage, 100), 0, 100) : 0;
      const spinning = sk.on && pct > 0;
      const blades = Math.max(2, Math.round(num(props.blades, num(defs.blades, num(r.blades, 3)))));
      const sweepFt = num(props.sweep, num(defs.sweep, 0));
      const hub = num(r.size, 8.5);
      const bladeLen = sweepFt > 0 ? Math.max(hub * 0.7, P.S(sweepFt) / 2) : 4.6;
      /* One turn in this many seconds. A fan at 100% is a blur, one at 20% is
       * visibly turning; below that the eye reads it as stopped anyway. */
      const period = spinning ? (2.6 - 2.15 * (pct / 100)).toFixed(2) : null;

      nodes.push({ tag: 'circle', attrs: { cx, cy, r: hub, fill, stroke, 'stroke-width': 1.4 } });
      const group = {
        tag: 'g',
        attrs: {
          class: spinning && (!ctx || ctx.motion !== false) ? 'fps-spin' : null,
          /* The spin is a CSS transform and a presentation `transform=` would
           * lose to it, so `facing` is baked into each blade's own angle
           * instead of wrapping the group in a second rotate. */
          style: period ? `--fps-o:${cx}px ${cy}px;--fps-d:${period}s` : null,
          'pointer-events': 'none',
        },
        children: [],
      };
      for (let i = 0; i < blades; i++) {
        group.children.push({
          tag: 'ellipse',
          attrs: {
            cx, cy: cy - bladeLen / 2, rx: Math.max(1.4, bladeLen * 0.4), ry: bladeLen / 2,
            fill: spinning ? colour('@fanRim', theme, '#2fb5a4') : colour('@glyphOff', theme, '#9aa4b6'),
            opacity: spinning ? 0.6 : 0.85,
            transform: `rotate(${facing + (i * 360) / blades} ${cx} ${cy})`,
          },
        });
      }
      nodes.push(group);
      nodes.push({ tag: 'circle', attrs: { cx, cy, r: 1.7, fill: theme.wallThick } });
    } else if (shape === 'channelBox') {
      const w = num(r.width, 32), h = num(r.height, 15);
      const chans = (item.props && item.props.channels) || [];
      const live = chans.filter((c) => states && states[c.entity] && states[c.entity].state === 'on').length;
      const anyOn = live > 0;
      const s2 = anyOn ? (type.states.on || {}) : (type.states.off || {});
      nodes.push({
        tag: 'rect',
        attrs: {
          x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: num(r.radius, 3.5),
          fill: colour(s2.fill, theme, fill), stroke: colour(s2.stroke, theme, stroke), 'stroke-width': anyOn ? 1.6 : 1.2,
        },
      });
      const step = w / Math.max(1, chans.length);
      chans.forEach((c, i) => {
        const cOn = states && states[c.entity] && states[c.entity].state === 'on';
        nodes.push({ tag: 'circle', attrs: { cx: cx - w / 2 + step * (i + 0.5), cy, r: num(r.socket, 2.8), fill: colour(cOn ? (type.states.on || {}).socketOn : (type.states.on || {}).socketOff, theme, theme.glyphOff) } });
      });
      if (chans.length) nodes.push({ tag: 'text', text: `${live}/${chans.length}`, attrs: { x: cx, y: cy + h / 2 + 11, 'font-size': 8, 'text-anchor': 'middle', fill: theme.glyphOff } });
    } else if (shape === 'perimeter') {
      /* A cove traces the room's OUTLINE, not a box around it. An L-shaped
       * room, a room with a curved wall and a plain rectangle are all the same
       * polygon problem, and the bounding box was only ever right for the
       * third. */
      const inset = num(item.props && item.props.inset, 1);
      const rm = ctx.room;
      if (rm) {
        const outline = insetPolygon(roomPoints(rm), inset);
        const d = outline.map((p, i) => `${i ? 'L' : 'M'} ${P.X(p[0])} ${P.Y(p[1])}`).join(' ') + ' Z';
        nodes.push({
          tag: 'path',
          attrs: { d, fill: 'none', stroke: litColour || stroke, 'stroke-width': num(r.thickness, 1.5), 'stroke-linejoin': 'round' },
        });
      }
      nodes.push({ tag: 'circle', attrs: { cx, cy, r: 5, fill, stroke, 'stroke-width': 1.2 } });
    } else if (shape === 'camera') {
      /* The view cone used to be a fixed triangle drawn here. It is a `vision`
       * cone off the item's own fov and range now, emitted above with every
       * other device's coverage, so "point the camera at the gate" is the same
       * gesture and the same numbers as pointing anything else. */
      nodes.push({ tag: 'circle', attrs: { cx, cy, r: num(r.size, 8.5), fill, stroke, 'stroke-width': 1.4 } });
      nodes.push(...rotated(Shapes().icon('camera', cx, cy, colour(sty.glyph, theme, theme.glyphOff), 0.72), facing, cx, cy));
    } else {
      nodes.push({ tag: 'circle', attrs: { cx, cy, r: num(r.size, 8.5), fill, stroke, 'stroke-width': sk.on ? 1.6 : 1.2 } });
      /* A disc is round, so the disc itself never needs turning — but the glyph
       * inside it does when the type says the icon has a front (a TV, a
       * doorbell, a sensor with a lens). `render.rotateIcon` opts in. */
      const spin = r.rotateIcon ? facing : 0;
      if (r.icon) nodes.push(...rotated(Shapes().icon(r.icon, cx, cy, colour(sty.glyph, theme, theme.glyphOff), num(r.iconScale, 0.8)), spin, cx, cy));
      else if (r.glyph) nodes.push({ tag: 'text', text: r.glyph, attrs: { x: cx, y: cy + 3.4, 'font-size': 10, 'text-anchor': 'middle', fill: colour(sty.glyph, theme, theme.glyphOff), 'pointer-events': 'none' } });
    }

    if (sty.badge) {
      const text = badgeText(sty.badge, st, item, ctx && ctx.share ? ctx.share[item.id] : undefined);
      if (text) {
        const readout = !!r.readout;
        nodes.push({
          tag: 'text', text,
          attrs: Object.assign({
            x: cx, y: cy + (readout ? 22 : 19), 'font-size': readout ? 11.5 : 8,
            'text-anchor': 'middle', 'font-weight': readout ? 800 : 600, 'pointer-events': 'none',
          }, readout
            ? { fill: '#ffffff', stroke: theme.wallThick, 'stroke-width': 2.6, 'paint-order': 'stroke', 'stroke-linejoin': 'round' }
            : { fill: theme.glyphOff }),
        });
      }
    }
    return nodes;
  }

  /* -------------------------------------------------------------- the scene */

  function build(project, floor, library, theme, opts) {
    opts = opts || {};
    const P = makeProjector(project);
    const states = opts.states || {};
    const bDoc = opts.boundaries || { types: {}, openingTypes: {}, defaults: {} };
    const flDoc = opts.flooring || { types: {} };
    const ext = floor.extent || { w: 40, h: 40 };
    const width = P.X(ext.w) + ((project.origin && project.origin[0]) || 0);
    const height = P.Y(ext.h) + ((project.origin && project.origin[1]) || 0);
    const warnings = [];

    const layers = {
      defs: [], sheet: [], flooring: [], flooringField: [], grid: [],
      daylight: [], boundaries: [], openings: [], furniture: [], overDaylight: [],
      scrim: [], lampWash: [], glow: [], markers: [], labels: [],
    };
    /* `scrim` sits above everything physical and below everything luminous.
     * That is the whole trick: one flat dim makes the house read as night, and
     * the lamp washes and pools above it are what a lit room looks like from
     * the doorway. Putting the scrim under the walls instead would darken the
     * floor while leaving the walls glowing, which reads as fog. */
    const order = ['sheet', 'flooring', 'flooringField', 'grid', 'daylight', 'boundaries', 'openings', 'furniture', 'overDaylight', 'scrim', 'lampWash', 'glow', 'markers', 'labels'];

    layers.defs.push({ tag: 'style', text: MOTION_CSS });

    layers.defs.push({
      tag: 'radialGradient', attrs: { id: 'fpsGlow' },
      children: [
        { tag: 'stop', attrs: { offset: '0%', 'stop-color': theme.glow, 'stop-opacity': 0.85 } },
        { tag: 'stop', attrs: { offset: '100%', 'stop-color': theme.glow, 'stop-opacity': 0 } },
      ],
    });
    layers.defs.push({
      tag: 'linearGradient', attrs: { id: 'fpsBeam', x1: '0', y1: '0', x2: '0', y2: '1' },
      children: [
        { tag: 'stop', attrs: { offset: '0%', 'stop-color': colour('@glowTint', theme, '#fff3c4'), 'stop-opacity': 0.55 } },
        { tag: 'stop', attrs: { offset: '100%', 'stop-color': colour('@glowTint', theme, '#fff3c4'), 'stop-opacity': 0 } },
      ],
    });

    layers.sheet.push({ tag: 'rect', attrs: { x: 0, y: 0, width, height, fill: theme.sheet } });

    /* ---- sun, house-level then floor override ---- */
    const sunCfg = Sun().mergeConfig(project.sun, floor.sun);
    const sunScene = Sun().scene(sunCfg, states, opts.when);
    const darkFloor = !sunScene || sunScene.day < 0.12;

    /* ---- rooms: clip paths, flooring, daylight ---- */
    const roomPathOf = (room) => roomPoints(room).map((p, i) => `${i ? 'L' : 'M'} ${P.X(p[0])} ${P.Y(p[1])}`).join(' ') + ' Z';
    const patternIds = new Set();

    /* ---- light zones ----
     *
     * A lamp's glow pool is clipped to the room it is in, so light does not
     * wash through a wall — plus a patch of spill through every opening on that
     * room, because light DOES get through a window or a doorway and a plan
     * that stops it dead at the glass is as wrong as one that ignores walls.
     *
     * How far it spills is the opening's own transmission — the same single
     * number the daylight model reads — so a blackout blind at 0 stops the
     * spill, a sheer curtain lets most of it past, and neither is a special
     * case. Openings that predate coverings behave exactly as they did.
     */
    const zoneCfg = Object.assign(
      { enabled: true, spillFt: 3.5 },
      ((Light().mergeConfig(project.lighting, floor.lighting, opts.lighting) || {}).zones) || {},
    );
    /* Declared here rather than beside the boundary loop below, because the
     * light zones now read boundary runs too and are built first. */
    const onExtent = (x, y) => Math.abs(x) < 1e-6 || Math.abs(y) < 1e-6 || Math.abs(x - ext.w) < 1e-6 || Math.abs(y - ext.h) < 1e-6;
    const defaults = Object.assign({ exterior: 'wall_exterior', interior: 'wall_partition' }, bDoc.defaults || {});

    const zonePathOf = (room) => {
      const parts = [roomPathOf(room)];
      /* `part_of` rects belong to the same zone: a lamp in one half of an
       * L-shaped room lights the whole of it, exactly as the wash does. */
      for (const other of floor.rooms || []) {
        if (other.id !== room.id && (primaryRoom(floor, other) || other).id === room.id) parts.push(roomPathOf(other));
      }
      if (zoneCfg.enabled === false) return parts.join(' ');
      const spill = num(zoneCfg.spillFt, 3.5);
      for (const op of floor.openings || []) {
        const owner = (floor.rooms || []).find((r) => r.id === op.room);
        if (!owner) continue;
        const edge = openingEdgeOf(owner, op);
        if (!edge) continue;
        /* Mine, or the neighbour's on the wall we share.
         *
         * A door between two rooms is filed under one of them, and the zone
         * used to take only its owner's — so light crossed it in exactly one
         * direction. Which room an opening is recorded against is bookkeeping;
         * the hole is physical, and both sides can see through it. */
        const mine = (primaryRoom(floor, owner) || owner).id === room.id;
        const shared = !mine && (roomEdges(room) || []).some((e) => edgesCoincide(e, edge));
        if (!mine && !shared) continue;
        const t = openingTransmission(op, bDoc, null, states);
        if (t <= 0.02) continue;                 // shut: nothing gets through
        const tDef = (bDoc.openingTypes || {})[op.type] || {};
        const at = num(op.at, edge.lo);
        const w = num(op.w, (tDef.props && tDef.props.w) || 2.5);
        const a = pointOn(edge, at - 0.25), b = pointOn(edge, at + w + 0.25);
        /* Outward is away from the room's own centre, which is right for a
         * rect and close enough for anything convex. */
        const c = roomCentroid(owner);
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const len = Math.hypot(mx - c[0], my - c[1]) || 1;
        const nx = ((mx - c[0]) / len) * spill * t, ny = ((my - c[1]) / len) * spill * t;
        /* A quad through the opening, reaching both ways: light leaves the room
         * through it and also arrives from a lamp on the other side. */
        const quad = [
          [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny],
          [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny],
        ];
        parts.push(quad.map((p, i) => `${i ? 'L' : 'M'} ${P.X(p[0])} ${P.Y(p[1])}`).join(' ') + ' Z');
      }

      /* The same, for the parts of a wall that are not solid. An `open_edge`
       * between two halves of a car park, or a balcony's glass railing, spills
       * exactly like a doorway does — by its own transmission. */
      for (const other of [room, ...(floor.rooms || []).filter((r) => r.id !== room.id
        && (primaryRoom(floor, r) || r).id === room.id)]) {
        for (const run of transmissiveRuns(other, floor, bDoc, defaults, onExtent)) {
          const a = pointOn(run.edge, run.from - 0.25), b = pointOn(run.edge, run.to + 0.25);
          const c = roomCentroid(other);
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          const len = Math.hypot(mx - c[0], my - c[1]) || 1;
          const nx = ((mx - c[0]) / len) * spill * run.transmission;
          const ny = ((my - c[1]) / len) * spill * run.transmission;
          const quad = [
            [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny],
            [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny],
          ];
          parts.push(quad.map((p, i) => `${i ? 'L' : 'M'} ${P.X(p[0])} ${P.Y(p[1])}`).join(' ') + ' Z');
        }
      }
      return parts.join(' ');
    };

    for (const room of floor.rooms || []) {
      const d = roomPathOf(room);
      const clipId = `fpsClip-${room.id}`;
      layers.defs.push({ tag: 'clipPath', attrs: { id: clipId }, children: [{ tag: 'path', attrs: { d } }] });
      if (!room.part_of) {
        layers.defs.push({
          tag: 'clipPath', attrs: { id: `fpsZone-${room.id}`, clipRule: 'nonzero' },
          children: [{ tag: 'path', attrs: { d: zonePathOf(room), 'clip-rule': 'nonzero' } }],
        });
      }

      const [bx, by, bw, bh] = roomBBox(room);
      const fl = Flooring().build(flDoc, room.flooring || room.floor || 'plain', P, {
        bounds: { x0: bx, y0: by, x1: bx + bw, y1: by + bh },
        room, overrides: room.flooringOptions, theme,
      });
      if (fl.error) warnings.push({ room: room.id, kind: 'flooring', message: fl.error });
      for (const def of fl.defs || []) {
        if (patternIds.has(def.attrs.id)) continue;
        patternIds.add(def.attrs.id);
        layers.defs.push(def);
      }
      layers.flooring.push({ tag: 'path', roomId: room.id, attrs: { d, fill: fl.fill } });
      for (const n of fl.nodes || []) {
        layers.flooringField.push(Object.assign({}, n, { attrs: Object.assign({}, n.attrs, { 'clip-path': `url(#${clipId})` }) }));
      }
    }

    /* ---- boundaries + openings ---- */
    for (const room of floor.rooms || []) {
      for (const edge of roomEdges(room)) {
        /* A seam between two rects of the SAME logical room is not a wall.
         * Skipped for a curve segment: the probe steps along the wall's own
         * normal, and a bowed segment's normal is not the wall's. */
        const mid = pointOn(edge, (edge.lo + edge.hi) / 2);
        if (!edge.diagonal) {
          const nrm = WALL_NORMAL[edge.wall] * RAD;
          const probe = [mid[0] + Math.sin(nrm) * 0.12, mid[1] - Math.cos(nrm) * 0.12];
          const neighbour = roomAt(floor, probe[0], probe[1]);
          if (neighbour && primaryRoom(floor, neighbour) === primaryRoom(floor, room) && neighbour !== room) continue;
        }

        const isExterior = onExtent(edge.a[0], edge.a[1]) && onExtent(edge.b[0], edge.b[1]);
        for (const run of edgeRuns(edge, room, floor, defaults, isExterior)) {
          for (const n of boundaryNodes(run, edge, bDoc, theme, P)) {
            n.roomId = room.id; n.wall = edge.wall;
            layers.boundaries.push(n);
          }
        }
      }
    }

    /* The dashed quarter-circle a door leaf sweeps through. Scoped house →
     * floor like coverage, and overridable per opening below it, because it is
     * drawing convention rather than information: the leaf already says which
     * way the door opens, and a plan with many doors close together can read
     * better without them. Default on — it is what a floor plan looks like. */
    const swingArcDefault = Object.assign(
      { swingArc: true }, project.doors || {}, floor.doors || {},
    ).swingArc !== false;

    for (const op of floor.openings || []) {
      const room = (floor.rooms || []).find((r) => r.id === op.room);
      if (!room) { warnings.push({ kind: 'orphan-opening', message: `opening on unknown room "${op.room}"` }); continue; }
      for (const n of openingNodes(op, room, floor, bDoc, theme, P, states, swingArcDefault)) {
        n.openingId = op.id; layers.openings.push(n);
      }
    }

    /* ---- daylight ---- */
    if (sunScene && sunScene.day > 0.02) {
      for (const room of floor.rooms || []) {
        const clipId = `fpsClip-${room.id}`;
        const ops = (floor.openings || [])
          .filter((o) => o.room === room.id)
          .map((o) => {
            const edge = openingEdgeOf(room, o);
            if (!edge) return null;
            const tDef = (bDoc.openingTypes || {})[o.type] || {};
            const at = num(o.at, edge.lo), w = num(o.w, (tDef.props && tDef.props.w) || 2.5);
            return {
              at: [pointOn(edge, at), pointOn(edge, at + w)],
              width: w, height: num(o.h, (tDef.props && tDef.props.h) || 3.5),
              transmission: openingTransmission(o, bDoc, null, states),
              normalDeg: WALL_NORMAL[o.wall] ?? 0,
            };
          })
          .filter(Boolean);

        /* A wall that is not solid is an aperture too. A balcony fronted by a
         * glass railing, a car park open to the yard, a courtyard edge that is
         * a stepdown rather than a wall — all of them let daylight in, and
         * before this the model could only see a hole somebody had drawn as an
         * `opening`. Same shape as the openings above, so `roomDaylight` needs
         * no idea which of the two it is looking at. */
        for (const run of transmissiveRuns(room, floor, bDoc, defaults, onExtent)) {
          ops.push({
            at: [pointOn(run.edge, run.from), pointOn(run.edge, run.to)],
            width: run.width,
            height: run.height,
            transmission: run.transmission,
            /* `roomDaylight` casts a beam only for an aperture that declares a
             * normal, so leaving it off is how a run says "I let light in but I
             * do not shaft it". Non-barriers never shaft; and an OUTDOOR room is
             * lit from directly above, so a beam through its railing would be
             * drawing a shaft across ground that is already in full sun. */
            normalDeg: (run.encloses && !room.outdoor) ? (WALL_NORMAL[run.edge.wall] ?? 0) : undefined,
          });
        }

        const dl = Sun().roomDaylight(room, ops, sunScene, sunCfg);
        if (dl.ambient > 0.02) {
          const [bx, by, bw, bh] = roomBBox(room);
          layers.daylight.push({
            tag: 'rect', roomId: room.id,
            attrs: {
              x: P.X(bx), y: P.Y(by), width: P.S(bw), height: P.S(bh),
              fill: colour('@daylightWash', theme, '#fff6d8'), opacity: clamp(dl.ambient * 0.5, 0, 0.45),
              /* SCREEN, like the lamp wash — daylight brightens a floor, it does
               * not cover it. Plain alpha veils whatever is beneath, so marble,
               * oak and terracotta all drifted toward the same pale cream as the
               * sun came up and the plan lost its materials exactly when there
               * was most light to see them by. */
              'mix-blend-mode': 'screen',
              'clip-path': `url(#${clipId})`, 'pointer-events': 'none',
            },
          });
        }
        for (const beam of dl.beams) {
          const [a, b] = beam.at;
          const inAng = (beam.normalDeg + 180) * RAD;
          const dx = Math.sin(inAng) * beam.length, dy = -Math.cos(inAng) * beam.length;
          const spread = P.S(beam.length * Math.tan(num(beam.spreadDeg, 6) * RAD));
          const px = -(dy / (Math.hypot(dx, dy) || 1)), py = dx / (Math.hypot(dx, dy) || 1);
          layers.daylight.push({
            tag: 'polygon', roomId: room.id,
            attrs: {
              points: [
                `${P.X(a[0])},${P.Y(a[1])}`,
                `${P.X(a[0] + dx) - px * spread},${P.Y(a[1] + dy) - py * spread}`,
                `${P.X(b[0] + dx) + px * spread},${P.Y(b[1] + dy) + py * spread}`,
                `${P.X(b[0])},${P.Y(b[1])}`,
              ].join(' '),
              fill: colour('@sunBeam', theme, '#fff3c4'), opacity: clamp(beam.strength * 0.5, 0, 0.5),
              'mix-blend-mode': 'screen',
              'clip-path': `url(#${clipId})`, 'pointer-events': 'none',
            },
          });
        }
      }
    }

    /* ---- artificial light ----
     *
     * Done before the items are drawn because the wash is a room-sized layer,
     * not a per-marker one, and it has to know every lamp in the room before it
     * can paint any of it.
     *
     * Membership is `item.room` when it is set and geometry only as a fallback,
     * for the same reason the marker layer trusts it: a cove marker can sit
     * outside its own slab. Sub-rects of one logical room (`part_of`) pool into
     * the primary, so a lamp in one half lights the whole of an L-shaped room
     * rather than exactly the rectangle it happens to stand in. */
    const lightCfg = Light().mergeConfig(project.lighting, floor.lighting, opts.lighting);
    const motion = opts.motion !== false && lightCfg.motion !== false;
    /* Whether a device draws what it REACHES as well as where it is.
     *
     * Scoped house -> floor like every other setting here, and on by default so
     * a type that declares `render.cone` keeps behaving as it always has. A
     * house where the sensors cluster in small rooms can end up with more wedge
     * than plan, which is a judgement about one house rather than something the
     * framework should decide — so it is a setting, not a new default. */
    const coverage = Object.assign({ enabled: true }, project.coverage || {}, floor.coverage || {}).enabled !== false;
    const roomLamps = new Map();
    if (lightCfg.enabled) {
      for (const item of floor.items || []) {
        const type = resolveType(library, item);
        if (!type || (item.kind || type.kind) !== 'fixture') continue;
        let room = item.room ? (floor.rooms || []).find((x) => x.id === item.room) : null;
        if (!room) room = roomAt(floor, item.at[0], item.at[1]);
        if (!room) continue;
        const key = (primaryRoom(floor, room) || room).id;
        const st = item.entity && states ? states[item.entity] : null;
        const sk = stateOf(type, st);
        const output = Light().lampOutput(item, type, st, lightCfg);
        if (!roomLamps.has(key)) roomLamps.set(key, []);
        roomLamps.get(key).push({
          item, type, state: st, on: sk.on, output,
          colour: sk.on ? lampColour(st, theme, output.kelvin) : null,
        });
      }
    }

    /* Floor area per logical room, summed across its part_of rects — the
     * denominator that turns lumens into foot-candles. */
    const roomAreas = new Map();
    for (const room of floor.rooms || []) {
      const key = (primaryRoom(floor, room) || room).id;
      roomAreas.set(key, (roomAreas.get(key) || 0) + Sun().roomArea(room));
    }

    /* A room's own floor decides how much light comes back up, so the light
     * model is handed the reflectance of the surface actually drawn there —
     * the room's `flooringOptions` override first, then the flooring type's
     * own figure, then nothing. A room with no flooring reflects nothing, which
     * is the old behaviour exactly. */
    const floorReflectance = (roomId) => {
      const room = (floor.rooms || []).find((r) => r.id === roomId);
      if (!room) return 0;
      const own = (room.flooringOptions || {}).reflectance;
      if (own !== undefined) return num(own, 0);
      const def = Flooring().resolve(flDoc, room.flooring || room.floor || 'plain') || {};
      return num(def.reflectance, num((def.options || {}).reflectance, 0));
    };

    const roomLevels = new Map();
    for (const [key, lamps] of roomLamps) {
      roomLevels.set(key, Light().roomLight(lamps, roomAreas.get(key) || 1,
        Object.assign({}, lightCfg, { reflectance: floorReflectance(key) })));
    }

    const scrim = lightCfg.enabled ? Light().scrimOpacity(sunScene ? sunScene.day : 1, lightCfg) : 0;
    if (scrim > 0.005) {
      layers.scrim.push({
        tag: 'rect',
        attrs: {
          x: 0, y: 0, width, height,
          fill: colour('@nightScrim', theme, '#060a14'), opacity: scrim, 'pointer-events': 'none',
        },
      });
    }

    if (lightCfg.enabled) {
      for (const room of floor.rooms || []) {
        const key = (primaryRoom(floor, room) || room).id;
        const lit = roomLevels.get(key);
        if (!lit || lit.level <= 0.01) continue;
        const [bx, by, bw, bh] = roomBBox(room);
        layers.lampWash.push({
          tag: 'rect', roomId: room.id,
          attrs: {
            x: P.X(bx), y: P.Y(by), width: P.S(bw), height: P.S(bh),
            fill: lit.colour || theme.lampWarm || '#ffd9a0',
            opacity: clamp(lit.level * lightCfg.maxWash, 0, 1),
            'clip-path': `url(#fpsClip-${room.id})`,
            'mix-blend-mode': 'screen', 'pointer-events': 'none',
          },
        });

        /* What comes out the other side.
         *
         * A lit room behind translucent glazing throws light into whatever is
         * beyond it, and a tinted material colours what it passes. So each
         * transmissive run gets a band on its OUTWARD side carrying this
         * room's own level, attenuated by the run's transmission and tinted by
         * the material — clear glazing has no tint and simply carries the
         * lamp's colour through.
         *
         * Deliberately NOT clipped to this room: the whole point is that it
         * lands next door. It is the same `screen` blend as the wash itself,
         * so two rooms lighting the same strip add up rather than one winning.
         */
        const spillFt = num(zoneCfg.spillFt, 3.5);
        if (zoneCfg.enabled !== false) {
          for (const run of transmissiveRuns(room, floor, bDoc, defaults, onExtent)) {
            const carried = clamp(lit.level * lightCfg.maxWash * run.transmission, 0, 1);
            if (carried <= 0.02) continue;
            const a = pointOn(run.edge, run.from), b = pointOn(run.edge, run.to);
            const c = roomCentroid(room);
            const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
            const len = Math.hypot(mx - c[0], my - c[1]) || 1;
            const reach = spillFt * run.transmission;
            const nx = ((mx - c[0]) / len) * reach, ny = ((my - c[1]) / len) * reach;
            const quad = [a, b, [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]];
            layers.lampWash.push({
              tag: 'path', roomId: room.id, boundaryType: run.type,
              attrs: {
                d: quad.map((p, i) => `${i ? 'L' : 'M'} ${P.X(p[0])} ${P.Y(p[1])}`).join(' ') + ' Z',
                fill: run.tint
                  ? mixColour(lit.colour || theme.lampWarm || '#ffd9a0', colour(run.tint, theme, '#ffffff'))
                  : (lit.colour || theme.lampWarm || '#ffd9a0'),
                opacity: carried,
                'mix-blend-mode': 'screen', 'pointer-events': 'none',
              },
            });
          }
        }
      }
    }

    /* ---- items ---- */
    const shares = shareMap(floor.items, library);
    for (const item of floor.items || []) {
      const type = resolveType(library, item);
      if (!type) {
        layers.markers.push({ tag: 'circle', itemId: item.id, attrs: { cx: P.X(item.at[0]), cy: P.Y(item.at[1]), r: 7, fill: 'none', stroke: theme.deadRim, 'stroke-dasharray': '3 3' } });
        warnings.push({ kind: 'unknown-type', item: item.id, message: `no library type for ${item.kind}.${item.type}` });
        continue;
      }
      const kind = item.kind || type.kind;
      if (kind === 'furniture') {
        const p = Object.assign({}, type.defaults || {}, item.props || {});
        const w = num(p.w, 3), h = num(p.h, 3);
        /* Furniture is mostly inert, but some of it is a real thing with a
         * switch on it — a flight of stairs whose risers are lit, a tank with a
         * level. A type opts in with `render.bindable`, and only then does the
         * inspector offer it an entity. Everything else keeps drawing exactly as
         * it did, unaware that state exists. */
        const fSt = item.entity && states ? states[item.entity] : null;
        const fOn = !!fSt && !['off', 'unavailable', 'unknown'].includes(fSt.state);
        const c = {
          x: item.at[0], y: item.at[1], w, h, p, P, t: theme,
          X: P.X(item.at[0]), Y: P.Y(item.at[1]), W: P.S(w), H: P.S(h),
          fill: colour((type.render && type.render.fill) || '@furnFill', theme, theme.furnFill),
          line: colour((type.render && type.render.line) || '@furnLine', theme, theme.furnLine),
          on: fOn,
          state: fSt,
          motion,
          accent: fOn ? lampColour(fSt, theme, null) : null,
        };
        const target = type.aboveDaylight ? layers.overDaylight : layers.furniture;
        for (const n of Shapes().furniture((type.render && type.render.shape) || 'rect', c)) {
          n.itemId = item.id;
          /* A furniture drawer may already rotate its own details (radial
           * leaves/fronds, for example). Preserve that local transform when
           * rotating the whole item; replacing it made a turned plant collapse
           * all of its leaves back onto one axis. */
          if (p.rot) n.attrs.transform = [`rotate(${p.rot} ${c.X + c.W / 2} ${c.Y + c.H / 2})`, n.attrs.transform].filter(Boolean).join(' ');
          target.push(n);
        }
      } else {
        const ctx = { room: roomAt(floor, item.at[0], item.at[1]), darkFloor, lightCfg, motion, coverage, floor, states, library, share: shares };
        /* The zone this lamp lights. `item.room` wins over geometry for the
         * same reason it does everywhere else — a pillar-mounted fitting can
         * sit outside the slab it lights. A lamp in no room at all (a garden
         * spike) gets no clip, which is correct: there is no wall to stop it. */
        const zoneRoom = item.room
          ? ((floor.rooms || []).find((r) => r.id === item.room) || null)
          : ctx.room;
        const zoneId = zoneRoom ? (primaryRoom(floor, zoneRoom) || zoneRoom).id : null;
        /* A command is in flight for this marker's entity. The class is added
         * here rather than inside markerNodes because it applies to whatever
         * that type happens to draw — disc, cone, rectangle, a group of blades —
         * and none of them should have to know about it. The glow is left
         * alone: a guess is not light in the room, and flashing a whole room
         * bright for a command that then fails is exactly the lie the
         * confirmation window exists to avoid. */
        const inFlight = item.entity && opts.pending && opts.pending.has(item.entity);
        for (const n of markerNodes(item, type, theme, P, states, ctx)) {
          n.itemId = item.id;
          if (inFlight && n.layer !== 'glow') {
            n.attrs = Object.assign({}, n.attrs, {
              class: [n.attrs && n.attrs.class, 'fps-pending'].filter(Boolean).join(' '),
            });
          }
          if (n.layer === 'glow' && zoneId && zoneCfg.enabled !== false) {
            n.attrs['clip-path'] = `url(#fpsZone-${zoneId})`;
          }
          (n.layer === 'glow' ? layers.glow : layers.markers).push(n);
        }
      }
    }

    /* ---- room labels and chips ----
     *
     * A room's name, and how much of it is on. The count is the thing you
     * actually read from across a room — "3/8" tells you the state of a whole
     * room at a glance, which is the entire argument for a floor plan over a
     * list.
     *
     * It is suppressed in three cases, each for its own reason:
     *
     *   one lamp      "0/1" and "1/1" are the only two states it could show,
     *                 and the marker beside it already says which.
     *   ganged        the lamps share one physical switch, so "1 of 2" is not
     *                 a state they can be in. Claiming otherwise is a lie
     *                 about the wiring.
     *   named rooms   `chips.hideRooms` — a bath or a balcony whose lamps are
     *                 always used together, where the number is just noise.
     */
    const chipCfg = Object.assign(
      { show: true, counts: true, hideWhenAtMost: 1, hideRooms: [], style: 'pill' },
      project.chips || {},
    );
    /* Everything the label has to keep off, as circles in screen space.
     *
     * Built once for the floor rather than per room, and deliberately WITHOUT
     * asking which room each marker belongs to: a collision is a fact about
     * pixels, and a ceiling fan hung near a doorway overlaps the label next
     * door just as badly as its own. `markerRadius` is the same function the
     * canvas draws and hit-tests from, so the label dodges what is actually
     * on screen rather than an estimate of it. */
    const labelBlockers = [];
    for (const item of floor.items || []) {
      const t = resolveType(library, item);
      if (!t) continue;
      const [ix, iy] = item.at || [0, 0];
      /* Furniture has a real footprint and its `at` is the TOP-LEFT corner, so
       * it blocks as the rectangle it actually covers. Treating it as a circle
       * of radius w/2 — which is what a marker is — made a sofa block a
       * quarter of the room and left dense rooms with nowhere to put a label
       * at all. A marker's `at` is its centre and a disc is what it draws. */
      if (item.kind === 'furniture') {
        const p = item.props || {};
        const d = t.defaults || {};
        const fw = P.S(num(p.w, num(d.w, 2))), fh = P.S(num(p.h, num(d.h, 2)));
        labelBlockers.push({
          rect: true, weight: 1,
          x: P.X(ix) + fw / 2, y: P.Y(iy) + fh / 2, w: fw, h: fh,
        });
      } else {
        const r = markerRadius(item, t, P);
        /* A marker sitting under a name is the thing that actually looks
         * broken — a fan especially — so it costs more than furniture does. */
        labelBlockers.push({ rect: false, weight: 6, x: P.X(ix), y: P.Y(iy), r });
      }
    }
    /* Area of overlap, not a yes/no: in a fully furnished room nothing is
     * completely clear, and "least covered" is a far better answer than
     * "give up and sit on the ceiling fan". */
    const overlap = (x, y, w, h, b) => {
      const bw = b.rect ? b.w : b.r * 2;
      const bh = b.rect ? b.h : b.r * 2;
      const ox = Math.min(x + w / 2, b.x + bw / 2) - Math.max(x - w / 2, b.x - bw / 2);
      const oy = Math.min(y + h / 2, b.y + bh / 2) - Math.max(y - h / 2, b.y - bh / 2);
      return ox > 0 && oy > 0 ? ox * oy * b.weight : 0;
    };

    for (const room of floor.rooms || []) {
      if (room.noLabel || room.part_of || chipCfg.show === false) continue;
      const name = (room.name || room.id).toUpperCase();
      const lvl = roomLevels.get(room.id) || { on: 0, total: 0 };
      const showCount = chipCfg.counts !== false
        && room.showCount !== false
        && !room.ganged
        && lvl.total > num(chipCfg.hideWhenAtMost, 1)
        && !(chipCfg.hideRooms || []).includes(room.id);
      const count = showCount ? `${lvl.on}/${lvl.total}` : '';

      /* Sized from the text rather than measured, because there is no text
       * metrics API that works in Node, the browser and an exported file
       * alike. 6.2px per character at 11px is close enough that the pill never
       * clips, and a little slack looks deliberate. */
      const wName = name.length * 6.2;
      const wCount = count ? count.length * 6.6 + 10 : 0;
      const w = wName + wCount + 18;
      const h = 18;

      /* Where the name sits.
       *
       * The centroid is the right answer for an empty room and the wrong one
       * for a real house: a ceiling fan, a pendant or a chandelier is almost
       * always AT the middle of the room, which is exactly where the label
       * wants to be — so the label was drawn on top of the fan.
       *
       * `chip_at` still wins outright. A position someone set by hand is a
       * decision, not a starting point, and second-guessing it would make the
       * control useless. Otherwise the label takes the centroid when it is
       * clear and the first clear rung of a FIXED ladder of offsets when it is
       * not — vertical first because a name reads better above or below a
       * marker than beside it, then horizontal, then diagonal, at increasing
       * distance. Fixed and ordered, never random or nearest-fit, so the same
       * plan renders identically every time and the exported SVG matches what
       * the editor drew.
       *
       * If nothing is clear it falls back to the centroid, which is exactly
       * what it did before — a crowded room is no worse off than it was. */
      const centre = room.chip_at || roomCentroid(room);
      let at = centre;
      if (!room.chip_at && labelBlockers.length) {
        /* Searched in FEET and projected per candidate, so the room test is the
         * same `pointInRoom` the rest of this file uses. */
        const halfFt = ((w / 2) * 0.9) / (P.ppf || 22);
        const insideRoom = (fx, fy) => pointInRoom(room, fx, fy)
          /* Both ends, not just the middle: a pill reaching out through the
           * wall of a narrow room reads as a mistake. */
          && pointInRoom(room, fx - halfFt, fy)
          && pointInRoom(room, fx + halfFt, fy);
        const cost = (fx, fy) => {
          const px = P.X(fx), py = P.Y(fy);
          let sum = 0;
          for (const b of labelBlockers) sum += overlap(px, py, w, h, b);
          return sum;
        };

        let best = null;
        const consider = (fx, fy) => {
          if (best && best.cost === 0) return;
          if (!insideRoom(fx, fy)) return;
          const c = cost(fx, fy);
          if (!best || c < best.cost) best = { at: [fx, fy], cost: c };
        };
        consider(centre[0], centre[1]);
        /* A fixed, ordered ladder: vertical first because a name reads better
         * above or below a marker than beside it, then horizontal, then
         * diagonal, widening. Ordered rather than nearest-fit so the same plan
         * renders identically every time — ties keep the earliest rung, and the
         * centroid is rung zero, so an empty room never moves its label. */
        for (let ring = 1; ring <= 6 && !(best && best.cost === 0); ring++) {
          const d = 1.2 * ring;
          for (const [dx, dy] of [[0, -d], [0, d], [-d, 0], [d, 0], [-d, -d], [d, -d], [-d, d], [d, d]]) {
            consider(centre[0] + dx, centre[1] + dy);
          }
        }
        if (best) at = best.at;
      }
      const cx = P.X(at[0]), cy = P.Y(at[1]);

      const rot = room.chip_rotate ? `rotate(${room.chip_rotate} ${cx} ${cy})` : undefined;

      if (chipCfg.style === 'pill') {
        layers.labels.push({
          tag: 'rect', roomId: room.id,
          attrs: {
            x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: h / 2,
            fill: theme.chipBg, stroke: theme.chipBorder, 'stroke-width': 1,
            opacity: 0.86, 'pointer-events': 'none', transform: rot,
          },
        });
      }
      const inkFill = chipCfg.style === 'pill'
        ? theme.chipInk
        : (darkFloor ? theme.chipInk : theme.roomLabel);
      layers.labels.push({
        tag: 'text', text: name, roomId: room.id,
        attrs: Object.assign({
          x: cx - (wCount ? wCount / 2 : 0), y: cy + 4, 'font-size': 11, 'font-weight': 600,
          'text-anchor': 'middle', fill: inkFill, 'pointer-events': 'none', transform: rot,
        }, chipCfg.style === 'pill' ? {} : {
          stroke: theme.roomLabelHalo, 'stroke-width': 3, 'paint-order': 'stroke', 'stroke-linejoin': 'round',
        }),
      });
      if (count) {
        layers.labels.push({
          tag: 'text', text: count, roomId: room.id,
          attrs: {
            x: cx + w / 2 - wCount / 2 - 6, y: cy + 4, 'font-size': 10.5, 'font-weight': 700,
            'text-anchor': 'middle', 'pointer-events': 'none', transform: rot,
            fill: lvl.on ? theme.lampRim : (chipCfg.style === 'pill' ? theme.glyphOff : theme.roomLabel),
          },
        });
      }
    }

    /* ---- compass ----
     *
     * Optional, and drawn from the ONE place the plan's rotation lives —
     * `sun.screenUpBearing`, the compass bearing that points up the screen. It
     * is the same number the daylight model turns openings against, so the
     * needle and the beams can never disagree about which way the house faces.
     *
     * It appears whenever the sun is on, because a daylit plan without a north
     * mark asks the reader to take the lighting on trust; `project.compass.show`
     * forces it either way. Deliberately in the labels layer: it is chrome about
     * the drawing, not part of it. */
    const compassCfg = project.compass || {};
    const showCompass = compassCfg.show === true
      || (compassCfg.show !== false && sunCfg.enabled && isFinite(num(sunCfg.screenUpBearing, NaN)));
    if (showCompass) {
      const bearing = num(sunCfg.screenUpBearing, 0);
      const r = 15;
      const cx = width - r - 16, cy = height - r - 16;
      /* North sits `bearing` degrees anticlockwise of screen-up: if east points
       * up (bearing 90) then north points left. */
      const a = (-bearing) * RAD;
      const nx = cx + Math.sin(a) * r * 0.72, ny = cy - Math.cos(a) * r * 0.72;
      const tailX = cx - Math.sin(a) * r * 0.72, tailY = cy + Math.cos(a) * r * 0.72;
      layers.labels.push({ tag: 'circle', attrs: { cx, cy, r, fill: theme.sheet, opacity: 0.72, stroke: theme.wallThin, 'stroke-width': 1, 'pointer-events': 'none' } });
      layers.labels.push({ tag: 'line', attrs: { x1: tailX, y1: tailY, x2: nx, y2: ny, stroke: theme.wallThin, 'stroke-width': 1.4, 'pointer-events': 'none' } });
      layers.labels.push({ tag: 'circle', attrs: { cx: nx, cy: ny, r: 2.6, fill: theme.lampRim || theme.wallThick, 'pointer-events': 'none' } });
      layers.labels.push({
        tag: 'text', text: 'N',
        attrs: {
          x: nx, y: ny - 4.5, 'font-size': 8.5, 'font-weight': 700, 'text-anchor': 'middle',
          fill: theme.roomLabel, 'pointer-events': 'none',
        },
      });
    }

    /* ---- grid, last so it can sit under everything but above the sheet ---- */
    if (opts.grid && opts.grid.show) {
      const step = num(opts.grid.size, 1);
      for (let gx = 0; gx <= ext.w + 1e-6; gx += step) {
        const major = Math.abs(gx % 5) < 1e-6;
        layers.grid.push({ tag: 'line', attrs: { x1: P.X(gx), y1: P.Y(0), x2: P.X(gx), y2: P.Y(ext.h), stroke: major ? theme.gridLineStrong : theme.gridLine, 'stroke-width': major ? 1 : 0.6 } });
      }
      for (let gy = 0; gy <= ext.h + 1e-6; gy += step) {
        const major = Math.abs(gy % 5) < 1e-6;
        layers.grid.push({ tag: 'line', attrs: { x1: P.X(0), y1: P.Y(gy), x2: P.X(ext.w), y2: P.Y(gy), stroke: major ? theme.gridLineStrong : theme.gridLine, 'stroke-width': major ? 1 : 0.6 } });
      }
    }

    /* roomLevels is handed back rather than kept private because the control
     * surfaces and the dashboard glance cards all want to say "3 of 8 lights,
     * 62% lit" about the same room, and recomputing it in three places is how
     * three slightly different answers appear on one screen. */
    return {
      width, height, projector: P, order, layers,
      sun: sunScene, sunConfig: sunCfg, darkFloor, warnings,
      lighting: lightCfg, scrim, motion,
      roomLevels: Object.fromEntries(roomLevels),
    };
  }

  /* ------------------------------------------------------- hit targets */

  /* Invisible tap targets, one per item / opening / room.
   *
   * Lives here rather than in the editor because the dashboard card needs the
   * identical geometry: the whole point of a tap radius is that what is easy to
   * grab while drawing is easy to tap on the finished plan, and two copies of
   * this drift the first time a type's `tap` changes. A marker's tap circle
   * (r ~ 17) is deliberately much larger than its visible disc (r ~ 8.5).
   *
   * `target` says what a backend should do with it: 'item', 'opening', 'room'.
   * Rooms come last so a marker standing on one still wins the tap. */
  /* Tap targets, emitted BACK TO FRONT.
   *
   * The consumer appends these to one group in order, and an SVG pointer event
   * goes to the LAST matching sibling — so whatever is emitted last is what you
   * actually hit. Rooms used to come last, which meant a room's own shape sat on
   * top of every marker inside it and a tap on a lamp opened the room sheet
   * instead of switching the lamp. Rooms first, then openings, then items.
   *
   * Items are then sorted largest-first among themselves, so a small marker
   * standing on a big one — a tank sensor on its tank, a spot over a solar
   * array — stays reachable. Ordering by area rather than by declaration order
   * means it holds however the plan was drawn.
   */
  function hitTargets(floor, library, P, states) {
    const out = [];
    for (const room of floor.rooms || []) {
      out.push({
        target: 'room', id: (primaryRoom(floor, room) || room).id, tag: 'path',
        attrs: { d: roomPoints(room).map((pt, i) => `${i ? 'L' : 'M'} ${P.X(pt[0])} ${P.Y(pt[1])}`).join(' ') + ' Z' },
      });
    }
    for (const op of floor.openings || []) {
      const room = (floor.rooms || []).find((r) => r.id === op.room);
      if (!room) continue;
      const edge = openingEdgeOf(room, op);
      if (!edge) continue;
      const at = num(op.at, 0), w = num(op.w, 2.5);
      const a = pointOn(edge, at), b = pointOn(edge, at + w);
      out.push({
        target: 'opening', id: op.id, tag: 'line',
        attrs: { x1: P.X(a[0]), y1: P.Y(a[1]), x2: P.X(b[0]), y2: P.Y(b[1]), 'stroke-width': 14, stroke: 'transparent' },
      });
    }
    const items = [];
    for (const item of floor.items || []) {
      const t = resolveType(library, item) || {};
      const d = t.defaults || {}, p = item.props || {};
      /* An explicit tap rectangle, in feet, for a marker that stands for
       * something far bigger than its own disc — a solar array, a water tank.
       * A 17px circle on a ten-foot array is a target you have to hunt for. */
      if (Array.isArray(p.hitRect) && p.hitRect.length === 4 && p.hitRect.every((v) => typeof v === "number" && Number.isFinite(v))) {
        const [hx, hy, hw, hh] = p.hitRect;
        items.push({ target: 'item', id: item.id, tag: 'rect', area: Math.abs(hw * hh), attrs: {
          x: P.X(hx), y: P.Y(hy), width: P.S(Math.abs(hw)), height: P.S(Math.abs(hh)),
        } });
        continue;
      }
      if ((t.render || {}).shape === 'label') {
        const st = item.entity && states ? states[item.entity] : null;
        const text = labelText(p.template || d.template, st, item);
        const m = labelMetrics(item, t, text);
        const cx = P.X(item.at[0]), cy = P.Y(item.at[1]);
        const facing = num(p.rot, num(d.rot, 0));
        items.push({ target: 'item', id: item.id, tag: 'rect', area: m.width * m.height, attrs: {
          x: cx - m.width / 2, y: cy - m.height / 2, width: m.width, height: m.height,
          transform: facing ? `rotate(${facing} ${cx} ${cy})` : null,
        } });
      } else if ((item.kind || t.kind) === 'furniture') {
        const w = num(p.w, num(d.w, 3)), h = num(p.h, num(d.h, 3));
        items.push({ target: 'item', id: item.id, tag: 'rect', area: P.S(w) * P.S(h), attrs: { x: P.X(item.at[0]), y: P.Y(item.at[1]), width: P.S(w), height: P.S(h) } });
      } else {
        const r = num(t.render && t.render.tap, 17);
        items.push({ target: 'item', id: item.id, tag: 'circle', area: Math.PI * r * r, attrs: { cx: P.X(item.at[0]), cy: P.Y(item.at[1]), r } });
      }
    }
    /* Biggest first, so the smallest thing under the finger is on top and wins.
     * Ties keep their declaration order, which keeps the output stable. */
    items.sort((a, b) => b.area - a.area);
    for (const it of items) { delete it.area; out.push(it); }
    return out;
  }

  /* -------------------------------------------------- SVG string (export) */

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function nodeToSvg(n) {
    const attrs = Object.entries(n.attrs || {})
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}="${esc(v)}"`).join(' ');
    const kids = (n.children || []).map(nodeToSvg).join('');
    if (n.text !== undefined || kids) return `<${n.tag} ${attrs}>${kids}${n.text !== undefined ? esc(n.text) : ''}</${n.tag}>`;
    return `<${n.tag} ${attrs}/>`;
  }

  function toSvg(scene) {
    const defs = scene.layers.defs.map(nodeToSvg).join('');
    const body = scene.order.map((k) => `<g id="fps-${k}">${(scene.layers[k] || []).map(nodeToSvg).join('')}</g>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${scene.width} ${scene.height}" width="${scene.width}" height="${scene.height}" font-family="ui-sans-serif,system-ui,sans-serif"><defs>${defs}</defs>${body}</svg>`;
  }

  return {
    build, toSvg, nodeToSvg, resolveType, hitTargets,
    makeProjector, roomPoints, roomBBox, roomCentroid, pointInRoom, roomAt, roomEdges,
    primaryRoom, colour, stateOf, lampColour, openingIsOpen, openingTransmission, coneNodes, MOTION_CSS,
    variantOf, markerRadius, labelText, thresholdColour, labelMetrics,
    coveringOpenness, coveringTransmission, insetPolygon, polygonArea,
    WALL_NORMAL,
  };
}));
