/**
 * help-figures.js — the pictures in the help site, as data.
 *
 * `make-docs.js` asks this module for every figure, writes each picture to
 * `docs/figures/` and places it inside the topic it belongs to. Nothing here is
 * a screenshot and nothing is drawn by hand: every picture is `plan-scene.js`
 * rendering a synthetic house, so when the renderer changes, the next
 * `node tools/make-docs.js` redraws the help, and the suite's `--check` fails
 * until somebody does.
 *
 * ## Where the pictures come from
 *
 * Most show a piece of Aria House — the invented bungalow `make-showcase.js`
 * builds and the README leads with — changed in exactly one way per panel: the
 * hour, a finish, a wall treatment, a blind. Showing a setting on a real room,
 * with the rest of the house left as it was, is what makes the difference
 * legible; the same setting on an empty box reads as a swatch.
 *
 * A few show things that house does not have (a stair, a curved wall, a row of
 * trees). Those are small scenes built from the library's own defaults, so a
 * look added to `shapes.js` is one line here away from being pictured.
 *
 * ## Why a picture is cropped by leaving rooms out
 *
 * The whole house is 900 KB of SVG, most of it floor texture and wall
 * material. Cropping only by viewBox would ship all of that for every panel. So
 * a panel keeps only the rooms that reach its crop (plus a margin, so walls
 * still know what is beyond them and light still knows where it can go) and
 * every item standing in those rooms. The extent and the origin stay the
 * house's, so the coordinates below are the house's own feet.
 *
 * ## Placing a figure
 *
 * `after` names a `##` heading in the topic; the figure goes at the end of that
 * section. `after: null` puts it at the top. A heading that no longer exists is
 * an error, not a picture quietly dropped — rename a heading and the build says
 * which figure lost its place.
 */

'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'floorplan_studio', 'app');
const scene = require(path.join(APP, 'lib', 'plan-scene.js'));
const Shapes = require(path.join(APP, 'lib', 'shapes.js'));
const library = require(path.join(APP, 'defaults', 'library.json'));
const themes = require(path.join(APP, 'defaults', 'themes.json'));
const flooring = require(path.join(APP, 'defaults', 'flooring.json'));
const boundaries = require(path.join(APP, 'defaults', 'boundaries.json'));
const aria = require('./make-showcase.js');

const THEME = themes.themes.frosted.plan;
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* The equinox the showcase still is drawn on, so an hour here means what it
 * means there. */
const at = (hhmm) => new Date(`2026-09-21T${hhmm}:00Z`);
const words = (key) => String(key).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/* Two moods most panels start from. Everything off, so the one thing a figure
 * changes is the only thing that moved. */
const DAY = { when: at('12:00'), lampsOn: [], fansOn: [], frontDoor: 'off', motion: false, drape: 100 };
const NIGHT = Object.assign({}, DAY, { when: at('21:40') });

/* --------------------------------------------------------------- helpers */

const roomRect = (id) => aria.ROOMS.find((r) => r.id === id).rect;

/* Where an item stands, as a box. Furniture `at` is its top-left corner; a
 * marker's is its centre. */
function itemBox(it) {
  const p = it.props || {};
  if ((it.kind || '') === 'furniture') {
    const w = Number(p.w) || 1; const h = Number(p.h) || 1;
    return [it.at[0], it.at[1], it.at[0] + w, it.at[1] + h];
  }
  return [it.at[0], it.at[1], it.at[0], it.at[1]];
}
const centre = (it) => { const b = itemBox(it); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
const inside = (it, rect) => {
  const [x, y] = centre(it);
  return x >= rect[0] && x <= rect[0] + rect[2] && y >= rect[1] && y <= rect[1] + rect[3];
};

/* The floor, keeping only what can show inside `crop` (see the header). */
function cropFloor(floor, crop, margin) {
  const m = margin === undefined ? 4 : margin;
  const box = [crop[0] - m, crop[1] - m, crop[0] + crop[2] + m, crop[1] + crop[3] + m];
  const touches = (b) => b[2] >= box[0] && b[0] <= box[2] && b[3] >= box[1] && b[1] <= box[3];
  const keep = new Set();
  for (const r of floor.rooms) {
    const [x, y, w, h] = scene.roomBBox(r);
    if (touches([x, y, x + w, y + h])) keep.add(r.id);
  }
  /* A part_of rect and its primary are one room: keep both or the seam
   * between them turns into a wall. */
  for (const r of floor.rooms) if (r.part_of && keep.has(r.id)) keep.add(r.part_of);
  for (const r of floor.rooms) if (r.part_of && keep.has(r.part_of)) keep.add(r.id);
  const roomOf = (it) => it.room || ((scene.roomAt(floor, ...centre(it)) || {}).id);
  return Object.assign({}, floor, {
    rooms: floor.rooms.filter((r) => keep.has(r.id)),
    openings: (floor.openings || []).filter((o) => keep.has(o.room)),
    boundaries: (floor.boundaries || []).filter((b) => keep.has(b.room)),
    items: (floor.items || []).filter((it) => {
      const rid = roomOf(it);
      return rid ? keep.has(rid) : touches(itemBox(it));
    }),
  });
}

/* ---- what is outside the window is not shipped ----
 *
 * Leaving rooms out is not enough on its own: a stone wall-top is ONE field of
 * a thousand chips laid across the whole floor and clipped to the wall bands,
 * and a room half in the crop still carries all of its texture. So every node
 * whose box — through its own transforms — misses the window is dropped, and
 * then every definition nothing still refers to. Anything this cannot place (a
 * relative path, a transform it does not parse, text) is kept, so the error
 * is always a slightly larger file and never a missing piece of drawing. */
const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const IDENT = [1, 0, 0, 1, 0, 0];
const mul = (p, q) => [p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1], p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3], p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]];

function parseTransform(src) {
  let m = IDENT; let any = false;
  const re = /(\w+)\s*\(([^)]*)\)/g;
  let hit;
  while ((hit = re.exec(String(src)))) {
    any = true;
    const v = (hit[2].match(NUM) || []).map(Number);
    let t;
    if (hit[1] === 'translate') t = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (hit[1] === 'scale') t = [v[0], 0, 0, v[1] === undefined ? v[0] : v[1], 0, 0];
    else if (hit[1] === 'rotate') {
      const a = (v[0] || 0) * Math.PI / 180; const c = Math.cos(a); const s = Math.sin(a);
      const cx = v[1] || 0; const cy = v[2] || 0;
      t = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
    } else if (hit[1] === 'matrix' && v.length === 6) t = v;
    else return null;
    m = mul(m, t);
  }
  return any ? m : null;
}

/* Min/max without spreading: a field can hold tens of thousands of numbers. */
function range(list, from, step) {
  let lo = Infinity; let hi = -Infinity;
  for (let i = from; i < list.length; i += step) { if (list[i] < lo) lo = list[i]; if (list[i] > hi) hi = list[i]; }
  return [lo, hi];
}

function ownBox(n) {
  const a = n.attrs || {};
  const f = (k) => { const v = Number(a[k]); return Number.isFinite(v) ? v : 0; };
  let b = null;
  if (n.tag === 'rect' || n.tag === 'image') {
    if (!Number.isFinite(Number(a.width)) || !Number.isFinite(Number(a.height))) return null;
    b = [f('x'), f('y'), f('x') + f('width'), f('y') + f('height')];
  } else if (n.tag === 'circle' || n.tag === 'ellipse') {
    const r = n.tag === 'circle' ? f('r') : Math.max(f('rx'), f('ry'));
    b = [f('cx') - r, f('cy') - r, f('cx') + r, f('cy') + r];
  } else if (n.tag === 'line') {
    b = [Math.min(f('x1'), f('x2')), Math.min(f('y1'), f('y2')), Math.max(f('x1'), f('x2')), Math.max(f('y1'), f('y2'))];
  } else if (n.tag === 'polygon' || n.tag === 'polyline' || n.tag === 'path') {
    const d = String(a.points || a.d || '');
    /* A relative command moves from wherever the pen is; that needs a real
     * path walker, and keeping the node costs only bytes. */
    if (n.tag === 'path' && /[mlhvcsqta]/.test(d.replace(/\d[eE][-+]?\d/g, ''))) return null;
    const v = (d.match(NUM) || []).map(Number);
    if (!v.length) return null;
    if (n.tag === 'path' && /[HVA]/.test(d)) {
      /* Arc radii and single-axis moves break the x,y pairing: take every
       * number as either axis, which can only make the box larger. */
      const [lo, hi] = range(v, 0, 1);
      b = [lo, lo, hi, hi];
    } else {
      const [x0, x1] = range(v, 0, 2); const [y0, y1] = range(v, 1, 2);
      b = [x0, y0, x1, y1];
    }
  } else return null;
  const pad = f('stroke-width') / 2 + 1;
  return [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad];
}

function boxThrough(b, m) {
  const pts = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]
    .map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])),
    Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}

function visit(n, M, view) {
  const a = n.attrs || {};
  let local = M;
  if (a.transform !== undefined) {
    const t = parseTransform(a.transform);
    if (!t) return n;
    local = mul(M, t);
  }
  if (n.children && n.children.length) {
    const kids = n.children.map((k) => visit(k, local, view)).filter(Boolean);
    if (!kids.length) return null;
    /* By identity, not by count: a child can come back the same length but a
     * new, trimmed object, and returning `n` would put the untrimmed one back. */
    return kids.length === n.children.length && kids.every((k, i) => k === n.children[i])
      ? n : Object.assign({}, n, { children: kids });
  }
  const b = ownBox(n);
  if (!b) return n;
  const w = boxThrough(b, local);
  return w[2] >= view[0] && w[0] <= view[2] && w[3] >= view[1] && w[1] <= view[3] ? n : null;
}

function slim(built, view) {
  const pad = 24;              // a blurred edge or a glow reaches a little past its shape
  const v = [view[0] - pad, view[1] - pad, view[2] + pad, view[3] + pad];
  const layers = {};
  for (const key of built.order) layers[key] = (built.layers[key] || []).map((n) => visit(n, IDENT, v)).filter(Boolean);
  const refs = new Set();
  const collect = (s) => { for (const m of s.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)) refs.add(m[1] || m[2]); };
  collect(built.order.map((k) => layers[k].map(scene.nodeToSvg).join('')).join(''));
  /* Definitions refer to one another (a mask to a gradient), so keep going
   * until nothing new is reached. */
  const defs = built.layers.defs.map((n) => ({ n, s: scene.nodeToSvg(n), keep: false }));
  for (let grew = true; grew;) {
    grew = false;
    for (const d of defs) {
      if (d.keep) continue;
      const id = d.n.attrs && d.n.attrs.id;
      if (!id || refs.has(id)) { d.keep = true; collect(d.s); grew = true; }
    }
  }
  layers.defs = defs.filter((d) => d.keep).map((d) => d.n);
  return Object.assign({}, built, { layers });
}

/* Two decimals of a pixel. The renderer writes coordinates to seventeen
 * significant figures, which is right for its own arithmetic and pure weight in
 * a picture: a hundredth of a pixel at 22 px/ft is a two-thousandth of a foot.
 * Only digits after a decimal point are touched, so ids and colours are safe. */
const compact = (svg) => svg.replace(/(\d\.\d\d)\d+/g, '$1');

/* The renderer's own document with its window moved onto the crop. */
function frame(svg, vb) {
  const [x, y, w, h] = vb.map((n) => Math.round(n * 100) / 100);
  return svg.replace(/^<svg([^>]*)>/, (whole, attrs) => '<svg' + attrs
    .replace(/\sviewBox="[^"]*"/, ` viewBox="${x} ${y} ${w} ${h}"`)
    .replace(/\swidth="[^"]*"/, ` width="${w}"`)
    .replace(/\sheight="[^"]*"/, ` height="${h}"`) + '>');
}

function checked(built, where) {
  if (built.warnings && built.warnings.length) {
    throw new Error(`${where}: the scene reported ${built.warnings.length} warning(s): `
      + built.warnings.map((w) => w.kind + ' ' + (w.message || '')).join('; '));
  }
  return built;
}

/* One panel of Aria House. */
function renderAria(fig, cell) {
  const project = clone(aria.project);
  const floor = project.floors[0];
  for (const patch of [fig.patch, cell.patch]) if (patch) patch(project, floor, cell);
  const opts = Object.assign({}, DAY, fig.state || {}, cell.state || {});
  const states = Object.assign(aria.statesFor(opts), fig.states || {}, cell.states || {});
  const built = checked(scene.build(project, cropFloor(floor, fig.crop), library, THEME, {
    states, boundaries, flooring, when: opts.when, motion: false,
  }), `figure ${fig.id} (${cell.label})`);
  const P = built.projector;
  const [x, y, w, h] = fig.crop;
  const lean = slim(built, [P.X(x), P.Y(y), P.X(x) + P.S(w), P.Y(y) + P.S(h)]);
  return { svg: frame(scene.toSvg(lean), [P.X(x), P.Y(y), P.S(w), P.S(h)]), w: P.S(w), h: P.S(h) };
}

/* One small scene of its own: a floor, a room or two, whatever the cell puts
 * in it. No sun and no lamps — these picture a SHAPE. */
function renderMini(fig, cell) {
  const spec = fig.mini(cell);
  const floor = Object.assign({ id: 'figure', name: 'Figure', openings: [], boundaries: [], items: [] }, spec.floor);
  const project = Object.assign({
    name: 'Figure', ppf: 22, origin: [11, 11],
    sun: { enabled: false }, lighting: { enabled: false }, coverage: { enabled: true },
    chips: { show: false, counts: false },
  }, spec.project || {});
  const built = checked(scene.build(project, floor, library, THEME, { states: {}, boundaries, flooring, motion: false }),
    `figure ${fig.id} (${cell.label})`);
  return { svg: scene.toSvg(built), w: built.width, h: built.height };
}

const miniRoom = (w, h, flooringKey, outdoor) => ({
  id: 'r', name: '', shape: 'rect', rect: [0, 0, w, h], flooring: flooringKey, outdoor: !!outdoor, noLabel: true,
});

/* A look's footprint, from the registry: its own per-look size when it has one,
 * the type's default size otherwise. */
function lookSize(typeKey, look) {
  const type = library.types[typeKey];
  const d = type.defaults || {};
  const s = Shapes.furnitureVariantSize(type.render.shape, look);
  return s ? [s[0], s[1]] : [Number(d.w) || 3, Number(d.h) || 3];
}

/* Mutators the figures share. */
const itemsIn = (floor, roomId) => floor.items.filter((it) => inside(it, roomRect(roomId)));
const byEntity = (floor, entity) => floor.items.filter((it) => it.entity === entity);
const opening = (floor, id) => floor.openings.find((o) => o.id === id);
const boundary = (floor, id) => floor.boundaries.find((b) => b.id === id);

/* --------------------------------------------------------------- figures */

const FIGURES = [
  /* The two live ones: the real cards in a frame, on the stand-in Home
   * Assistant (see demo-page.js). `demo` is the query the frame opens with. */
  {
    id: 'live-dashboard', topic: 'dashboard-install', after: 'Opening and closing a room\'s popup',
    demo: 't=18:20', height: 900,
    caption: 'The dashboard generated for the demo house, live. Tap a lamp, tap a room’s name for its popup, pinch or use − and + to zoom, and drag the time of day.',
  },
  {
    id: 'live-room', topic: 'room-controls', after: 'Sections',
    demo: 't=19:10&open=living', height: 900,
    caption: 'The demo living room’s popup with the stock sections: brightness, a button per fixture type, each light, the devices, and the room’s scenes and scripts found by name.',
  },
  {
    id: 'start-steps', topic: 'start-here', after: 'The shape of the work',
    crop: [5, 18, 38, 22], min: '16rem',
    caption: 'The same corner of the demo house at each step. Nothing is lit until the last panel, because nothing is bound until then.',
    patch(project) { project.sun.enabled = false; project.lighting.enabled = false; },
    cells: [
      { label: '1 · Rooms', patch(p, f) { p.sun.enabled = false; f.openings = []; f.items = []; for (const r of f.rooms) r.flooring = 'plain'; } },
      { label: '2 · Openings', patch(p, f) { f.items = []; for (const r of f.rooms) r.flooring = 'plain'; } },
      { label: '3 · Things and finishes', patch() {} },
      { label: '4 · Bound, at golden hour', patch(p) { p.sun.enabled = true; p.lighting.enabled = true; }, state: aria.STILL },
    ],
  },
  /* A picture another generator owns (make-gif.js), placed here. */
  {
    id: 'day-animation', topic: 'concept-daylight', after: 'How a room gets lit',
    image: 'showcase.gif', width: 900, height: 685,
    caption: 'The demo house through one day, dawn to night, drawn by the same renderer: the beams swing and lengthen as the sun goes round, and lamps take over as it sets.',
  },
  {
    id: 'daylight-hours', topic: 'concept-daylight', after: 'The hour you pick changes the drawing more than any setting',
    crop: [4, 25.5, 24, 13.5], min: '12rem',
    caption: 'The demo living room on the equinox at 28° north, lamps off. Its windows face west and south, so the morning sun finds nothing to come through and the late sun comes a long way in.',
    cells: [
      { label: '09:00 — sun in the east, nothing faces it', state: { when: at('09:00') } },
      { label: '12:00 — high sun, short patches by the sliders', state: { when: at('12:00') } },
      { label: '15:00 — lower, reaching further in', state: { when: at('15:00') } },
      { label: '16:45 — through the west window, the longest beams', state: { when: at('16:45') } },
    ],
  },
  {
    id: 'light-layers', topic: 'concept-artificial-light', after: 'What is drawn',
    crop: [7, 26, 34, 13], min: '20rem', state: NIGHT,
    caption: 'Night in the living and dining rooms. Each lamp cuts the dark where its light falls; the light-model switch leaves only a glow at each fitting.',
    cells: [
      { label: 'Everything off', state: { lampsOn: [] } },
      { label: 'The ceiling downlights', state: { lampsOn: ['light.demo_living', 'light.demo_dining'] } },
      { label: 'Plus the cove and the pendant', state: { lampsOn: ['light.demo_living', 'light.demo_dining', 'light.demo_living_cove', 'light.demo_dining_pendant'] } },
      { label: 'The same lamps, light model off',
        state: { lampsOn: ['light.demo_living', 'light.demo_dining', 'light.demo_living_cove', 'light.demo_dining_pendant'] },
        patch(p) { p.lighting.enabled = false; } },
    ],
  },
  {
    id: 'light-watts', topic: 'concept-artificial-light', after: 'One lamp',
    crop: [48, 7.5, 9, 14], min: '10rem', state: Object.assign({}, NIGHT, { lampsOn: ['light.demo_study'] }),
    caption: 'The study’s two downlights at three wattages. How far the light carries comes from the lumens; nothing is a per-type radius.',
    cells: [3, 12, 40].map((watt) => ({
      label: `${watt} W each`,
      patch(p, f) { for (const it of byEntity(f, 'light.demo_study')) it.props.watt = watt; },
    })),
  },
  {
    id: 'flooring-choices', topic: 'room-flooring', after: 'Choosing one',
    crop: [7.5, 26.5, 20, 12], min: '11rem',
    caption: 'The demo living room, emptied, in six of the shipped finishes. Tiled finishes repeat a pattern; field finishes such as marble and terrazzo are drawn once across the whole room.',
    /* No sun: a patch of daylight over half the floor is the one thing that
     * would stop the finishes being compared. */
    patch(p, f) { p.sun.enabled = false; const gone = new Set(itemsIn(f, 'living')); f.items = f.items.filter((it) => !gone.has(it)); },
    cells: ['parquet_oak_chevron', 'herringbone_walnut', 'marble_calacatta', 'terrazzo_blush', 'hex_sage', 'cement_indigo'].map((key) => ({
      label: words(flooring.types[key].label),
      patch(p, f) { f.rooms.find((r) => r.id === 'living').flooring = key; },
    })),
  },
  {
    id: 'wall-treatments', topic: 'walls-boundaries', after: null,
    crop: [28, 35, 16, 13], min: '10rem',
    caption: 'The corner of the demo terrace with its two outer edges set to six treatments. Each draws differently and lets a different share of light through.',
    cells: ['glass_railing', 'parapet_glass', 'railing_cable', 'railing_balustrade', 'wall_half', 'hedge'].map((type) => ({
      label: boundaries.types[type].label,
      patch(p, f) { boundary(f, 'terr_e').type = type; boundary(f, 'terr_s').type = type; },
    })),
  },
  {
    /* A scene of its own rather than a corner of the house: every long wall
     * of the demo house has a window in it, and a window is exactly where a
     * wall-top finish stops. */
    id: 'wall-tops', topic: 'walls-boundaries', after: 'How wide is a wall, and what is its top made of?', min: '10rem',
    caption: 'One outside wall, four ways. Width is a property of the run; its top can take any floor finish, the demo house’s black granite coping among them.',
    cells: [
      { label: '0.5 ft, no finish', props: { thicknessFt: 0.5 } },
      { label: '0.85 ft, no finish', props: { thicknessFt: 0.85 } },
      { label: '0.85 ft, black granite coping', props: { thicknessFt: 0.85, topFinish: 'granite_black' } },
      { label: '1.2 ft, Carrara top', props: { thicknessFt: 1.2, topFinish: 'marble_carrara' } },
    ],
    mini(cell) {
      return {
        floor: {
          extent: { w: 14, h: 9 },
          rooms: [
            { id: 'g', name: '', shape: 'rect', rect: [0, 0, 14, 3], flooring: 'grass', outdoor: true, noLabel: true },
            { id: 'r', name: '', shape: 'rect', rect: [0, 3, 14, 6], flooring: 'oak_honey', outdoor: false, noLabel: true },
          ],
          boundaries: [
            { id: 'top', room: 'r', wall: 'n', type: 'wall_exterior', props: Object.assign({}, cell.props) },
            ...['n', 'e', 'w'].map((wall) => ({ id: 'g' + wall, room: 'g', wall, type: 'open_edge' })),
          ],
        },
      };
    },
  },
  {
    id: 'door-swing', topic: 'walls-openings', after: 'Swing',
    crop: [40, 16.5, 10, 9], min: '9rem',
    caption: 'The demo bathroom door, seen from the corridor. Read the arc to see which way it opens.',
    cells: [
      { label: 'Swing in', op: { swing: 'in' } },
      { label: 'Swing out', op: { swing: 'out' } },
      { label: 'Hinged at the other jamb', op: { swing: 'in', hinge: 'end' } },
      { label: 'Sliding', op: { type: 'door_sliding' } },
      { label: 'Pocket', op: { type: 'door_pocket' } },
    ].map((c) => Object.assign(c, { patch(p, f) { Object.assign(opening(f, 'd_bath'), c.op); } })),
  },
  {
    id: 'door-sensor', topic: 'walls-openings', after: 'Sensors, motors and a drawing without sensors',
    crop: [0, 18, 17, 11], min: '11rem',
    caption: 'The demo front door bound to a contact sensor. A sensor that cannot answer is drawn hollow rather than as a confident “closed”.',
    patch(p, f) { for (const it of byEntity(f, 'camera.demo_porch')) it.props.cone = false; },
    cells: [
      { label: 'Sensor off — closed', state: { frontDoor: 'off' } },
      { label: 'Sensor on — open', state: { frontDoor: 'on' } },
      { label: 'Sensor unavailable', state: { frontDoor: 'unavailable' } },
    ],
  },
  {
    id: 'covering-position', topic: 'opening-coverings', after: 'Bound or assumed',
    crop: [4, 25.5, 24, 13.5], min: '12rem', state: { when: at('16:45') },
    caption: 'The drape on the demo living room’s west window at 16:45. How far it is drawn decides how much of the low sun reaches the floor.',
    cells: [100, 50, 0].map((position) => ({
      label: position === 100 ? 'Open (100)' : position === 0 ? 'Drawn (0)' : `Half (${position})`,
      patch(p, f) { opening(f, 'w_living_w').covering.position = position; },
    })),
  },
  {
    id: 'sensor-aim', topic: 'item-aim', after: 'The wedge is opt-in',
    crop: [24, 19.5, 24, 9], min: '16rem',
    caption: 'The demo hallway’s motion sensor. Its wedge is drawn from its own field of view, range and facing — and, being a sensor, it starts with the wedge off.',
    cells: [
      { label: 'Wedge off, as placed', props: { cone: false } },
      { label: 'On: facing 90°, 90° wide, 12 ft', props: { cone: true, rot: 90, fov: 90, range: 12 } },
      { label: 'Turned to 270°, 140° wide, 16 ft', props: { cone: true, rot: 270, fov: 140, range: 16 } },
    ].map((c) => Object.assign(c, {
      patch(p, f) { for (const it of byEntity(f, 'binary_sensor.demo_hall_motion')) Object.assign(it.props, c.props); },
    })),
  },
  {
    id: 'scheme-palettes', topic: 'item-colour', after: 'Four colours, and what each one paints',
    crop: [8.5, 27.5, 18, 10], min: '14rem',
    caption: 'One seating group from the demo living room in four palettes. The shapes are identical; only each item’s scheme changed.',
    patch(p, f) {
      const markers = new Set(itemsIn(f, 'living').filter((it) => it.kind !== 'furniture'));
      f.items = f.items.filter((it) => !markers.has(it));
    },
    cells: [
      { label: 'As the demo ships', palette: {} },
      { label: 'Velvet and brass', palette: { sofa: 'forest_velvet', armchair: 'mustard_fabric', coffee_table: 'satin_brass', side_table: 'satin_brass', rug: 'oatmeal_fabric', tv_unit: 'walnut' } },
      { label: 'Navy and oak', palette: { sofa: 'navy_velvet', armchair: 'tan_leather', coffee_table: 'oak', side_table: 'oak', rug: 'beige_linen', tv_unit: 'oak' } },
      { label: 'Charcoal and rattan', palette: { sofa: 'charcoal_fabric', armchair: 'rattan', coffee_table: 'matte_black', side_table: 'rattan', rug: 'seagrass', tv_unit: 'wenge' } },
    ].map((c) => Object.assign(c, {
      patch(p, f) {
        for (const it of itemsIn(f, 'living')) if (c.palette[it.type]) it.scheme = c.palette[it.type];
      },
    })),
  },
  {
    id: 'stair-looks', topic: 'item-stairs', after: 'Five arrangements', min: '9rem',
    caption: 'Each arrangement at its own default footprint, drawn by the library’s stair type.',
    cells: Shapes.furnitureVariantsOf('stairs').map((look) => ({ label: words(look), look })),
    mini(cell) {
      const [w, h] = lookSize('furniture.stairs', cell.look);
      const size = Math.max(...Shapes.furnitureVariantsOf('stairs').flatMap((l) => lookSize('furniture.stairs', l))) + 2;
      return {
        floor: {
          extent: { w: size, h: size },
          rooms: [miniRoom(size, size, 'porcelain_ivory')],
          items: [{ id: 's', kind: 'furniture', type: 'stairs', at: [(size - w) / 2, (size - h) / 2], room: 'r', scheme: 'oak',
            props: Object.assign({}, library.types['furniture.stairs'].defaults, { variant: cell.look, w, h }) }],
        },
      };
    },
  },
  ...['tree', 'plant'].map((shape) => {
    const looks = Shapes.furnitureVariantsOf(shape).slice(0, 8);
    const typeKey = 'furniture.' + shape;
    const size = Math.max(...looks.flatMap((l) => lookSize(typeKey, l))) + 1.5;
    return {
      id: shape + '-looks', topic: 'vegetation', after: shape === 'tree' ? 'Tree looks' : 'Plant and planter looks', min: '7rem',
      caption: `The first ${looks.length} ${shape} looks, each at its own suggested crown spread, on the same patch of grass.`,
      cells: looks.map((look) => ({ label: words(look), look })),
      mini(cell) {
        const [w, h] = lookSize(typeKey, cell.look);
        return {
          floor: {
            extent: { w: size, h: size },
            rooms: [miniRoom(size, size, 'grass', true)],
            /* A room on the floor's edge counts as walled; a lawn is not. */
            boundaries: ['n', 'e', 's', 'w'].map((wall) => ({ id: 'e' + wall, room: 'r', wall, type: 'open_edge' })),
            items: [{ id: 'v', kind: 'furniture', type: shape, at: [(size - w) / 2, (size - h) / 2], room: 'r',
              props: Object.assign({}, library.types[typeKey].defaults, { variant: cell.look, w, h }) }],
          },
        };
      },
    };
  }),
  {
    id: 'curved-bulge', topic: 'walls-curved', after: 'Give the bulge, not the radius', min: '10rem',
    caption: 'A 16 ft wall with no bulge, a 1.5 ft bulge and a 3 ft bulge. The editor asks for the bulge and works out the radius.',
    cells: [0, 1.5, 3].map((bulge) => ({ label: bulge ? `${bulge} ft bulge` : 'Straight', bulge })),
    mini(cell) {
      const chord = 16; const s = cell.bulge;
      const south = s ? [1, 11, -(chord * chord / 4 + s * s) / (2 * s)] : [1, 11];
      return {
        floor: {
          extent: { w: 18, h: 15 },
          rooms: [{ id: 'r', name: '', shape: 'polygon', points: [[1, 1], [17, 1], [17, 11], south], flooring: 'oak_honey', outdoor: false, noLabel: true }],
        },
      };
    },
  },
];

/* ---------------------------------------------------------------- output */

/** Every figure rendered: `files` (published path -> SVG) and `html` per figure. */
function renderAll() {
  const files = {};
  const rendered = [];
  const seen = new Set();
  for (const fig of FIGURES) {
    if (seen.has(fig.id)) throw new Error(`two figures are called "${fig.id}"`);
    seen.add(fig.id);
    if (fig.image) {
      rendered.push({ fig, placed: false, html: `<figure class="fig" id="fig-${esc(fig.id)}">`
        + `<img class="fig-wide" src="${esc(fig.image)}" width="${fig.width}" height="${fig.height}" loading="lazy" decoding="async" alt="${esc(fig.caption)}">`
        + `<figcaption>${esc(fig.caption)}</figcaption></figure>` });
      continue;
    }
    if (fig.demo) {
      const html = `<figure class="fig fig-demo" id="fig-${esc(fig.id)}">`
        + `<iframe src="demo/index.html?embed&amp;${esc(fig.demo).replace(/&amp;|&/g, '&amp;')}" loading="lazy" style="height:${fig.height || 860}px" `
        + `title="${esc(fig.caption.split('. ')[0])}"></iframe>`
        + `<figcaption>${esc(fig.caption)} <a href="demo/index.html">Open the demo on its own page</a>.</figcaption></figure>`;
      rendered.push({ fig, html, placed: false });
      continue;
    }
    const cells = fig.cells.map((cell, i) => {
      const out = fig.mini ? renderMini(fig, cell) : renderAria(fig, cell);
      const name = `figures/${fig.id}-${i + 1}.svg`;
      files[name] = compact(out.svg);
      const alt = `${fig.caption.split('. ')[0]} — ${cell.label}`;
      return `<a class="fig-cell" href="${name}"><img src="${name}" width="${Math.round(out.w)}" height="${Math.round(out.h)}" `
        + `loading="lazy" decoding="async" alt="${esc(alt)}"><span>${esc(cell.label)}</span></a>`;
    });
    const html = `<figure class="fig" id="fig-${esc(fig.id)}"><div class="fig-cells" style="--fig-min:${fig.min || '11rem'}">`
      + cells.join('') + `</div><figcaption>${esc(fig.caption)}</figcaption></figure>`;
    rendered.push({ fig, html, placed: false });
  }
  return { files, rendered };
}

const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

/** The topic's HTML with its figures in place. Throws when a heading is gone. */
function place(topicId, bodyHtml, set) {
  let html = bodyHtml;
  for (const r of set.rendered.filter((x) => x.fig.topic === topicId)) {
    if (r.fig.after === null) {
      html = r.html + html;
    } else {
      const heads = [...html.matchAll(/<h2>([\s\S]*?)<\/h2>/g)];
      const hit = heads.find((m) => text(m[1]) === r.fig.after);
      if (!hit) throw new Error(`figure "${r.fig.id}" wants to follow "## ${r.fig.after}" in topic ${topicId}, which has no such heading`);
      const next = html.indexOf('<h2>', hit.index + hit[0].length);
      const cut = next < 0 ? html.length : next;
      html = html.slice(0, cut) + r.html + html.slice(cut);
    }
    r.placed = true;
  }
  return html;
}

/** Throws when a figure names a topic no page rendered. */
function assertPlaced(set) {
  const lost = set.rendered.filter((r) => !r.placed).map((r) => `${r.fig.id} -> ${r.fig.topic}`);
  if (lost.length) throw new Error('figures with no topic to go in: ' + lost.join(', '));
}

module.exports = { FIGURES, renderAll, place, assertPlaced, cropFloor, slim };
