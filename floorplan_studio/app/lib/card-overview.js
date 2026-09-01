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
 * The HOUSE card always shows the house's name and its weather — that is what
 * makes it recognisable from across a room, and it is not negotiable. Beside it
 * go three lists the user owns entirely: `counts` (how many of a thing are on),
 * `stats` (a live number), and the house's own `shortcuts` as buttons.
 *
 * The FLOOR card always shows "N of M active" for the floor, and under it a
 * breakdown by class. The classes default to whatever the floor actually has,
 * derived from the markers on the plan through the library's own categories —
 * so a floor that gains a heater gains a heater row, and nobody maintains a
 * list.
 */

/* eslint-disable no-undef */

const FPS_FMT = {
  /* Watts read as kW past a thousand, because a five-digit number in a chip is
   * a number nobody reads. */
  power(v, unit) {
    if (!isFinite(v)) return '—';
    if (Math.abs(v) >= 1000) return (v / 1000).toFixed(2) + ' kW';
    return Math.round(v) + ' ' + (unit || 'W');
  },
  energy(v, unit) { return isFinite(v) ? v.toFixed(1) + ' ' + (unit || 'kWh') : '—'; },
  temperature(v, unit) { return isFinite(v) ? Math.round(v) + (unit || '°') : '—'; },
  percent(v) { return isFinite(v) ? Math.round(v) + '%' : '—'; },
  duration(v, unit, raw) {
    const parts = String(raw === undefined || raw === null ? '' : raw).split(':').map(Number);
    if (parts.length >= 2 && parts.every(isFinite)) return Math.max(0, Math.round(parts[0] * 60 + parts[1])) + 'm';
    return isFinite(v) ? Math.max(0, Math.round(v)) + 'm' : '—';
  },
  raw(v, unit, raw) { return raw === undefined || raw === null ? '—' : String(raw) + (unit ? ' ' + unit : ''); },
};

function fpsEl(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

/* A small drawn icon, from the same path set the plan uses. Never a Unicode
 * glyph: ⏻ and ⛶ render as tofu boxes on Windows and Android, which is a
 * reported failure rather than a theory. */
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
    const sig = ids.map((id) => id + '=' + ((states[id] || {}).state || '?')).join('|');
    if (sig === this._sig) return;
    this._sig = sig;

    if (!this._built) {
      const style = fpsEl('style');
      style.textContent = FPS_CARD_CSS;
      this._root = fpsEl('div', 'fps-card fps-house');
      this.shadowRoot.replaceChildren(style, this._root);
      this._built = true;
    }
    this._root.replaceChildren();

    /* --- the fixed half: who this is and what it is like outside --- */
    const head = fpsEl('div', 'fps-house-head');
    head.appendChild(fpsEl('div', 'fps-house-title', cfg.title || FPS_DATA.project.name || 'Home'));

    const wx = cfg.weather && states[cfg.weather];
    if (wx) {
      const w = fpsEl('div', 'fps-house-wx');
      const t = wx.attributes && wx.attributes.temperature;
      w.appendChild(fpsIcon(this.skyIcon(wx.state), 'currentColor', 17));
      w.appendChild(fpsEl('span', 'fps-wx-state', String(wx.state).replace(/[-_]/g, ' ')));
      if (t !== undefined && t !== null) {
        w.appendChild(fpsEl('span', 'fps-wx-temp', Math.round(t) + (wx.attributes.temperature_unit || '°')));
      }
      w.addEventListener('click', () => this.moreInfo(cfg.weather));
      head.appendChild(w);
    }

    /* People sit with the weather because both answer "what is going on right
     * now" rather than "what is switched on". */
    if ((cfg.people || []).length) {
      const row = fpsEl('div', 'fps-people');
      for (const p of cfg.people) {
        const st = states[p];
        if (!st) continue;
        const home = st.state === 'home';
        const chip = fpsEl('button', 'fps-person' + (home ? ' home' : ''));
        const pic = st.attributes && st.attributes.entity_picture;
        if (pic) {
          const img = document.createElement('img');
          img.src = pic;
          img.alt = '';
          chip.appendChild(img);
        }
        chip.appendChild(fpsEl('span', null, (st.attributes && st.attributes.friendly_name) || p.split('.')[1]));
        chip.title = st.state;
        chip.addEventListener('click', () => this.moreInfo(p));
        row.appendChild(chip);
      }
      head.appendChild(row);
    }
    this._root.appendChild(head);

    /* --- the half that is yours --- */
    const chips = fpsEl('div', 'fps-chips');
    for (const c of cfg.counts || []) {
      let list = fpsCountEntities(c, states, FPS_DATA.project.floors || []);
      if (c.excludeUnavailable) {
        list = list.filter((id) => states[id] && !['unknown', 'unavailable'].includes(states[id].state));
      }
      if (!list.length || !fpsShown(c, states)) continue;
      const on = list.filter((id) => fpsIsOn(states, id, c.mode)).length;
      if (c.hideWhenZero && !on) continue;
      const chip = fpsEl('button', 'fps-chip' + (on ? ' on' : ''));
      chip.appendChild(fpsIcon(c.icon, 'currentColor'));
      chip.appendChild(fpsEl('span', 'fps-chip-n', c.total === false ? String(on) : `${on}/${list.length}`));
      if (c.label) chip.appendChild(fpsEl('span', 'fps-chip-l', c.label));
      chip.title = `${c.label || c.domain || 'items'}: ${on} of ${list.length} on`;
      /* Tapping a count opens the first thing it counted rather than doing
       * nothing — a chip that looks pressable and is not reads as broken. */
      chip.addEventListener('click', () => this.moreInfo(list.find((id) => fpsIsOn(states, id)) || list[0]));
      chips.appendChild(chip);
    }

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
      if (s.signed && isFinite(num) && num > 0) text = '+' + text;
      if (s.prefix) text = s.prefix + ' ' + text;
      if (s.suffix) text += ' ' + s.suffix;
      const chip = fpsEl('button', 'fps-chip fps-stat' + (s.signed && num < 0 ? ' neg' : ''));
      chip.appendChild(fpsIcon(s.icon, 'currentColor'));
      chip.appendChild(fpsEl('span', 'fps-chip-n', text));
      if (s.label) chip.appendChild(fpsEl('span', 'fps-chip-l', s.label));
      chip.title = s.name || s.entity;
      chip.addEventListener('click', () => this.moreInfo(s.entity));
      chips.appendChild(chip);
    }

    /* The house's own shortcuts, as buttons. Same list the room panels use, so
     * a goodnight scene is written once and reachable from both. */
    for (const s of Controls.shortcuts(FPS_DATA.controls, FPS_DATA.project, null, null)) {
      if (s.slot === 'header' || s.section === 'house' || cfg.showAllShortcuts) {
        const state = s.state || s.entity;
        const btn = fpsEl('button', 'fps-chip fps-chip-action' + (state && fpsIsOn(states, state) ? ' on' : ''));
        if (s.icon) btn.appendChild(fpsIcon(s.icon, 'currentColor'));
        btn.appendChild(fpsEl('span', 'fps-chip-l', s.label || s.id));
        btn.addEventListener('click', () => this.run(s));
        chips.appendChild(btn);
      }
    }

    if (chips.children.length) this._root.appendChild(chips);
  }

  /* Weather states are Home Assistant's own vocabulary, so the mapping is fixed
   * rather than configurable — but it falls back to a cloud, never to nothing. */
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

  moreInfo(entityId) {
    if (!entityId) return;
    const ev = new Event('hass-more-info', { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }
}

/* ------------------------------------------------------------- floor card */

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

  /* The classes to break down by.
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

  render() {
    if (!this._config || !this._hass) return;
    const states = this._hass.states || {};
    const classes = this.classes();
    const all = [...new Set(classes.flatMap((c) => c.entities))];
    const sig = all.map((id) => id + '=' + ((states[id] || {}).state || '?')).join('|');
    if (sig === this._sig) return;
    this._sig = sig;

    if (!this._built) {
      const style = fpsEl('style');
      style.textContent = FPS_CARD_CSS;
      this._root = fpsEl('div', 'fps-card fps-floorcard');
      this.shadowRoot.replaceChildren(style, this._root);
      this._built = true;
    }
    this._root.replaceChildren();

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

  moreInfo(entityId) {
    const ev = new Event('hass-more-info', { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }
}

customElements.define('fps-house-card', FpsHouseCard);
customElements.define('fps-floor-card', FpsFloorCard);

window.customCards.push(
  { type: 'fps-house-card', name: 'Floorplan Studio house overview', description: 'House name, weather, people, live counts and your own shortcut buttons.', preview: false },
  { type: 'fps-floor-card', name: 'Floorplan Studio floor overview', description: 'How much of a floor is active, broken down by class.', preview: false },
);
