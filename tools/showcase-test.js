#!/usr/bin/env node
/**
 * showcase-test.js — is the showcase house a BUILDING?
 *
 *   node tools/make-showcase.js --test
 *
 * `validate-project.js` asks whether the document is structurally sound and
 * `audit-plan.js` asks whether anything overlaps. Neither asks the question
 * that actually decides whether a plan reads as real, which is about the plan
 * as architecture:
 *
 *   - do the rooms TILE the building exactly, with no hole and no overlap
 *   - can you REACH every room without walking through a bedroom or a bathroom
 *   - is every window in an exterior wall, and every internal door in a shared one
 *   - does every room have enough daylight, and enough light fittings, to be used
 *
 * A hole in the floor renders as a patch of site showing through the middle of
 * the house and is easy to miss on a busy drawing. A room reachable only
 * through a bedroom renders perfectly and is wrong in a way that a reader feels
 * without being able to name. So both are assertions, not eyeball work.
 *
 * The coverage test rasterises at half-foot cells rather than doing rectangle
 * algebra: the rooms are axis-aligned today, but a poly room added later would
 * silently defeat an algebraic check, and a sampling check keeps working.
 */

'use strict';

const path = require('path');
const APP = path.resolve(__dirname, '..', 'floorplan_studio', 'app');
const lib = require(path.join(APP, 'defaults', 'library.json'));

const CELL = 0.5;

module.exports = function run() {
  const S = require('./make-showcase.js');
  let pass = 0;
  const fails = [];
  const ok = (name, cond, detail) => {
    if (cond) { pass++; return; }
    fails.push(name + (detail ? '  -- ' + detail : ''));
  };

  const byId = new Map(S.ROOMS.map((r) => [r.id, r]));
  const rectOf = (r) => ({ x: r.rect[0], y: r.rect[1], w: r.rect[2], h: r.rect[3] });

  /* ---------------------------------------------------- the floor is solid */

  /* Every half-foot cell of the plot is covered exactly once. A cell covered
   * twice is two rooms fighting over a floor finish; a cell covered zero times
   * is a hole. */
  const cols = Math.round(S.PLOT.w / CELL);
  const rows = Math.round(S.PLOT.h / CELL);
  const cover = new Int8Array(cols * rows);
  for (const r of S.ROOMS) {
    const q = rectOf(r);
    for (let j = Math.round(q.y / CELL); j < Math.round((q.y + q.h) / CELL); j++) {
      for (let i = Math.round(q.x / CELL); i < Math.round((q.x + q.w) / CELL); i++) {
        if (i >= 0 && i < cols && j >= 0 && j < rows) cover[j * cols + i]++;
      }
    }
  }
  let holes = 0; let doubles = 0; let firstHole = null; let firstDouble = null;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v = cover[j * cols + i];
      const at = `(${(i * CELL).toFixed(1)}, ${(j * CELL).toFixed(1)})`;
      if (v === 0) { holes++; if (!firstHole) firstHole = at; }
      if (v > 1) { doubles++; if (!firstDouble) firstDouble = at; }
    }
  }
  ok('the rooms tile the plot with no hole', holes === 0, holes ? `${holes} cells, first at ${firstHole}` : null);
  ok('and no two rooms claim the same floor', doubles === 0, doubles ? `${doubles} cells, first at ${firstDouble}` : null);

  const area = (r) => r.rect[2] * r.rect[3];
  const indoorArea = S.INDOOR.reduce((n, r) => n + area(r), 0);
  ok('the indoor rooms fill the building exactly',
    indoorArea === (S.B.x1 - S.B.x0) * (S.B.y1 - S.B.y0),
    `${indoorArea} vs ${(S.B.x1 - S.B.x0) * (S.B.y1 - S.B.y0)}`);

  /* Every indoor room is inside the building, every outdoor room outside it. */
  const inside = (r) => {
    const q = rectOf(r);
    return q.x >= S.B.x0 && q.y >= S.B.y0 && q.x + q.w <= S.B.x1 && q.y + q.h <= S.B.y1;
  };
  ok('no indoor room escapes the building', S.INDOOR.every(inside),
    S.INDOOR.filter((r) => !inside(r)).map((r) => r.id).join(', '));
  const overlapsBuilding = (r) => {
    const q = rectOf(r);
    return q.x < S.B.x1 && q.x + q.w > S.B.x0 && q.y < S.B.y1 && q.y + q.h > S.B.y0;
  };
  ok('no outdoor room reaches inside it', !S.OUTDOOR.some(overlapsBuilding),
    S.OUTDOOR.filter(overlapsBuilding).map((r) => r.id).join(', '));

  /* ------------------------------------------------------------- adjacency */

  /* Two rooms share a wall if their rectangles touch along a line rather than
   * at a point, and the shared run is what a door has to fit into. */
  function sharedRun(a, b) {
    const p = rectOf(a); const q = rectOf(b);
    const xOverlap = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
    const yOverlap = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
    if (Math.abs(p.x + p.w - q.x) < 1e-9 || Math.abs(q.x + q.w - p.x) < 1e-9) {
      return yOverlap > 0 ? { axis: 'v', len: yOverlap } : null;
    }
    if (Math.abs(p.y + p.h - q.y) < 1e-9 || Math.abs(q.y + q.h - p.y) < 1e-9) {
      return xOverlap > 0 ? { axis: 'h', len: xOverlap } : null;
    }
    return null;
  }

  /* ------------------------------------------------- openings are on walls */

  /* An exterior wall is one with nothing on the other side of it. A window in
   * an interior wall looks into the next room; a window drawn on a wall the
   * room does not have floats clear of the house. Both render cleanly. */
  const WALL_DELTA = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  function neighbourAcross(r, wall, at) {
    const q = rectOf(r);
    const [dx, dy] = WALL_DELTA[wall];
    /* A point just outside the middle of the run, on the wall's own normal. */
    const px = wall === 'n' || wall === 's' ? at : q.x + (dx > 0 ? q.w + 0.25 : -0.25);
    const py = wall === 'w' || wall === 'e' ? at : q.y + (dy > 0 ? q.h + 0.25 : -0.25);
    const x = wall === 'n' || wall === 's' ? px : px;
    const y = wall === 'n' || wall === 's' ? q.y + (dy > 0 ? q.h + 0.25 : -0.25) : py;
    return S.ROOMS.find((o) => {
      const t = rectOf(o);
      return x > t.x && x < t.x + t.w && y > t.y && y < t.y + t.h;
    }) || null;
  }

  const offWall = [];
  const windowsInside = [];
  const doorsNowhere = [];
  for (const op of S.OPENINGS) {
    const r = byId.get(op.room);
    if (!r) { offWall.push(`${op.id} names no room`); continue; }
    const q = rectOf(r);
    /* The run has to lie within the wall it names. */
    const lo = op.wall === 'n' || op.wall === 's' ? q.x : q.y;
    const hi = op.wall === 'n' || op.wall === 's' ? q.x + q.w : q.y + q.h;
    if (op.at < lo - 1e-9 || op.at + op.w > hi + 1e-9) {
      offWall.push(`${op.id} runs ${op.at}..${op.at + op.w} on a wall spanning ${lo}..${hi}`);
      continue;
    }
    const beyond = neighbourAcross(r, op.wall, op.at + op.w / 2);
    const isWindow = op.type === 'window';
    const isSky = op.type === 'skylight';
    if (isSky) continue;
    if (isWindow && beyond && !beyond.outdoor) windowsInside.push(`${op.id} in ${op.room} looks into ${beyond.id}`);
    if (!isWindow && !beyond) doorsNowhere.push(`${op.id} on ${op.room} ${op.wall} opens onto nothing`);
  }
  ok('every opening lies within the wall it names', !offWall.length, offWall.join('; '));
  ok('every window is in an exterior wall', !windowsInside.length, windowsInside.join('; '));
  ok('every door opens onto somewhere', !doorsNowhere.length, doorsNowhere.join('; '));

  /* ----------------------------------------------------------- circulation */

  /* Build the graph of what you can walk through, then assert the shape of it.
   * Only non-window openings are edges — you do not climb through a window to
   * get to the study. */
  const graph = new Map(S.ROOMS.map((r) => [r.id, new Set()]));
  for (const op of S.OPENINGS) {
    if (op.type === 'window' || op.type === 'skylight') continue;
    const r = byId.get(op.room);
    if (!r) continue;
    const beyond = neighbourAcross(r, op.wall, op.at + op.w / 2);
    if (!beyond) continue;
    graph.get(op.room).add(beyond.id);
    graph.get(beyond.id).add(op.room);
    const run = sharedRun(r, beyond);
    ok(`the ${op.id} opening fits the wall it shares with ${beyond.id}`,
      !!run && run.len >= op.w - 1e-9, run ? `${op.w} ft opening in a ${run.len} ft shared wall` : 'no shared wall');
  }

  /* Everything is reachable from outside the front door. */
  const start = 'porch';
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const next of graph.get(queue.shift()) || []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  const unreachable = S.INDOOR.filter((r) => !seen.has(r.id)).map((r) => r.id);
  ok('every indoor room is reachable from the front door', !unreachable.length, unreachable.join(', '));

  /* The rule that makes it a house: you do not pass THROUGH a bedroom or a
   * bathroom to reach anywhere else. A room whose only neighbours are private
   * rooms fails this, and so does a private room used as a corridor. */
  const PRIVATE = new Set(['bed_main', 'bed2', 'bath', 'ens', 'wardrobe']);
  /* Rooms it is correct to enter from exactly one other room. */
  const ENSUITE = new Set(['ens', 'wardrobe', 'utility']);
  const throughPrivate = [];
  for (const r of S.INDOOR) {
    if (ENSUITE.has(r.id)) continue;
    const doors = [...graph.get(r.id)];
    if (!doors.length) continue;
    if (doors.every((d) => PRIVATE.has(d))) throughPrivate.push(`${r.id} is only reachable via ${doors.join('/')}`);
  }
  ok('no room is reached only through a bedroom or a bathroom', !throughPrivate.length, throughPrivate.join('; '));

  /* An ensuite and a walk-in should hang off ONE room, and it should be the
   * bedroom. A bathroom with two doors is a corridor with a toilet in it. */
  for (const id of ['ens', 'wardrobe']) {
    const doors = [...graph.get(id)];
    ok(`the ${id} opens off the main bedroom only`,
      doors.length === 1 && doors[0] === 'bed_main', doors.join('/') || 'no door');
  }
  ok('the utility opens off the kitchen', graph.get('utility').has('kitchen'), [...graph.get('utility')].join('/'));

  /* The corridor is the spine: it should serve more rooms than anything else. */
  const fanout = [...graph.entries()].map(([id, s]) => [id, s.size]).sort((a, b) => b[1] - a[1]);
  ok('the corridor serves more rooms than any other space', fanout[0][0] === 'hall',
    fanout.slice(0, 3).map(([i, n]) => `${i}:${n}`).join(' '));

  /* ------------------------------------------------------------- amenities */

  /* Every habitable room has daylight. A bathroom or a utility may be
   * internal; a bedroom or a living room may not. */
  const daylit = new Set(S.OPENINGS
    .filter((o) => o.type === 'window' || o.type === 'skylight' || o.type.startsWith('door_sliding'))
    .map((o) => o.room));
  const HABITABLE = ['bed_main', 'bed2', 'study', 'living', 'dining', 'kitchen'];
  const dark = HABITABLE.filter((id) => !daylit.has(id));
  ok('every habitable room has a window', !dark.length, dark.join(', '));

  /* Every enclosed room has at least one light fitting in it. A room with no
   * lamp is a room the lighting model draws as a black hole at night. */
  const inRoom = (x, y) => S.ROOMS.find((r) => {
    const q = rectOf(r);
    return x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h;
  });
  const lampRooms = new Set();
  for (const it of S.items) {
    if (it.kind !== 'fixture') continue;
    const r = inRoom(it.at[0], it.at[1]);
    if (r) lampRooms.add(r.id);
  }
  const unlit = S.INDOOR.filter((r) => !lampRooms.has(r.id)).map((r) => r.id);
  ok('every indoor room has a light fitting', !unlit.length, unlit.join(', '));

  /* Markers must land in a room at all — an item at a coordinate outside every
   * room is invisible in the chip counts and unreachable in the controls. */
  const homeless = S.items.filter((it) => it.kind !== 'furniture' && !inRoom(it.at[0], it.at[1]))
    .map((it) => `${it.id} ${it.kind}.${it.type} at ${it.at}`);
  ok('every marker lands inside a room', !homeless.length, homeless.slice(0, 4).join('; '));

  /* A LINEAR fixture's drawn body has to stay in its room too.
   *
   * Checking that a marker's centre lands in a room is not enough, and this is
   * the hole that let an 8 ft under-counter strip centred 3 ft from the wall
   * hang a foot into the dining room: its `at` was correctly inside the
   * kitchen, and a cove, a tube, a linear batten and a run of festoon lights
   * all have the same shape of mistake available to them. The extent comes
   * from `plan-scene.markerExtent`, which is what the renderer itself measures
   * with, so this test cannot disagree with the drawing. */
  /* Measured from the `len` prop rather than from `markerExtent`, which
   * answers `{ rx, ry: rx }` for a type with no second axis — a SQUARE, which
   * is the right answer for hit-testing a marker and far too generous for the
   * cross axis of something 5 ft long and an inch thick. A type whose resize
   * prop is `len` in feet is a run: long on its own axis, thin across it. */
  const longMarkers = [];
  for (const it of S.items) {
    if (it.kind === 'furniture') continue;
    const type = lib.types[`${it.kind}.${it.type}`];
    const resize = type && type.render && type.render.resize;
    if (!resize || resize.prop !== 'len' || resize.unit !== 'ft') continue;
    const len = it.props.len ?? (type.defaults || {}).len;
    if (!(len > 0)) continue;
    const hw = len / 2;
    const hh = 0.25;                              // a batten is thin, whatever it is
    const rot = ((it.props.rot ?? type.defaults?.rot ?? 0) % 180 + 180) % 180;
    /* A quarter turn swaps the axes; anything else takes the bounding box. */
    const a = rot * Math.PI / 180;
    const bw = Math.abs(hw * Math.cos(a)) + Math.abs(hh * Math.sin(a));
    const bh = Math.abs(hw * Math.sin(a)) + Math.abs(hh * Math.cos(a));
    const host = inRoom(it.at[0], it.at[1]);
    if (!host) continue;                          // already reported above
    const q = rectOf(host);
    if (it.at[0] - bw < q.x - 1e-6 || it.at[1] - bh < q.y - 1e-6
      || it.at[0] + bw > q.x + q.w + 1e-6 || it.at[1] + bh > q.y + q.h + 1e-6) {
      longMarkers.push(`${it.id} ${it.kind}.${it.type} spans `
        + `${(it.at[0] - bw).toFixed(1)}..${(it.at[0] + bw).toFixed(1)} x `
        + `${(it.at[1] - bh).toFixed(1)}..${(it.at[1] + bh).toFixed(1)}, outside ${host.id}`);
    }
  }
  ok('no linear fixture reaches out of its room', !longMarkers.length, longMarkers.join('; '));

  /* Furniture stays inside the room it sits in — a bed crossing a wall is the
   * single most common composition mistake, and it always renders. */
  const strays = [];
  for (const it of S.items) {
    if (it.kind !== 'furniture') continue;
    const type = lib.types[`furniture.${it.type}`];
    const d = (type && type.defaults) || {};
    const w = it.props.w ?? d.w; const h = it.props.h ?? d.h;
    if (!(w > 0 && h > 0)) continue;
    const cx = it.at[0] + w / 2; const cy = it.at[1] + h / 2;
    const host = inRoom(cx, cy);
    if (!host) { strays.push(`${it.id} ${it.type} is in no room`); continue; }
    const q = rectOf(host);
    /* Site-scale furniture (a hedge along the boundary, a lawn) is allowed to
     * span rooms; a sofa is not. */
    if (['hedge', 'garden_bed', 'lawn', 'planter', 'pergola', 'solar', 'clothesline'].includes(it.type)) continue;
    if (it.at[0] < q.x - 1e-9 || it.at[1] < q.y - 1e-9
      || it.at[0] + w > q.x + q.w + 1e-9 || it.at[1] + h > q.y + q.h + 1e-9) {
      strays.push(`${it.id} ${it.type} crosses out of ${host.id}`);
    }
  }
  ok('no furniture crosses out of its room', !strays.length, strays.slice(0, 5).join('; '));

  /* ------------------------------------------------- doors need room to open */

  /* `audit-plan.js` checks whether furniture sits IN an opening. It says
   * nothing about the quarter-circle a hinged leaf sweeps on its way, and that
   * is the one a reader notices: a bath door opening onto the side of the bath,
   * a study door clipping a bookshelf. Both render as a tidy arc drawn straight
   * over the furniture, so nothing looks broken — it just looks like a house
   * nobody could live in.
   *
   * The swept box is the opening's run by its own width, deep into the room.
   * That is the bounding box of the leaf's arc whichever jamb it is hinged on,
   * so it neither needs to know the hinge nor cares if the hinge changes.
   * Sliding and folding leaves are excluded: they travel along the wall. */
  const UNDERLAY = new Set(['rug', 'mat', 'yoga_mat', 'play_mat', 'garden_bed', 'planter', 'deck', 'pool', 'lawn', 'hedge']);
  const blocked = [];
  for (const op of S.OPENINGS) {
    if (op.type !== 'door') continue;
    const r = byId.get(op.room);
    if (!r) continue;
    const q = rectOf(r);
    const w = op.w;
    let sweep;
    if (op.wall === 'n') sweep = { x: op.at, y: q.y, w, h: w };
    else if (op.wall === 's') sweep = { x: op.at, y: q.y + q.h - w, w, h: w };
    else if (op.wall === 'w') sweep = { x: q.x, y: op.at, w, h: w };
    else sweep = { x: q.x + q.w - w, y: op.at, w, h: w };

    for (const it of S.items) {
      if (it.kind !== 'furniture' || UNDERLAY.has(it.type)) continue;
      const type = lib.types[`furniture.${it.type}`];
      const d = (type && type.defaults) || {};
      const fw = it.props.w ?? d.w; const fh = it.props.h ?? d.h;
      if (!(fw > 0 && fh > 0)) continue;
      const ox = Math.min(sweep.x + sweep.w, it.at[0] + fw) - Math.max(sweep.x, it.at[0]);
      const oy = Math.min(sweep.y + sweep.h, it.at[1] + fh) - Math.max(sweep.y, it.at[1]);
      if (ox > 0.01 && oy > 0.01 && ox * oy > 0.35) {
        blocked.push(`${op.id} sweeps ${(ox * oy).toFixed(1)} sq ft of ${it.type} (${it.id})`);
      }
    }
  }
  ok('no door opens onto the furniture', !blocked.length, blocked.join('; '));

  /* ------------------------------------------------------- it still builds */

  const built = S.build(S.STILL, false);
  ok('the scene builds with no warnings', built.warnings.length === 0,
    built.warnings.slice(0, 4).map((w) => w.kind + ' ' + (w.message || '')).join('; '));
  ok('the scene has a usable size', built.width > 0 && built.height > 0, `${built.width}x${built.height}`);

  /* The showcase exists to show these off, so their presence is a test. */
  const kinds = new Set(S.items.map((i) => `${i.kind}.${i.type}`));
  for (const need of ['device.fan', 'device.camera', 'device.pir', 'device.extension',
    'device.solar', 'device.water_level', 'furniture.pergola', 'fixture.cove']) {
    ok(`the showcase includes ${need}`, kinds.has(need));
  }
  const sensored = S.OPENINGS.filter((o) => o.sensor).length;
  ok('at least four openings carry a contact sensor', sensored >= 4, String(sensored));

  /* Blinds at one position prove nothing: the point of a covering is that it
   * has a position at all, so the composition needs several distinct ones and
   * at least one driven by a real cover entity rather than set by hand. */
  const withCover = S.floor.openings.filter((o) => o.covering);
  const positions = new Set(withCover.map((o) => o.covering.position));
  ok('blinds appear at three or more distinct positions', positions.size >= 3,
    [...positions].join(', '));
  ok('and at least one blind is bound to a cover entity',
    withCover.some((o) => o.covering.entity), withCover.length + ' coverings');

  for (const f of fails) console.log('  FAIL  ' + f);
  console.log(`${pass} passed, ${fails.length} failed`);
  return fails.length === 0;
};

if (require.main === module) process.exitCode = module.exports() ? 0 : 1;
