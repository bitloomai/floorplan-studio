#!/usr/bin/env node
/**
 * make-readme-image.js — render the README's hero plan.
 *
 *   node tools/make-readme-image.js            writes docs/hero-plan.svg
 *   node tools/make-readme-image.js --check    regenerates and diffs, no write
 *
 * The picture at the top of the README is not a mockup and not a screenshot
 * someone remembered to retake. It is the renderer's own output, built from the
 * committed synthetic house by the same `plan-scene.js` the editor paints with
 * and the dashboard card ships — so it cannot show a feature that does not
 * exist, and it goes stale only if the renderer changes, at which point
 * regenerating is one command.
 *
 * The committed synthetic house remains the source, for the same reason it is
 * the fixture: nobody's real home belongs in a README. This file curates one
 * of its floors into a showcase rather than publishing the deliberately plain
 * test layout verbatim. Tests need generic Room A/Room B data; a product hero
 * needs a house somebody can imagine living in.
 *
 * Evening, with about half the lights on, because that is the state where the
 * thing the tool actually does — daylight fading, lamp pools, live device
 * state — is visible at all. A plan at noon with everything off is a drawing of
 * some rectangles.
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

const project = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'house', 'test-house.project.json'), 'utf8'));
const floor = structuredClone(project.floors.find((f) => f.id === 'first') || project.floors[0]);

/* Keep the showcase synthetic but make it read as a home rather than a test
 * matrix. Furniture coordinates are TOP-LEFT corners, unlike marker points;
 * keeping that distinction explicit here prevents the old half-outside bed.
 * Every type below is still resolved through library.json and drawn through
 * Shapes, exactly like a user's own project. */
project.name = 'Lumen House';
project.ppf = 24;
project.origin = [30, 30];
project.lighting = { scrim: 0.24, maxWash: 0.48, targetFc: 16 };
project.floors = [floor];
floor.name = 'Main';

const roomBySuffix = (suffix) => floor.rooms.find((r) => r.id.endsWith(suffix));
Object.assign(roomBySuffix('_a'), {
  name: 'Living room', flooring: 'wood_wide', chip_at: [11, 8.3],
});
Object.assign(roomBySuffix('_b'), {
  name: 'Kitchen & dining', flooring: 'tile_large', chip_at: [34, 12.4],
});
Object.assign(roomBySuffix('_c'), {
  name: 'Bedroom', flooring: 'carpet', chip_at: [11, 28.2],
});
Object.assign(roomBySuffix('_d'), {
  name: 'Studio', flooring: 'terrazzo', chip_at: [24, 20.2],
});

const furnish = (id, type, at, props) => ({
  id: `hero_${id}`, kind: 'furniture', type, at, room: null,
  entity: null, name: null, props: props || {},
});

/* The test floor has useful device and lighting coverage. Re-compose only its
 * visible furnishings and remove the three test-only logic markers, which are
 * valuable to the suite but read as unexplained dots in a marketing image. */
floor.items = floor.items.filter((it) => it.kind !== 'furniture' && it.kind !== 'logic');

/* Four lights per room leave breathing room for furniture while preserving
 * the live 1/2 and 2/2 room chips. */
const keepLights = new Set(['first_l1', 'first_l3', 'first_l4', 'first_l6',
  'first_t1', 'first_t2', 'first_l7', 'first_l9', 'first_l8', 'first_l10']);
floor.items = floor.items.filter((it) => it.kind !== 'fixture' || keepLights.has(it.id));

const move = (id, at, props) => {
  const it = floor.items.find((entry) => entry.id === id);
  if (!it) return;
  it.at = at;
  if (props) Object.assign(it.props, props);
};
move('first_l1', [4, 3]);
move('first_l3', [18, 3]);
move('first_l4', [4, 12]);
move('first_l6', [18, 12]);
move('first_fan', [11, 5.7], { blades: 4, sweep: 4.2, variant: 'slim' });
move('first_cam', [42, 2], { rot: 225, fov: 62, range: 10, variant: 'dome' });
move('first_pir', [9, 16], { rot: 180, fov: 72, range: 8 });
move('first_sw', [20.6, 13.7]);
move('first_plug', [23.2, 13.7]);

floor.items.push(
  /* Living room */
  furnish('living_rug', 'rug', [7, 8.5], { w: 8, h: 5 }),
  furnish('living_sofa', 'sofa', [2, 10.4], { w: 6.5, h: 3 }),
  furnish('living_coffee', 'coffee_table', [10, 10.2], { w: 3.5, h: 2 }),
  furnish('living_chair', 'armchair', [16, 9.8], { w: 2.8, h: 2.8 }),
  furnish('living_tv', 'tv_unit', [8.5, 0.7], { w: 5, h: 1.4, shelves: 2 }),
  furnish('living_plant', 'plant', [19.6, 0.8], { w: 1.5, h: 1.5, variant: 'monstera' }),

  /* Kitchen and dining */
  furnish('kitchen_counter', 'counter', [22.7, 0.8], { w: 10, h: 2, sink: true, sinkAt: 0.58 }),
  furnish('kitchen_oven', 'oven', [33.2, 0.8], { w: 2.2, h: 2 }),
  furnish('kitchen_fridge', 'fridge', [40.4, 0.8], { w: 2.8, h: 3 }),
  furnish('dining_table', 'round_table', [34.5, 7.2], { w: 4.8, h: 4.8, seats: 4 }),
  furnish('kitchen_island', 'bar_counter', [24, 7.5], { w: 7, h: 2, seats: 3 }),
  furnish('kitchen_plant', 'plant', [41.5, 12.2], { w: 1.5, h: 1.5, variant: 'fern' }),

  /* Bedroom — all extents remain inside [0,18] x [15,30]. */
  furnish('bedroom_rug', 'rug', [0.8, 20], { w: 8.5, h: 7.5 }),
  furnish('bedroom_bed', 'bed', [1.7, 20.5], { w: 6.6, h: 6.6, faces: 's' }),
  furnish('bedroom_night_left', 'nightstand', [0.4, 18.5], { w: 1.5, h: 1.5 }),
  furnish('bedroom_night_right', 'nightstand', [7.5, 18.5], { w: 1.5, h: 1.5 }),
  furnish('bedroom_dresser', 'dresser', [9.7, 16.1], { w: 3.5, h: 1.6 }),
  furnish('bedroom_wardrobe', 'wardrobe', [14.7, 16.2], { w: 2, h: 6.2 }),
  furnish('bedroom_plant', 'plant', [15.1, 26.7], { w: 1.5, h: 1.5, variant: 'flowering' }),

  /* L-shaped studio */
  furnish('studio_sofa', 'sofa', [19.2, 16.1], { w: 6.5, h: 3 }),
  furnish('studio_console', 'console_table', [27.1, 16.3], { w: 4, h: 1.4 }),
  furnish('studio_desk', 'desk', [31.2, 23.4], { w: 5.2, h: 2.2, drawers: 3 }),
  furnish('studio_chair', 'chair', [33, 26.2], { w: 1.6, h: 1.6, variant: 'office' }),
  furnish('studio_books', 'bookshelf', [40.1, 23.3], { w: 3, h: 1 }),
  furnish('studio_plant', 'plant', [41.6, 27.1], { w: 1.5, h: 1.5, variant: 'potted' }),
);

/* Which lights are on. Named rather than random, so the image is deterministic
 * and a diff means the renderer changed rather than the dice. */
const LIT = /_a1$|_a2$|_b1$|_c1$|_d1$|_ceiling$/;
const states = {};
for (const it of floor.items || []) {
  if (!it.entity) continue;
  const domain = it.entity.split('.')[0];
  if (domain === 'light') {
    states[it.entity] = LIT.test(it.entity)
      ? { state: 'on', attributes: { brightness: 220, rgb_color: [255, 203, 135] } }
      : { state: 'off', attributes: {} };
  } else if (domain === 'fan') {
    states[it.entity] = { state: 'on', attributes: { percentage: 68 } };
  } else if (domain === 'climate') {
    states[it.entity] = { state: 'cool', attributes: { temperature: 24 } };
  } else if (domain === 'camera') {
    states[it.entity] = { state: 'streaming', attributes: {} };
  } else if (domain === 'binary_sensor') {
    states[it.entity] = { state: 'on', attributes: { device_class: 'motion' } };
  } else {
    states[it.entity] = { state: 'off', attributes: {} };
  }
}

const built = scene.build(project, floor, lib, themes.themes.frosted.plan, {
  states, boundaries, flooring,
  when: new Date('2026-08-21T17:05:00Z'),
  /* No animation in a still image: the spin class would just sit there as dead
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
  console.log(`README hero: ${floor.name} floor, ${nodes} nodes, ${built.width}x${built.height}`);
  console.log(`  ${OUT}  (${(svg.length / 1024).toFixed(0)} KB)`);
}
