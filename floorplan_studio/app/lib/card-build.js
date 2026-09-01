/**
 * Bakes the plan into ONE Lovelace module resource.
 *
 * The output is a self-contained `.js` file that Home Assistant loads as a
 * `module` resource — no HACS, no files copied into `config/www/`, nothing
 * fetched from the internet at runtime. It carries:
 *
 *   - the shared scene libraries, verbatim, the SAME files the editor paints
 *     with and the exporter writes with, and
 *   - the project, library, themes, boundaries, flooring and controls
 *     documents as data.
 *
 * That "verbatim" is the whole point. There is no second renderer for the card
 * to drift from — if a wall is drawn wrong on the dashboard it is drawn wrong
 * in the editor too, which is a bug you can see while you are working instead
 * of one you find on a wall tablet a week later.
 *
 * ## Scoping
 *
 * Each shared library is a UMD wrapper ending in
 * `}(typeof self !== 'undefined' ? self : this, factory))`, which in a browser
 * would attach `PlanScene`, `Shapes` and friends to `window`. Two cards doing
 * that is a name collision waiting to happen, so the bundle wraps everything in
 * an IIFE that declares its own `self`. The UMD wrappers resolve that name to
 * the local object by ordinary lexical scope, and nothing lands on `window`
 * except the custom element itself.
 *
 * ## Size
 *
 * ONE resource serves every floor — the card takes a `floor:` option — because
 * the project document is the bulk of the payload and baking it once per floor
 * would multiply the largest part of the file by five. `trimProject()` drops
 * what the runtime provably never reads.
 */

/* The app, tests, and exporter read the shared renderer libraries verbatim
 * from disk. That keeps the generated card on the same renderer as the editor. */
const fs = require('fs');
const path = require('path');

const LIB_DIR = __dirname;

function readSource(name) {
  return fs.readFileSync(path.join(LIB_DIR, name), 'utf8');
}

/* Order matters: plan-scene resolves the others out of the shared scope when it
 * is first called, so they only have to exist by then, but keeping the
 * dependency order also keeps the bundle readable when something goes wrong in
 * a browser console at 11pm. */
const SHARED = ['shapes.js', 'flooring.js', 'sun.js', 'controls.js', 'lighting.js', 'plan-scene.js'];

/* Keys the card never reads. Editor bookkeeping (undo cursors, selections),
 * import residue (`_legacy`, kept for round-tripping an old spec, which the
 * dashboard has no use for) and per-floor comments. Dropping them is worth
 * roughly a fifth of the payload on a real house. */
const DROP_FLOOR_KEYS = ['_legacy', '_comment', '_notes', '_open_questions', '_source'];
const DROP_ITEM_KEYS = ['_legacy', '_comment'];

function trimProject(project) {
  const out = JSON.parse(JSON.stringify(project));
  delete out._legacy;
  for (const floor of out.floors || []) {
    for (const k of DROP_FLOOR_KEYS) delete floor[k];
    for (const item of floor.items || []) {
      for (const k of DROP_ITEM_KEYS) delete item[k];
      /* An item with no props left is smaller written as nothing at all, and
       * the runtime reads `item.props || {}` everywhere anyway. */
      if (item.props && !Object.keys(item.props).length) delete item.props;
      if (item.name === null) delete item.name;
    }
    for (const room of floor.rooms || []) {
      for (const k of DROP_FLOOR_KEYS) delete room[k];
      for (const k of ['chip_at', 'chip_rotate', 'part_of', 'master', 'dnd', 'keys']) {
        if (room[k] === null || room[k] === 0) delete room[k];
      }
      /* An empty shortcuts array on every room in a five-floor house is a few
       * hundred wasted bytes and no information. The resolver reads
       * `layer.shortcuts || []`. */
      if (Array.isArray(room.shortcuts) && !room.shortcuts.length) delete room.shortcuts;
    }
  }
  return out;
}

/* The library, minus the editor.
 *
 * `props` is the schema for the inspector's form fields — labels, min, max,
 * step. The card never draws a form, and it reads item values straight off
 * `item.props`, so none of that metadata reaches the dashboard. `defaults` DOES
 * ship, because a marker that never set `watt` still has to light its room.
 * On a full library this is about a third of the bundle. */
const KEEP_TYPE_KEYS = [
  'label', 'kind', 'category', 'group', 'render', 'states', 'domains',
  'defaults', 'onRule', 'offStates', 'channels', 'aboveDaylight', 'thresholds',
];

function trimLibrary(library) {
  const types = {};
  for (const [k, t] of Object.entries(library.types || {})) {
    const keep = {};
    for (const f of KEEP_TYPE_KEYS) if (t[f] !== undefined) keep[f] = t[f];
    types[k] = keep;
  }
  /* Categories ship: the floor card breaks its counts down by them and prints
   * their labels, so dropping them left it grouping by raw ids. They are a few
   * dozen bytes. */
  return { types, aliases: library.aliases || {}, categories: library.categories || [] };
}

/* Descriptions and design notes are written for whoever is configuring the
 * surfaces in the editor. The card renders none of them.
 *
 * `presets` DO ship, and used not to: a room whose config is `{preset: "logic"}`
 * resolves that preset by name at paint time, so dropping the table left the
 * card quietly showing the default sections instead of the ones the room asked
 * for. `domainActions` ships for the same reason — it is what a tap on a scene
 * resolves through. */
function trimControls(controls) {
  const out = JSON.parse(JSON.stringify(controls));
  delete out._comment; delete out._filter_comment; delete out.filterSchema;
  for (const d of Object.values(out.designs || {})) delete d.description;
  const strip = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const k of Object.keys(node)) {
      if (k.startsWith('_')) delete node[k];
      else strip(node[k]);
    }
  };
  strip(out);
  return out;
}

/* The card draws floors, so it needs every finish and its options. It does not
 * EDIT them, so it needs nothing that exists to drive the editor's form:
 * `generatorOptions` describes which controls to show for each generator, and
 * the `_comment` blocks are for whoever opens the JSON. This document shipped
 * untrimmed until now, so the prose went to every dashboard viewer too. */
function trimFlooring(flooring) {
  const out = JSON.parse(JSON.stringify(flooring));
  delete out.generatorOptions;
  for (const k of Object.keys(out)) if (k.startsWith('_')) delete out[k];
  for (const t of Object.values(out.types || {})) {
    for (const k of Object.keys(t)) if (k.startsWith('_')) delete t[k];
  }
  return out;
}

/* Only the theme(s) that could actually be selected. Shipping every theme is
 * cheap, but shipping the editor-chrome half of each one is not, and the card
 * never renders chrome. */
function trimThemes(themesDoc) {
  const out = { active: themesDoc.active, themes: {} };
  for (const [id, t] of Object.entries(themesDoc.themes || {})) {
    /* `follows` and `vars` ship: they are what the "follow Home Assistant"
     * theme resolves through at paint time, and dropping them leaves the card
     * wearing the fallback map forever. */
    out.themes[id] = { label: t.label || t.name, plan: t.plan };
    if (t.follows) out.themes[id].follows = t.follows;
    if (t.vars) out.themes[id].vars = t.vars;
  }
  return out;
}

function readShared() {
  return SHARED.map((name) => {
    const src = readSource(name);
    return `/* ===== ${name} ===== */\n${src}`;
  }).join('\n');
}

/**
 * @param docs  {project, library, themes, boundaries, flooring, controls}
 * @param opts  {version}
 * @returns {{name, content, bytes, floors}}
 */
/* Whatever the user wrote in Dashboard → Appearance, with the one thing that
 * has no business in a stylesheet taken out.
 *
 * `</style>` is stripped because the sheet is set through `textContent` on a
 * real `<style>` node — where it would be inert anyway — but the same string is
 * also JSON-encoded into a module, and a value that can close its own context
 * in ANY reader is worth removing once rather than reasoning about twice. */
function userCss(project) {
  const css = ((project || {}).dashboard || {}).css;
  if (!css || typeof css !== 'string') return '';
  const clean = css.replace(/<\/?(style|script)[^>]*>/gi, '');
  return `\n\n/* ---- your own CSS, from Dashboard -> Appearance ---- */\n${clean}\n`;
}

function elementTypes(resourceKey) {
  const key = String(resourceKey || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  if (!key) return {
    plan: 'custom:fps-floorplan-card',
    house: 'custom:fps-house-card',
    floor: 'custom:fps-floor-card',
  };
  return {
    plan: `custom:fps-${key}-floorplan-card`,
    house: `custom:fps-${key}-house-card`,
    floor: `custom:fps-${key}-floor-card`,
  };
}

function build(docs, opts) {
  opts = opts || {};
  const data = {
    generatedAt: new Date().toISOString(),
    version: opts.version || '0',
    project: trimProject(docs.project),
    library: trimLibrary(docs.library),
    themes: trimThemes(docs.themes),
    boundaries: docs.boundaries,
    flooring: trimFlooring(docs.flooring),
    controls: trimControls(docs.controls),
  };

  /* The plan card first — it is the one that registers `window.customCards`,
   * which the overview cards then push onto. */
  const runtime = ['card-runtime.js', 'card-overview.js']
    .map((f) => readSource(f).replace(/^\/\* eslint-disable no-undef \*\/$/m, ''))
    .join('\n\n');
  const css = require('./card-css.js');

  /* The banner is the card's only chance to say what it is. This file gets
   * copied out of dashboards, pasted into forum posts and committed to other
   * people's config repos, detached from LICENSE and NOTICE — so the licence
   * line and the SPDX tag travel in the bytes themselves. That is Apache-2.0
   * §4(d)'s "within a display generated by the Derivative Works" placement,
   * and it costs four lines. */
  /* The project name is user text going into a comment, so a name containing a
   * comment terminator would close the banner early and drop the licence line
   * (and the rest of the comment) into executable position. One replace, once,
   * here — newlines too, since they would break the ` * ` prefix. */
  const bannerName = String(docs.project.name || 'untitled').replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');
  let content = [
    '/* fps-floorplan-card — generated by the Floorplan Studio app.',
    ` * ${data.generatedAt} · project "${bannerName}"`,
    ' *',
    ' * Regenerated in full every time you press Generate dashboard. Editing this',
    ' * file by hand works exactly once.',
    ' *',
    ' * Floorplan Studio — Copyright 2026 Karthik Babu.',
    ' * Licensed under the Apache License, Version 2.0.',
    ' * http://www.apache.org/licenses/LICENSE-2.0',
    ' * SPDX-License-Identifier: Apache-2.0',
    ' *',
    ' * The house plan baked in below is your own data, not part of the licensed',
    ' * work. Your CSS, if you added any, is likewise yours.',
    ' */',
    '(function () {',
    "  'use strict';",
    '  /* Shadows the global `self` so the UMD wrappers below attach their exports',
    '   * here instead of to window. Nothing but the custom element escapes. */',
    '  const self = {};',
    readShared(),
    '  const Shapes = self.Shapes, Flooring = self.Flooring, SunModel = self.SunModel;',
    '  const Controls = self.Controls, Lighting = self.Lighting, PlanScene = self.PlanScene;',
    '  const FPS_DATA = ' + JSON.stringify(data) + ';',
    /* The user's own stylesheet, appended so it wins on equal specificity.
     *
     * It is CSS and only CSS — it lands inside each card's shadow root, so it
     * cannot reach the rest of the dashboard, and there is nowhere for a script
     * to go. That containment is the reason this is safe to offer at all: the
     * old dashboard's glass look was `card_mod` reaching into other people's
     * elements, and this cannot. */
    '  const FPS_CARD_CSS = ' + JSON.stringify(css + userCss(docs.project)) + ';',
    runtime,
    '}());',
    '',
  ].join('\n');

  const types = elementTypes(opts.resourceKey);
  if (opts.resourceKey) {
    content = content
      .replaceAll('fps-floorplan-card', types.plan.slice('custom:'.length))
      .replaceAll('fps-house-card', types.house.slice('custom:'.length))
      .replaceAll('fps-floor-card', types.floor.slice('custom:'.length));
  }

  return {
    name: types.plan.slice('custom:'.length) + '.js',
    content,
    elementTypes: types,
    /* The app's Node runtime reports the actual UTF-8 payload size. */
    bytes: Buffer.byteLength(content, 'utf8'),
    floors: (docs.project.floors || []).map((f) => ({ id: f.id, name: f.name })),
  };
}

module.exports = { build, readSource, trimProject, trimThemes, trimLibrary, trimControls, trimFlooring, userCss, elementTypes, SHARED };
