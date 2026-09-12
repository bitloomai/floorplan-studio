#!/usr/bin/env node
/**
 * make-showcase.js — the single-storey house the help site and the README lead
 * with, and the frames of the animation that shows it working.
 *
 *   node tools/make-showcase.js              writes docs/showcase-plan.svg
 *   node tools/make-showcase.js --test       geometry + circulation self-test
 *   node tools/make-showcase.js --frames     writes docs/frames/showcase-NN.svg
 *   node tools/make-showcase.js --check      regenerates and diffs, no write
 *
 * ## Why a second composition
 *
 * `make-readme-image.js` draws a four-storey block cut into thirteen rooms so
 * that the README picture can prove breadth — multi-floor, stairs, balconies.
 * Breadth is not the same as being convincing. Thirteen rooms in 60 x 40 ft
 * leaves every room too small to furnish honestly, and a plan whose rooms are
 * all 10 ft across reads as a diagram of a house rather than a house.
 *
 * This one is a single storey on its own plot, drawn the way a bungalow is
 * actually planned, and it is deliberately EMPTIER: the big rooms carry the
 * image, the materials carry the colour, and the lighting carries the mood.
 *
 * ## The plan, and why it is this plan
 *
 * A single-storey house lives or dies on circulation. Get it wrong and the
 * drawing still renders, so nothing complains — but a reader who has ever
 * looked at a floor plan feels it immediately, usually as "why would you walk
 * through a bedroom to reach the garden".
 *
 * So the plan is three bands across a 48 x 30 ft footprint:
 *
 *   NORTH  y  8..21   private: bedrooms, baths, study      (quiet, off-street)
 *   SPINE  y 21..27   porch -> foyer -> a corridor serving every room
 *   SOUTH  y 27..38   public: living, dining, kitchen, utility
 *
 * The public band is on the south because the terrace is on the south, and the
 * living room has to be the room that opens onto it. That one decision fixes
 * the whole plan: bedrooms face the quiet side, the corridor separates private
 * from public instead of threading between beds, and the front door arrives in
 * a foyer rather than into somebody's living room.
 *
 * Every habitable room touches the corridor. The only rooms entered through
 * another are the ensuite and the walk-in wardrobe, which is where they belong,
 * and the utility, which opens off the kitchen. `--test` asserts exactly that,
 * because it is the property that makes this a building.
 *
 * ## Materials
 *
 * One palette, and open-plan rooms SHARE a floor — which is the detail that
 * makes a drawing read as one house rather than a material sampler. Living and
 * dining are one oak chevron field across both rooms; entrance and hallway are
 * one Carrara marble; the main bedroom and its wardrobe are one wool.
 *
 * The stone is where the money shows, so it is spent where a visitor stands:
 * Carrara through the entrance and the full length of the hallway, Calacatta in
 * the ensuite, steel granite on the kitchen floor, honey travertine on the
 * porch, and a black granite coping along the top of the exterior wall — that
 * last one being a surface the model treats as its own material, which is why
 * the wall reads as a built thing rather than a thick line.
 *
 * Against all that stone, warmth comes from oak (living, dining, bedroom two,
 * study) and wool (main bedroom). Sage appears exactly twice, in the family
 * bath and the utility, so the one cool accent looks chosen rather than
 * scattered.
 *
 * ## Conventions that cost time when forgotten
 *
 * - Furniture `at` is its TOP-LEFT corner. A marker's `at` is its CENTRE.
 * - An opening's `at` is ABSOLUTE along the wall's own axis: an x coordinate on
 *   a north/south wall, a y coordinate on an east/west wall. It is NOT an
 *   offset from the room's corner.
 * - Everything lands on a half-foot, and furniture sits flush to its wall.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'floorplan_studio', 'app');
const OUT = path.join(ROOT, 'docs', 'showcase-plan.svg');
const FRAME_DIR = path.join(ROOT, 'docs', 'frames');

const scene = require(path.join(APP, 'lib', 'plan-scene.js'));
const lib = require(path.join(APP, 'defaults', 'library.json'));
const themes = require(path.join(APP, 'defaults', 'themes.json'));
const flooring = require(path.join(APP, 'defaults', 'flooring.json'));
const boundaries = require(path.join(APP, 'defaults', 'boundaries.json'));

/* The plot, and the building inside it. Named rather than repeated, because
 * every coordinate below is derived from these four numbers and a typo in one
 * of them is a hole in the floor. */
const PLOT = { w: 64, h: 48 };
const B = { x0: 8, y0: 8, x1: 56, y1: 38 };      // building interior

/* ------------------------------------------------------------------ rooms */

const INDOOR = [
  /* North band — private. */
  { id: 'bed_main', name: 'Main bedroom', rect: [8, 8, 15, 13], flooring: 'wool_cream' },
  { id: 'ens',      name: 'Ensuite',      rect: [23, 8, 7, 7],  flooring: 'marble_calacatta' },
  { id: 'wardrobe', name: 'Walk-in',      rect: [23, 15, 7, 6], flooring: 'wool_cream' },
  { id: 'bed2',     name: 'Bedroom',      rect: [30, 8, 12, 13], flooring: 'oak_honey' },
  { id: 'bath',     name: 'Bath',         rect: [42, 8, 7, 13], flooring: 'hex_sage' },
  { id: 'study',    name: 'Study',        rect: [49, 8, 7, 13], flooring: 'oak_honey' },

  /* Spine. Six feet, not four: a corridor is comfortable at four, but the
   * front door has to fit in the foyer's own west wall with a jamb either
   * side of it, and a 3.5 ft door in a 4 ft wall is a hole with a frame
   * around it. The extra two feet come off the public band, which can afford
   * them — see the note above the room list. */
  { id: 'foyer',    name: 'Entrance',     rect: [8, 21, 8, 6],  flooring: 'marble_carrara' },
  { id: 'hall',     name: 'Hallway',      rect: [16, 21, 40, 6], flooring: 'marble_carrara' },

  /* South band — public. */
  { id: 'living',   name: 'Living room',  rect: [8, 27, 19, 11], flooring: 'parquet_oak_chevron' },
  { id: 'dining',   name: 'Dining',       rect: [27, 27, 13, 11], flooring: 'parquet_oak_chevron' },
  { id: 'kitchen',  name: 'Kitchen',      rect: [40, 27, 10, 11], flooring: 'porcelain_greige' },
  { id: 'utility',  name: 'Utility',      rect: [50, 27, 6, 11], flooring: 'linoleum_sage' },
];

const OUTDOOR = [
  { id: 'garden_n', name: 'Garden',   rect: [0, 0, 64, 8],   flooring: 'grass' },
  { id: 'drive',    name: 'Driveway', rect: [0, 8, 8, 13],   flooring: 'paver_sand' },
  { id: 'porch',    name: 'Porch',    rect: [0, 21, 8, 6],   flooring: 'travertine_honey' },
  { id: 'side_w',   name: null,       rect: [0, 27, 8, 11],  flooring: 'gravel', noLabel: true },
  { id: 'yard',     name: 'Service',  rect: [56, 8, 8, 30],  flooring: 'gravel' },
  { id: 'terrace',  name: 'Terrace',  rect: [8, 38, 32, 10], flooring: 'deck_teak' },
  { id: 'lawn',     name: 'Lawn',     rect: [40, 38, 24, 10], flooring: 'grass' },
  { id: 'lawn_w',   name: null,       rect: [0, 38, 8, 10],  flooring: 'grass', noLabel: true },
];

const ROOMS = [...INDOOR, ...OUTDOOR.map((r) => ({ ...r, outdoor: true }))];

const room = (r) => Object.assign({
  shape: 'rect', points: null, rect: null, outdoor: false, noLabel: false,
  chip_at: null, chip_rotate: 0, chip_scale: 1, part_of: null, ganged: false,
  master: null, dnd: null, boost: null, shortcuts: [], keys: null, popup: null,
}, r);

/* --------------------------------------------------------------- openings */

/* `at` is absolute along the wall's axis. Doors are listed with the room they
 * are drawn on and swing INTO, which is what decides the arc. */
const OPENINGS = [
  /* The front door. Its contact sensor is the one this image is built to
   * show, so it is on the porch side where nothing overlaps it. */
  { id: 'front', type: 'door', room: 'foyer', wall: 'w', at: 22.25, w: 3.5,
    sensor: 'binary_sensor.demo_front_door' },

  /* Spine: foyer to corridor, corridor to living. */
  { id: 'o_foyer_hall', type: 'opening', room: 'foyer', wall: 'e', at: 22.5, w: 4 },
  { id: 'o_foyer_liv',  type: 'arch',    room: 'foyer', wall: 's', at: 10.5, w: 4 },

  /* Corridor doors, north side. */
  { id: 'd_bed_main', type: 'door', room: 'bed_main', wall: 's', at: 19, w: 3 },
  { id: 'd_bed2',     type: 'door', room: 'bed2',     wall: 's', at: 32, w: 3 },
  { id: 'd_bath',     type: 'door', room: 'bath',     wall: 's', at: 44, w: 2.5 },
  { id: 'd_study',    type: 'door', room: 'study',    wall: 's', at: 51.5, w: 2.5 },

  /* Corridor openings, south side. */
  { id: 'o_hall_din',  type: 'opening', room: 'dining',  wall: 'n', at: 30, w: 5 },
  { id: 'd_kitchen',   type: 'door',    room: 'kitchen', wall: 'n', at: 46.5, w: 2.5 },

  /* Rooms entered from another room, which is correct for exactly these. */
  { id: 'd_ens',      type: 'door',         room: 'ens',      wall: 'w', at: 10, w: 2.5 },
  { id: 'o_wardrobe', type: 'opening',      room: 'wardrobe', wall: 'w', at: 16.5, w: 3 },
  { id: 'd_utility',  type: 'door',         room: 'utility',  wall: 'w', at: 28, w: 2.5 },

  /* Open plan: living and dining are one room with a structural pier. */
  { id: 'o_liv_din', type: 'opening', room: 'living', wall: 'e', at: 27.5, w: 9 },

  /* Out to the terrace. Two big sliders, both sensored — the pair is the
   * point: one open, one shut, in the same picture. */
  { id: 'slide_liv', type: 'door_sliding', room: 'living', wall: 's', at: 12, w: 7,
    sensor: 'binary_sensor.demo_living_slider' },
  { id: 'slide_din', type: 'door_sliding', room: 'dining', wall: 's', at: 30, w: 6,
    sensor: 'binary_sensor.demo_dining_slider' },
  /* Back door from the kitchen, and the utility's own door to the yard. */
  { id: 'd_back',     type: 'door', room: 'kitchen', wall: 's', at: 46, w: 3,
    sensor: 'binary_sensor.demo_back_door' },
  { id: 'd_yard',     type: 'door', room: 'utility', wall: 'e', at: 35, w: 2.5 },

  /* Windows. North face first — the quiet side, so the bedrooms get the
   * biggest openings. */
  { id: 'w_bed_main_n', type: 'window', room: 'bed_main', wall: 'n', at: 11, w: 7, h: 5, sill: 2,
    sensor: 'binary_sensor.demo_bed_main_window' },
  { id: 'w_bed2_n',     type: 'window', room: 'bed2',     wall: 'n', at: 33, w: 6, h: 5, sill: 2 },
  { id: 'w_bath_n',     type: 'window', room: 'bath',     wall: 'n', at: 44.5, w: 2.5, h: 3, sill: 4.5 },
  { id: 'w_study_n',    type: 'window', room: 'study',    wall: 'n', at: 51, w: 4, h: 5, sill: 2 },
  { id: 'w_ens_n',      type: 'window', room: 'ens',      wall: 'n', at: 25.5, w: 2, h: 2.5, sill: 5 },

  /* West face, onto the drive and porch. */
  { id: 'w_bed_main_w', type: 'window', room: 'bed_main', wall: 'w', at: 12, w: 5, h: 5, sill: 2 },
  { id: 'w_living_w',   type: 'window', room: 'living',   wall: 'w', at: 29, w: 6, h: 6, sill: 1 },

  /* East face, onto the service yard. */
  { id: 'w_study_e',  type: 'window', room: 'study',   wall: 'e', at: 12, w: 4, h: 5, sill: 2 },
  { id: 'w_utility_e', type: 'window', room: 'utility', wall: 'e', at: 30.5, w: 2, h: 3, sill: 4 },

  /* South face — the terrace elevation, so these are the big ones. */
  { id: 'w_kitchen_s', type: 'window', room: 'kitchen', wall: 's', at: 41, w: 4, h: 4, sill: 3 },
  { id: 'w_living_s',  type: 'window', room: 'living',  wall: 's', at: 21, w: 5, h: 6, sill: 1 },

  /* A skylight over the corridor, which is how a 40 ft interior corridor is
   * actually daylit. */
  { id: 'sky_hall', type: 'skylight', room: 'hall', wall: 'n', at: 24, w: 4, h: 4 },
];

/* Blinds. Four different positions plus one bound to a real cover entity, so
 * that "set by hand" and "driven by the house" appear side by side. */
const COVERINGS = {
  w_bed_main_n: { type: 'roller', position: 35 },
  w_bed2_n:     { type: 'roller', position: 100 },
  w_living_w:   { type: 'drape',  position: 70 },
  w_study_n:    { type: 'venetian', position: 55 },
  w_living_s:   { type: 'drape', position: 100, entity: 'cover.demo_living_drape' },
};

/* ------------------------------------------------------------- boundaries */

/* What the outdoor edges are made of. The exterior walls carry a stone coping
 * on their top face — the wall-top finish is a real surface in the model, and
 * a 10 in coping is what a real parapet has. */
const BOUNDS = [
  { id: 'wall_n', room: 'bed_main', wall: 'n', type: 'wall_exterior', props: { thicknessFt: 0.85, topFinish: 'granite_black' } },
  { id: 'wall_w', room: 'living', wall: 'w', type: 'wall_exterior', props: { thicknessFt: 0.85, topFinish: 'granite_black' } },
  { id: 'terr_e', room: 'terrace', wall: 'e', type: 'glass_railing' },
  { id: 'terr_s', room: 'terrace', wall: 's', type: 'parapet_glass' },
  { id: 'porch_w', room: 'porch', wall: 'w', type: 'open_edge' },
  { id: 'lawn_s', room: 'lawn', wall: 's', type: 'railing_cable' },
];

/* ------------------------------------------------------------------ items */

const items = [];
let seq = 0;
const nextId = (p) => `${p}${++seq}`;

const marker = (kind, type, x, y, entity, props) => {
  items.push({ id: nextId(kind[0]), kind, type, at: [x, y], room: null,
    entity: entity || null, name: null, props: props || {} });
  return items[items.length - 1];
};
/* `scheme` is a TOP-LEVEL field on the item, not one of its props — see
 * `schemeOf` in plan-scene.js. Worth stating, because putting it in `props`
 * fails silently: the item draws in the default grey and nothing complains.
 *
 * Every piece below names one. Left unset, furniture draws in a neutral grey
 * that is correct and lifeless, and a plan of twenty grey slabs is the single
 * biggest difference between this image and one somebody wants to look at. */
const furnish = (type, at, props, scheme) => {
  items.push({ id: nextId('u'), kind: 'furniture', type, at, room: null,
    entity: null, name: null, scheme: scheme || null, props: props || {} });
  return items[items.length - 1];
};

/* ---- ceilings ----
 *
 * Downlights in rows, which is what a ceiling is. Laid out per room from its
 * own rectangle so the grid is centred in the room rather than eyeballed. */
const spot = (x, y, entity) => marker('fixture', 'spot', x, y, entity, { watt: 7, variant: 'recessed' });

/* `cols` x `rows` downlights inset `inset` ft from the room's edges. */
function ceilingGrid(roomId, cols, rows, entity, inset = 3.5) {
  const r = ROOMS.find((q) => q.id === roomId).rect;
  const [x, y, w, h] = r;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const px = cols === 1 ? x + w / 2 : x + inset + ((w - inset * 2) * i) / (cols - 1);
      const py = rows === 1 ? y + h / 2 : y + inset + ((h - inset * 2) * j) / (rows - 1);
      spot(Math.round(px * 2) / 2, Math.round(py * 2) / 2, entity);
    }
  }
}

ceilingGrid('living', 3, 2, 'light.demo_living');
ceilingGrid('dining', 2, 2, 'light.demo_dining');
ceilingGrid('kitchen', 2, 3, 'light.demo_kitchen', 2.5);
ceilingGrid('bed_main', 3, 2, 'light.demo_bed_main');
ceilingGrid('bed2', 2, 2, 'light.demo_bed2');
ceilingGrid('study', 1, 2, 'light.demo_study', 3);
ceilingGrid('bath', 1, 2, 'light.demo_bath', 3.5);
ceilingGrid('ens', 1, 1, 'light.demo_ens');
ceilingGrid('utility', 1, 1, 'light.demo_utility');
ceilingGrid('foyer', 1, 1, 'light.demo_foyer');
/* A walk-in with no lamp in it is a cupboard the lighting model draws as a
 * black hole after dark. Every enclosed room gets one; `--test` checks. */
ceilingGrid('wardrobe', 1, 1, 'light.demo_wardrobe');
/* The corridor is long, so it gets a run of four rather than a grid. */
for (let i = 0; i < 4; i++) spot(20 + i * 11, 24, 'light.demo_hall');

/* ---- the lamps that are not downlights ---- */
marker('fixture', 'pendant', 33.5, 31.5, 'light.demo_dining_pendant', { watt: 12, count: 3, variant: 'cluster' });
marker('fixture', 'cove', 17.5, 28, 'light.demo_living_cove', { watt: 20, len: 16 });
marker('fixture', 'strip', 43.25, 27.8, 'light.demo_kitchen_under', { watt: 9, len: 5 });
marker('fixture', 'mirror_light', 25.5, 8.6, 'light.demo_ens_mirror', { watt: 6 });
marker('fixture', 'string', 24, 43, 'light.demo_terrace', { watt: 24, len: 26 });
marker('fixture', 'bollard', 4, 30.5, 'light.demo_path', { watt: 6 });
marker('fixture', 'bollard', 4, 35.5, 'light.demo_path', { watt: 6 });
marker('fixture', 'step_light', 4, 23, 'light.demo_porch', { watt: 4 });
marker('fixture', 'flood', 58, 26, 'light.demo_yard', { watt: 30 });

/* ---- fans ----
 *
 * At the centre of the rooms that have them, which is where the room's own
 * label wants to sit; the label steps aside for a marker. */
marker('device', 'fan', 17.5, 31.5, 'fan.demo_living', { sweep: 4, blades: 4, variant: 'paddle3' });
marker('device', 'fan', 15.5, 14.5, 'fan.demo_bed_main', { sweep: 3.5, blades: 4 });
marker('device', 'fan', 36, 14.5, 'fan.demo_bed2', { sweep: 3.5, blades: 4, variant: 'blades3' });
marker('device', 'fan_exhaust', 55.6, 34, 'fan.demo_utility_exhaust', { rot: 90 });

/* ---- devices ----
 *
 * Few, and each where the real thing is fixed. Only the camera asks for a
 * coverage wedge: every cone is opt-in, which is what stops an AC blowing
 * chevrons across the room it is drawn in. */
marker('device', 'ac', 10, 27.8, 'climate.demo_living', { rot: 180 });
marker('device', 'ac', 9, 9, 'climate.demo_bed_main', { rot: 180 });
marker('device', 'ac', 31, 9, 'climate.demo_bed2', { rot: 180 });
marker('device', 'thermostat', 16.6, 22, 'climate.demo_house');
marker('device', 'tv', 17.5, 27.7, 'media_player.demo_tv', { rot: 180 });
marker('device', 'speaker', 9.2, 27.8, 'media_player.demo_speaker', { rot: 135 });
marker('device', 'wall_switch', 15.2, 21.6, 'switch.demo_hall_plate', { gangs: 3 });
marker('device', 'wall_switch', 26, 27.6, 'switch.demo_living_plate', { gangs: 2 });
marker('device', 'camera', 6.6, 21.7, 'camera.demo_porch', { rot: 200, fov: 100, range: 16, variant: 'turret', cone: true });
marker('device', 'pir', 36, 22.4, 'binary_sensor.demo_hall_motion', { rot: 90 });
marker('device', 'doorbell', 7.6, 21.8, 'binary_sensor.demo_doorbell', { rot: 270 });
marker('device', 'smoke', 24, 23.8, 'binary_sensor.demo_hall_smoke');
marker('device', 'leak', 51.5, 28.4, 'binary_sensor.demo_utility_leak');
marker('device', 'router', 52.8, 9.4, 'sensor.demo_router', { rot: 180 });
marker('device', 'plug', 25.8, 37.4, 'switch.demo_living_plug');
marker('device', 'extension', 50.6, 9.4, 'sensor.demo_study_board', {
  channels: [
    { entity: 'switch.demo_board_1', label: 'Desk' },
    { entity: 'switch.demo_board_2', label: 'Monitor' },
    { entity: 'switch.demo_board_3', label: 'Charger' },
  ],
});
marker('device', 'hood', 43.5, 27.9, 'fan.demo_hood', { rot: 180 });
marker('device', 'induction', 43.5, 28.4, 'switch.demo_hob');
marker('device', 'washer', 51.5, 36.4, 'sensor.demo_washer');
marker('device', 'geyser', 48.3, 15.5, 'switch.demo_bath_geyser');

/* Service yard — the plant a real house has and a plan usually omits. */
marker('device', 'ac_outdoor', 58, 11, 'sensor.demo_ac_outdoor_1');
marker('device', 'ac_outdoor', 58, 14, 'sensor.demo_ac_outdoor_2');
marker('device', 'inverter', 61, 17.5, 'sensor.demo_inverter');
marker('device', 'battery', 61, 20.5, 'sensor.demo_battery');
marker('device', 'water_level', 58.5, 31, 'sensor.demo_tank');
marker('device', 'db_panel', 58, 22.8, 'sensor.demo_db');
marker('device', 'ev_charger', 7.4, 9.5, 'sensor.demo_ev');
/* The gate is drawn as the thing it is; its sensor is a normal contact badge.
 * `device.gate_motor` sizes its badge to the gate's real width in FEET, so at
 * an 8 ft opening it renders as an 8 ft bubble sitting over the driveway. */
marker('device', 'contact', 1.6, 13.5, 'binary_sensor.demo_gate');
marker('device', 'irrigation_valve', 61, 35.5, 'switch.demo_irrigation');
marker('device', 'weather_station', 61.5, 41, 'sensor.demo_weather');

/* ---- furnishing ----
 *
 * `at` is the TOP-LEFT corner, everything is flush or centred on the
 * half-foot, and nothing sits closer than half a foot to a wall it is not
 * against. Restraint is the brief: the rooms are big and they are meant to
 * read as big. */

/* Living room. The TV is on the corridor wall, which is the only wall in the
 * room with no opening in it — which is exactly why a real TV goes there. */
furnish('rug', [12, 28.5], { w: 11, h: 7 }, 'beige_linen');
furnish('tv_unit', [15, 27.5], { w: 5, h: 1.5, shelves: 2 }, 'smoked_oak');
furnish('sofa', [13, 33], { w: 8, h: 3 }, 'ivory_boucle');
furnish('armchair', [9.5, 29.5], { w: 2.5, h: 2.5 }, 'cognac_leather');
furnish('armchair', [23, 29.5], { w: 2.5, h: 2.5 }, 'cognac_leather');
furnish('coffee_table', [15.5, 30.5], { w: 3.5, h: 2 }, 'walnut');
furnish('side_table', [10, 33], { w: 1.5, h: 1.5 }, 'walnut');
furnish('plant', [24.5, 35.5], { w: 1.5, h: 1.5, variant: 'monstera' });

/* Dining. A round table under the cluster pendant, sideboard on the pier. */
furnish('round_table', [31, 29], { w: 5, h: 5, seats: 6 }, 'oak');
furnish('sideboard', [38.5, 29], { w: 1.5, h: 4 }, 'walnut');
furnish('plant', [38, 27.5], { w: 1.5, h: 1.5, variant: 'fern' });

/* Kitchen. A counter run along the corridor wall, island parallel to it. */
furnish('counter', [40.5, 27.5], { w: 5.5, h: 2, sink: true, sinkAt: 0.75 }, 'carrara');
furnish('fridge', [40.5, 35.5], { w: 2.5, h: 2.5 }, 'stainless');
furnish('island', [42, 30], { w: 6, h: 2.5 }, 'carrara');

/* Utility. */
furnish('washer_unit', [50.5, 35.5], { w: 2, h: 2 }, 'pearl_white');
furnish('storage_rack', [54, 27.5], { w: 1.5, h: 4, shelves: 4 }, 'dove_paint');
furnish('softener_unit', [50.5, 33], { w: 1.5, h: 1.5 }, 'dove_paint');

/* Main bedroom, its ensuite and its walk-in. */
furnish('rug', [10, 12], { w: 11, h: 8 }, 'oatmeal_fabric');
furnish('bed', [11.5, 12.5], { w: 6.5, h: 7, faces: 's' }, 'ivory_boucle');
furnish('nightstand', [9.5, 12.5], { w: 1.5, h: 1.5 }, 'walnut');
furnish('nightstand', [18.5, 12.5], { w: 1.5, h: 1.5 }, 'walnut');
furnish('dressing_table', [8.5, 19.5], { w: 3.5, h: 1.5 }, 'whitewash');
furnish('basin', [23.5, 8.5], { w: 2.5, h: 1.5 }, 'sanitary_white');
furnish('wc', [28, 8.5], { w: 1.5, h: 2 }, 'sanitary_white');
furnish('shower', [26.5, 12], { w: 2.5, h: 2.5 }, 'sanitary_white');
furnish('wardrobe', [24, 15.2], { w: 5, h: 1.5 }, 'whitewash');

/* Second bedroom. */
furnish('rug', [31.5, 12], { w: 9, h: 7.5 }, 'beige_linen');
furnish('bed', [33.5, 11.5], { w: 5.5, h: 6.5, faces: 's' }, 'beige_linen');
furnish('nightstand', [31.5, 11.5], { w: 1.5, h: 1.5 }, 'oak');
furnish('wardrobe', [39.5, 9], { w: 2, h: 5 }, 'oak');
furnish('desk', [37, 19], { w: 4, h: 2 }, 'oak');

/* Family bath. */
furnish('bathtub', [42.5, 12], { w: 5.5, h: 2.5 }, 'sanitary_white');
furnish('basin', [45.5, 8.5], { w: 2.5, h: 1.5 }, 'sanitary_white');
furnish('wc', [42.5, 8.5], { w: 1.5, h: 2 }, 'sanitary_white');

/* Study. */
furnish('desk', [49.5, 8.5], { w: 5.5, h: 2.5, drawers: 3 }, 'walnut');
furnish('chair', [52, 11.5], { w: 1.5, h: 1.5, variant: 'office' }, 'slate_fabric');
furnish('bookshelf', [49.5, 12], { w: 1.5, h: 5, shelves: 4 }, 'oak');

/* Foyer. */
furnish('shoe_rack', [12, 25.8], { w: 2.5, h: 1 }, 'oak');
furnish('console_table', [12.5, 21.3], { w: 3, h: 1.2 }, 'walnut');

/* Terrace — seating at the living end, dining set at the dining end, planting
 * along the parapet. The pergola is over the seating, not the whole deck. */
furnish('pergola', [10, 39.5], { w: 13, h: 7 }, 'teak');
furnish('deck_chair', [11, 41], { w: 3.5, h: 2 }, 'teak');
furnish('deck_chair', [11, 44], { w: 3.5, h: 2 }, 'teak');
furnish('side_table', [16, 42.5], { w: 1.5, h: 1.5 }, 'teak');
furnish('table', [28, 40.5], { w: 5, h: 3, seats: 4 }, 'teak');
furnish('parasol', [34.5, 40.5], { w: 3, h: 3 }, 'oatmeal_fabric');
furnish('bbq', [37, 45], { w: 2.5, h: 1.5 }, 'matte_black');
furnish('planter', [24, 46], { w: 14, h: 1.5 }, 'clay_paint');

/* Lawn and garden. Restrained: three trees, a hedge to the street, and the
 * solar array where a single-storey roof would actually carry it. */
/* The array is the furniture; the thing that REPORTS is a device on top of it.
 * Both exist on purpose — the panels are a footprint with a tilt, the marker is
 * what a generation entity binds to, and a plan that only has the furniture
 * shows panels that never produce anything. */
furnish('solar', [43, 39.5], { cols: 4, rows: 2, w: 9, h: 4, wattPerPanel: 450 });
marker('device', 'solar', 47.5, 41.5, 'sensor.demo_solar', { onRule: 'numeric' });
furnish('tree', [57, 43.5], { w: 4, h: 4, variant: 'deciduous' });
furnish('tree', [51, 44.5], { w: 3, h: 3, variant: 'flowering' });
furnish('tree', [18, 1.5], { w: 4.5, h: 4.5, variant: 'deciduous' });
furnish('tree', [44, 1.5], { w: 4, h: 4, variant: 'pine' });
furnish('hedge', [0, 6.3], { w: 64, h: 1.2 });

furnish('car', [1, 8.5], { w: 6, h: 12 }, 'pearl_white');

/* The gate itself: a sliding leaf across the drive where it meets the street,
 * given explicit w/h rather than a rotation, because `at` anchors the
 * UNROTATED top-left and a quarter-turned leaf lands nowhere near its numbers. */
furnish('gate_leaf', [0.5, 9.5], { w: 0.5, h: 8 }, 'matte_black');
furnish('bird_bath', [3, 33], { w: 1.5, h: 1.5 }, 'limestone');
furnish('clothesline', [57.5, 34.5], { w: 5, h: 0.5 });
furnish('shed', [58.5, 27.5], { w: 4, h: 3 }, 'dove_paint');

/* ---------------------------------------------------------------- project */

const floor = {
  id: 'ground', name: 'Ground floor', level_ft: 0, icon: 'mdi:home-floor-g',
  extent: { w: PLOT.w, h: PLOT.h }, grid: { size: 0.5, snap: true, reference: null },
  sun: null, popup: null,
  rooms: ROOMS.map(room),
  openings: OPENINGS.map((o) => Object.assign(
    { h: 4, sill: 0, swing: 'in', sensor: null, cover: null },
    o,
    COVERINGS[o.id] ? { covering: Object.assign({ entity: null }, COVERINGS[o.id]) } : {},
  )),
  boundaries: BOUNDS,
  items,
};

const project = {
  name: 'Aria House', schemaVersion: 1, ppf: 22, origin: [34, 34],
  activeTheme: 'frosted',
  compass: { up: 'N', right: 'E', down: 'S', left: 'W', show: true },
  /* A round latitude with nothing attached to it: the daylight model needs a
   * position and an orientation, not an address. */
  sun: {
    enabled: true, location: { lat: 28, lon: 0 }, screenUpBearing: 0,
    ambient: { referenceExposure: 0.16, outdoor: 1 },
  },
  lighting: { scrim: 0.55, maxWash: 0.46, targetFc: 18, bounce: 0.6, zones: { enabled: true, spillFt: 4 } },
  coverage: { enabled: true },
  chips: { show: true, counts: true, hideWhenAtMost: 1, hideRooms: [], style: 'pill' },
  floors: [floor],
};

/* ------------------------------------------------------------- the states */

/* Which lamps are on, named rather than random so the image is deterministic
 * and a diff means the renderer changed rather than the dice. */
const LAMPS_ON = [
  'light.demo_living', 'light.demo_living_cove', 'light.demo_dining_pendant',
  'light.demo_kitchen_under', 'light.demo_hall', 'light.demo_terrace',
  'light.demo_bed2', 'light.demo_ens_mirror', 'light.demo_path',
];

/* One scene, described once. `phase` moves the sun and swaps the handful of
 * states that make the house look lived in at that hour; everything else is
 * derived, so a frame cannot disagree with the still. */
function statesFor(opts) {
  const on = new Set(opts.lampsOn || LAMPS_ON);
  const out = {};
  for (const it of items) {
    if (!it.entity) continue;
    const domain = it.entity.split('.')[0];
    if (domain === 'light') {
      out[it.entity] = on.has(it.entity)
        ? { state: 'on', attributes: { brightness: 220, rgb_color: [255, 200, 130] } }
        : { state: 'off', attributes: {} };
    } else if (domain === 'fan') {
      const spinning = (opts.fansOn || []).includes(it.entity);
      out[it.entity] = { state: spinning ? 'on' : 'off', attributes: { percentage: spinning ? 75 : 0 } };
    } else if (domain === 'climate') {
      out[it.entity] = { state: 'cool', attributes: { temperature: 24, current_temperature: 27 } };
    } else if (domain === 'camera') {
      out[it.entity] = { state: 'streaming', attributes: {} };
    } else if (domain === 'cover') {
      out[it.entity] = { state: 'open', attributes: { current_position: 100 } };
    } else if (domain === 'binary_sensor') {
      out[it.entity] = { state: 'off', attributes: {} };
    } else if (domain === 'media_player') {
      out[it.entity] = { state: 'playing', attributes: {} };
    } else if (domain === 'switch') {
      out[it.entity] = { state: 'off', attributes: {} };
    } else {
      out[it.entity] = { state: 'off', attributes: {} };
    }
  }
  /* The openings' own sensors, which is the feature this composition leads
   * with. An UNKNOWN sensor is deliberate: the model draws a hollow pip for
   * "nobody knows", and a confident wrong answer on a door is worse than no
   * answer at all. */
  Object.assign(out, {
    'binary_sensor.demo_front_door': { state: opts.frontDoor || 'off', attributes: {} },
    'binary_sensor.demo_living_slider': { state: 'on', attributes: {} },
    'binary_sensor.demo_dining_slider': { state: 'off', attributes: {} },
    'binary_sensor.demo_back_door': { state: 'unavailable', attributes: {} },
    'binary_sensor.demo_bed_main_window': { state: 'on', attributes: {} },
    'binary_sensor.demo_hall_motion': { state: opts.motion ? 'on' : 'off', attributes: {} },
    'binary_sensor.demo_doorbell': { state: 'off', attributes: {} },
    'cover.demo_living_drape': { state: 'open', attributes: { current_position: opts.drape ?? 100 } },
    'binary_sensor.demo_gate': { state: 'off', attributes: {} },
    'sensor.demo_tank': { state: '68', attributes: { unit_of_measurement: '%' } },
    'sensor.demo_weather': { state: '29', attributes: { unit_of_measurement: '°C' } },
  });
  return out;
}

/* The still: the equinox at 17:20, which is golden hour for this latitude.
 *
 * The hour is the single biggest lever on whether this reads as a drawing or a
 * photograph, and it is worth being deliberate about. At 15:40 the sun sits
 * 29° up, which puts a short stub of light inside each window and flattens the
 * whole plan into even daylight — technically correct, visually inert. At 17:20
 * it is 7.6° up: just above `sun.beam.minElevation`, so the beams are at their
 * longest, they rake east across the floor from the west glass, and the lamps
 * that are on finally read as warm pools against them instead of being washed
 * out. Past 18:30 the sun is down, the beams vanish and the materials go with
 * them — which is the right mood for a frame of the animation and the wrong one
 * for the single image somebody judges the tool by. */
const STILL = {
  when: new Date('2026-09-21T17:20:00Z'),
  lampsOn: LAMPS_ON, fansOn: ['fan.demo_living', 'fan.demo_bed_main'],
  frontDoor: 'on', motion: true, drape: 100,
};

function build(opts, motion) {
  return scene.build(project, floor, lib, themes.themes.frosted.plan, {
    states: statesFor(opts), boundaries, flooring, when: opts.when, motion: !!motion,
  });
}

module.exports = { project, floor, items, ROOMS, INDOOR, OUTDOOR, OPENINGS, B, PLOT, build, statesFor, STILL, LAMPS_ON };

/* ------------------------------------------------------------------- main */


/* ---------------------------------------------------------------- frames --
 *
 * A day in the house, as a sequence of stills. Each frame changes the hour and
 * the handful of states a real house changes with it — the sun sweeps, lamps
 * come on as it goes, the fan starts in the heat of the afternoon, somebody
 * comes through the front door and the corridor sees them. Nothing here
 * animates within a frame; the motion is between frames, which is what makes
 * it legible at eight frames rather than eighty. */
const FRAMES = [
  { hour: '06:20', lamps: [], fans: [], door: 'off', motion: false, drape: 100, label: 'Dawn' },
  { hour: '08:00', lamps: ['light.demo_kitchen_under'], fans: [], door: 'off', motion: false, drape: 100, label: 'Morning' },
  { hour: '11:30', lamps: [], fans: ['fan.demo_living'], door: 'off', motion: false, drape: 60, label: 'Midday' },
  { hour: '14:10', lamps: [], fans: ['fan.demo_living', 'fan.demo_bed_main'], door: 'off', motion: false, drape: 35, label: 'Afternoon' },
  { hour: '15:40', lamps: LAMPS_ON.slice(0, 4), fans: ['fan.demo_living', 'fan.demo_bed_main'], door: 'on', motion: true, drape: 70, label: 'Home' },
  { hour: '17:30', lamps: LAMPS_ON, fans: ['fan.demo_living'], door: 'off', motion: true, drape: 100, label: 'Evening' },
  { hour: '19:15', lamps: LAMPS_ON, fans: ['fan.demo_living'], door: 'off', motion: false, drape: 100, label: 'Dusk' },
  { hour: '21:40', lamps: LAMPS_ON.filter((l) => l !== 'light.demo_bed2'), fans: ['fan.demo_bed_main'], door: 'off', motion: false, drape: 100, label: 'Night' },
];

function writeFrames() {
  fs.mkdirSync(FRAME_DIR, { recursive: true });
  const index = [];
  FRAMES.forEach((f, i) => {
    const built = build({
      when: new Date(`2026-09-21T${f.hour}:00Z`),
      lampsOn: f.lamps, fansOn: f.fans, frontDoor: f.door, motion: f.motion, drape: f.drape,
    }, false);
    if (built.warnings.length) {
      console.error(`frame ${i} (${f.label}) has ${built.warnings.length} warning(s)`);
      for (const w of built.warnings) console.error('  ' + w.kind + ' ' + (w.message || ''));
      process.exitCode = 1;
    }
    const name = `showcase-${String(i).padStart(2, '0')}.svg`;
    fs.writeFileSync(path.join(FRAME_DIR, name), scene.toSvg(built));
    index.push({ name, label: f.label, hour: f.hour, width: built.width, height: built.height });
    console.log(`  ${name}  ${f.hour}  ${f.label}`);
  });
  fs.writeFileSync(path.join(FRAME_DIR, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`${index.length} frames -> ${FRAME_DIR}`);
}

/* ------------------------------------------------------------------- main --
 *
 * Last in the file on purpose: `writeFrames` reads the `FRAMES` table above,
 * and a `const` is hoisted WITHOUT being initialised, so calling it from
 * higher up the file threw "Cannot access 'FRAMES' before initialization".
 * An entry point belongs after everything it can reach. */
if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.includes('--test')) {
    process.exitCode = require('./showcase-test.js')() ? 0 : 1;
  } else if (argv.includes('--frames')) {
    writeFrames();
  } else {
    const built = build(STILL, false);
    if (built.warnings.length) {
      console.error(`The scene reported ${built.warnings.length} warning(s):`);
      for (const w of built.warnings) console.error('  ' + w.kind + ' ' + (w.message || ''));
      process.exitCode = 1;
    }
    const svg = scene.toSvg(built);
    if (argv.includes('--check')) {
      const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
      if (current !== svg) {
        console.error('docs/showcase-plan.svg does not match the renderer.');
        console.error('Run `node tools/make-showcase.js` and commit the result.');
        process.exitCode = 1;
      } else console.log('docs/showcase-plan.svg matches the renderer.');
    } else {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, svg);
      const nodes = built.order.reduce((n, k) => n + built.layers[k].length, 0);
      console.log(`Showcase: ${floor.rooms.length} rooms, ${items.length} items, ${nodes} nodes, ${built.width}x${built.height}`);
      console.log(`  ${OUT}  (${(svg.length / 1024).toFixed(0)} KB)`);
    }
  }
}
