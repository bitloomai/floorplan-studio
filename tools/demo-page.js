/**
 * demo-page.js — the live demo on the help site, `docs/demo/`.
 *
 * The generated dashboard, running in a browser with nothing behind it: the
 * same card bundle `card-build.js` installs into Home Assistant, built from the
 * invented house in `make-showcase.js`, driven by the stand-in Home Assistant
 * in `demo-hass.js`. `make-docs.js` writes it and `--check` holds it to the
 * renderer, so a change to the cards is a change to the demo the next time the
 * site is generated, and a stale demo fails the suite.
 *
 * The same page is what `make-hero.js` films, with `?capture` switching its
 * clock to virtual time and hiding its controls.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'floorplan_studio', 'app');
const cardBuild = require(path.join(APP, 'lib', 'card-build.js'));
const EntityBindings = require(path.join(APP, 'lib', 'entity-bindings.js'));
const aria = require('./make-showcase.js');
const pkg = require(path.join(ROOT, 'package.json'));
const registry = (name) => require(path.join(APP, 'defaults', name + '.json'));

/* The hour the demo opens at: the sun just down, the living rooms lit. */
const START = '18:20';

const cap = (s) => String(s).replace(/^./, (c) => c.toUpperCase());

/* Every entity the stand-in has to answer for: whatever the plan and the
 * dashboard bind, plus whatever the day itself mentions. */
function entityList(controls) {
  const life = aria.DEMO_LIFE;
  const ids = new Set(EntityBindings.project(aria.project, controls));
  for (const key of ['on', 'attributes', 'cover', 'fixed', 'people', 'scenes']) for (const id of Object.keys(life[key] || {})) ids.add(id);
  for (const key of ['weather', 'solar', 'power', 'battery', 'tank', 'washer']) {
    const block = life[key] || {};
    for (const id of [block.entity, block.remaining].concat(block.also || [])) if (id) ids.add(id);
  }
  return [...ids].sort();
}

/* Home Assistant-style friendly names, from the house's own room names: the
 * room's name, then what is left of the id. A room sheet strips the room's
 * name back off, so "Living room cove" reads "cove" inside its own room. */
function names(ids) {
  const life = aria.DEMO_LIFE;
  const rooms = Object.fromEntries(aria.ROOMS.filter((r) => r.name).map((r) => [r.id, r.name]));
  const byLength = Object.keys(rooms).sort((a, b) => b.length - a.length);
  const WORDS = { tv: 'television', hob: 'induction hob', db: 'distribution board', ev: 'EV charger', ac: 'AC', plate: 'switch plate' };
  const FALLBACK = { light: 'lights', fan: 'fan', climate: 'AC', media_player: 'media', cover: 'drape', camera: 'camera', weather: 'weather' };
  const channels = {};
  for (const it of aria.floor.items) for (const ch of (it.props && it.props.channels) || []) if (ch.entity) channels[ch.entity] = ch.label;
  const out = {};
  for (const id of ids) {
    const [domain, rest] = id.split('.');
    const stem = rest.replace(/^demo_/, '');
    if ((life.scenes || {})[id]) { out[id] = life.scenes[id].name; continue; }
    if (domain === 'person') { out[id] = cap(stem); continue; }
    if (channels[id]) { out[id] = 'Study ' + channels[id].toLowerCase(); continue; }
    const room = byLength.find((r) => stem === r || stem.startsWith(r + '_'));
    const tail = (room ? stem.slice(room.length) : stem).replace(/^_/, '').split('_').map((w) => WORDS[w] || w).join(' ');
    const label = cap(tail || FALLBACK[domain] || domain);
    out[id] = room ? `${rooms[room]} ${label}` : label;
  }
  return out;
}

/* A lamp's draw, so the power reading moves when it goes on. */
function watts(library) {
  const out = {};
  for (const it of aria.floor.items) {
    if (!it.entity || it.entity.split('.')[0] !== 'light') continue;
    const type = library.types[`${it.kind}.${it.type}`] || {};
    const d = type.defaults || {};
    const p = it.props || {};
    out[it.entity] = (out[it.entity] || 0) + (Number(p.watt ?? d.watt) || 8) * (Number(p.count ?? d.count) || 1);
  }
  return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page(data) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Live demo — Floorplan Studio</title>
<meta name="description" content="The dashboard Floorplan Studio generates, for an invented house, running against a stand-in Home Assistant in your browser.">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<style>
/* Home Assistant's own light-theme variables, which the cards read. */
:root{--primary-background-color:#eef1f5;--secondary-background-color:#e3e7ee;--card-background-color:#fff;
  --ha-card-background:#fff;--primary-text-color:#1b1f24;--secondary-text-color:#5f6874;--primary-color:#2f7de1;
  --divider-color:rgba(20,30,45,.12);--ha-card-border-radius:14px;
  --ha-card-box-shadow:0 1px 2px rgba(15,25,45,.06),0 6px 18px rgba(15,25,45,.06);color-scheme:light}
*{box-sizing:border-box}
html,body{margin:0;background:var(--primary-background-color);color:var(--primary-text-color);
  font:14px/1.45 Roboto,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.bar{position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .9rem;padding:.5rem .85rem;
  background:#fff;border-bottom:1px solid var(--divider-color)}
/* Solid, not frosted: a blurred bar over a plan that repaints makes the
   browser re-blur the plan under it on every change. */
.brand{display:flex;align-items:center;gap:.45rem;font-weight:650;white-space:nowrap}
.tag{color:var(--secondary-text-color);font-size:.8rem}
.time{display:flex;align-items:center;gap:.55rem;flex:1 1 16rem;min-width:12rem}
.time output{font:600 1rem/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;min-width:3.2rem}
.time input{flex:1;accent-color:var(--primary-color)}
.bar button,.bar a{font:inherit;font-size:.85rem;padding:.38rem .7rem;border-radius:9px;border:1px solid var(--divider-color);
  background:#fff;color:var(--primary-text-color);cursor:pointer;text-decoration:none;white-space:nowrap}
.bar button[aria-pressed=true]{background:var(--primary-color);color:#fff;border-color:transparent}
.view{display:grid;gap:8px;padding:8px;max-width:1440px;margin:0 auto}
.toast{position:fixed;left:0;right:0;margin:0 auto;bottom:18px;width:max-content;max-width:calc(100vw - 32px);z-index:10000;
  padding:.55rem .9rem;border-radius:10px;background:#1b1f24;color:#fff;font-size:.85rem;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.embed .tag,.embed .back{display:none}
.capture .bar{display:none}
.capture .view{max-width:none}
[hidden]{display:none!important}
</style>
</head><body>
<header class="bar">
  <span class="brand"><img src="../favicon.svg" width="22" height="22" alt="">${esc(aria.project.name)}</span>
  <span class="tag">Live demo — an invented house and a stand-in Home Assistant. Tap lamps, rooms and scenes.</span>
  <label class="time"><output id="clock">${START}</output><input id="time" type="range" min="0" max="1435" step="5" aria-label="Time of day"></label>
  <button id="play" type="button" aria-pressed="false">Play the day</button>
  <button id="reset" type="button">Undo my taps</button>
  <a class="back" href="../index.html">Help</a>
</header>
<main class="view" id="view"></main>
<div class="toast" id="toast" role="status" hidden></div>
<script>window.FPS_DEMO = ${JSON.stringify(data)};</script>
<script src="demo-hass.js"></script>
<script src="aria-dashboard.js"></script>
<script>
(function () {
  'use strict';
  var D = window.FPS_DEMO;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search.slice(1) + '&' + location.hash.slice(1));
  var capture = params.has('capture');
  document.documentElement.classList.toggle('capture', capture);
  document.documentElement.classList.toggle('embed', params.has('embed'));
  var ymd = D.life.date.split('-').map(Number);
  var toMin = function (s) { var p = String(s).split(':').map(Number); return p[0] * 60 + (p[1] || 0); };
  var epochAt = function (min) { return Date.UTC(ymd[0], ymd[1] - 1, ymd[2]) + Math.round(min * 60000); };
  var start = epochAt(toMin(params.get('t') || D.start));
  if (capture) FpsDemo.clock.useVirtualTime(start); else FpsDemo.clock.setHouseTime(start);

  /* Filmed as two screens side by side, both frames share ONE house, so a tap
   * on the phone shows on the desktop too. The first frame to boot makes it. */
  var host = capture && window.parent !== window ? window.parent : null;
  var house = (host && host.FPS_SHARED_HOUSE)
    || FpsDemo.createHouse({ life: D.life, names: D.names, watts: D.watts, entities: D.entities });
  if (host) host.FPS_SHARED_HOUSE = house;
  var make = function (tag, config) { var el = document.createElement(tag); el.setConfig(config); return el; };
  var cards = [
    make('fps-house-card', { type: 'custom:fps-house-card' }),
    make('fps-floorplan-card', { type: 'custom:fps-floorplan-card', floor: D.floor, title: D.floorName }),
    make('fps-floor-card', { type: 'custom:fps-floor-card', floor: D.floor }),
  ];
  $('view').replaceChildren.apply($('view'), cards);
  var push = function () { var h = house.hass(); cards.forEach(function (c) { c.hass = h; }); };
  house.onChange(push);
  push();

  var show = function () {
    var m = Math.floor(house.minute()) % 1440;
    $('clock').value = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    $('time').value = String(m - (m % 5));
  };
  var goTo = function (min) { FpsDemo.clock.setHouseTime(epochAt(((min % 1440) + 1440) % 1440)); house.tick(); push(); show(); };
  $('time').addEventListener('input', function () { goTo(Number($('time').value)); });
  var playing = null;
  $('play').addEventListener('click', function () {
    if (playing) { clearInterval(playing); playing = null; }
    else playing = setInterval(function () { goTo(house.minute() + 4); }, 100);
    $('play').setAttribute('aria-pressed', String(!!playing));
    $('play').textContent = playing ? 'Pause' : 'Play the day';
  });
  $('reset').addEventListener('click', function () { house.reset(); push(); });
  show();
  /* The sun moves on its own; a real dashboard hears about it every few
   * minutes from sun.sun, this one every twenty seconds. */
  if (!capture) setInterval(function () { house.tick(); push(); show(); }, 20000);

  var toastTimer = null;
  document.addEventListener('hass-more-info', function (ev) {
    var id = ev.detail && ev.detail.entityId;
    var st = house.states[id];
    $('toast').textContent = ((st && st.attributes.friendly_name) || id) + ' — ' + (st ? st.state : 'unknown')
      + '. In Home Assistant this opens its details.';
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').hidden = true; }, 2600);
  });

  if (params.get('open')) {
    setTimeout(function () {
      var hit = FpsDemo.find(cards[1].shadowRoot, '.fps-hit[data-target="chip"][data-id="' + params.get('open') + '"]');
      if (hit) FpsDemo.press(hit);
    }, 60);
  }
  window.demo = { house: house, cards: cards, push: push, show: show, goTo: goTo, epochAt: epochAt, toMin: toMin };
}());
</script>
</body></html>
`;
}

/** The files of `docs/demo/`, as published path -> contents. */
function build() {
  const docs = {
    project: aria.project, library: registry('library'), themes: registry('themes'),
    boundaries: registry('boundaries'), flooring: registry('flooring'), controls: registry('controls'),
  };
  /* A fixed stamp, so the committed bundle only changes when what it is built
   * from changes. */
  const bundle = cardBuild.build(docs, { version: pkg.version, generatedAt: `${aria.DEMO_LIFE.date}T00:00:00.000Z` });
  const entities = entityList(docs.controls);
  const data = {
    start: START, floor: aria.floor.id, floorName: aria.floor.name,
    life: aria.DEMO_LIFE, entities, names: names(entities), watts: watts(docs.library),
  };
  return {
    'demo/index.html': page(data),
    'demo/aria-dashboard.js': bundle.content,
    'demo/demo-hass.js': fs.readFileSync(path.join(__dirname, 'demo-hass.js'), 'utf8'),
  };
}

module.exports = { build, START };
