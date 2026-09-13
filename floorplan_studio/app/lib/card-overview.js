/**
 * The two overview cards: `fps-house-card` and `fps-floor-card`.
 *
 * NOT loaded on its own — `card-build.js` concatenates this into the same
 * Lovelace module as the plan card, so `FPS_DATA`, `Controls`, `PlanScene` and
 * `FPS_CARD_CSS` are already in scope.
 *
 * ## Why these are custom elements and not glance + markdown
 *
 * A `glance` card is native and tappable but cannot count; a `markdown` card can
 * count but is sanitised down to bare text, so nothing in it can be tapped and
 * no styling survives. Using both meant every dashboard carried two cards doing
 * half a job each, and the counts could never be pressed.
 *
 * These do the whole job: live counts, live readouts, and buttons that work.
 *
 * ## Fixed skeleton, configurable contents
 *
 * The HOUSE card is one status bar: the house's name, today's date and the
 * weather on a row you can tap, then what is on, then live readings as pills —
 * with the household beside it as a pill each, face, name and whether they are
 * home. That shape is the hand-built "pulse" hero this app's dashboards
 * replace, kept because it held up on a phone, a tablet and a 4K wall screen:
 * one bar wide, a rail beside the plan in between, a row of three narrow.
 * `counts` (how many of a thing are on), `stats` (a live number) and the
 * house's own `shortcuts` are the user's.
 *
 * The FLOOR card says, in one sentence, what the floor is doing: "9 of 34
 * lights on · 0 of 1 fan running · no motion detected · rainy, sun -64°". The
 * phrases come from the markers on the plan, so a floor that gains a fan gains
 * the fan phrase and nobody maintains a list. `style: "breakdown"` keeps the
 * older layout — a count and a bar per library category.
 */

/* eslint-disable no-undef */

/* Units ride against their number with no space: "+1.79kW", "52.1%". In a pill
 * the value is one token, and a space let a narrow pill break between the
 * number and what it counts. */
const FPS_FMT = {
  /* Watts read as kW past a thousand, because a five-digit number in a chip is
   * a number nobody reads. */
  power(v, unit) {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) > 1000) return (v / 1000).toFixed(2) + 'kW';
    return Math.round(v) + (unit || 'W');
  },
  energy(v, unit) { return isFinite(v) ? v.toFixed(1) + (unit || 'kWh') : '—'; },
  temperature(v, unit) { return isFinite(v) ? Math.round(v) + (unit || '°') : '—'; },
  percent(v) { return isFinite(v) ? Math.round(v) + '%' : '—'; },
  duration(v, unit, raw) {
    const parts = String(raw === undefined || raw === null ? '' : raw).split(':').map(Number);
    if (parts.length >= 2 && parts.every(isFinite)) return Math.max(0, Math.round(parts[0] * 60 + parts[1])) + 'm';
    return isFinite(v) ? Math.max(0, Math.round(v)) + 'm' : '—';
  },
  raw(v, unit, raw) { return raw === undefined || raw === null ? '—' : String(raw) + (unit || ''); },
};
FPS_FMT.kwh = FPS_FMT.energy;

/* "Sun, 13/Sep/26". Fixed English abbreviations rather than a locale formatter,
 * which would render the date in whatever language the viewing browser is set
 * to and change its length with it. */
const FPS_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FPS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fpsShortDate(d) {
  return `${FPS_DAYS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${FPS_MONTHS[d.getMonth()]}/${String(d.getFullYear() % 100).padStart(2, '0')}`;
}

function fpsEl(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

/* A small drawn icon, from the same path set the plan uses. Never a Unicode
 * symbol by default: ⏻ and ⛶ render as tofu boxes on Windows and Android,
 * which is a reported failure rather than a theory. */
function fpsIcon(name, colour, size) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  const s = size || 15;
  svg.setAttribute('viewBox', '-9 -9 18 18');
  svg.setAttribute('width', s);
  svg.setAttribute('height', s);
  svg.setAttribute('class', 'fps-ic');
  for (const node of Shapes.icon(name || 'dot', 0, 0, colour || 'currentColor', 1)) {
    const e = document.createElementNS(NS, node.tag);
    for (const [k, v] of Object.entries(node.attrs || {})) if (v !== undefined && v !== null) e.setAttribute(k, v);
    svg.appendChild(e);
  }
  return svg;
}

/* What leads a count or a pill. A `glyph` is the user's own choice of
 * character — an emoji renders everywhere a dashboard does — and wins over the
 * drawn `icon`, which stays the default for the reason above. */
function fpsMark(spec, size) {
  if (spec && spec.glyph) return fpsEl('span', 'fps-glyph', spec.glyph);
  return fpsIcon(spec && spec.icon, 'currentColor', size);
}

/* Shared by both cards: everything the plan binds, so a count over "the whole
 * house" means the house that is drawn rather than the house that exists. */
function fpsItemsOf(floors) {
  return floors.flatMap((f) => (f.items || []).map((i) => Object.assign({ _floor: f.id }, i)));
}

/* Whether one entity counts as "on".
 *
 * The domain registry answers this correctly for every domain — a climate
 * entity is on when it is not `off`, a cover when it is not `closed`. A chip
 * may still override it, because "how many ACs are doing something" and "how
 * many ACs are heating" are different questions about the same entities. */
function fpsIsOn(states, id, mode) {
  if (!mode) return Controls.isOn(id, states, FPS_DATA.controls);
  const st = states[id];
  return !!st && Controls.onByRule({ onRule: mode }, st.state);
}

/* A chip that only exists while something is true — the washing machine that
 * appears while it is running and goes away when it stops. Without this a
 * dashboard grows a permanent row of chips reading "off". */
function fpsShown(spec, states) {
  const w = spec.showWhen;
  if (!w) return true;
  const st = states[w.entity || spec.entity];
  if (!st) return false;
  if (w.is) return [].concat(w.is).includes(st.state);
  if (w.not) return ![].concat(w.not).includes(st.state);
  return !['off', 'idle', 'unavailable', 'unknown'].includes(st.state);
}

/* One count chip's population. Three ways to name it, in order of how much
 * maintenance they cost you:
 *
 *   types    marker types on the plan     — nothing to maintain, follows the plan
 *   domain   every entity of a domain     — follows Home Assistant
 *   entities a hand-written list          — for the stubborn cases
 */
function fpsCountEntities(chip, states, floors) {
  const out = new Set();
  if (chip.types) {
    for (const i of fpsItemsOf(floors)) {
      if (!i.entity) continue;
      if (chip.types.includes(i.type) || chip.types.includes(i.kind + '.' + i.type)) out.add(i.entity);
    }
  }
  if (chip.domain) {
    for (const id of Object.keys(states)) {
      if (id.split('.')[0] !== chip.domain) continue;
      /* A light group and its members would otherwise both count, and "9 of 5
       * lights on" is worse than no number at all. */
      if (chip.skipGroups && (states[id].attributes || {}).entity_id) continue;
      out.add(id);
    }
  }
  for (const id of chip.entities || []) out.add(id);
  return [...out];
}

function fpsMoreInfo(node, entityId) {
  if (!entityId) return;
  const ev = new Event('hass-more-info', { bubbles: true, composed: true });
  ev.detail = { entityId };
  node.dispatchEvent(ev);
}

/* ------------------------------------------------------------- house card */

class FpsHouseCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sig = null;
  }

  static getStubConfig() { return { type: 'custom:fps-house-card' }; }

  setConfig(config) {
    this._config = config || {};
    this._built = false;
    this._sig = null;
  }

  /* Two rows of chips at most. Claiming more pushes the plan below the fold on
   * a phone, which is the one thing this card must not do. */
  getCardSize() { return 2; }

  set hass(hass) { this._hass = hass; this.render(); }

  cfg() {
    const d = (FPS_DATA.project.dashboard || {}).house || {};
    return Object.assign({}, d, this._config || {});
  }

  watched(cfg, states) {
    const ids = new Set();
    if (cfg.weather) ids.add(cfg.weather);
    for (const p of cfg.people || []) ids.add(p);
    for (const c of cfg.counts || []) {
      for (const e of fpsCountEntities(c, states, FPS_DATA.project.floors || [])) ids.add(e);
      if (c.showWhen && c.showWhen.entity) ids.add(c.showWhen.entity);
    }
    for (const s of cfg.stats || []) {
      if (s.entity) ids.add(s.entity);
      if (s.valueEntity) ids.add(s.valueEntity);
      /* The gate entity is watched too, or a chip that appears when the washer
       * starts would not appear until something else changed. */
      if (s.showWhen && s.showWhen.entity) ids.add(s.showWhen.entity);
    }
    for (const s of Controls.shortcuts(FPS_DATA.controls, FPS_DATA.project, null, null)) {
      if (s.state) ids.add(s.state);
      if (s.entity) ids.add(s.entity);
    }
    return [...ids];
  }

  render() {
    if (!this._config || !this._hass) return;
    const states = this._hass.states || {};
    const cfg = this.cfg();
    const ids = this.watched(cfg, states);
    /* The date is part of what is drawn, so it is part of the signature: a
     * card left open overnight would otherwise keep yesterday's until
     * something in the house changed. A person's picture too, which Home
     * Assistant can swap without the state moving. */
    const sig = new Date().toDateString() + '|' + ids.map((id) => {
      const st = states[id] || {};
      return id + '=' + (st.state || '?') + (id.startsWith('person.') ? '@' + ((st.attributes || {}).entity_picture || '') : '');
    }).join('|');
    if (sig === this._sig) return;
    this._sig = sig;

    if (!this._built) {
      const style = fpsEl('style');
      style.textContent = FPS_CARD_CSS;
      this._root = fpsEl('div', 'fps-house');
      this.shadowRoot.replaceChildren(style, this._root);
      this._built = true;
    }
    this._root.replaceChildren();

    /* The glass is on the SHELL, not on the whole card: the people sit beside
     * it as pills of their own, the way they did on the hero this replaces.
     * The shell carries `fps-card`, so a house's own card CSS still lands on
     * the part that looks like a card. */
    const shell = fpsEl('div', 'fps-card fps-house-shell');

    /* --- the fixed half: which house, which day, what it is like outside --- */
    const head = fpsEl('button', 'fps-house-head');
    head.type = 'button';
    head.appendChild(fpsEl('span', 'fps-house-title', cfg.title || FPS_DATA.project.name || 'Home'));
    if (cfg.showDate !== false) head.appendChild(fpsEl('span', 'fps-house-date', '· ' + fpsShortDate(new Date())));
    const wx = cfg.weather && states[cfg.weather];
    if (wx) {
      const w = fpsEl('span', 'fps-house-wx');
      const glyph = (cfg.weatherIcons || {})[wx.state];
      w.appendChild(glyph ? fpsEl('span', 'fps-glyph', glyph) : fpsIcon(this.skyIcon(wx.state), 'currentColor', 17));
      if (cfg.weatherText) w.appendChild(fpsEl('span', 'fps-wx-state', String(wx.state).replace(/[-_]/g, ' ')));
      const t = wx.attributes && wx.attributes.temperature;
      if (cfg.showTemperature !== false && t !== undefined && t !== null) {
        w.appendChild(fpsEl('span', 'fps-wx-temp', Math.round(t) + (wx.attributes.temperature_unit || '°')));
      }
      head.appendChild(w);
      head.title = `Weather: ${String(wx.state).replace(/[-_]/g, ' ')} — tap for details`;
    }
    head.addEventListener('click', () => this.moreInfo(cfg.weather));
    shell.appendChild(head);

    /* --- what is on: counts, as a line of text ---
     *
     * A count is an aggregate, so it reads as text rather than as a row of
     * pills; the pills below are single readings. Each is still a button —
     * tapping one opens the first thing it counted, because something that
     * looks like information and does nothing when pressed reads as broken. */
    const countRow = fpsEl('div', 'fps-counts');
    for (const c of cfg.counts || []) {
      let list = fpsCountEntities(c, states, FPS_DATA.project.floors || []);
      if (c.excludeUnavailable) {
        list = list.filter((id) => states[id] && !['unknown', 'unavailable'].includes(states[id].state));
      }
      if (!list.length || !fpsShown(c, states)) continue;
      const on = list.filter((id) => fpsIsOn(states, id, c.mode)).length;
      if (c.hideWhenZero && !on) continue;
      if (countRow.children.length) countRow.appendChild(fpsEl('span', 'fps-sep', '·'));
      const chip = fpsEl('button', 'fps-cnt' + (on ? ' on' : ''));
      chip.type = 'button';
      chip.appendChild(fpsMark(c, 13));
      chip.appendChild(fpsEl('span', 'fps-chip-n', c.total === false ? String(on) : `${on}/${list.length}`));
      if (c.label) chip.appendChild(fpsEl('span', 'fps-chip-l', c.label));
      chip.title = `${c.label || c.domain || 'items'}: ${on} of ${list.length} on`;
      chip.addEventListener('click', () => this.moreInfo(list.find((id) => fpsIsOn(states, id, c.mode)) || list[0]));
      countRow.appendChild(chip);
    }
    if (countRow.children.length) shell.appendChild(countRow);

    /* --- live readings, as pills --- */
    const chips = fpsEl('div', 'fps-chips');
    for (const s of cfg.stats || []) {
      /* Usually one entity supplies both the displayed value and the details
       * dialog. A running appliance is the useful exception: show its
       * remaining-time sensor, but open the appliance itself when pressed. */
      const valueEntity = s.valueEntity || s.entity;
      const st = valueEntity && states[valueEntity];
      if (!st && s.hideWhenMissing !== false) continue;
      const unavailable = !!st && ['unknown', 'unavailable'].includes(st.state);
      if (unavailable && s.hideWhenUnavailable) continue;
      if (!fpsShown(s, states)) continue;
      const raw = st ? st.state : null;
      const num = parseFloat(raw);
      const unit = (st && st.attributes && st.attributes.unit_of_measurement) || s.unit;
      const fmt = FPS_FMT[s.format] || FPS_FMT.raw;
      let text = !st || unavailable ? '—' : fmt(num, unit, raw);
      if (s.signed && isFinite(num) && num >= 0 && text !== '—') text = '+' + text;
      if (s.prefix) text = s.prefix + ' ' + text;
      if (s.suffix) text += ' ' + s.suffix;
      /* `tone` marks a pill that is saying something is happening — the
       * washer mid-cycle — in the same warm the plan uses for "on". */
      const chip = fpsEl('button', 'fps-chip fps-stat' + (s.signed && num < 0 ? ' neg' : '') + (s.tone ? ' tone-' + s.tone : ''));
      chip.type = 'button';
      chip.appendChild(fpsMark(s, 13));
      if (s.label) chip.appendChild(fpsEl('span', 'fps-chip-l', s.label));
      chip.appendChild(fpsEl('span', 'fps-chip-n', text));
      chip.title = (s.name || s.entity || '') + ' — tap for details';
      chip.addEventListener('click', () => this.moreInfo(s.entity));
      chips.appendChild(chip);
    }

    /* The house's own shortcuts, as buttons. Same list the room panels use, so
     * a goodnight scene is written once and reachable from both. */
    for (const s of Controls.shortcuts(FPS_DATA.controls, FPS_DATA.project, null, null)) {
      if (s.slot === 'header' || s.section === 'house' || cfg.showAllShortcuts) {
        const state = s.state || s.entity;
        const btn = fpsEl('button', 'fps-chip fps-chip-action' + (state && fpsIsOn(states, state) ? ' on' : ''));
        btn.type = 'button';
        if (s.icon || s.glyph) btn.appendChild(fpsMark(s, 13));
        btn.appendChild(fpsEl('span', 'fps-chip-l', s.label || s.id));
        btn.addEventListener('click', () => this.run(s));
        chips.appendChild(btn);
      }
    }
    if (chips.children.length) shell.appendChild(chips);
    this._root.appendChild(shell);

    /* --- who is home ---
     *
     * A face, a first name and a word, with a dot that is green at home and
     * red away. A person with no picture gets their initial rather than an
     * empty circle. One that Home Assistant does not know is still drawn,
     * reading "unavailable", so a typo'd id says so instead of vanishing. */
    const people = cfg.people || [];
    this._root.classList.toggle('no-people', !people.length);
    if (people.length) {
      const row = fpsEl('div', 'fps-people');
      row.setAttribute('aria-label', 'Household presence');
      for (const p of people) {
        const st = states[p];
        const attrs = (st && st.attributes) || {};
        const friendly = String(attrs.friendly_name || p.split('.').pop().replace(/_/g, ' ')).trim();
        const status = st ? st.state : 'unavailable';
        const home = status === 'home';
        const chip = fpsEl('button', 'fps-person' + (home ? ' home' : ''));
        chip.type = 'button';
        const avatar = fpsEl('span', 'fps-avatar');
        if (attrs.entity_picture) {
          const img = document.createElement('img');
          img.src = attrs.entity_picture;
          img.alt = friendly;
          avatar.appendChild(img);
        } else {
          avatar.appendChild(fpsEl('span', 'fps-initial', friendly.charAt(0).toUpperCase()));
        }
        avatar.appendChild(fpsEl('span', 'fps-presence'));
        chip.appendChild(avatar);
        const copy = fpsEl('span', 'fps-person-copy');
        copy.appendChild(fpsEl('span', 'fps-person-name', friendly.split(/\s+/)[0]));
        copy.appendChild(fpsEl('span', 'fps-person-state', home ? 'Home' : String(status).replace(/_/g, ' ')));
        chip.appendChild(copy);
        chip.title = `${friendly} · ${status}`;
        chip.setAttribute('aria-label', `${friendly}: ${status}`);
        chip.addEventListener('click', () => this.moreInfo(p));
        row.appendChild(chip);
      }
      this._root.appendChild(row);
    }
  }

  /* Weather states are Home Assistant's own vocabulary, so the mapping is fixed
   * rather than configurable — but it falls back to a cloud, never to nothing.
   * `weatherIcons` on the card replaces it with the house's own glyphs. */
  skyIcon(state) {
    const s = String(state || '');
    if (/pour|rain|hail/.test(s)) return 'droplet';
    if (/snow/.test(s)) return 'snowflake';
    if (/lightning/.test(s)) return 'energy';
    if (/wind/.test(s)) return 'fanBlades';
    if (/fog/.test(s)) return 'dot';
    if (/clear-night/.test(s)) return 'dot';
    if (/sunny|clear/.test(s)) return 'bulb';
    return 'dot';
  }

  run(shortcut) {
    const call = Controls.shortcutCall(shortcut, FPS_DATA.controls);
    if (!call) return;
    if (shortcut.confirm && !window.confirm(`${shortcut.label || 'This'} — run it?`)) return;
    const [d, s] = call.service.split('.');
    this._hass.callService(d, s, call.data);
  }

  moreInfo(entityId) { fpsMoreInfo(this, entityId); }
}

/* ------------------------------------------------------------- floor card */

/* The floor's sentence, one phrase per kind of thing, in the order a person
 * asks about a floor: is anything on, is anything running, is anyone there.
 * Named by marker TYPE, the same way the house card's seeded counts are, so the
 * sentence follows the plan. A phrase whose population is empty is left out —
 * a floor with no AC does not say "0 of 0 ACs active". */
const FPS_PHRASES = [
  { id: 'lights', kinds: ['fixture'], one: 'light', many: 'lights', verb: 'on', dead: true },
  { id: 'fans', types: ['fan', 'fan_exhaust'], one: 'fan', many: 'fans', verb: 'running' },
  { id: 'ac', types: ['ac', 'ac_window', 'ac_cassette', 'heat_pump'], one: 'AC', many: 'ACs', verb: 'active' },
  { id: 'heat', types: ['geyser', 'heater', 'boiler', 'floor_heating', 'radiator', 'towel_rail'], one: 'heater', many: 'heaters', verb: 'on' },
  { id: 'screens', types: ['tv'], one: 'TV', many: 'TVs', verb: 'on' },
  { id: 'motion', types: ['pir', 'occupancy'], motion: true },
];

class FpsFloorCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sig = null;
  }

  static getStubConfig() {
    return { type: 'custom:fps-floor-card', floor: (FPS_DATA.project.floors[0] || {}).id };
  }

  setConfig(config) {
    if (!config || !config.floor) throw new Error('fps-floor-card: a `floor` is required');
    this._floor = (FPS_DATA.project.floors || []).find((f) => f.id === config.floor);
    if (!this._floor) throw new Error(`fps-floor-card: no floor "${config.floor}" in this plan`);
    this._config = config;
    this._built = false;
    this._sig = null;
  }

  getCardSize() { return 2; }

  set hass(hass) { this._hass = hass; this.render(); }

  /* Card, then floor, then house — the same narrowing every other setting
   * here follows. */
  style() {
    return this._config.style
      || (this._floor.dashboard || {}).style
      || ((FPS_DATA.project.dashboard || {}).floor || {}).style
      || 'summary';
  }

  /* The classes to break down by, for the breakdown layout.
   *
   * Default: whatever this floor actually has, grouped by the library's own
   * categories. That is the same promise the rest of the dashboard makes —
   * adding a heater to the plan adds it here, and nobody maintains a list. A
   * floor that wants a different cut says so and this steps aside. */
  classes() {
    const declared = (this._floor.dashboard || {}).breakdown
      || ((FPS_DATA.project.dashboard || {}).floor || {}).breakdown;
    const items = (this._floor.items || []).filter((i) => i.entity && (i.kind || '') !== 'furniture');
    if (declared) {
      return declared.map((d) => ({
        label: d.label || d.category || (d.types || []).join('/'),
        entities: [...new Set(items.filter((i) => this.inClass(i, d)).map((i) => i.entity))],
      })).filter((c) => c.entities.length);
    }
    const cats = new Map();
    for (const i of items) {
      const t = PlanScene.resolveType(FPS_DATA.library, i);
      if (!t) continue;
      const cat = t.category || 'other';
      if (!cats.has(cat)) cats.set(cat, new Set());
      cats.get(cat).add(i.entity);
    }
    const cs = FPS_DATA.library.categories || [];
    const order = cs.map((c) => c.id);
    return [...cats.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([id, set]) => ({
        label: (cs.find((c) => c.id === id) || {}).label || id,
        entities: [...set],
      }));
  }

  inClass(item, d) {
    if (d.types) return d.types.includes(item.type) || d.types.includes(item.kind + '.' + item.type);
    if (d.domains) return d.domains.includes(String(item.entity).split('.')[0]);
    if (d.category) {
      const t = PlanScene.resolveType(FPS_DATA.library, item);
      return !!t && t.category === d.category;
    }
    return false;
  }

  /* Each phrase's entities, counted per ENTITY like every other count here:
   * one relay behind two gate lamps is one thing you can switch. */
  phrases() {
    const items = (this._floor.items || []).filter((i) => i.entity && (i.kind || '') !== 'furniture');
    return FPS_PHRASES.map((p) => ({
      spec: p,
      entities: [...new Set(items.filter((i) => (p.kinds
        ? p.kinds.includes(i.kind || 'fixture')
        : p.types.includes(i.type))).map((i) => i.entity))],
    })).filter((p) => p.entities.length);
  }

  weatherEntity() {
    const house = (FPS_DATA.project.dashboard || {}).house || {};
    const sun = FPS_DATA.project.sun || {};
    return this._config.weather || house.weather || (sun.weather && sun.weather.entity) || null;
  }

  render() {
    if (!this._config || !this._hass) return;
    const states = this._hass.states || {};
    const summary = this.style() !== 'breakdown';
    const groups = summary ? this.phrases() : this.classes();
    const all = [...new Set(groups.flatMap((c) => c.entities))];
    const wxId = summary ? this.weatherEntity() : null;
    const sunSt = summary ? states['sun.sun'] : null;
    const sig = all.map((id) => id + '=' + ((states[id] || {}).state || '?')).join('|')
      + (summary ? `|${wxId}=${((states[wxId] || {}).state) || '?'}|sun=${sunSt && sunSt.attributes ? Math.round(sunSt.attributes.elevation) : '?'}` : '');
    if (sig === this._sig) return;
    this._sig = sig;

    if (!this._built) {
      const style = fpsEl('style');
      style.textContent = FPS_CARD_CSS;
      this._root = fpsEl('div');
      this.shadowRoot.replaceChildren(style, this._root);
      this._built = true;
    }
    this._root.className = 'fps-card fps-floorcard' + (summary ? ' fps-floor-summary' : '');
    this._root.replaceChildren();
    if (summary) this.renderSummary(groups, states, wxId, sunSt);
    else this.renderBreakdown(groups, all, states);
  }

  renderSummary(phrases, states, wxId, sunSt) {
    this._root.appendChild(fpsEl('div', 'fps-floor-title',
      this._config.title || `${this._floor.name || this._floor.id} snapshot`));
    const line = fpsEl('div', 'fps-floor-line');
    const sep = () => { if (line.children.length) line.appendChild(fpsEl('span', 'fps-sep', '·')); };

    for (const { spec, entities } of phrases) {
      const on = entities.filter((id) => fpsIsOn(states, id));
      const btn = fpsEl('button', 'fps-phrase' + (on.length ? ' on' : ''));
      btn.type = 'button';
      if (spec.motion) {
        btn.textContent = on.length
          ? `motion in ${on.length} area${on.length === 1 ? '' : 's'}`
          : 'no motion detected';
      } else {
        btn.appendChild(fpsEl('b', null, String(on.length)));
        const noun = entities.length === 1 ? spec.one : spec.many;
        let tail = ` of ${entities.length} ${noun} ${spec.verb}`;
        /* Unavailable is called out rather than folded into "off": a lamp that
         * has fallen off the network is a thing to fix, and counting it as off
         * hides it. */
        const dead = spec.dead ? entities.filter((id) => !states[id] || ['unavailable', 'unknown'].includes(states[id].state)).length : 0;
        if (dead) tail += ` (${dead} unavailable)`;
        btn.appendChild(document.createTextNode(tail));
      }
      btn.addEventListener('click', () => this.moreInfo(on[0] || entities[0]));
      sep();
      line.appendChild(btn);
    }

    /* The sky, and where the sun is — the two things that explain why the plan
     * looks the way it does right now. */
    const wx = wxId && states[wxId];
    const el = sunSt && sunSt.attributes && typeof sunSt.attributes.elevation === 'number' ? sunSt.attributes.elevation : null;
    if (wx || el !== null) {
      const sky = fpsEl('button', 'fps-phrase fps-phrase-sky');
      sky.type = 'button';
      sky.textContent = [wx ? String(wx.state).replace(/[-_]/g, ' ') : null, el !== null ? `sun ${Math.round(el)}°` : null]
        .filter(Boolean).join(', ');
      sky.addEventListener('click', () => this.moreInfo(wx ? wxId : 'sun.sun'));
      sep();
      line.appendChild(sky);
    }
    this._root.appendChild(line);
  }

  renderBreakdown(classes, all, states) {
    const on = all.filter((id) => fpsIsOn(states, id)).length;
    const dead = all.filter((id) => !states[id] || ['unavailable', 'unknown'].includes(states[id].state)).length;

    const head = fpsEl('div', 'fps-floor-head');
    head.appendChild(fpsEl('div', 'fps-floor-title', this._config.title || this._floor.name || this._floor.id));
    const big = fpsEl('div', 'fps-floor-count');
    big.appendChild(fpsEl('span', 'fps-big', String(on)));
    big.appendChild(fpsEl('span', 'fps-of', ` of ${all.length} active`));
    head.appendChild(big);
    /* Unavailable is called out rather than folded into "off": a device that has
     * fallen off the network is a thing to fix, and counting it as off hides it. */
    if (dead) head.appendChild(fpsEl('span', 'fps-floor-dead', `${dead} unavailable`));
    this._root.appendChild(head);

    const rows = fpsEl('div', 'fps-floor-rows');
    for (const c of classes) {
      const cOn = c.entities.filter((id) => fpsIsOn(states, id)).length;
      const row = fpsEl('button', 'fps-floor-row' + (cOn ? ' on' : ''));
      row.appendChild(fpsEl('span', 'fps-floor-label', c.label));
      row.appendChild(fpsEl('span', 'fps-floor-n', `${cOn}/${c.entities.length}`));
      const bar = fpsEl('span', 'fps-floor-bar');
      const fill = fpsEl('span', 'fps-floor-fill');
      fill.style.width = `${c.entities.length ? Math.round((cOn / c.entities.length) * 100) : 0}%`;
      bar.appendChild(fill);
      row.appendChild(bar);
      row.addEventListener('click', () => {
        const target = c.entities.find((id) => fpsIsOn(states, id)) || c.entities[0];
        if (target) this.moreInfo(target);
      });
      rows.appendChild(row);
    }
    this._root.appendChild(rows);
  }

  moreInfo(entityId) { fpsMoreInfo(this, entityId); }
}

customElements.define('fps-house-card', FpsHouseCard);
customElements.define('fps-floor-card', FpsFloorCard);

window.customCards.push(
  { type: 'fps-house-card', name: 'Floorplan Studio house overview', description: 'House name, date and weather, what is on, live readings and who is home.', preview: false },
  { type: 'fps-floor-card', name: 'Floorplan Studio floor overview', description: 'One sentence on what a floor is doing: lights, fans, motion and the sky.', preview: false },
);
