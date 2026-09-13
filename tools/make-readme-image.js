#!/usr/bin/env node
/**
 * make-readme-image.js — render the README's hero plan.
 *
 *   node tools/make-readme-image.js            writes docs/hero-plan.svg
 *   node tools/make-readme-image.js --check    regenerates and diffs, no write
 *
 * The picture at the top of the README is not a mockup and not a screenshot
 * someone remembered to retake. It is the renderer's own output, built by the
 * same `plan-scene.js` the editor paints with and the dashboard card ships, out
 * of the same shipped registries a user's own project resolves through — so it
 * cannot show a feature that does not exist, and it goes stale only if the
 * renderer changes, at which point regenerating is one command.
 *
 * ## Why this file composes its own floor
 *
 * It used to curate one floor of `test/house/`. That floor is built to be
 * DULL on purpose — four rectangles, generic contents — because its job is to
 * make assertions legible, and dressing it up produced a hero with a dead
 * L-shaped notch, four rooms, almost no devices and furniture floating at
 * coordinates that did not line up with anything.
 *
 * So the showcase is its own house now, invented here and still entirely
 * synthetic: nobody's real home belongs in a README. What a real house taught
 * this composition is a matter of PROPORTION, not content — ceilings are mostly
 * downlights laid out on a grid, roughly a third of a home's floor area is
 * outdoors, and the finishes change room to room. None of its geometry, names
 * or entities appear here.
 *
 * ## The two rules that keep it from reading as clutter
 *
 *   1. EVERYTHING LANDS ON A HALF-FOOT GRID, and furniture sits flush to the
 *      wall it belongs against. A plan looks wrong long before a reader can say
 *      why, and the reason is almost always a 0.3 ft gap behind a sofa.
 *   2. Repetition is laid out, not scattered. Downlights go in rows a real
 *      electrician would set out; a random sprinkle of the same marker reads as
 *      noise no matter how few there are.
 *
 * Furniture `at` is its TOP-LEFT corner; a marker's `at` is its centre. Keeping
 * that distinction explicit is what stops the half-outside bed this file has
 * produced before.
 *
 * Late afternoon, sun still up and about half the lamps on, because that is the
 * one state where everything the tool actually does is visible at once: sun
 * beams through the west windows, warm pools under the lamps that are on, and
 * live device state. A plan at noon with everything off is a drawing of some
 * rectangles.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'floorplan_studio', 'app');
const OUT = path.join(ROOT, 'docs', 'hero-plan.svg');

const scene = require(path.join(APP, 'lib', 'plan-scene.js'));
const lib = require(path.join(APP, 'defaults', 'library.json'));
const themes = require(path.join(APP, 'defaults', 'themes.json'));
const flooring = require(path.join(APP, 'defaults', 'flooring.json'));
const boundaries = require(path.join(APP, 'defaults', 'boundaries.json'));

/* ------------------------------------------------------------------ rooms --
 *
 * Thirteen rooms tiling 60 x 40 ft exactly, so the frame is filled and there is
 * no dead notch. The terrace's outer corner carries a radius — a curved wall is
 * a real feature of the model, and an outdoor corner is where a curve looks
 * deliberate rather than decorative.
 *
 * The LANDING is not decoration. Without it the middle row is a chain of rooms
 * and the only way into the bedroom is through the bathroom, which is how the
 * first cut ended up with a bath opening straight onto the stair. A plan whose
 * circulation does not work reads as wrong even to someone not looking for it.
 * Bath and balcony both open off the bedroom, stacked in the right-hand column
 * so that neither is reached through the other. */
const rooms = [
  { id: 'living',  name: 'Living room', rect: [0, 0, 22, 15],  flooring: 'wood_wide' },
  { id: 'foyer',   name: 'Entrance',    rect: [22, 0, 10, 15], flooring: 'marble' },
  { id: 'kitchen', name: 'Kitchen',     rect: [32, 0, 14, 15], flooring: 'tile_large' },
  { id: 'dining',  name: 'Dining',      rect: [46, 0, 14, 15], flooring: 'herringbone' },

  { id: 'master',  name: 'Main bedroom', rect: [0, 15, 18, 12],  flooring: 'carpet' },
  { id: 'stairs',  name: 'Stair',        rect: [18, 15, 7, 12],  flooring: 'granite' },
  { id: 'landing', name: 'Landing',      rect: [25, 15, 6, 12],  flooring: 'granite' },
  { id: 'bed2',    name: 'Bedroom',      rect: [31, 15, 14, 12], flooring: 'wood' },
  { id: 'bath',    name: 'Bath',         rect: [45, 15, 15, 6],  flooring: 'tile_small' },
  { id: 'balcony', name: 'Balcony',      rect: [45, 21, 15, 6],  flooring: 'deck', outdoor: true },

  { id: 'study',   name: 'Study',        rect: [0, 27, 18, 13],  flooring: 'terrazzo' },
  { id: 'hall',    name: 'Hall',         rect: [18, 27, 10, 13], flooring: 'granite' },
  {
    id: 'terrace', name: 'Terrace', flooring: 'deck', outdoor: true,
    shape: 'poly', points: [[28, 27], [60, 27], [60, 40, 7], [28, 40]],
  },
];

const room = (r) => Object.assign({
  shape: 'rect', points: null, rect: null, outdoor: false, noLabel: false,
  chip_at: null, chip_rotate: 0, part_of: null, ganged: false,
  master: null, dnd: null, boost: null, shortcuts: [], keys: null, popup: null,
}, r);

/* --------------------------------------------------------------- openings --
 *
 * `at` is ABSOLUTE along the wall's own axis, not an offset from the room's
 * corner — a window at `at: 6` on the west wall of a room starting at y=15 is
 * drawn at y=6, floating clear of the building. (The committed test house has
 * exactly that mistake in it.) Every number below is a plan coordinate.
 *
 * `hinge` picks which jamb the door turns on. The renderer is consistent about
 * it — an opening always runs in increasing coordinate order, so `start` is the
 * left jamb on a horizontal wall and the top one on a vertical wall — but
 * consistent is not the same as right for a particular door: which side a door
 * should open from is a fact about the room, and the renderer turns each arc about that hinge. (It did not always: the
 * sweep flag ignored which way the wall winds, so half of them curved about
 * the opposite corner.) */
const openings = [
  /* North face */
  { id: 'w1', type: 'window', room: 'living', wall: 'n', at: 5, w: 8, h: 5, sill: 2 },
  { id: 'w2', type: 'window', room: 'kitchen', wall: 'n', at: 35, w: 6, h: 4, sill: 3 },
  { id: 'w3', type: 'window', room: 'dining', wall: 'n', at: 49, w: 8, h: 5, sill: 2 },
  /* West face */
  { id: 'w4', type: 'window', room: 'living', wall: 'w', at: 4, w: 7, h: 5, sill: 2 },
  { id: 'w5', type: 'window', room: 'master', wall: 'w', at: 18, w: 6, h: 4, sill: 2.5 },
  { id: 'w6', type: 'window', room: 'study', wall: 'w', at: 30, w: 7, h: 5, sill: 2 },
  /* East and south faces */
  { id: 'w7', type: 'window', room: 'dining', wall: 'e', at: 4, w: 7, h: 5, sill: 2 },
  { id: 'w8', type: 'window', room: 'bath', wall: 'e', at: 16.5, w: 3, h: 3, sill: 4 },
  { id: 'w9', type: 'window', room: 'study', wall: 's', at: 4, w: 6, h: 4, sill: 2.5 },

  /* The way through the house: front door into the entrance, entrance to the
   * stair, stair to the landing, and the landing serving the bedrooms. */
  { id: 'd1', type: 'door', room: 'foyer', wall: 'n', at: 25, w: 3.5 },
  { id: 'd2', type: 'opening', room: 'living', wall: 'e', at: 4, w: 5 },
  { id: 'd3', type: 'arch', room: 'foyer', wall: 'e', at: 4, w: 4 },
  { id: 'd4', type: 'opening', room: 'kitchen', wall: 'e', at: 4, w: 5 },
  { id: 'd5', type: 'door', room: 'foyer', wall: 's', at: 22.5, w: 2.5 },
  { id: 'd6', type: 'opening', room: 'landing', wall: 'w', at: 19, w: 4 },
  { id: 'd7', type: 'door', room: 'master', wall: 'e', at: 19, w: 3 },
  { id: 'd8', type: 'door', room: 'bed2', wall: 'w', at: 19, w: 3 },
  /* Bath and balcony both open off the bedroom, not off the stair. */
  { id: 'd9', type: 'door', room: 'bath', wall: 'w', at: 16.5, w: 2.5 },
  { id: 'd10', type: 'door_sliding', room: 'balcony', wall: 'w', at: 22, w: 4 },
  { id: 'd11', type: 'door', room: 'hall', wall: 'n', at: 20.5, w: 3 },
  { id: 'd12', type: 'door', room: 'study', wall: 'e', at: 31, w: 3 },
  { id: 'd13', type: 'door_sliding', room: 'terrace', wall: 'w', at: 31, w: 6 },
];

/* Blinds at four different positions, because a covering bound to a cover
 * entity and one set by hand look the same here, and the point is that the
 * model has them at all. */
const COVERINGS = { w1: 82, w4: 46, w6: 100, w7: 24, w3: 68 };

/* ------------------------------------------------------------- boundaries --
 *
 * What the outdoor edges are made of. Each carries its own light transmission,
 * which is why a glass-fronted balcony and a solid parapet are different
 * objects rather than two ways of drawing a line. */
const bounds = [
  { id: 'b1', room: 'balcony', wall: 'e', type: 'glass_railing' },
  { id: 'b2', room: 'balcony', wall: 's', type: 'open_edge' },
  { id: 'b3', room: 'terrace', wall: 'e', type: 'railing_cable' },
  { id: 'b4', room: 'terrace', wall: 's', type: 'parapet_glass' },
];

/* ------------------------------------------------------------------ items --
 *
 * Downlights first, laid out in rows. This is what a ceiling really is — in the
 * house this composition takes its proportions from, recessed spots outnumber
 * every other fitting roughly four to one — and laying them out on a grid is
 * what separates "a ceiling" from "some dots". */
const items = [];
let seq = 0;
const id = (p) => `${p}${++seq}`;

const spot = (x, y, entity) => items.push({
  id: id('f'), kind: 'fixture', type: 'spot', at: [x, y], room: null,
  entity, name: null, props: { watt: 7, variant: 'recessed' },
});
/* A row of `n` downlights spread evenly between two x positions. */
const spotRow = (x0, x1, y, n, entity) => {
  for (let i = 0; i < n; i++) spot(x0 + ((x1 - x0) * i) / (n - 1 || 1), y, entity);
};

spotRow(5.5, 16.5, 4, 3, 'light.demo_living');
spotRow(5.5, 16.5, 11, 3, 'light.demo_living');
spotRow(35.5, 42.5, 4, 3, 'light.demo_kitchen');
spotRow(35.5, 42.5, 11, 3, 'light.demo_kitchen');
spotRow(49.5, 56.5, 4, 3, 'light.demo_dining');
spotRow(4, 14, 19, 3, 'light.demo_master');
spotRow(4, 14, 24, 3, 'light.demo_master');
spotRow(33.5, 42.5, 19, 3, 'light.demo_bed2');
spotRow(33.5, 42.5, 24, 3, 'light.demo_bed2');
spotRow(4.5, 13.5, 31, 3, 'light.demo_study');
spotRow(4.5, 13.5, 36, 3, 'light.demo_study');
spot(24.5, 4, 'light.demo_foyer');
spot(24.5, 10, 'light.demo_foyer');
spot(28, 18, 'light.demo_landing');
spot(28, 24, 'light.demo_landing');
spot(48, 18, 'light.demo_bath');
spot(56, 18, 'light.demo_bath');
spot(23, 31, 'light.demo_hall');
spot(23, 36, 'light.demo_hall');

const marker = (kind, type, x, y, entity, props) => items.push({
  id: id(kind[0]), kind, type, at: [x, y], room: null,
  entity: entity || null, name: null, props: props || {},
});

/* Lamps that are not downlights, each where that kind of fitting really goes. */
marker('fixture', 'pendant', 53, 7.5, 'light.demo_dining_pendant', { watt: 12, count: 3, variant: 'cluster' });
marker('fixture', 'cove', 11, 7.5, 'light.demo_living_cove', { watt: 18 });
marker('fixture', 'strip', 38.5, 1.2, 'light.demo_kitchen_under', { watt: 9, len: 8 });
marker('fixture', 'string', 44, 33.5, 'light.demo_terrace', { watt: 24, len: 22 });
marker('fixture', 'bollard', 47, 25.5, 'light.demo_balcony', { watt: 6 });
marker('fixture', 'bollard', 57, 25.5, 'light.demo_balcony', { watt: 6 });

/* Ceiling fans, at the centre of the rooms that have them — which is exactly
 * where a room's name wants to go, and the label steps aside for them. */
marker('device', 'fan', 11, 7.5, 'fan.demo_living', { sweep: 4, blades: 4, variant: 'paddle3' });
marker('device', 'fan', 9, 21, 'fan.demo_master', { sweep: 3.5, blades: 4 });
marker('device', 'fan', 38, 21, 'fan.demo_bed2', { sweep: 3.5, blades: 4 });

/* Devices, kept few and put where the real thing is fixed: a switch beside the
 * door it works, an AC high on the wall, a camera on an outside corner. Only
 * the camera asks for its coverage wedge — every cone is opt-in now, which is
 * what keeps an AC from blowing chevrons across the room it is drawn in. */
marker('device', 'wall_switch', 21, 3, 'switch.demo_living_plate', { gangs: 3 });
marker('device', 'wall_switch', 22.8, 12.5, 'switch.demo_foyer_plate', { gangs: 2 });
marker('device', 'ac', 20.5, 2, 'climate.demo_living', { rot: 180 });
marker('device', 'ac', 44, 16, 'climate.demo_bed2', { rot: 180 });
marker('device', 'tv', 11, 1, 'media_player.demo_living_tv', { rot: 180 });
marker('device', 'speaker', 2, 1.5, 'media_player.demo_living_speaker', { rot: 135 });
marker('device', 'camera', 58.5, 28.5, 'camera.demo_terrace', { rot: 225, fov: 96, range: 18, variant: 'turret', cone: true });
marker('device', 'pir', 23, 28.5, 'binary_sensor.demo_hall_motion', { rot: 180 });
marker('device', 'thermostat', 18.8, 29, 'climate.demo_house');
marker('device', 'router', 16.5, 28.2, 'sensor.demo_router');
marker('device', 'plug', 1, 13.6, 'switch.demo_living_plug');
marker('device', 'contact', 26.75, 0.2, 'binary_sensor.demo_front_door');

/* ------------------------------------------------------------- furnishing --
 *
 * `at` is the TOP-LEFT corner. Everything here is flush to a wall or centred in
 * its room on the half-foot, and nothing is closer than 0.5 ft to a wall it is
 * not against. */
const furnish = (type, at, props) => items.push({
  id: id('u'), kind: 'furniture', type, at, room: null,
  entity: null, name: null, props: props || {},
});

/* Living room — sofa and armchairs face the TV wall across a rug. */
furnish('rug', [5, 5.5], { w: 12, h: 7 });
furnish('tv_unit', [8, 0.5], { w: 6, h: 1.5, shelves: 2 });
furnish('sofa', [7, 11], { w: 8, h: 3 });
furnish('coffee_table', [9.5, 7.5], { w: 3, h: 2 });
furnish('armchair', [3, 7], { w: 2.5, h: 2.5 });
furnish('armchair', [16.5, 7], { w: 2.5, h: 2.5 });
furnish('plant', [19.5, 12.5], { w: 1.5, h: 1.5, variant: 'monstera' });

/* Entrance */
furnish('console_table', [22.5, 0.5], { w: 3, h: 1.2 });
furnish('plant', [29.5, 12.5], { w: 1.5, h: 1.5, variant: 'fern' });

/* Kitchen — a run of counter along the north wall, island parallel to it. */
furnish('counter', [32.5, 0.5], { w: 9, h: 2, sink: true, sinkAt: 0.55 });
furnish('oven', [41.5, 0.5], { w: 2, h: 2 });
furnish('fridge', [43.5, 0.5], { w: 2.5, h: 2.5 });
furnish('bar_counter', [34.5, 8], { w: 8, h: 2, seats: 3 });

/* Dining */
furnish('round_table', [50.5, 5], { w: 5, h: 5, seats: 6 });
furnish('sideboard', [46.5, 13], { w: 5, h: 1.5 });

/* Main bedroom */
furnish('rug', [2, 17.5], { w: 10, h: 8 });
furnish('bed', [3.5, 18], { w: 6.5, h: 7, faces: 's' });
furnish('nightstand', [1.5, 18], { w: 1.5, h: 1.5 });
furnish('nightstand', [10.5, 18], { w: 1.5, h: 1.5 });
furnish('wardrobe', [15.5, 15.5], { w: 2, h: 3 });
furnish('dresser', [12.5, 25], { w: 4, h: 1.5 });

/* Stair — the flight, with every riser lit. */
furnish('stairs', [19, 16], {
  w: 5, h: 10, steps: 12, dir: 'up', axis: 'ns',
  lighting: 'edge', lightEvery: 1, sequence: 'together',
});

/* Second bedroom */
furnish('rug', [33, 17.5], { w: 10, h: 7.5 });
furnish('bed', [35, 18], { w: 5.5, h: 6.5, faces: 's' });
furnish('nightstand', [33, 18], { w: 1.5, h: 1.5 });
furnish('nightstand', [41, 18], { w: 1.5, h: 1.5 });
furnish('wardrobe', [43, 16], { w: 1.8, h: 6 });

/* Bath — a long room across the top right, fittings along its north wall. */
furnish('basin', [46, 15.5], { w: 2.5, h: 1.5 });
furnish('wc', [50, 15.5], { w: 1.5, h: 2 });
furnish('shower', [56.5, 15.5], { w: 3, h: 2.5 });

/* Balcony */
furnish('deck_chair', [46.5, 22], { w: 2, h: 3.5 });
furnish('deck_chair', [49.5, 22], { w: 2, h: 3.5 });
furnish('planter', [53, 22], { w: 6, h: 1.5 });

/* Study */
furnish('desk', [1, 28], { w: 6, h: 2.5, drawers: 3 });
furnish('chair', [3.5, 31], { w: 1.5, h: 1.5, variant: 'office' });
furnish('bookshelf', [14.5, 28], { w: 3, h: 1, shelves: 4 });
furnish('sofa', [1, 36.5], { w: 7, h: 2.5 });
furnish('plant', [15.5, 37.5], { w: 1.5, h: 1.5, variant: 'potted' });

/* Terrace — seating one end, planting the other, panels along the roof edge. */
furnish('table', [33, 30], { w: 5, h: 3, seats: 4 });
furnish('parasol', [39.5, 30], { w: 3, h: 3 });
furnish('deck_chair', [30, 34.5], { w: 4, h: 2 });
furnish('solar', [50, 28.5], { cols: 3, rows: 2, w: 7, h: 3.5, wattPerPanel: 400 });
furnish('planter', [29, 37.5], { w: 12, h: 1.5 });
furnish('tree', [55, 34], { w: 3.5, h: 3.5, variant: 'palm' });

/* ---------------------------------------------------------------- project -- */
const floor = {
  id: 'main', name: 'Main', level_ft: 0, icon: 'mdi:home-floor-1',
  extent: { w: 60, h: 40 }, grid: { size: 0.5, snap: true, reference: null },
  sun: null, popup: null,
  rooms: rooms.map(room),
  openings: openings.map((o) => Object.assign({
    h: 4, sill: 0, swing: 'in', sensor: null,
  }, o, COVERINGS[o.id] !== undefined
    ? { covering: { type: 'roller', position: COVERINGS[o.id], entity: null } }
    : {})),
  boundaries: bounds,
  items,
};

const project = {
  name: 'Lumen House', schemaVersion: 1, ppf: 22, origin: [34, 34],
  activeTheme: 'frosted',
  compass: { up: 'N', right: 'E', down: 'S', left: 'W', show: false },
  /* The sun is what makes the west windows throw beams across the floor at this
   * hour. A round latitude with no meaning attached to it — the model needs a
   * position and an orientation, not a real address. */
  sun: {
    enabled: true, location: { lat: 40, lon: 0 }, screenUpBearing: 0,
    ambient: { referenceExposure: 0.16, outdoor: 1 },
  },
  lighting: { scrim: 0.2, maxWash: 0.46, targetFc: 18, bounce: 0.6, zones: { enabled: true, spillFt: 4 } },
  coverage: { enabled: true },
  chips: { show: true, counts: true, hideWhenAtMost: 1, hideRooms: [], style: 'pill' },
  floors: [floor],
};

/* Which lamps are on. Named rather than random, so the image is deterministic
 * and a diff means the renderer changed rather than the dice. Roughly half —
 * enough to show warm pools against the daylight without lighting every room,
 * which would flatten the whole thing back out. */
const ON = new Set([
  'light.demo_living', 'light.demo_living_cove', 'light.demo_kitchen_under',
  'light.demo_dining_pendant', 'light.demo_bed2', 'light.demo_hall',
  'light.demo_terrace', 'light.demo_landing',
]);

const states = {};
for (const it of items) {
  if (!it.entity) continue;
  const domain = it.entity.split('.')[0];
  if (domain === 'light') {
    states[it.entity] = ON.has(it.entity)
      ? { state: 'on', attributes: { brightness: 218, rgb_color: [255, 201, 132] } }
      : { state: 'off', attributes: {} };
  } else if (domain === 'fan') {
    states[it.entity] = { state: it.entity === 'fan.demo_living' ? 'on' : 'off', attributes: { percentage: 66 } };
  } else if (domain === 'climate') {
    states[it.entity] = { state: 'cool', attributes: { temperature: 24 } };
  } else if (domain === 'camera') {
    states[it.entity] = { state: 'streaming', attributes: {} };
  } else if (domain === 'binary_sensor') {
    states[it.entity] = { state: it.entity.endsWith('_motion') ? 'on' : 'off', attributes: {} };
  } else if (domain === 'media_player') {
    states[it.entity] = { state: it.entity.endsWith('_tv') ? 'playing' : 'off', attributes: {} };
  } else {
    states[it.entity] = { state: 'off', attributes: {} };
  }
}

const built = scene.build(project, floor, lib, themes.themes.frosted.plan, {
  states, boundaries, flooring,
  when: new Date('2026-09-21T16:10:00Z'),
  /* No animation in a still image: the spin class would sit there as dead
   * markup, and GitHub strips it from an <img> anyway. */
  motion: false,
});

if (!Number.isFinite(built.width) || built.width <= 0) {
  console.error('The scene has no usable size — check the floor\'s extent.');
  process.exit(1);
}
if (built.warnings.length) {
  console.error(`The scene reported ${built.warnings.length} warning(s):`);
  for (const w of built.warnings) console.error('  ' + w.kind + ' ' + (w.message || ''));
  process.exit(1);
}

const svg = scene.toSvg(built);

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (current !== svg) {
    console.error('docs/hero-plan.svg does not match the renderer.');
    console.error('Run `node tools/make-readme-image.js` and commit the result.');
    process.exit(1);
  }
  console.log('docs/hero-plan.svg matches the renderer.');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, svg);
  const nodes = built.order.reduce((n, k) => n + built.layers[k].length, 0);
  console.log(`README hero: ${floor.rooms.length} rooms, ${items.length} items, ${nodes} nodes, ${built.width}x${built.height}`);
  console.log(`  ${OUT}  (${(svg.length / 1024).toFixed(0)} KB)`);
}
