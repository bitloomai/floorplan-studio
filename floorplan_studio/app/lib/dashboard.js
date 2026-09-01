/**
 * Turns the project into a Lovelace dashboard config.
 *
 * One dashboard, one view per floor, tabs across the top. Each view carries:
 *
 *   1. the HOUSE card    — `custom:fps-house-card`, identical on every tab, so
 *                          the headline numbers are wherever you happen to be
 *   2. the live PLAN     — `custom:fps-floorplan-card`
 *   3. the FLOOR card    — `custom:fps-floor-card`, how much of this floor is
 *                          active, broken down by class
 *   4. scenes and shortcuts, as native glance rows
 *
 * Everything on it is derived from the markers already placed on the plan.
 * There is no hand-maintained entity list anywhere in this file, which is the
 * point: adding a camera to the plan puts it in the counts, and deleting one
 * takes it out, without a second place to remember.
 *
 * ## Why two custom cards rather than glance + markdown
 *
 * A `glance` card is native and tappable but cannot count. A `markdown` card
 * can count — a Jinja template is the only arithmetic Lovelace offers without a
 * custom element — but its content is sanitised down to bare text, so nothing
 * in it can ever be pressed and no styling survives.
 *
 * Pairing them meant every tab carried two cards each doing half a job, and the
 * counts were the half you could not touch. The house and floor cards do both:
 * live arithmetic AND a working tap. Glance rows are still used for the two
 * things they are genuinely best at — a row of scenes and a row of shortcuts,
 * where Home Assistant's own more-info and long-press come for free.
 */

'use strict';

/* The logic layer on the dashboard.
 *
 * Two rows, split the way a person thinks about them: the things you TRIGGER
 * (scenes, scripts, buttons) and the things you CHECK OR SET (automations,
 * helpers, and any other entity the house made a shortcut of). Both are built
 * from what the plan already carries — the user's shortcuts on the house, the
 * floor and its rooms, plus any logic marker standing in a room — so there is
 * no list to maintain here either.
 *
 * Split by DOMAIN, not by any meaning of ours: the builder does not know what a
 * do-not-disturb is, and a dashboard that sorted by house vocabulary would be
 * sorting by a vocabulary it made up. */
const TRIGGER_DOMAINS = ['scene', 'script', 'button', 'input_button'];

const uniq = (a) => [...new Set(a.filter(Boolean))];
const domainOf = (e) => String(e || '').split('.')[0];

function itemsOf(floors) {
  return floors.flatMap((f) => (f.items || []).map((i) => Object.assign({ _floor: f.id }, i)));
}

/* Every shortcut that applies anywhere in this scope. Reads the old spec
 * format's `dnd` and `ac_boost` fields through the same door, so an imported
 * plan reaches the dashboard without either becoming a concept here. */
function shortcutsOf(project, floors) {
  const out = [];
  const push = (layer, level) => {
    if (!layer) return;
    for (const s of layer.shortcuts || []) if (s && s.entity) out.push({ entity: s.entity, label: s.label, level });
    if (layer.dnd) out.push({ entity: layer.dnd, label: 'Do not disturb', level });
    for (const x of layer.boost || []) if (x && x.entity) out.push({ entity: x.entity, label: x.label, level });
  };
  push(project, 'house');
  for (const f of floors) {
    push(f, 'floor');
    for (const r of f.rooms || []) push(r, 'room');
  }
  return out;
}

/* @param trigger  true for the things you fire, false for the ones you check */
function logicEntities(project, floors, trigger) {
  const want = (e) => TRIGGER_DOMAINS.includes(domainOf(e)) === trigger;
  const ids = shortcutsOf(project, floors).map((s) => s.entity).filter(want);
  for (const i of itemsOf(floors)) {
    if ((i.kind || '') !== 'logic' || !i.entity) continue;
    if (want(i.entity)) ids.push(i.entity);
  }
  return uniq(ids);
}

function entitiesByType(items, types, kind) {
  return uniq(items
    .filter((i) => (kind ? (i.kind || 'device') === kind : true) && types.includes(i.type) && i.entity)
    .map((i) => i.entity));
}

/* --------------------------------------------------------------- glance */

function glanceCard(title, entities, opts) {
  opts = opts || {};
  if (!entities.length) return null;
  return {
    type: 'glance',
    title,
    show_state: true,
    show_name: true,
    columns: Math.min(entities.length, opts.columns || 5),
    state_color: true,
    entities: entities.map((e) => ({ entity: e })),
  };
}

/* ------------------------------------------------- house card defaults */

/* What a brand-new project's house card shows before anybody configures it.
 *
 * Derived from the plan, like everything else here: a count chip appears for a
 * class the house actually has. A house with no ACs does not get an AC chip
 * that reads 0 of 0 forever. Once `project.dashboard.house` exists these are
 * not consulted again — the card is the user's from then on. */
const DEFAULT_COUNTS = [
  { icon: 'bulb', label: 'lights', kinds: ['fixture'], mode: 'on' },
  { icon: 'fanBlades', label: 'fans', types: ['fan', 'fan_exhaust'] },
  { icon: 'snowflake', label: 'AC', types: ['ac', 'ac_window', 'ac_cassette'] },
  { icon: 'flame', label: 'heat', types: ['geyser', 'heater', 'boiler', 'floor_heating'] },
  { icon: 'screen', label: 'screens', types: ['tv', 'stb', 'console'] },
  { icon: 'camera', label: 'cameras', types: ['camera', 'doorbell'] },
  { icon: 'motion', label: 'motion', types: ['pir', 'occupancy'] },
];

/* A stat is a live number, so it needs a marker that reports one. */
const DEFAULT_STATS = [
  { icon: 'energy', label: 'now', types: ['energy_meter'], format: 'power', signed: true, name: 'Home power' },
  { icon: 'solar', label: 'solar', types: ['solar', 'inverter'], format: 'power', name: 'Solar now' },
  { icon: 'droplet', label: 'tank', types: ['water'], format: 'raw', name: 'Tank level' },
  { icon: 'power', label: 'battery', types: ['battery'], format: 'percent', name: 'Battery' },
];

function defaultCounts(all) {
  const out = [];
  for (const c of DEFAULT_COUNTS) {
    const entities = c.kinds
      ? uniq(all.filter((i) => c.kinds.includes(i.kind || 'fixture') && i.entity).map((i) => i.entity))
      : entitiesByType(all, c.types, null);
    if (!entities.length) continue;
    out.push({ icon: c.icon, label: c.label, entities, mode: c.mode });
  }
  return out;
}

function defaultStats(all) {
  const out = [];
  for (const s of DEFAULT_STATS) {
    const entity = entitiesByType(all, s.types, null)[0];
    if (!entity) continue;
    out.push({ icon: s.icon, label: s.label, entity, format: s.format, signed: s.signed, name: s.name });
  }
  return out;
}

/* --------------------------------------------------------------- build */

/**
 * @param project  the builder's project document
 * @param opts     {title, urlPath, icon, cardType, includeHouse, includeFloor}
 */
function build(project, opts) {
  opts = opts || {};
  const floors = (project.floors || []).filter((f) => !f.hidden);
  if (!floors.length) throw new Error('the project has no floors to put on a dashboard');
  const tabStyle = opts.tabStyle || ((project.dashboard || {}).tabStyle) || 'icons';

  const cardTypes = opts.cardTypes || {};
  const cardType = cardTypes.plan || opts.cardType || 'custom:fps-floorplan-card';
  const all = itemsOf(floors);
  const sunCfg = project.sun || {};
  const sun = {
    entity: sunCfg.sunEntity || 'sun.sun',
    weather: (sunCfg.weather && sunCfg.weather.entity) || null,
  };

  /* The house header, identical on every tab so the headline numbers are
   * wherever you happen to be. One card rather than the old glance + markdown
   * pair: a glance cannot count and a markdown card cannot be tapped, and the
   * two halves of one thought should not be two cards. */
  const houseCard = { type: cardTypes.house || 'custom:fps-house-card' };

  /* Seeded from the plan the first time, so a new project has something on it
   * rather than an empty strip — and then it is the user's. */
  if (!(project.dashboard || {}).house) {
    houseCard.title = project.name || 'Home';
    if (sun.weather) houseCard.weather = sun.weather;
    houseCard.counts = defaultCounts(all);
    houseCard.stats = defaultStats(all);
  }

  const views = floors.map((f) => {
    const cards = [];
    if (opts.includeHouse !== false) cards.push(houseCard);
    cards.push({ type: cardType, floor: f.id, title: f.name || f.id });
    if (opts.includeFloor !== false) {
      cards.push({ type: cardTypes.floor || 'custom:fps-floor-card', floor: f.id });
      /* Scenes and shortcuts stay native glance rows: they are lists of things
       * to press, which is the one job a glance card does well, and keeping
       * them native means Home Assistant's own more-info and long-press work
       * without this app reimplementing either. */
      const scenes = glanceCard('Scenes & scripts', logicEntities(project, [f], true), { columns: 4 });
      if (scenes) cards.push(scenes);
      const logic = glanceCard('Shortcuts', logicEntities(project, [f], false), { columns: 4 });
      if (logic) cards.push(logic);
    }

    const view = {
      title: f.name || f.id,
      path: slug(f.id),
      /* A panel view gives the plan the full width. The stack inside it is what
       * keeps the glance cards attached to the plan they describe — a masonry
       * view would reflow them into a column beside it at the first wide
       * breakpoint, which puts "Ground Floor snapshot" next to the first floor. */
      panel: true,
      cards: [{ type: 'vertical-stack', cards }],
    };
    /* Lovelace uses the title as the visible tab label only when no icon is
     * present. Keep both choices explicit: names are useful for an unfamiliar
     * house, while compact icons suit a wall tablet and a five-floor home. */
    if (tabStyle !== 'names') view.icon = floorIcon(f, floors);
    return view;
  });

  return {
    title: opts.title || project.name || 'Home plan',
    views,
    /* Not a strategy dashboard and not editable-in-place: regenerating from the
     * app overwrites this whole config, and a note in the file is the only
     * warning anyone gets before their hand-edit disappears. */
    _generated_by: 'floorplan-studio',
    _generated_at: new Date().toISOString(),
  };
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'floor';
}

/* A tab icon.
 *
 * The floor's own `icon` wins — unless it is `mdi:floor-plan`, which is what
 * the editor stamps on every floor it creates. Five identical tabs is worse
 * than no icons at all, so the generic placeholder is treated as "nobody
 * chose", and anything the user actually picked is honoured. Ordered by level
 * where levels are set, because "which floor is this" is the only thing the
 * icon has to answer. */
const GENERIC_ICON = 'mdi:floor-plan';

function floorIcon(floor, floors) {
  if (floor.icon && floor.icon !== GENERIC_ICON) return floor.icon;
  const name = String(floor.name || floor.id).toLowerCase();
  if (/terrace|roof/.test(name)) return 'mdi:home-roof';
  if (/deck|balcon/.test(name)) return 'mdi:binoculars';
  if (/base|cellar|under/.test(name)) return 'mdi:home-floor-b';
  const levelled = floors.filter((f) => typeof f.level_ft === 'number').sort((a, b) => a.level_ft - b.level_ft);
  const idx = levelled.indexOf(floor);
  const byIndex = ['mdi:home-floor-g', 'mdi:home-floor-1', 'mdi:home-floor-2', 'mdi:home-floor-3'];
  return byIndex[idx] || 'mdi:floor-plan';
}

/* Every entity the generated dashboard names, so the caller can check they all
 * exist BEFORE saving over a working dashboard. A typo'd sensor should fail the
 * generate, not show up as a silent zero. */
function boundEntities(project) {
  const all = itemsOf((project.floors || []));
  const ids = new Set();
  /* Every marker with an entity: the floor card counts them all, class by
   * class, so every one of them is named on the dashboard. */
  for (const i of all) if (i.entity) ids.add(i.entity);
  /* Whatever the house card was configured with, or seeded with. */
  const house = (project.dashboard || {}).house;
  if (house) {
    if (house.weather) ids.add(house.weather);
    for (const p of house.people || []) ids.add(p);
    for (const c of house.counts || []) for (const e of c.entities || []) ids.add(e);
    for (const s of house.stats || []) {
      if (s.entity) ids.add(s.entity);
      if (s.valueEntity) ids.add(s.valueEntity);
    }
  } else {
    for (const c of defaultCounts(all)) for (const e of c.entities) ids.add(e);
    for (const s of defaultStats(all)) ids.add(s.entity);
  }
  /* Shortcuts and logic markers are named on the generated dashboard too, so a
   * typo'd scene has to fail the generate rather than appear as a dead tile on
   * a wall tablet. */
  for (const e of logicEntities(project, project.floors || [], true)) ids.add(e);
  for (const e of logicEntities(project, project.floors || [], false)) ids.add(e);
  return [...ids].sort();
}

module.exports = {
  build, boundEntities, slug, logicEntities, shortcutsOf, defaultCounts, defaultStats,
  DEFAULT_COUNTS, DEFAULT_STATS, TRIGGER_DOMAINS,
};
