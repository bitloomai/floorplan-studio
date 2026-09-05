#!/usr/bin/env node
/**
 * audit-plan.js — look for the mistakes a plan can contain that still render.
 *
 *   node tools/audit-plan.js                     audits fixtures/ and app/data/
 *   node tools/audit-plan.js path/to.project.json
 *
 * The validator in `app/lib/validate-project.js` answers a different question:
 * is this document STRUCTURALLY sound — does every room have a shape, does
 * every item name a real type. It says nothing about whether the plan is a
 * building. A sofa half inside a wall, a door with a wardrobe across it, two
 * rooms overlapping by a foot and a window drawn floating clear of the house
 * are all perfectly valid documents that draw a wrong picture.
 *
 * So this is a geometry audit, and it is deliberately separate: it reports and
 * never edits, because almost every finding here is a judgement call about a
 * real house that only the person who lives in it can make. A bed overlapping a
 * rug is furniture on a rug; a bed overlapping a wardrobe is a mistake.
 *
 * Everything is in plan feet. Furniture `at` is its TOP-LEFT corner and a
 * marker's `at` is its centre — the single most common source of a wrong answer
 * in here, so it is handled once, in `footprint()`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'floorplan_studio', 'app');
const scene = require(path.join(APP, 'lib', 'plan-scene.js'));
const lib = require(path.join(APP, 'defaults', 'library.json'));

/* How much overlap is worth mentioning. Plans are drawn by hand and by
 * converters; a couple of inches is noise, and reporting it trains people to
 * ignore the whole report. */
const TOLERANCE_FT = 0.25;
const MIN_AREA = 0.35;          // sq ft of overlap before it counts

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

/* A rectangle for anything that has one. Furniture is a real footprint anchored
 * at its top-left; a marker is a point and has no footprint worth intersecting,
 * so it comes back null and is checked differently. */
function footprint(item, type) {
  if ((item.kind || (type && type.kind)) !== 'furniture') return null;
  const p = item.props || {};
  const d = (type && type.defaults) || {};
  const w = num(p.w, num(d.w, 0));
  const h = num(p.h, num(d.h, 0));
  if (!(w > 0 && h > 0)) return null;
  const [x, y] = item.at || [0, 0];
  return { x, y, w, h };
}

const overlapArea = (a, b) => {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > TOLERANCE_FT && oy > TOLERANCE_FT ? ox * oy : 0;
};

/* ---- facing ----
 *
 * Screen degrees: 0 points up, positive turns clockwise — the frame
 * `plan-scene.js` uses for `rot`, `WALL_NORMAL` and the sun's bearing alike.
 * Never a compass bearing; that lives in `project.compass` and nowhere else. */
const RAD = Math.PI / 180;
const facingVec = (rot) => [Math.sin(rot * RAD), -Math.cos(rot * RAD)];

/* How close to a wall counts as MOUNTED on it. A device standing free in the
 * middle of a room — a floor purifier, a tripod camera — may point anywhere and
 * is not this check's business. */
const MOUNT_FT = 2.5;
/* How far a cone must get into the room before it is doing anything. Below
 * this it is buried in the wall the device hangs on. */
const USEFUL_FT = 2;

const distToSegment = (p, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  let t = len2 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
};

/* Furniture that is MEANT to sit under other furniture. A rug with a bed on it
 * is a furnished room, not a collision, and reporting it buries the real ones. */
const UNDERLAY = new Set(['rug', 'mat', 'yoga_mat', 'play_mat', 'garden_bed', 'planter', 'deck', 'pool']);
const isUnderlay = (item) => UNDERLAY.has(item.type);

/* Two rectangles can be compared by their bounding boxes. A POLYGON cannot.
 *
 * An L-shaped room's bounding box covers its own notch, so a stairwell tucked
 * into that notch — which is the entire reason the room is L-shaped — reads as
 * a 56 sq ft overlap between two rooms that do not touch. That is not an edge
 * case, it is the most ordinary thing an irregular room is for, and it made the
 * synthetic house report six overlaps the moment it grew a staircase.
 *
 * The box stays as a cheap reject. When either room is a polygon the shared
 * area is then MEASURED, by sampling the overlapping box on a quarter-foot grid
 * and asking `pointInRoom` — the renderer's own containment test, so the audit
 * and the drawing cannot disagree about where a room is. */
const SAMPLE_FT = 0.25;
function sharedArea(a, b, box) {
  if (a.shape !== 'poly' && b.shape !== 'poly') return box.area;
  let cells = 0;
  for (let x = box.x + SAMPLE_FT / 2; x < box.x + box.w; x += SAMPLE_FT) {
    for (let y = box.y + SAMPLE_FT / 2; y < box.y + box.h; y += SAMPLE_FT) {
      if (scene.pointInRoom(a, x, y) && scene.pointInRoom(b, x, y)) cells++;
    }
  }
  return cells * SAMPLE_FT * SAMPLE_FT;
}

function auditFloor(floor, out) {
  const where = floor.name || floor.id;
  const rooms = floor.rooms || [];
  const items = floor.items || [];
  const roomBox = new Map();
  for (const r of rooms) roomBox.set(r.id, scene.roomBBox(r));

  /* ---- rooms overlapping each other ----
   * `part_of` sub-rects are one room written as several and are expected to
   * touch; anything else sharing floor area is two rooms claiming one space. */
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      if (a.part_of === b.id || b.part_of === a.id || (a.part_of && a.part_of === b.part_of)) continue;
      const [ax, ay, aw, ah] = roomBox.get(a.id);
      const [bx, by, bw, bh] = roomBox.get(b.id);
      const boxA = { x: ax, y: ay, w: aw, h: ah }, boxB = { x: bx, y: by, w: bw, h: bh };
      const boxed = overlapArea(boxA, boxB);
      if (boxed <= MIN_AREA) continue;          // boxes barely meet: nothing to measure
      const ox = Math.max(ax, bx), oy = Math.max(ay, by);
      const area = sharedArea(a, b, {
        x: ox, y: oy,
        w: Math.min(ax + aw, bx + bw) - ox,
        h: Math.min(ay + ah, by + bh) - oy,
        area: boxed,
      });
      if (area > MIN_AREA) {
        out.push({ level: 'warn', floor: where, kind: 'rooms overlap',
          detail: `${a.id} and ${b.id} share about ${area.toFixed(1)} sq ft` });
      }
    }
  }

  /* ---- openings that miss their wall ----
   * `at` is ABSOLUTE along the wall's axis, not an offset from the room's
   * corner. Get that wrong and the opening is drawn floating clear of the
   * building — which is exactly the mistake in the committed test house. */
  for (const op of floor.openings || []) {
    const room = rooms.find((r) => r.id === op.room);
    if (!room) { out.push({ level: 'error', floor: where, kind: 'opening has no room', detail: `${op.id} names "${op.room}"` }); continue; }
    const edges = scene.roomEdges(room);
    const edge = (op.edge !== undefined && op.edge !== null)
      ? edges.find((e) => e.index === op.edge)
      : edges.find((e) => e.wall === op.wall);
    if (!edge) { out.push({ level: 'error', floor: where, kind: 'opening has no wall', detail: `${op.id} on ${op.room} wall ${op.wall}` }); continue; }
    const at = num(op.at, edge.lo), w = num(op.w, 2.5);
    if (at < edge.lo - 0.01 || at + w > edge.hi + 0.01) {
      out.push({ level: 'error', floor: where, kind: 'opening off its wall',
        detail: `${op.id} spans ${at.toFixed(2)}–${(at + w).toFixed(2)} on a wall running ${edge.lo.toFixed(2)}–${edge.hi.toFixed(2)}` });
    }
    /* A letter that names more than one edge is ambiguous: the opening lands on
     * whichever comes first, which may not be the one that was meant. */
    if ((op.edge === undefined || op.edge === null)
      && edges.filter((e) => e.wall === op.wall).length > 1) {
      out.push({ level: 'warn', floor: where, kind: 'opening on an ambiguous wall',
        detail: `${op.id}: room ${op.room} has ${edges.filter((e) => e.wall === op.wall).length} "${op.wall}" edges — set edge to pick one` });
    }
  }

  /* ---- furniture ---- */
  const boxes = [];
  for (const item of items) {
    const type = scene.resolveType(lib, item);
    if (!type) { out.push({ level: 'error', floor: where, kind: 'unknown type', detail: `${item.id} is ${item.kind}.${item.type}` }); continue; }
    const box = footprint(item, type);
    if (box) boxes.push({ item, box });

    /* Is it inside the room it claims, or inside any room at all? A marker is
     * a point; furniture is checked by its centre so a chair tucked under a
     * table edge is not reported for overhanging by an inch. */
    const cx = box ? box.x + box.w / 2 : (item.at || [0, 0])[0];
    const cy = box ? box.y + box.h / 2 : (item.at || [0, 0])[1];
    const named = item.room && rooms.find((r) => r.id === item.room);
    if (named && !scene.pointInRoom(named, cx, cy)) {
      out.push({ level: 'warn', floor: where, kind: 'item outside the room it names',
        detail: `${item.id} (${item.kind}.${item.type}) says ${item.room}` });
    } else if (!item.room && !rooms.some((r) => scene.pointInRoom(r, cx, cy))) {
      out.push({ level: 'warn', floor: where, kind: 'item in no room at all',
        detail: `${item.id} (${item.kind}.${item.type}) at ${cx.toFixed(1)}, ${cy.toFixed(1)}` });
    }
  }

  /* ---- furniture overlapping furniture ---- */
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i], B = boxes[j];
      if (isUnderlay(A.item) || isUnderlay(B.item)) continue;
      const area = overlapArea(A.box, B.box);
      /* One thing wholly inside another is FITTED, not colliding — a basin set
       * into a counter, a hatch on a tank, a hob in a worktop. Real furniture
       * does this constantly and a plain rectangle intersection calls every
       * one of them a fault. Judged by containment rather than by a list of
       * type names, so it keeps working for types nobody has added yet. */
      const areaA = A.box.w * A.box.h, areaB = B.box.w * B.box.h;
      if (area > 0 && area >= Math.min(areaA, areaB) * 0.92) continue;
      if (area > MIN_AREA) {
        out.push({ level: 'warn', floor: where, kind: 'furniture overlaps furniture',
          detail: `${A.item.type} (${A.item.id}) and ${B.item.type} (${B.item.id}) share ${area.toFixed(1)} sq ft` });
      }
    }
  }

  /* ---- furniture across a doorway ----
   *
   * The one that actually matters when you look at a plan: a wardrobe drawn
   * over the door it is supposed to stand beside.
   *
   * Two exclusions, both learned from running this on a real house and reading
   * what it said. A counter under a kitchen window is a sink, not a fault —
   * only openings you WALK THROUGH can be blocked. And a staircase inside its
   * own stairwell, or a lift car in its shaft, necessarily covers the way in;
   * those pieces ARE the architecture rather than furniture standing in front
   * of it. Without both, the report was 21 findings of which 3 were real, which
   * is a report nobody reads twice. */
  const WALKABLE = new Set(['door', 'door_double', 'door_sliding', 'door_pocket', 'door_folding', 'opening', 'arch', 'cased']);
  const ARCHITECTURAL = new Set(['stairs', 'lift', 'escalator']);
  for (const op of floor.openings || []) {
    if (!WALKABLE.has(op.type)) continue;
    const room = rooms.find((r) => r.id === op.room);
    if (!room) continue;
    const edges = scene.roomEdges(room);
    const edge = (op.edge !== undefined && op.edge !== null)
      ? edges.find((e) => e.index === op.edge)
      : edges.find((e) => e.wall === op.wall);
    if (!edge) continue;
    const at = num(op.at, edge.lo), w = num(op.w, 2.5);
    /* The swept area in front of the opening, a foot deep either side. */
    const span = { lo: at, hi: at + w };
    const door = edge.horizontal
      ? { x: span.lo, y: edge.fixed - 1, w: span.hi - span.lo, h: 2 }
      : { x: edge.fixed - 1, y: span.lo, w: 2, h: span.hi - span.lo };
    for (const { item, box } of boxes) {
      if (isUnderlay(item) || ARCHITECTURAL.has(item.type)) continue;
      const area = overlapArea(door, box);
      if (area > MIN_AREA) {
        out.push({ level: 'error', floor: where, kind: 'furniture blocks an opening',
          detail: `${item.type} (${item.id}) covers ${area.toFixed(1)} sq ft of ${op.id} (${op.type}) in ${op.room}` });
      }
    }
  }

  /* ---- devices aimed into the wall they hang on ----
   *
   * A marker's `rot` decides which way it faces, and a type that ships a
   * default gives every marker that never set one the SAME facing — so an AC
   * whose type says 270 blows west in every room in the house, and the three of
   * them mounted on a west wall blow into it. This renders perfectly: the unit
   * is drawn, the entity is bound, only the air goes into the plaster.
   *
   * Judged by where the cone's centreline actually GOES rather than by
   * comparing two angles, because that one measurement covers both mistakes —
   * facing straight into the wall, and running along it a hand's breadth
   * outside the room — and it needs no separate rule for a corner.
   *
   * The tuning that keeps this honest is the exterior case: a camera on an
   * outside wall aimed at the street or the drive is doing its job, and every
   * house has some. So aiming OUT of the building is a warning for a vision
   * device and an error for anything else, while aiming through a wall into
   * the next room is always wrong. */
  for (const item of items) {
    const type = scene.resolveType(lib, item);
    if (!type || !(type.render && type.render.cone)) continue;
    const style = type.render.cone.style || 'vision';
    const p = item.props || {}, d = type.defaults || {};
    const rot = num(p.rot, num(d.rot, 0));
    const range = num(p.range, num(d.range, 10));
    const at = item.at || [0, 0];
    const room = (item.room && rooms.find((r) => r.id === item.room))
      || rooms.find((r) => scene.pointInRoom(r, at[0], at[1]));
    if (!room) continue;               // already reported as in no room at all
    const edges = scene.roomEdges(room);
    let wall = null;
    for (const e of edges) {
      const dist = distToSegment(at, e.a, e.b);
      if (!wall || dist < wall.dist) wall = { e, dist };
    }
    if (!wall || wall.dist > MOUNT_FT) continue;   // free-standing: not our business

    const f = facingVec(rot);
    let reach = 0;
    for (let t = 0.25; t <= range; t += 0.25) {
      if (!scene.pointInRoom(room, at[0] + f[0] * t, at[1] + f[1] * t)) break;
      reach = t;
    }
    if (reach >= Math.min(range, USEFUL_FT)) continue;

    /* What is on the other side decides how bad it is. */
    const beyond = [at[0] + f[0] * (wall.dist + 1.5), at[1] + f[1] * (wall.dist + 1.5)];
    const next = rooms.find((r) => r.id !== room.id && r.part_of !== room.id
      && room.part_of !== r.id && scene.pointInRoom(r, beyond[0], beyond[1]));
    const what = `${item.id} (${item.kind}.${item.type}${item.entity ? ', ' + item.entity : ''})`
      + ` faces ${rot}° on the ${wall.e.wall} wall of ${room.id}`;
    if (next) {
      out.push({ level: 'error', floor: where, kind: 'device aimed through a wall',
        detail: `${what} — its ${style} cone lands in ${next.id}, ${reach.toFixed(1)} ft of ${range} ft used` });
    } else if (style === 'vision') {
      out.push({ level: 'warn', floor: where, kind: 'device aimed out of the building',
        detail: `${what} — deliberate for a street camera, a mistake for anything indoors` });
    } else {
      out.push({ level: 'error', floor: where, kind: 'device aimed into its own wall',
        detail: `${what} — its ${style} cone reaches ${reach.toFixed(1)} ft of ${range} ft into the room` });
    }
  }

  /* ---- boundaries pointing at nothing ---- */
  for (const b of floor.boundaries || []) {
    const room = rooms.find((r) => r.id === b.room);
    if (!room) { out.push({ level: 'error', floor: where, kind: 'boundary has no room', detail: `${b.id} names "${b.room}"` }); continue; }
    const edges = scene.roomEdges(room);
    const hit = (b.edge !== undefined && b.edge !== null)
      ? edges.find((e) => e.index === b.edge)
      : edges.filter((e) => e.wall === b.wall);
    if (!hit || (Array.isArray(hit) && !hit.length)) {
      out.push({ level: 'error', floor: where, kind: 'boundary has no wall', detail: `${b.id} on ${b.room} wall ${b.wall}` });
    } else if (Array.isArray(hit) && hit.length > 1) {
      out.push({ level: 'warn', floor: where, kind: 'boundary on an ambiguous wall',
        detail: `${b.id}: room ${b.room} has ${hit.length} "${b.wall}" edges — it applies to all of them` });
    }
  }

  /* ---- duplicate ids, which make a thing unaddressable ---- */
  const seen = new Map();
  for (const list of [rooms, items, floor.openings || [], floor.boundaries || []]) {
    for (const x of list) {
      if (!x.id) continue;
      if (seen.has(x.id)) out.push({ level: 'error', floor: where, kind: 'duplicate id', detail: x.id });
      seen.set(x.id, true);
    }
  }
}

function audit(file) {
  const project = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = [];
  for (const floor of project.floors || []) auditFloor(floor, out);
  return { project, out };
}

const targets = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!targets.length) {
  for (const p of [path.join(ROOT, 'fixtures'), path.join(APP, 'data')]) {
    if (!fs.existsSync(p)) continue;
    for (const f of fs.readdirSync(p)) if (f.endsWith('project.json')) targets.push(path.join(p, f));
  }
}
if (!targets.length) { console.log('Nothing to audit.'); process.exit(0); }

let worst = 0;
for (const file of targets) {
  const { project, out } = audit(file);
  const errors = out.filter((r) => r.level === 'error');
  const warns = out.filter((r) => r.level === 'warn');
  console.log(`\n${path.relative(ROOT, file)}  —  ${project.name}`);
  console.log(`  ${errors.length} error(s), ${warns.length} warning(s)`);
  const byKind = {};
  for (const r of out) (byKind[r.kind] = byKind[r.kind] || []).push(r);
  for (const [kind, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${list[0].level === 'error' ? 'ERROR' : 'warn '}  ${kind}  (${list.length})`);
    for (const r of list.slice(0, 8)) console.log(`      ${r.floor}: ${r.detail}`);
    if (list.length > 8) console.log(`      … and ${list.length - 8} more`);
  }
  if (errors.length) worst = 1;
}
process.exit(process.argv.includes('--strict') ? worst : 0);
