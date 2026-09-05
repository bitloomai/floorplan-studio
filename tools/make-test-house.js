#!/usr/bin/env node
/**
 * make-test-house.js — generate the synthetic house the suite runs against.
 *
 *   node tools/make-test-house.js            writes test/house/
 *   node tools/make-test-house.js --check    regenerates and diffs, no write
 *
 * ## Why this exists
 *
 * The suite needs a building with real depth: five floors, dozens of rooms,
 * lights that pool on a floor at night, a fan that spins, openings the daylight
 * model can pour through, and enough markers that hit-testing means something.
 * The house it was originally built against had all of that and was somebody's
 * actual home — its rooms named, its device models listed, its coordinates in
 * the file. That is not publishable, so it lives in `fixtures/`, gitignored,
 * and is still usable locally through `FPS_FIXTURES_DIR`.
 *
 * What ships instead is invented here. Not sanitised, not anonymised —
 * INVENTED, geometry included. Stripping names off a real floor plan still
 * publishes the floor plan, and "which rooms adjoin which" is the part of a
 * home worth not handing out.
 *
 * ## What the house has to contain
 *
 * The generator is not free to produce any building; the suite asserts against
 * it. The constraints, and why each is here:
 *
 *   - Floor ids `ground`, `first`, `second`, `terrace`, `deck`. Tests look up
 *     `first` by id for the lighting, motion and hit-target work.
 *   - Every floor needs rooms, items and openings, because "all floors build
 *     with no warnings" walks all five.
 *   - `first` needs enough lamps in a small enough room to clear 5 foot-candles
 *     with everything on, or the room-level assertion has nothing to find.
 *   - At least one fan, or the motion tests have no `fps-spin` to look for.
 *   - Rooms in more than one shape, so the polygon and curve paths are drawn
 *     rather than merely present in the renderer.
 *   - Every entity id is `*.demo_*`. That is what makes it obvious at a glance,
 *     in a diff or a bug report, that nothing here is anybody's house.
 *
 * Deterministic on purpose: same input, same bytes, so regenerating produces an
 * empty diff and `--check` can be trusted in CI.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test', 'house');

/* Round numbers, on purpose: 30N 0E is open desert, and a coordinate pair with
 * four zeroes after the point reads as invented rather than redacted.
 *
 * The latitude is not arbitrary either. The suite asserts the sun is 40 to 70
 * degrees up and 45 to 135 degrees round at ten in the morning; at high
 * latitudes a summer sun swings far enough south to fall outside that window,
 * which is a fact about the sky rather than a bug, but it would make the
 * assertion useless. Thirty degrees keeps a comfortable margin on both. */
const LAT = 30;
const LON = 0;

const room = (id, name, rect, extra) => Object.assign({
  id, name, shape: 'rect', rect, points: null, flooring: 'wood',
  boost: null, dnd: null, master: null, ganged: false, outdoor: false,
  noLabel: false, chip_at: null, chip_rotate: 0, part_of: null,
  controls: null, keys: null, shortcuts: [],
}, extra || {});

const item = (id, kind, type, at, entity, props) => ({
  id, kind, type, at, room: null, entity: entity || null, name: null, props: props || {},
});

/* An opening's `at` is ABSOLUTE in the schema — measured in the floor's own
 * coordinates along the wall, not from the corner of the room it belongs to.
 *
 * This file used to write it relative, and that is how EIGHT windows ended up
 * outside the walls they were on. It went unnoticed for the worst possible
 * reason: a room whose wall starts at 0 makes the two conventions identical, so
 * the openings on Room A and Room C were right and the ones on Room B and the
 * poly rooms were not, in the same list, written the same way.
 *
 * So the helper now takes `from` — the offset a person would actually measure,
 * from the start of that room's wall — and does the conversion itself, which
 * means the call sites cannot get it wrong again. */
const wallStart = (r, wall) => {
  const rect = r.rect || (() => {
    const xs = r.points.map((p) => p[0]), ys = r.points.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), 0, 0];
  })();
  return (wall === 'n' || wall === 's') ? rect[0] : rect[1];
};

const openingIn = (rooms) => (id, type, roomId, wall, from, w, extra) => {
  const r = rooms.find((x) => x.id === roomId);
  if (!r) throw new Error(`opening ${id} names room ${roomId}, which does not exist`);
  return Object.assign({
    id, type, room: roomId, wall, at: wallStart(r, wall) + from, w,
    h: 4, sill: type === 'window' ? 2.5 : 0,
    curtain: type === 'window' ? 0.25 : 0, transmission: type === 'window' ? 0.85 : 1,
  }, extra || {});
};

const boundary = (id, roomId, wall, type, extra) =>
  Object.assign({ id, room: roomId, wall, type }, extra || {});

/* ---- the building -------------------------------------------------------
 *
 * A 44 x 30 ft footprint, four rooms to a floor on the lower three, opening out
 * to terrace and deck above. Room ids are deliberately generic: `room_a`
 * through `room_d` per floor, so no test can come to depend on a name that
 * means something. */

/* A different sanitaryware look on every living floor. A fixture that only ever
 * draws a type's DEFAULT look cannot tell a working variant from a broken one,
 * and until this file placed a bathroom at all there was nothing here to look
 * at in any case.
 *
 * This is a SPREAD, not a full sweep — three bathrooms cannot hold five tubs
 * without stacking them, and a fixture that stacks furniture to reach coverage
 * teaches the audit to report a collision that is not one. Exhaustiveness is
 * the suite's job instead: it renders every variant of every shape and asserts
 * each draws something distinct, which no house layout could have proved. */
const BATH_LOOKS = {
  ground: { tub: 'alcove', wc: 'close_coupled', basin: 'counter_top', shower: 'square' },
  first: { tub: 'corner', wc: 'wall_hung', basin: 'pedestal', shower: 'quadrant' },
  second: { tub: 'freestanding', wc: 'squat', basin: 'under_counter', shower: 'walk_in' },
};

function livingFloor(id, name, level, opts) {
  const o = opts || {};
  const looks = BATH_LOOKS[id] || BATH_LOOKS.ground;
  const rooms = [
    room(`${id}_a`, 'Room A', [0, 0, 22, 15], { master: `light.demo_${id}_a1` }),
    room(`${id}_b`, 'Room B', [22, 0, 22, 15], { flooring: 'tile' }),
    /* Room C carries the room-level vocabulary: a header do-not-disturb plus a
     * scene and an automation, which is what proves a room can name its own
     * controls rather than inheriting a fixed list. */
    room(`${id}_c`, 'Room C', [0, 15, 18, 15], {
      flooring: 'carpet',
      shortcuts: [
        { id: 'dnd', label: 'Do not disturb', entity: `input_boolean.demo_${id}_dnd`, slot: 'header' },
        { id: 'reading', label: 'Reading', entity: `scene.demo_${id}_reading` },
        { id: 'presence', label: 'Presence', entity: `automation.demo_${id}_presence` },
      ],
    }),
    /* One L-shaped room per living floor, so the polygon path is exercised by
     * the fixture and not only by the inline projects in the suite. */
    room(`${id}_d`, 'Room D', null, {
      shape: 'poly', flooring: 'tile',
      points: [[18, 15], [44, 15], [44, 30], [30, 30], [30, 22], [18, 22]],
    }),
    /* The notch left over in Room D's L — x 18-30, y 22-30 — is where the
     * vertical circulation and the wet room go. Until these two rooms existed
     * the fixture had no staircase, no lift and no sanitaryware at all, so a
     * whole shelf of the library was drawn by nothing anyone ran. */
    room(`${id}_e`, 'Room E', [18, 22, 6, 8], { flooring: 'granite' }),
    room(`${id}_f`, 'Room F', [24, 22, 6, 8], { flooring: 'tile_small' }),
  ];
  const opening = openingIn(rooms);

  /* Room A is the lit one: six spots in 330 sq ft clears 5 fc comfortably,
   * which is what the foot-candle assertion needs to see.
   *
   * Every room carries at least TWO distinct light entities, which is not
   * decoration. The room chip reads "how many of this room's lights are on" and
   * a room wired to a single entity can only ever be 1/1, so a house where each
   * room has one light produces no chips at all and four assertions have
   * nothing to look at. */
  const items = [
    item(`${id}_l1`, 'fixture', 'spot', [4, 4], `light.demo_${id}_a1`, { watt: 9 }),
    item(`${id}_l2`, 'fixture', 'spot', [11, 4], `light.demo_${id}_a1`, { watt: 9 }),
    item(`${id}_l3`, 'fixture', 'spot', [18, 4], `light.demo_${id}_a1`, { watt: 9 }),
    item(`${id}_l4`, 'fixture', 'spot', [4, 11], `light.demo_${id}_a2`, { watt: 9 }),
    item(`${id}_l5`, 'fixture', 'spot', [11, 11], `light.demo_${id}_a2`, { watt: 9 }),
    item(`${id}_l6`, 'fixture', 'spot', [18, 11], `light.demo_${id}_a2`, { watt: 9 }),
    item(`${id}_t1`, 'fixture', 'tube', [28, 4], `light.demo_${id}_b1`, { len: 4, rot: 0 }),
    item(`${id}_t2`, 'fixture', 'spot', [38, 4], `light.demo_${id}_b2`, { watt: 9 }),
    item(`${id}_l7`, 'fixture', 'spot', [6, 20], `light.demo_${id}_c1`, { watt: 9 }),
    item(`${id}_l9`, 'fixture', 'spot', [13, 20], `light.demo_${id}_c2`, { watt: 9 }),
    item(`${id}_l8`, 'fixture', 'spot', [36, 20], `light.demo_${id}_d1`, { watt: 9 }),
    item(`${id}_l10`, 'fixture', 'spot', [40, 26], `light.demo_${id}_d2`, { watt: 9 }),
    /* Logic markers: a plan can pin a scene or an automation to a place, and
     * the suite checks the fixture exercises that at all. */
    item(`${id}_sc`, 'logic', 'scene', [16, 13], `scene.demo_${id}_evening`, {}),
    item(`${id}_au`, 'logic', 'automation', [19, 13], `automation.demo_${id}_dusk`, {}),
    item(`${id}_tg`, 'logic', 'toggle', [16, 17], `input_boolean.demo_${id}_guest`, {}),
    /* The fan is what the motion tests look for. */
    item(`${id}_fan`, 'device', 'fan', [11, 7.5], `fan.demo_${id}_ceiling`, { blades: 3, sweep: 4.5 }),
    item(`${id}_ac`, 'device', 'ac', [33, 1], `climate.demo_${id}_ac`, { rot: 180 }),
    /* `cone: true` on exactly two of the directional devices. Coverage is
     * opt-in per item, so a fixture that never sets it draws no wedge anywhere
     * and the whole coverage path goes unexercised — but turning it on for all
     * of them buries the rooms, which is why it is opt-in in the first place. */
    item(`${id}_cam`, 'device', 'camera', [42, 2], `camera.demo_${id}_hall`, { rot: 225, fov: 90, range: 18, cone: true }),
    item(`${id}_pir`, 'device', 'pir', [9, 16], `binary_sensor.demo_${id}_motion`, { rot: 180, fov: 110, range: 14, cone: true }),
    item(`${id}_sw`, 'device', 'wall_switch', [21, 14], `switch.demo_${id}_plate`, {
      gangs: 3, variant: 'rocker',
      /* Each gang drives a light that actually exists on this floor, so the
       * plate reads as three real loads rather than three dead references. */
      channels: [
        { entity: `light.demo_${id}_a1`, label: 'Gang 1' },
        { entity: `light.demo_${id}_b1`, label: 'Gang 2' },
        { entity: `light.demo_${id}_c1`, label: 'Gang 3' },
      ],
    }),
    item(`${id}_plug`, 'device', 'plug', [23, 14], `switch.demo_${id}_plug`, { watt: 2300 }),
    item(`${id}_bed`, 'furniture', 'bed', [9, 25], null, { w: 6, h: 6.5, rot: 0 }),
    item(`${id}_sofa`, 'furniture', 'sofa', [36, 26], null, { w: 7, h: 3, rot: 0 }),
    item(`${id}_tbl`, 'furniture', 'table', [33, 9], null, { w: 5, h: 3, rot: 0 }),

    /* Room E — the shaft. Both pieces of vertical circulation, and the stair
     * is BOUND to a light so the step-lighting path (a lit nosing that climbs
     * the flight one tread at a time) has something real to drive it. Only the
     * ground floor can climb without also descending. */
    item(`${id}_l11`, 'fixture', 'spot', [21, 24], `light.demo_${id}_e1`, { watt: 9 }),
    item(`${id}_l12`, 'fixture', 'spot', [22.5, 29], `light.demo_${id}_e2`, { watt: 9 }),
    item(`${id}_stair`, 'furniture', 'stairs', [18, 22], `light.demo_${id}_stair`, {
      w: 6, h: 5.5, variant: 'u_switchback', steps: 15, axis: 'ns',
      dir: 'up', continues: o.bottom ? 'cut' : 'both',
      lighting: 'edge', lightEvery: 2, sequence: 'progressive',
    }),
    item(`${id}_lift`, 'furniture', 'lift', [18.5, 28], null, { w: 2.5, h: 1.75, variant: 'dumbwaiter' }),

    /* Room F — the wet room, and the only place any of the sanitaryware looks
     * are drawn. Laid out on the half-foot grid and flush to the walls, the
     * same two rules the README hero follows. */
    item(`${id}_l13`, 'fixture', 'spot', [26.5, 23.5], `light.demo_${id}_f1`, { watt: 9 }),
    item(`${id}_l14`, 'fixture', 'spot', [26.5, 28.5], `light.demo_${id}_f2`, { watt: 9 }),
    item(`${id}_tub`, 'furniture', 'bathtub', [24.25, 22.25], null, { w: 4.5, h: 2.4, variant: looks.tub }),
    item(`${id}_bsn`, 'furniture', 'basin', [24.25, 25], null, { w: 2.5, h: 1.4, variant: looks.basin }),
    item(`${id}_wc`, 'furniture', 'wc', [24.25, 27], null, { w: 1.4, h: 2.5, variant: looks.wc }),
    item(`${id}_shw`, 'furniture', 'shower', [27.2, 25], null, { w: 2.6, h: 2.6, variant: looks.shower }),
  ];

  const openings = [
    opening(`${id}_w1`, 'window', `${id}_a`, 'n', 6, 6),
    opening(`${id}_w2`, 'window', `${id}_b`, 'n', 8, 6),
    opening(`${id}_w3`, 'window', `${id}_c`, 'w', 6, 5),
    opening(`${id}_d1`, 'door', `${id}_a`, 'e', 10, 3),
    opening(`${id}_d2`, 'door', `${id}_c`, 'n', 6, 3),
    opening(`${id}_v1`, 'grill_vent', `${id}_b`, 'e', 8, 2),
    /* The wet room's door goes on its SOUTH wall at the far end, which is the
     * only run of that room's perimeter no fitting stands against. Putting it
     * where the tub is would have been a door the audit reports as blocked, and
     * correctly — this is exactly the mistake the check exists to catch. */
    opening(`${id}_d3`, 'door', `${id}_f`, 's', 3.5, 2.5),
    opening(`${id}_d4`, 'opening', `${id}_e`, 'n', 1, 4),
  ];

  /* Wall treatments, which this fixture carried NONE of — `boundaries` was a
   * literal empty array on every floor, so the registry that decides how a run
   * of wall is drawn, and how much daylight it passes, was exercised only by
   * projects built inline inside the suite.
   *
   * One of them is a PARTIAL run on purpose: the rest of that wall has to stay
   * an ordinary wall, and "the whole edge got restyled" is the failure mode. */
  const boundaries = [
    boundary(`${id}_bg`, `${id}_b`, 'n', 'glass_full', { from: 26, to: 40 }),
    boundary(`${id}_bl`, `${id}_c`, 'w', 'louvre'),
    boundary(`${id}_bh`, `${id}_a`, 's', 'wall_half', { from: 0, to: 8 }),
    boundary(`${id}_bp`, `${id}_f`, 'w', 'glass_partition'),
  ];

  return {
    id, name, level_ft: level, icon: o.icon || 'mdi:home-floor-1',
    extent: { w: 44, h: 30 }, grid: { size: 0.5, snap: true }, sun: null, popup: null,
    boundaries, rooms, openings, items, schemaVersion: 1,
  };
}

function openFloor(id, name, level, icon) {
  const rooms = [
    room(`${id}_a`, 'Open A', [0, 0, 26, 18], { outdoor: true, flooring: 'paver' }),
    /* A five-sided room with a cut corner. `rect` and `poly` are the only two
     * shapes the model has — `validate-project.js` rejects anything else, and
     * the renderer has no third branch — so "an irregular room" means a polygon
     * with an interesting outline, not a separate shape. */
    room(`${id}_b`, 'Open B', null, {
      shape: 'poly', outdoor: true, flooring: 'paver',
      points: [[26, 0], [44, 0], [44, 12], [38, 18], [26, 18]],
    }),
  ];
  const items = [
    item(`${id}_l1`, 'fixture', 'string', [13, 2], `light.demo_${id}_string`, { len: 20, rot: 0 }),
    item(`${id}_l2`, 'fixture', 'spot', [35, 9], `light.demo_${id}_spot`, { watt: 9 }),
    item(`${id}_pir`, 'device', 'pir', [13, 17], `binary_sensor.demo_${id}_motion`, { rot: 0, fov: 120, range: 16 }),
    item(`${id}_sw`, 'device', 'wall_switch', [2, 17], `switch.demo_${id}_plate`, { gangs: 1, variant: 'industrial' }),
    item(`${id}_sol`, 'device', 'solar', [35, 3], `sensor.demo_${id}_pv`, { cols: 6, rows: 2 }),
  ];
  const opening = openingIn(rooms);
  const openings = [
    opening(`${id}_d1`, 'door', `${id}_a`, 's', 12, 3),
    /* Open B's cut corner gives it TWO edges the compass calls "east" — the
     * vertical one and the diagonal — so naming the wall is not enough to say
     * which. `edge` is the index into `roomEdges`, and it is the only way to
     * be unambiguous on a polygon. */
    opening(`${id}_w1`, 'window', `${id}_b`, 'e', 4, 5, { edge: 1 }),
  ];

  /* An outdoor floor is where the railing and parapet treatments belong, and
   * they are also the ones that pass daylight — a terrace walled in solid
   * would be darker than the room below it. */
  const boundaries = [
    boundary(`${id}_br`, `${id}_a`, 's', 'glass_railing'),
    boundary(`${id}_bm`, `${id}_a`, 'w', 'metal_railing'),
    boundary(`${id}_bn`, `${id}_b`, 'n', 'parapet_glass'),
  ];

  return {
    id, name, level_ft: level, icon,
    extent: { w: 44, h: 18 }, grid: { size: 0.5, snap: true }, sun: null, popup: null,
    boundaries, rooms, openings, items, schemaVersion: 1,
  };
}

const project = {
  schemaVersion: 1,
  id: 'demo-test-house',
  name: 'Demo Test House',
  units: 'ft',
  ppf: 22,
  origin: [34, 34],
  activeTheme: 'frosted',
  compass: { up: 'N', right: 'E', down: 'S', left: 'W' },
  sun: {
    enabled: true,
    location: { lat: LAT, lon: LON, label: 'Synthetic (30N 0E)' },
    screenUpBearing: 90,
    weather: { entity: null },
    solarSensor: { entity: null, peakW: null },
  },
  popup: null,
  floors: [
    livingFloor('ground', 'Ground', 0, { icon: 'mdi:home-floor-g', bottom: true }),
    livingFloor('first', 'First', 11, { icon: 'mdi:home-floor-1' }),
    livingFloor('second', 'Second', 22, { icon: 'mdi:home-floor-2' }),
    openFloor('terrace', 'Terrace', 33, 'mdi:home-roof'),
    openFloor('deck', 'Deck', 33, 'mdi:binoculars'),
  ],
  savedAt: '2026-01-01T00:00:00.000Z',
  controls: null,
  /* House-level shortcuts, which every room inherits — the suite checks one
   * reaches a room alongside that room's own. */
  shortcuts: [
    { id: 'goodnight', label: 'Goodnight', entity: 'scene.demo_goodnight' },
    { id: 'house_mode', label: 'House mode', entity: 'input_select.demo_house_mode' },
    { id: 'night_off', label: 'Night lights off', entity: 'automation.demo_night_off' },
  ],
};

/* ---- emit ---------------------------------------------------------------
 *
 * The whole project plus one file per floor, matching the layout the suite
 * reads: `test-house.project.json` and `<id>.floor.json`. */

const files = { 'test-house.project.json': project };
for (const f of project.floors) files[`${f.id}.floor.json`] = f;

const check = process.argv.includes('--check');
let differs = 0;

fs.mkdirSync(OUT, { recursive: true });
for (const [name, doc] of Object.entries(files)) {
  const text = JSON.stringify(doc, null, 2) + '\n';
  const target = path.join(OUT, name);
  if (check) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (current !== text) { differs++; console.error(`  differs: ${name}`); }
  } else {
    fs.writeFileSync(target, text);
  }
}

if (check) {
  if (differs) {
    console.error(`\n${differs} file(s) in test/house/ do not match the generator.`);
    console.error('Run `node tools/make-test-house.js` and commit the result.');
    process.exit(1);
  }
  console.log('test/house/ matches the generator.');
} else {
  const rooms = project.floors.reduce((n, f) => n + f.rooms.length, 0);
  const items = project.floors.reduce((n, f) => n + f.items.length, 0);
  console.log(`Synthetic test house: ${project.floors.length} floors, ${rooms} rooms, ${items} items`);
  console.log(`  ${OUT}`);
}
