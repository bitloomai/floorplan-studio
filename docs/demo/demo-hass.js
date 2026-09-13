/**
 * demo-hass.js — a stand-in Home Assistant for the demo house.
 *
 * The live demo on the help site and the README's hero animation both run the
 * REAL generated cards: the same bundle `card-build.js` installs into a
 * dashboard. A card needs a `hass` object to draw and to call services on, and
 * a public web page has no Home Assistant behind it — so this file is one. It
 * is a browser script, loaded before the card bundle, and it talks to nothing:
 * no network, no storage, no real house.
 *
 * Three parts:
 *
 * - THE CLOCK. The plan's daylight, the house card's date and the card's own
 *   timers all read `Date` and `setTimeout`. In the live demo the clock runs in
 *   real time from whatever hour the visitor picks. For the hero it is fully
 *   virtual: `advance(ms)` fires due timers in order and seeks every CSS
 *   animation, so a frame captured twice is the same frame.
 *
 * - THE HOUSE. A day in the house is DATA (`FPS_DEMO.life`, written from
 *   `make-showcase.js`): which lamps are on between which hours, who is away,
 *   when the washer runs. Solar, power, battery and weather are derived from the
 *   hour and from what is on. A service call overrides the schedule for that
 *   entity until the schedule itself next changes it, which is how a lamp
 *   switched off at seven stays off until its evening comes round again.
 *
 * - THE HANDS. `press(el)` sends the pointer events a finger would to an
 *   element inside a card's shadow root, so a scripted tap runs exactly the
 *   code a real tap runs.
 */

(function (root) {
  'use strict';

  /* -------------------------------------------------------------- clock */

  const RealDate = root.Date;
  const clock = { virtual: false, offset: 0, now: 0, perf: 0, timers: new Map(), seq: 1, seen: new WeakMap() };
  const now = () => (clock.virtual ? clock.now : RealDate.now() + clock.offset);

  class DemoDate extends RealDate {
    constructor(...args) { if (args.length) super(...args); else super(now()); }
    static now() { return now(); }
  }
  root.Date = DemoDate;

  function setHouseTime(epoch) {
    if (clock.virtual) clock.now = epoch;
    else clock.offset = epoch - RealDate.now();
  }

  function schedule(fn, ms, every, args) {
    if (typeof fn !== 'function') return 0;
    const id = clock.seq++;
    clock.timers.set(id, { at: clock.perf + Math.max(0, Number(ms) || 0), every, fn, args });
    return id;
  }

  /* From here on nothing moves unless `advance` says so. */
  function useVirtualTime(epoch) {
    clock.virtual = true;
    clock.now = epoch;
    clock.perf = 0;
    root.setTimeout = (fn, ms, ...a) => schedule(fn, ms, 0, a);
    root.setInterval = (fn, ms, ...a) => schedule(fn, ms, Math.max(1, Number(ms) || 1), a);
    root.clearTimeout = (id) => { clock.timers.delete(id); };
    root.clearInterval = (id) => { clock.timers.delete(id); };
    root.requestAnimationFrame = (fn) => schedule(() => fn(clock.perf), 16, 0, []);
    root.cancelAnimationFrame = (id) => { clock.timers.delete(id); };
    try { Object.defineProperty(root.performance, 'now', { configurable: true, value: () => clock.perf }); } catch (e) { /* read-only here */ }
  }

  function allAnimations() {
    const out = new Set();
    const visit = (scope) => {
      if (scope.getAnimations) for (const a of scope.getAnimations()) out.add(a);
      for (const el of scope.querySelectorAll('*')) if (el.shadowRoot) visit(el.shadowRoot);
    };
    visit(root.document);
    return out;
  }

  /* Every running animation, paused at how long it has existed in virtual
   * time — so a fan turns at its real speed and a sheet slides up over its
   * real quarter second, however long the capture takes per frame. */
  function syncAnimations() {
    if (!clock.virtual) return;
    for (const a of allAnimations()) {
      if (!clock.seen.has(a)) clock.seen.set(a, clock.perf);
      try { a.pause(); a.currentTime = clock.perf - clock.seen.get(a); } catch (e) { /* a finished transition */ }
    }
  }

  /* `ms` of animation time; the house clock moves `houseMs` (a time-lapse moves
   * it faster than the fans turn). Due timers fire in order, each seeing the
   * house clock where it would have been. */
  function advance(ms, houseMs) {
    const from = clock.perf; const to = from + ms;
    const h0 = clock.now; const h1 = h0 + (houseMs === undefined ? ms : houseMs);
    for (let guard = 0; guard < 20000; guard++) {
      let pick = null;
      for (const [id, t] of clock.timers) if (t.at <= to && (!pick || t.at < pick.t.at)) pick = { id, t };
      if (!pick) break;
      clock.perf = pick.t.at;
      clock.now = h0 + (h1 - h0) * (ms ? (clock.perf - from) / ms : 1);
      if (pick.t.every) pick.t.at += pick.t.every; else clock.timers.delete(pick.id);
      try { pick.t.fn(...pick.t.args); } catch (e) { console.error(e); }
    }
    clock.perf = to;
    clock.now = h1;
    syncAnimations();
  }

  /* -------------------------------------------------------------- house */

  const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const inSpan = (min, [a, b]) => { const x = toMin(a); const y = toMin(b); return x <= y ? min >= x && min < y : min >= x || min < y; };
  const inAny = (min, spans) => (spans || []).some((s) => inSpan(min, s));
  const domainOf = (id) => String(id).split('.')[0];
  const ON_WORD = { media_player: 'playing', climate: 'cool', cover: 'open', person: 'home', sensor: 'on' };
  const OFF_WORD = { media_player: 'off', climate: 'off', cover: 'closed' };
  const isOn = (st) => !!st && !['off', 'closed', 'idle', 'unavailable', 'unknown', 'not_home', 'standby'].includes(st.state);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = (x) => x * x * (3 - 2 * x);

  function createHouse(spec) {
    const life = spec.life || {};
    const names = spec.names || {};
    const watts = spec.watts || {};
    const entities = spec.entities || [];
    const manual = new Map();          // id -> { st, sched } — a service call, until the schedule moves
    const listeners = new Set();
    let states = {};
    let latency = spec.latency === undefined ? 320 : spec.latency;

    const minuteOf = () => { const d = new RealDate(now()); return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60; };
    const named = (id, attrs) => Object.assign({ friendly_name: names[id] || id }, attrs || {});

    /* What the day says an entity is doing at this minute, before anybody
     * pressed anything. */
    function scheduled(id, min) {
      const d = domainOf(id);
      if (life.people && life.people[id]) {
        const away = (life.people[id].away || []).find((s) => inSpan(min, s));
        return { state: away ? (away[2] || 'not_home') : 'home', attributes: named(id) };
      }
      if (life.cover && life.cover[id]) {
        const hit = life.cover[id].find((s) => inSpan(min, s));
        const pos = hit ? hit[2] : 100;
        return { state: pos > 0 ? 'open' : 'closed', attributes: named(id, { current_position: pos }) };
      }
      const on = inAny(min, (life.on || {})[id]);
      const extra = ((life.attributes || {})[id]) || {};
      if (d === 'light') {
        return on
          ? { state: 'on', attributes: named(id, Object.assign({ brightness: 225, rgb_color: [255, 196, 128], color_mode: 'rgb' }, extra)) }
          : { state: 'off', attributes: named(id) };
      }
      if (d === 'fan') return { state: on ? 'on' : 'off', attributes: named(id, { percentage: on ? (extra.percentage || 60) : 0 }) };
      if (d === 'climate') {
        const t = temperatureAt(min);
        return { state: on ? 'cool' : 'off', attributes: named(id, { temperature: 24, current_temperature: Math.round(t - 3), hvac_action: on ? 'cooling' : 'off' }) };
      }
      if (d === 'scene') return { state: '2026-09-21T06:00:00+00:00', attributes: named(id) };
      if (d === 'script') return { state: 'off', attributes: named(id) };
      if (d === 'binary_sensor') return { state: on ? 'on' : 'off', attributes: named(id, extra) };
      const fixed = (life.fixed || {})[id];
      if (fixed !== undefined) return { state: String(fixed), attributes: named(id, extra) };
      return { state: on ? (ON_WORD[d] || 'on') : (OFF_WORD[d] || 'off'), attributes: named(id, extra) };
    }

    function temperatureAt(min) {
      const w = life.weather || {};
      const lo = w.min === undefined ? 24 : w.min; const hi = w.max === undefined ? 33 : w.max;
      const peak = toMin(w.peak || '15:00');
      const dist = Math.min(Math.abs(min - peak), 1440 - Math.abs(min - peak)) / 720;
      return hi - (hi - lo) * smooth(clamp(dist * 1.35, 0, 1));
    }

    /* The readings that follow from the hour and from what is on. */
    function derive(min, map) {
      const put = (id, state, attrs) => { if (id) map[id] = { state: String(state), attributes: named(id, attrs) }; };
      const w = life.weather || {};
      if (w.entity) {
        const day = inSpan(min, [w.sunrise || '06:10', w.sunset || '18:05']);
        const cloudy = inAny(min, w.cloudy);
        put(w.entity, day ? (cloudy ? 'partlycloudy' : 'sunny') : 'clear-night',
          { temperature: Math.round(temperatureAt(min) * 10) / 10, temperature_unit: '°C' });
      }
      const s = life.solar || {};
      let solar = 0;
      if (s.entity) {
        const a = toMin(s.from || '06:10'); const b = toMin(s.to || '18:00');
        const x = (min - a) / (b - a);
        solar = x > 0 && x < 1 ? Math.round((s.peak || 3200) * Math.pow(Math.sin(Math.PI * x), 1.4) * (inAny(min, w.cloudy) ? 0.55 : 1)) : 0;
        for (const id of [s.entity].concat(s.also || [])) put(id, solar, { unit_of_measurement: 'W', device_class: 'power' });
      }
      const p = life.power || {};
      if (p.entity) {
        let use = p.base || 350;
        for (const [id, st] of Object.entries(map)) {
          if (!isOn(st)) continue;
          const d = domainOf(id);
          if (watts[id]) use += watts[id];
          else if (p.domains && p.domains[d]) use += p.domains[d];
          if (p.entities && p.entities[id]) use += p.entities[id];
        }
        put(p.entity, Math.round(use - solar), { unit_of_measurement: 'W', device_class: 'power' });
      }
      const b = life.battery || {};
      if (b.entity) {
        const points = b.points || [['00:00', 55], ['06:00', 38], ['15:00', 96], ['24:00', 55]];
        let v = points[0][1];
        for (let i = 1; i < points.length; i++) {
          const a = toMin(points[i - 1][0]); const c = toMin(points[i][0]);
          if (min >= a && min <= c) { v = points[i - 1][1] + (points[i][1] - points[i - 1][1]) * smooth((min - a) / (c - a)); break; }
        }
        put(b.entity, Math.round(v), { unit_of_measurement: '%', device_class: 'battery' });
      }
      const tank = life.tank || {};
      if (tank.entity) put(tank.entity, Math.round((tank.from || 74) - ((tank.from || 74) - (tank.to || 61)) * (min / 1440)), { unit_of_measurement: '%' });
      const wash = life.washer || {};
      if (wash.entity) {
        const run = (wash.runs || []).find((r) => inSpan(min, r));
        put(wash.entity, run ? 'running' : 'off');
        if (wash.remaining) {
          const left = run ? Math.max(0, toMin(run[1]) - min) : 0;
          const hh = Math.floor(left / 60); const mm = Math.floor(left % 60);
          put(wash.remaining, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
        }
      }
    }

    function evaluate() {
      const min = minuteOf();
      const next = {};
      for (const id of entities) {
        const sched = scheduled(id, min);
        const m = manual.get(id);
        if (m && m.sched !== sched.state) manual.delete(id);
        next[id] = manual.has(id) ? manual.get(id).st : sched;
      }
      derive(min, next);
      return next;
    }

    function tick() {
      const next = evaluate();
      const changed = JSON.stringify(next) !== JSON.stringify(states);
      states = next;
      if (changed) for (const fn of listeners) fn(states);
      return changed;
    }

    /* ------------------------------------------------------- services */

    function setManual(id, st) {
      const sched = scheduled(id, minuteOf()).state;
      manual.set(id, { st, sched });
    }

    function applyTo(id, service, data) {
      const d = domainOf(id);
      const cur = states[id] || scheduled(id, minuteOf());
      const attrs = Object.assign({}, cur.attributes);
      let turnOn;
      if (/^(turn_on|open_cover|media_play)$/.test(service)) turnOn = true;
      else if (/^(turn_off|close_cover|media_pause|media_stop)$/.test(service)) turnOn = false;
      else if (/^(toggle|media_play_pause)$/.test(service)) turnOn = !isOn(cur);
      if (service === 'set_cover_position') {
        const pos = clamp(Number(data.position) || 0, 0, 100);
        return setManual(id, { state: pos > 0 ? 'open' : 'closed', attributes: Object.assign(attrs, { current_position: pos }) });
      }
      if (turnOn === undefined) return undefined;
      if (d === 'light') {
        if (turnOn) {
          const bri = data.brightness !== undefined ? Number(data.brightness)
            : data.brightness_pct !== undefined ? Math.round(Number(data.brightness_pct) * 2.55) : (attrs.brightness || 225);
          Object.assign(attrs, { brightness: clamp(bri, 1, 255), rgb_color: attrs.rgb_color || [255, 196, 128], color_mode: 'rgb' });
        } else { delete attrs.brightness; delete attrs.rgb_color; }
      }
      if (d === 'fan') attrs.percentage = turnOn ? (data.percentage || attrs.percentage || 60) : 0;
      if (d === 'cover') attrs.current_position = turnOn ? 100 : 0;
      if (d === 'climate') attrs.hvac_action = turnOn ? 'cooling' : 'off';
      return setManual(id, { state: turnOn ? (ON_WORD[d] && d !== 'sensor' && d !== 'person' ? ON_WORD[d] : 'on') : (OFF_WORD[d] || 'off'), attributes: attrs });
    }

    /* A scene or script is a list of what it sets. `light.*` means every
     * light in the house; a later line beats an earlier one. */
    function run(id) {
      const def = (life.scenes || {})[id];
      if (!def) return;
      for (const [pattern, value] of def.set || []) {
        const ids = pattern.endsWith('.*') ? entities.filter((e) => domainOf(e) === pattern.slice(0, -2)) : [pattern];
        for (const e of ids) {
          const v = typeof value === 'string' ? { state: value } : value;
          const service = v.position !== undefined ? 'set_cover_position' : (isOn({ state: v.state }) ? 'turn_on' : 'turn_off');
          applyTo(e, service, v);
        }
      }
    }

    function callService(domain, service, data) {
      data = data || {};
      const ids = [].concat(data.entity_id || []);
      const later = (fn) => (latency ? root.setTimeout(fn, latency) : fn());
      later(() => {
        if (domain === 'scene' || domain === 'script') {
          if (/^(turn_on|toggle)$/.test(service)) ids.forEach(run);
          else run(`script.${service}`);
        } else {
          for (const id of ids) applyTo(id, service, data);
        }
        tick();
      });
      return Promise.resolve();
    }

    function hass() {
      return {
        states,
        themes: { darkMode: false, themes: {} },
        language: 'en',
        locale: { language: 'en', number_format: 'language', time_format: 'language' },
        user: { id: 'demo', name: 'Demo', is_admin: false },
        callService,
        connection: {
          subscribeMessage: () => Promise.resolve(() => {}),
          subscribeEvents: () => Promise.resolve(() => {}),
          sendMessagePromise: () => Promise.resolve({}),
        },
      };
    }

    tick();
    return {
      get states() { return states; },
      hass, tick, callService, run,
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      reset() { manual.clear(); return tick(); },
      set latency(ms) { latency = ms; },
      minute: minuteOf,
    };
  }

  /* -------------------------------------------------------------- hands */

  /* The first match for `selector` anywhere under `scope`, shadow roots
   * included. */
  function find(scope, selector) {
    const hit = scope.querySelector(selector);
    if (hit) return hit;
    for (const el of scope.querySelectorAll('*')) {
      if (el.shadowRoot) {
        const deep = find(el.shadowRoot, selector);
        if (deep) return deep;
      }
    }
    return null;
  }

  function centreOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* A tap: down, up, click, at the element's centre. */
  function press(el) {
    const { x, y } = centreOf(el);
    const init = { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', init));
    el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, init, { buttons: 0 })));
    el.dispatchEvent(new MouseEvent('click', Object.assign({}, init, { buttons: 0 })));
    return { x, y };
  }

  root.FpsDemo = {
    clock: { setHouseTime, useVirtualTime, advance, syncAnimations, now, get virtual() { return clock.virtual; } },
    createHouse, find, press, centreOf,
  };
}(window));
