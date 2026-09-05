/**
 * The live card: `custom:fps-floorplan-card`.
 *
 * NOT a UMD module and not loaded on its own. `card-build.js` concatenates the
 * shared scene libraries and this file into one Lovelace module resource, with
 * the project baked in. Inside that bundle `Shapes`, `Flooring`, `SunModel`,
 * `Controls`, `Lighting`, `PlanScene` and `FPS_DATA` are already in scope.
 *
 * The important thing about this file is how little of it there is. The card
 * does not know how to draw a house — `plan-scene.js` does, and it is the same
 * copy the editor paints with and the exporter writes with. What is left here
 * is the three things a card actually has to do that an editor does not:
 *
 *   1. turn `hass.states` into the state map the scene builder wants,
 *   2. not repaint when nothing it cares about changed,
 *   3. call services when something is tapped.
 *
 * Repaint control matters more than it looks. A busy instance fires state
 * events constantly, and a floor plan that rebuilds its SVG on every one of
 * them will drop frames on a wall tablet. The signature below is built only
 * from the entities this floor actually binds, so an unrelated sensor updating
 * a hundred times a minute costs one string comparison.
 */

/* eslint-disable no-undef */

const FPS_TAP_MS = 400;

class FpsFloorplanCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sig = null;
    this._hass = null;
    this._open = null;        // room id whose control surface is showing
    this._clock = null;
  }

  static getStubConfig() { return { type: 'custom:fps-floorplan-card', floor: (FPS_DATA.project.floors[0] || {}).id }; }

  setConfig(config) {
    if (!config || !config.floor) throw new Error('fps-floorplan-card: a `floor` is required');
    const floor = (FPS_DATA.project.floors || []).find((f) => f.id === config.floor);
    if (!floor) {
      throw new Error(`fps-floorplan-card: no floor "${config.floor}" in this plan `
        + `(have: ${(FPS_DATA.project.floors || []).map((f) => f.id).join(', ')})`);
    }
    this._config = Object.assign({ controls: true, header: true, motion: true }, config);
    this._floor = floor;
    this._sig = null;
    this._built = false;
    this.render();
  }

  /* A floor plan is only worth about a screen and a half of height; taking the
   * whole masonry column and then some makes the tabs unreachable on a phone. */
  getCardSize() { return 12; }

  connectedCallback() {
    /* The sun moves whether or not Home Assistant says anything, so the plan
     * needs its own slow tick. Two minutes is well inside the resolution of
     * anything the daylight model draws and costs nothing. */
    /* The theme cache goes with it: someone switching Home Assistant to dark
     * mode changes no entity state, so nothing else would ever invalidate it. */
    if (!this._clock) this._clock = setInterval(() => { this._sig = null; this._themeCache = null; this.render(); }, 120000);
  }

  disconnectedCallback() {
    if (this._clock) { clearInterval(this._clock); this._clock = null; }
    /* In-flight retries go with the card. A timer that outlived it would fire a
     * service call from a card nobody is looking at, and a retry only makes
     * sense as the tail of a tap that is still on screen. */
    if (this._guesses) {
      for (const g of this._guesses.values()) clearTimeout(g.timer);
      this._guesses.clear();
    }
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  /* ----------------------------------------------------------- state map */

  /* Every entity this floor's drawing depends on: markers, their sub-sensors,
   * extension-board channels, door contacts, and whatever the sun model reads.
   * Anything not in here cannot change the picture, so it cannot trigger a
   * repaint either. */
  boundEntities() {
    if (this._bound) return this._bound;
    const ids = new Set();
    for (const it of this._floor.items || []) {
      if (it.entity) ids.add(it.entity);
      const p = it.props || {};
      for (const k of ['presence', 'remote', 'sensor']) if (p[k]) ids.add(p[k]);
      for (const c of p.channels || []) if (c.entity) ids.add(c.entity);
    }
    for (const op of this._floor.openings || []) if (op.sensor) ids.add(op.sensor);
    /* The user's shortcuts too: a button that does not light up when you press
     * it is indistinguishable from one that did nothing. Only the EXPLICIT
     * shortcuts are watched — entities matched from the catalogue are found
     * when the sheet opens, and watching them would put half the house in the
     * repaint signature for a row nobody is looking at. */
    for (const room of this._floor.rooms || []) {
      for (const s of Controls.shortcuts(FPS_DATA.controls, FPS_DATA.project, this._floor, room)) {
        if (s.state) ids.add(s.state);
        if (s.entity) ids.add(s.entity);
      }
      if (room.master) ids.add(room.master);
    }
    const sun = Object.assign({}, FPS_DATA.project.sun, this._floor.sun);
    for (const id of [sun.sunEntity, sun.weather && sun.weather.entity, sun.solarSensor && sun.solarSensor.entity]) {
      if (id) ids.add(id);
    }
    this._bound = [...ids];
    return this._bound;
  }

  stateMap() {
    const out = {};
    const states = (this._hass && this._hass.states) || {};
    for (const id of this.boundEntities()) if (states[id]) out[id] = states[id];
    return this.applyOptimistic(out, states);
  }

  /* ------------------------------------------------------------- tooltip

     What a marker IS, without having to tap it. A plan is dense — a bedroom
     can carry a dozen discs — and "which of these is the balcony spot" is a
     question you should not have to answer by opening each one.

     Pointer-driven rather than CSS `:hover`, because the same handler has to
     work for a mouse and be absent for a finger: a touch device has no hover,
     and a tooltip that appears under a thumb covers the thing it describes. */

  tooltipsOn() {
    const d = FPS_DATA.project.dashboard || {};
    if (this._config.tooltips === false || d.tooltips === false) return false;
    /* A coarse pointer has no hover to speak of. */
    return !(window.matchMedia && window.matchMedia('(hover: none)').matches);
  }

  onHover(ev) {
    const t = ev.target.closest ? ev.target.closest('.fps-hit') : null;
    if (!t || t.dataset.target === 'room') return this.hideTip();
    const text = t.dataset.target === 'item'
      ? this.describeItem(t.dataset.id)
      : this.describeOpening(t.dataset.id);
    if (!text) return this.hideTip();
    this.showTip(text, ev);
  }

  describeItem(id) {
    const it = this.item(id);
    if (!it) return null;
    const type = PlanScene.resolveType(FPS_DATA.library, it) || {};
    const st = it.entity ? this._hass.states[it.entity] : null;
    const name = it.name || (st && st.attributes && st.attributes.friendly_name) || it.entity || type.label;
    /* What the thing IS — 5000 L, 5 kW, a 120-inch screen. It comes from the
     * marker's own properties rather than from Home Assistant, so it is worth
     * saying even when the entity is dead or there is no entity at all. */
    const spec = PlanScene.specLine(type, it);
    if (!st) return [name + (it.entity ? ' · unavailable' : ''), spec].filter(Boolean).join(' · ');
    const a = st.attributes || {};
    const bits = [String(st.state).replace(/_/g, ' ')];
    if (a.unit_of_measurement) bits[0] += a.unit_of_measurement;
    if (typeof a.brightness === 'number') bits.push(`${Math.round((a.brightness / 255) * 100)}%`);
    if (typeof a.percentage === 'number') bits.push(`${Math.round(a.percentage)}%`);
    if (typeof a.current_temperature === 'number') bits.push(`${a.current_temperature}°`);
    if (spec) bits.push(spec);
    return `${name} · ${bits.join(' · ')}`;
  }

  describeOpening(id) {
    const op = (this._floor.openings || []).find((o) => o.id === id);
    if (!op) return null;
    const t = (FPS_DATA.boundaries.openingTypes || {})[op.type] || {};
    const bits = [t.label || op.type];
    if (op.sensor) {
      const st = this._hass.states[op.sensor];
      bits.push(st ? (st.state === 'off' ? 'closed' : 'open') : 'no reading');
    }
    if (op.covering && op.covering.type && op.covering.type !== 'none') {
      const cov = (FPS_DATA.boundaries.coverings || {})[op.covering.type] || {};
      const openPct = Math.round(PlanScene.coveringOpenness(op, this._hass.states) * 100);
      bits.push(`${cov.label || op.covering.type} ${openPct}% open`);
    }
    return bits.join(' · ');
  }

  showTip(text, ev) {
    if (!this._tip) {
      this._tip = document.createElement('div');
      this._tip.className = 'fps-tip';
      this._root.appendChild(this._tip);
    }
    this._tip.textContent = text;
    const box = this._root.getBoundingClientRect();
    /* Flipped to the other side near the right edge, so the tip never runs off
     * the card that contains it. */
    const x = ev.clientX - box.left, y = ev.clientY - box.top;
    const flip = x > box.width - 180;
    this._tip.style.left = `${flip ? x - 12 : x + 12}px`;
    this._tip.style.top = `${Math.max(4, y - 30)}px`;
    this._tip.style.transform = flip ? 'translateX(-100%)' : 'none';
    this._tip.hidden = false;
  }

  hideTip() { if (this._tip) this._tip.hidden = true; }

  /* ---------------------------------------------------------- optimistic

     A tap has to look like it worked. On a local network Home Assistant answers
     in 100-300ms, which is long enough to feel like a dead button and short
     enough that people press it twice.

     So a tap paints the state it asked for immediately, and holds that guess
     until the real state arrives or the guess expires. Two rules keep it
     honest: the guess is dropped the moment the entity reports ANY state
     different from what it had when we guessed (whether or not that is what we
     asked for), and it expires on its own after a second or two — so a service
     that fails leaves the plan telling the truth rather than a lie that sticks.

     Off by default? No: on by default, because the alternative is a plan that
     feels broken. `dashboard.optimistic: false` turns it off for anyone who
     would rather see only confirmed state.

     ---- Confirming, and retrying

     Painting the guess fixes the 300ms feel. It does not fix a command that
     never lands. On a Zigbee or Z-Wave mesh a device that has drifted off its
     router can swallow a command outright while still reporting as online: the
     service call succeeds, nothing arrives, the guess expires, and the marker
     slides back to the old state with nothing anywhere having said "that did
     not work". The failure is invisible for as long as nobody walks into the
     room.

     So a guess can be asked to CONFIRM itself. While the command is in flight
     the marker carries `.fps-pending` and reads as in-flight rather than as
     settled — the honest thing, because a guess is not a state. If the entity
     has not reached what it was asked for by the time the window closes, the
     command is re-sent, up to `retries` times, `retryMs` apart. After the last
     one the guess is dropped and the true state shows.

     Retries are OFF by default and must be turned on. Re-sending a service
     call is a decision about someone else's house — how many extra commands a
     flaky mesh should get is exactly the kind of judgement this framework has
     no business making for anyone. The mechanism ships; the choice does not.

       dashboard.optimistic   false to paint only confirmed state   (default true)
       dashboard.optimisticMs the confirmation window, ms           (default 1600)
       dashboard.retries      re-sends after that window            (default 0)
       dashboard.retryMs      gap between re-sends, ms              (default 1000)
       dashboard.pendingStyle false to drop the in-flight look      (default true)

     Any of them may also be set on the card config, which wins.               */

  optimisticCfg() {
    const d = FPS_DATA.project.dashboard || {};
    const c = this._config || {};
    const pick = (k, dflt) => (c[k] !== undefined ? c[k] : (d[k] !== undefined ? d[k] : dflt));
    const off = c.optimistic === false || d.optimistic === false;
    const n = (v, dflt, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || dflt));
    return {
      ms: off ? 0 : n(pick('optimisticMs', 1600), 1600, 0, 10000),
      retries: off ? 0 : n(pick('retries', 0), 0, 0, 10),
      retryMs: n(pick('retryMs', 1000), 1000, 200, 10000),
      showPending: pick('pendingStyle', true) !== false,
    };
  }

  /* Kept as its own name: the window is the one number most of this file and
   * the tests care about, and `optimisticMs()` is what they ask for. */
  optimisticMs() { return this.optimisticCfg().ms; }

  /* `origin` is the call that produced this guess, so a retry is a literal
   * re-send rather than a reconstruction that could drift from it. */
  guess(entityId, state, origin) {
    const cfg = this.optimisticCfg();
    if (!cfg.ms || !entityId) return;
    const real = ((this._hass && this._hass.states) || {})[entityId];
    /* Never guess on a dead entity. `unavailable`/`unknown` means the device is
     * known to be gone — there is nothing to be optimistic about, and retrying
     * would bury an honest marker under three more commands nobody can answer. */
    if (real && (real.state === 'unavailable' || real.state === 'unknown')) return;
    this._guesses = this._guesses || new Map();
    const prev = this._guesses.get(entityId);
    if (prev) clearTimeout(prev.timer);
    const g = {
      state, was: real ? real.state : null,
      until: Date.now() + cfg.ms,
      tries: 0, max: cfg.retries, retryMs: cfg.retryMs, origin: origin || null,
    };
    g.timer = setTimeout(() => this.settleGuess(entityId), cfg.ms + 30);
    this._guesses.set(entityId, g);
    this._sig = null;
    this.render();
  }

  /* The window closed. Either it got there, or it gets another go. */
  settleGuess(entityId) {
    const g = this._guesses && this._guesses.get(entityId);
    if (!g) return;
    const real = ((this._hass && this._hass.states) || {})[entityId];
    const dead = !real || real.state === 'unavailable' || real.state === 'unknown';
    /* Dead, arrived, or out of tries — all three mean stop guessing and let the
     * real state speak, which is the whole point of a bounded retry. */
    if (dead || (real && real.state === g.state) || g.tries >= g.max || !g.origin) {
      this.dropGuess(entityId);
      return;
    }
    g.tries++;
    this._hass.callService(g.origin.domain, g.origin.service,
      Object.assign({}, g.origin.data, { entity_id: entityId }));
    g.until = Date.now() + g.retryMs;
    g.timer = setTimeout(() => this.settleGuess(entityId), g.retryMs + 30);
    this._sig = null;
    this.render();
  }

  dropGuess(entityId) {
    const g = this._guesses && this._guesses.get(entityId);
    if (!g) return;
    clearTimeout(g.timer);
    this._guesses.delete(entityId);
    this._sig = null;
    this.render();
  }

  /* The entities with a command in flight right now, for the in-flight styling.
   * Empty when the look is switched off, so the renderer needs no second flag. */
  pendingSet() {
    const out = new Set();
    if (this._guesses && this.optimisticCfg().showPending) {
      for (const id of this._guesses.keys()) out.add(id);
    }
    return out;
  }

  applyOptimistic(map, states) {
    if (!this._guesses || !this._guesses.size) return map;
    const now = Date.now();
    for (const [id, g] of [...this._guesses]) {
      const real = states[id];
      const moved = real && real.state !== g.was;
      /* With retries in play `until` is extended on every re-send, so it can no
       * longer retire a guess on its own — settleGuess owns that. This stays as
       * the backstop for the retries-off case, where it is the only clock. */
      const expired = now > g.until && g.tries >= g.max;
      if (expired || moved) { clearTimeout(g.timer); this._guesses.delete(id); continue; }
      /* Keep the real attributes — brightness, colour, percentage — and change
       * only the state we are guessing about. A light told to turn on should
       * come up in its own last colour, not in the default. */
      map[id] = Object.assign({}, real || { attributes: {} }, { state: g.state });
    }
    return map;
  }

  /* The state a tap is about to produce, for the guess. Only the domains where
   * that is knowable: toggling a light gives `on` or `off`, but running a
   * script or a scene gives whatever it gives. */
  guessFor(entityId, service) {
    const s = String(service || '');
    if (/\.turn_on$/.test(s)) return 'on';
    if (/\.turn_off$/.test(s)) return 'off';
    if (/\.toggle$/.test(s)) return this.isOn(entityId) ? 'off' : 'on';
    return null;
  }

  /* The state + attributes that actually change the drawing. Brightness and
   * colour are in here because a dimmed lamp draws a smaller, differently
   * tinted pool; a fan's percentage because its blades turn at that speed. */
  signature(states) {
    const parts = [];
    const labelEntities = new Set((this._floor.items || [])
      .filter((item) => ((PlanScene.resolveType(FPS_DATA.library, item) || {}).render || {}).shape === 'label')
      .map((item) => item.entity).filter(Boolean));
    for (const id of this.boundEntities()) {
      const s = states[id];
      if (!s) { parts.push(id + '=?'); continue; }
      const a = s.attributes || {};
      parts.push(`${id}=${s.state}:${a.brightness || ''}:${a.rgb_color || ''}:${a.color_temp_kelvin || ''}`
        + `:${a.percentage || ''}:${a.hvac_action || ''}:${a.current_temperature || ''}`
        + (labelEntities.has(id) ? `:${JSON.stringify(a)}` : ''));
    }
    /* Ten-minute buckets: the daylight layer is the only thing that moves on
     * its own, and it does not move fast enough to be worth more than that. */
    parts.push('t=' + Math.floor(Date.now() / 600000));
    parts.push('open=' + (this._open || ''));
    return parts.join('|');
  }

  /* ------------------------------------------------------------- render */

  /* The plan's colours.
   *
   * Default: follow Home Assistant. A dashboard card that ignores the theme the
   * rest of the dashboard is wearing looks like a screenshot pasted onto the
   * page, and this one fills a whole tab.
   *
   * A theme carrying `follows` + `vars` is resolved in two steps. The BASE
   * token map is chosen by measuring the host's own background, because
   * materials have to be real colours — a flooring generator shades its base to
   * derive grain and grout, and `var(--x)` cannot be shaded. Then the tokens
   * named in `vars` are overlaid from the dashboard's own custom properties:
   * background, ink, dividers, the active colour. Chrome follows; materials
   * belong to the plan.
   *
   * Anything Home Assistant does not define falls through to the base map, so a
   * minimal theme degrades to Frosted or Blueprint rather than to nothing. */
  theme() {
    const doc = FPS_DATA.themes;
    const id = this._config.theme || (FPS_DATA.project.dashboard || {}).theme || 'ha';
    const t = doc.themes[id] || doc.themes[FPS_DATA.project.activeTheme] || doc.themes[doc.active] || {};
    if (!t.follows && !t.vars) return t.plan || {};

    const dark = this.hostIsDark();
    if (this._themeCache && this._themeCache.id === id && this._themeCache.dark === dark) return this._themeCache.plan;

    const baseId = (t.follows || {})[dark ? 'dark' : 'light'];
    const plan = Object.assign({}, t.plan, ((doc.themes[baseId] || {}).plan) || {});
    const cs = getComputedStyle(this);
    for (const [token, names] of Object.entries(t.vars || {})) {
      for (const name of names) {
        const v = cs.getPropertyValue(name).trim();
        if (v) { plan[token] = v; break; }
      }
    }
    this._themeCache = { id, dark, plan };
    return plan;
  }

  /* Is the dashboard behind us dark? Asked of the card's own inherited text
   * colour rather than of a theme name, because a theme can be called anything
   * and there is no variable that reliably says "I am dark". Bright text means
   * a dark ground. */
  hostIsDark() {
    const cs = getComputedStyle(this);
    const probe = cs.getPropertyValue('--primary-text-color').trim() || cs.color;
    const rgb = FpsFloorplanCard.parseRgb(probe);
    if (!rgb) return false;
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return lum > 0.55;
  }

  static parseRgb(s) {
    if (!s) return null;
    let m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
    if (m) return [+m[1], +m[2], +m[3]];
    m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  render() {
    if (!this._config || !this._hass) return;
    const states = this.stateMap();
    const sig = this.signature(states);
    if (sig === this._sig) return;
    this._sig = sig;

    const theme = this.theme();
    const scene = PlanScene.build(FPS_DATA.project, this._floor, FPS_DATA.library, theme, {
      states,
      boundaries: FPS_DATA.boundaries,
      flooring: FPS_DATA.flooring,
      lighting: this._config.lighting,
      motion: this._config.motion !== false,
      pending: this.pendingSet(),
      when: new Date(),
      grid: { show: false },
    });
    this._scene = scene;

    if (!this._built) this.buildShell(theme);
    this.paintPlan(scene, theme, states);
    if (this._config.header !== false) this.paintHeader(scene, states);
    if (this._open) this.paintControls(this._open, states);
  }

  buildShell(theme) {
    const style = document.createElement('style');
    style.textContent = FPS_CARD_CSS;
    const root = document.createElement('div');
    root.className = 'fps-card';
    root.innerHTML = '<div class="fps-head" part="head"></div>'
      + '<div class="fps-plan"></div>'
      + '<div class="fps-surface" hidden></div>';
    this.shadowRoot.replaceChildren(style, root);
    this._root = root;
    this._built = true;
  }

  paintPlan(scene, theme, states) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${scene.width} ${scene.height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('class', 'fps-svg');
    svg.style.background = theme.sheet || 'transparent';

    const el = (tag, attrs, text) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null) n.setAttribute(k, v);
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const toEl = (n) => {
      const e = el(n.tag, n.attrs, n.text);
      for (const c of n.children || []) e.appendChild(toEl(c));
      return e;
    };

    const defs = el('defs');
    for (const n of scene.layers.defs) defs.appendChild(toEl(n));
    svg.appendChild(defs);
    for (const key of scene.order) {
      const g = el('g', { 'pointer-events': 'none' });
      for (const n of scene.layers[key] || []) g.appendChild(toEl(n));
      svg.appendChild(g);
    }

    /* Taps come off the SAME geometry the editor drags, via
     * PlanScene.hitTargets — so a marker that was easy to grab while placing it
     * is easy to hit here. */
    const hits = el('g', { class: 'fps-hits' });
    for (const t of PlanScene.hitTargets(this._floor, FPS_DATA.library, scene.projector, states)) {
      const e = el(t.tag, Object.assign({ fill: t.tag === 'line' ? 'none' : 'transparent' }, t.attrs));
      e.setAttribute('class', 'fps-hit fps-hit-' + t.target);
      e.dataset.target = t.target;
      e.dataset.id = t.id;
      hits.appendChild(e);
    }
    svg.appendChild(hits);

    svg.addEventListener('pointerdown', (ev) => this.onPointerDown(ev));
    svg.addEventListener('pointerup', (ev) => this.onPointerUp(ev));
    svg.addEventListener('pointercancel', () => { this._press = null; });
    if (this.tooltipsOn()) {
      svg.addEventListener('pointermove', (ev) => this.onHover(ev));
      svg.addEventListener('pointerleave', () => this.hideTip());
    }

    this._svg = svg;
    this._extent = { w: scene.width, h: scene.height };
    if (this._config.zoom !== false) this.attachPanZoom(svg);
    this.applyView();
    this._root.querySelector('.fps-plan').replaceChildren(svg);
  }

  /* ------------------------------------------------------------ pan/zoom

     A whole floor at once is the right default and the wrong thing to work
     with: on a phone a marker is four millimetres across. Zoom is done by
     moving the viewBox rather than by CSS transform, so stroke widths and text
     stay put — a CSS-scaled plan turns 1px walls into 3px walls and the
     labels into blurred stamps.

     A drag only pans once it has moved far enough to be a drag; below that it
     is still a tap, so the plan stays tappable one-handed.                   */

  attachPanZoom(svg) {
    const pts = new Map();
    let start = null;

    svg.addEventListener('wheel', (ev) => {
      if (!ev.ctrlKey && Math.abs(ev.deltaY) < 2) return;
      ev.preventDefault();
      const r = svg.getBoundingClientRect();
      this.zoomAt(Math.pow(0.9985, ev.deltaY), (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
    }, { passive: false });

    svg.addEventListener('pointerdown', (ev) => {
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        start = { dist: Math.hypot(a.x - b.x, a.y - b.y), view: Object.assign({}, this.view()) };
        this._press = null;                       // a second finger cancels the tap
      }
    });

    svg.addEventListener('pointermove', (ev) => {
      if (!pts.has(ev.pointerId)) return;
      const prev = pts.get(ev.pointerId);
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      if (pts.size === 2 && start) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (start.dist > 4) {
          const v = this.view();
          const k = dist / start.dist;
          v.k = Math.max(1, Math.min(6, start.view.k * k));
          this.setView(v);
        }
        return;
      }
      if (pts.size !== 1) return;
      const dx = ev.clientX - prev.x, dy = ev.clientY - prev.y;
      const moved = Math.hypot(ev.clientX - (this._press ? this._press.x : ev.clientX),
        ev.clientY - (this._press ? this._press.y : ev.clientY));
      const v = this.view();
      if (v.k <= 1.001) return;                   // nothing to pan at fit-to-width
      if (this._press && moved < 8) return;       // still a tap, not yet a drag
      this._press = null;
      const r = svg.getBoundingClientRect();
      v.x -= (dx / r.width) / v.k;
      v.y -= (dy / r.height) / v.k;
      this.setView(v);
    });

    const end = (ev) => { pts.delete(ev.pointerId); if (pts.size < 2) start = null; };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    /* Double-tap is the universal "put it back", and the one gesture nobody has
     * to be told about. */
    svg.addEventListener('dblclick', (ev) => { ev.preventDefault(); this.setView({ k: 1, x: 0, y: 0 }); });
  }

  view() { return this._view || (this._view = { k: 1, x: 0, y: 0 }); }

  setView(v) {
    const k = Math.max(1, Math.min(6, v.k || 1));
    const span = 1 / k;
    this._view = {
      k,
      x: Math.max(0, Math.min(1 - span, v.x || 0)),
      y: Math.max(0, Math.min(1 - span, v.y || 0)),
    };
    this.applyView();
  }

  zoomAt(factor, px, py) {
    const v = this.view();
    const k = Math.max(1, Math.min(6, v.k * factor));
    /* Keep the point under the cursor where it is, which is the difference
     * between zooming and jumping. */
    const span = 1 / v.k, nspan = 1 / k;
    this.setView({ k, x: v.x + (px * (span - nspan)), y: v.y + (py * (span - nspan)) });
  }

  applyView() {
    if (!this._svg || !this._extent) return;
    const v = this.view();
    const { w, h } = this._extent;
    this._svg.setAttribute('viewBox', `${(v.x * w).toFixed(2)} ${(v.y * h).toFixed(2)} ${(w / v.k).toFixed(2)} ${(h / v.k).toFixed(2)}`);
    this._svg.style.touchAction = v.k > 1.001 ? 'none' : 'manipulation';
  }

  paintHeader(scene, states) {
    const lit = Object.values(scene.roomLevels || {});
    const on = lit.reduce((n, r) => n + r.on, 0);
    const total = lit.reduce((n, r) => n + r.total, 0);
    const sun = scene.sun;
    const bits = [`${on} of ${total} lights on`];
    if (sun && typeof sun.elevation === 'number') {
      const wx = states[(FPS_DATA.project.sun || {}).weatherEntity || ((FPS_DATA.project.sun || {}).weather || {}).entity];
      const sky = wx ? String(wx.state).replace(/-/g, ' ') : null;
      bits.push(`${sky ? sky + ', ' : ''}sun ${Math.round(sun.elevation)}°`);
    }
    const head = this._root.querySelector('.fps-head');
    head.replaceChildren();
    const title = document.createElement('span');
    title.className = 'fps-title';
    title.textContent = this._config.title || this._floor.name || this._floor.id;
    const sub = document.createElement('span');
    sub.className = 'fps-sub';
    sub.textContent = bits.join(' · ');
    head.append(title, sub);
  }

  /* --------------------------------------------------------- interaction */

  onPointerDown(ev) {
    const t = ev.target.closest ? ev.target.closest('.fps-hit') : null;
    if (!t) return;
    /* The start position goes in too: a drag that turns into a pan must not
     * also fire the tap it began as. */
    this._press = { target: t.dataset.target, id: t.dataset.id, at: Date.now(), x: ev.clientX, y: ev.clientY };
  }

  onPointerUp(ev) {
    const p = this._press;
    this._press = null;
    if (!p) return;
    const held = Date.now() - p.at > FPS_TAP_MS;
    ev.preventDefault();
    if (p.target === 'item') return held ? this.moreInfoForItem(p.id) : this.primaryForItem(p.id);
    if (p.target === 'opening') return this.moreInfoForOpening(p.id);
    if (p.target === 'room') return this.toggleControls(p.id, held);
  }

  item(id) { return (this._floor.items || []).find((i) => i.id === id); }

  /* Tap a light, it toggles. Tap a sensor, there is nothing to toggle, so it
   * opens instead — the alternative is a tap that silently does nothing, which
   * reads as a broken plan rather than as a read-only marker. */
  primaryForItem(id) {
    const it = this.item(id);
    if (!it) return;
    if (!it.entity) {
      if ((it.kind || '') === 'furniture') return this.toggleControls(this.roomIdOf(it), false);
      return;
    }
    const type = PlanScene.resolveType(FPS_DATA.library, it) || {};
    if ((type.render || {}).tapAction === 'moreInfo') return this.moreInfo(it.entity);
    /* In a GANGED room the lamps share one physical switch, so tapping either
     * marker has to act on all of them — drawing two independently tappable
     * markers and then switching one would be a lie about the wiring. The
     * room's master group is used when it has one, since that is what the
     * house's own automations act on. */
    const room = this.roomOf(it);
    if (room && room.ganged && (it.kind || 'fixture') === 'fixture') {
      const ids = this.roomTarget(room);
      /* Read "is the room lit" from the markers, not from the call list: the
       * master is in that list and a group's own state can lag its members. */
      const on = [...new Set(this.roomItems(room)
        .filter((i) => (i.kind || 'fixture') === 'fixture' && i.entity)
        .map((i) => i.entity))].some((id) => this.isOn(id));
      const byDomain = {};
      for (const id of ids) (byDomain[id.split('.')[0]] = byDomain[id.split('.')[0]] || []).push(id);
      for (const [domain, entity_id] of Object.entries(byDomain)) {
        this.call(domain, on ? 'turn_off' : 'turn_on', { entity_id });
      }
      return undefined;
    }

    /* What a tap does is a lookup, not a switch statement: the same table the
     * control surface uses, so a scene marker on the plan and the same scene in
     * the sheet cannot disagree about what tapping it means. A marker carrying
     * its own `data` is how "set the fan to 3" gets drawn — one marker per
     * value, each running the same script with different variables. */
    const spec = Controls.actionFor(it.entity, FPS_DATA.controls);
    return this.runAction(spec.tap, it.entity, (it.props || {}).data) || this.moreInfo(it.entity);
  }

  /* `toggle` means the entity's own domain toggle; anything else names its
   * service outright. Returns true when it did something, so the caller can
   * fall back to opening the entity rather than doing nothing at all. */
  runAction(action, entityId, data) {
    if (!action || !entityId) return false;
    const domain = entityId.split('.')[0];
    let service = action === 'toggle' ? domain + '.toggle' : (action && action.service);
    if (!service) return false;
    const [d, s] = service.split('.');
    this.call(d, s, Object.assign({ entity_id: entityId }, action.data || {}, data || {}));
    return true;
  }

  /* What a LONG PRESS opens.
   *
   * Holding a camera should show you who it saw, not the camera again — the
   * paired detection sensor is the useful thing and it is a different entity.
   * That generalises: a marker may name its own hold target, and a type may
   * describe how to GUESS one from the entity it is bound to.
   *
   * Three rules keep the guess safe:
   *  - an explicit `props.holdEntity` always wins, because a guess is a guess
   *    and this house has one camera whose sensor is named nothing like it;
   *  - a guess is only used if that entity actually EXISTS in `hass.states`, so
   *    a hint that does not apply costs nothing;
   *  - failing both, hold falls back to the marker's own entity, which is what
   *    it has always done. A marker bound to nothing opens nothing rather than
   *    erroring.
   */
  holdTargetFor(it) {
    if (!it) return null;
    const p = it.props || {};
    if (p.holdEntity) return p.holdEntity;
    if (!it.entity) return null;
    const type = PlanScene.resolveType(FPS_DATA.library, it) || {};
    const hint = (type.render || {}).hold;
    if (hint) {
      const states = (this._hass && this._hass.states) || {};
      let stem = it.entity.split('.').slice(1).join('.');
      for (const s of [].concat(hint.strip || [])) {
        if (stem.endsWith(s)) { stem = stem.slice(0, -s.length); break; }
      }
      for (const domain of [].concat(hint.domain || 'binary_sensor')) {
        for (const suffix of [].concat(hint.suffix || [])) {
          const candidate = `${domain}.${stem}${suffix}`;
          if (states[candidate]) return candidate;
        }
      }
    }
    return it.entity;
  }

  moreInfoForItem(id) {
    const target = this.holdTargetFor(this.item(id));
    if (target) this.moreInfo(target);
  }

  moreInfoForOpening(id) {
    const op = (this._floor.openings || []).find((o) => o.id === id);
    if (op && op.sensor) this.moreInfo(op.sensor);
  }

  roomIdOf(item) {
    if (item.room) return item.room;
    const r = PlanScene.roomAt(this._floor, item.at[0], item.at[1]);
    return r ? r.id : null;
  }

  /* The room a marker belongs to, as an object. `part_of` rects resolve to the
   * primary, so a lamp in one half of an L-shaped room answers to the whole. */
  roomOf(item) {
    const id = this.roomIdOf(item);
    const r = (this._floor.rooms || []).find((x) => x.id === id);
    return r ? (PlanScene.primaryRoom(this._floor, r) || r) : null;
  }

  toggleControls(roomId, held) {
    if (!roomId || this._config.controls === false) return;
    const room = (this._floor.rooms || []).find((r) => r.id === roomId);
    if (!room) return;
    const cfg = Controls.resolve(FPS_DATA.controls, FPS_DATA.project, this._floor, room);
    if (!cfg.enabled) return;
    /* Hold on a room is "all on" without going through the sheet, because that
     * is the one action worth a shortcut — the openOn config decides. */
    if (held && (cfg.openOn || {}).chipHold === 'allOn') return this.roomAction(room, 'allOn', null, cfg);
    this._open = this._open === roomId ? null : roomId;
    this._sig = null;
    if (this._open) this.paintControls(this._open, this.stateMap());
    else this.closeControls();
  }

  closeControls() {
    this._open = null;
    const s = this._root.querySelector('.fps-surface');
    s.hidden = true;
    s.replaceChildren();
  }

  /* ------------------------------------------------------ control surface */

  roomItems(room) {
    return (this._floor.items || []).filter((i) => {
      const rid = i.room || (PlanScene.roomAt(this._floor, i.at[0], i.at[1]) || {}).id;
      return rid === room.id;
    });
  }

  paintControls(roomId) {
    const room = (this._floor.rooms || []).find((r) => r.id === roomId);
    if (!room) return this.closeControls();
    const cfg = Controls.resolve(FPS_DATA.controls, FPS_DATA.project, this._floor, room);
    const items = this.roomItems(room);
    /* The full state map, not this floor's slice: a scenes row finds its own
     * entities from everything Home Assistant knows, and a room's helpers are
     * frequently not markers on any floor. */
    const ctx = {
      room, items, areaEntities: [], library: FPS_DATA.library,
      states: this._hass.states, shortcuts: cfg.shortcuts, controls: FPS_DATA.controls,
    };
    const spec = cfg.designSpec || {};

    const box = this._root.querySelector('.fps-surface');
    box.hidden = false;
    box.className = 'fps-surface fps-surface-' + (spec.surface || 'sheet') + ' fps-anchor-' + (spec.anchor || 'bottom');
    box.style.setProperty('--fps-w', (spec.size && spec.size.width) || 'min(560px, 94vw)');
    box.style.setProperty('--fps-maxh', (spec.size && spec.size.maxHeight) || '70vh');
    box.style.setProperty('--fps-cols', String(spec.columns || 3));
    box.replaceChildren();

    if (spec.backdrop) {
      const back = document.createElement('div');
      back.className = 'fps-backdrop';
      if ((cfg.dismiss || {}).backdrop !== false) back.addEventListener('click', () => this.closeControls());
      box.appendChild(back);
    }

    const panel = document.createElement('div');
    panel.className = 'fps-panel' + (spec.tiles ? ' fps-tiles' : '');
    if (spec.grabBar) {
      const bar = document.createElement('div');
      bar.className = 'fps-grab';
      bar.addEventListener('click', () => this.closeControls());
      panel.appendChild(bar);
    }

    if ((cfg.header || {}).show !== false) panel.appendChild(this.controlHeader(cfg, room, items));

    for (const section of cfg.sections || []) {
      const node = this.controlSection(section, cfg, room, items, ctx, spec);
      if (node) panel.appendChild(node);
    }
    box.appendChild(panel);
  }

  controlHeader(cfg, room, items) {
    const head = document.createElement('div');
    head.className = 'fps-panel-head';
    const name = document.createElement('div');
    name.className = 'fps-room';
    name.textContent = room.name || room.id;
    head.appendChild(name);

    if ((cfg.header || {}).showCount !== false) {
      /* Counted over ENTITIES, not markers. One switch can drive two fittings —
       * a pair of gate lamps, a row of downlights on one relay — and each gets
       * its own marker because that is where they physically are. Counting
       * markers reported "2 of 6 on" for a single switch, and disagreed with
       * the All on/off beside it, which acts on entities. */
      const lamps = [...new Set(items
        .filter((i) => (i.kind || 'fixture') === 'fixture' && i.entity)
        .map((i) => i.entity))];
      const on = lamps.filter((e) => this.isOn(e)).length;
      const count = document.createElement('div');
      count.className = 'fps-count';
      count.textContent = String((cfg.header || {}).countFormat || '{on} of {total} on')
        .replace('{on}', on).replace('{total}', lamps.length);
      head.appendChild(count);
    }

    const row = document.createElement('div');
    row.className = 'fps-btns';
    for (const b of (cfg.header || {}).buttons || []) {
      const target = Controls.resolveTarget(b.target, cfg.shortcuts, room);
      const btn = document.createElement('button');
      btn.className = 'fps-btn' + (target && this.isOn(target) ? ' on' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => this.headerAction(b, cfg, room, items));
      row.appendChild(btn);
    }
    /* Then the house's own buttons. The framework supplies four and has no
     * opinion about the rest: a do-not-disturb boolean, a turbo switch and a
     * goodnight scene are all the same thing to this loop — a label and
     * something to call. */
    for (const s of (cfg.header || {}).shortcuts || []) {
      row.appendChild(this.shortcutButton(s, 'fps-btn'));
    }
    head.appendChild(row);
    return head;
  }

  /* One of the user's shortcuts, as a button. */
  shortcutButton(shortcut, className) {
    const state = shortcut.state || shortcut.entity;
    const btn = document.createElement('button');
    btn.className = className + (state && this.isOn(state) ? ' on' : '');
    btn.textContent = shortcut.label || shortcut.id || shortcut.entity || 'Run';
    btn.title = shortcut.entity || shortcut.service || '';
    btn.addEventListener('click', () => this.runShortcut(shortcut));
    return btn;
  }

  runShortcut(shortcut) {
    const call = Controls.shortcutCall(shortcut, FPS_DATA.controls);
    if (!call) return;
    if (shortcut.confirm && !window.confirm(`${shortcut.label || 'This'} — run it?`)) return;
    const [d, s] = call.service.split('.');
    this.call(d, s, call.data);
  }

  headerAction(b, cfg, room, items) {
    if (b.action === 'close') return this.closeControls();
    if (b.action === 'allOn' || b.action === 'allOff') return this.roomAction(room, b.action, items, cfg);
    const target = Controls.resolveTarget(b.target, cfg.shortcuts, room);
    if (!target) return;
    if (b.action === 'moreInfo') return this.moreInfo(target);
    if (b.action === 'toggle') {
      const spec = Controls.actionFor(target, FPS_DATA.controls);
      return this.runAction(spec.tap || 'toggle', target, b.data);
    }
  }

  /* All on / all off.
   *
   * A room with a master light group means it: one call to the group beats
   * fanning out over the markers, because the group is what the house's own
   * automations act on and the two should not disagree. Without one, walk the
   * lamps. Which members the master does NOT reach is roomTarget's problem. */
  roomAction(room, action, items, cfg) {
    const ids = this.roomTarget(room, items);
    if (!ids.length) return;
    const byDomain = {};
    for (const id of ids) (byDomain[id.split('.')[0]] = byDomain[id.split('.')[0]] || []).push(id);
    for (const [domain, entity_id] of Object.entries(byDomain)) {
      this.call(domain, action === 'allOn' ? 'turn_on' : 'turn_off', { entity_id });
    }
  }

  /* Every entity a room-wide command actually has to reach.
   *
   * A `master` is a light group used as the whole-room control, and this card
   * used to treat it as the whole room. A group does not have to be. A
   * Zigbee2MQTT group can only ever hold Zigbee2MQTT devices, so a mains-wired
   * relay on another integration can sit in the room and outside its master at
   * the same time — and "All on" would skip it, silently, forever. An HA light
   * group can simply have been built from a different list than the plan was.
   *
   * So: lead with the master, because for a Z2M group that is one broadcast
   * instead of N unicasts and it is what the house's automations act on, then
   * add back any member it demonstrably does not reach. A group that publishes
   * its membership in `attributes.entity_id` is walked; one that publishes
   * nothing is treated as covering nothing, and its members ride along
   * explicitly. turn_on/turn_off are idempotent, so a member that IS inside an
   * opaque group just takes a harmless second command — being wrong that way
   * costs a packet, being wrong the other way costs a light that never comes on. */
  resolveGroup(entity, seen) {
    const out = seen || new Set();
    if (!entity || out.has(entity)) return out;      // `seen` is also the cycle guard
    out.add(entity);
    const st = ((this._hass && this._hass.states) || {})[entity];
    const kids = st && st.attributes ? st.attributes.entity_id : null;
    if (Array.isArray(kids)) for (const k of kids) this.resolveGroup(k, out);
    return out;
  }

  roomTarget(room, items) {
    const members = [...new Set((items || this.roomItems(room))
      .filter((i) => (i.kind || 'fixture') === 'fixture' && i.entity)
      .map((i) => i.entity))];
    const master = room && room.master;
    if (!master) return members;
    const covered = this.resolveGroup(master);
    return [master, ...members.filter((e) => !covered.has(e))];
  }

  controlSection(section, cfg, room, items, ctx, spec) {
    const wrap = document.createElement('div');
    wrap.className = 'fps-section';
    if (section.label && !spec.flattenSections) {
      const h = document.createElement('div');
      h.className = 'fps-section-label';
      h.textContent = section.label;
      wrap.appendChild(h);
    }

    if (section.type === 'brightness') {
      const dimmable = Controls.applyFilter(
        items.filter((i) => (i.kind || 'fixture') === 'fixture' && i.entity)
          .map((i) => ({ entity: i.entity, domain: i.entity.split('.')[0], label: i.name, item: i })),
        section.filter, ctx,
      ).map((c) => c.entity).filter((e) => e.startsWith('light.'));
      if (!dimmable.length) return null;
      const lit = dimmable.map((e) => (this._hass.states[e] || {}).attributes || {})
        .map((a) => a.brightness).filter((b) => typeof b === 'number');
      const slider = document.createElement('input');
      slider.type = 'range'; slider.min = '1'; slider.max = '255'; slider.className = 'fps-slider';
      slider.value = String(lit.length ? Math.round(lit.reduce((a, b) => a + b, 0) / lit.length) : 128);
      slider.addEventListener('change', () => {
        this.call('light', 'turn_on', { entity_id: [...new Set(dimmable)], brightness: Number(slider.value) });
      });
      wrap.appendChild(slider);
      return wrap;
    }

    if (section.type === 'groups') {
      const groups = Controls.groupsFor(items, section.groupBy, ctx);
      if (!groups.length) return null;
      const row = document.createElement('div');
      row.className = 'fps-btns';
      for (const g of groups) {
        const on = g.entities.filter((e) => this.isOn(e)).length;
        const btn = document.createElement('button');
        btn.className = 'fps-btn' + (on ? ' on' : '');
        btn.textContent = `${this.typeLabel(g.type)} ${on}/${g.entities.length}`;
        btn.addEventListener('click', () => {
          const domain = g.entities[0].split('.')[0];
          this.call(domain, on ? 'turn_off' : 'turn_on', { entity_id: g.entities });
        });
        row.appendChild(btn);
      }
      wrap.appendChild(row);
      return wrap;
    }

    /* entities / scenes / anything list-shaped */
    const cands = Controls.sectionEntities(section, ctx);
    if (!cands.length) return null;
    const grid = document.createElement('div');
    grid.className = 'fps-grid';
    for (const c of cands) {
      grid.appendChild(this.entityTile(c, section));
    }
    wrap.appendChild(grid);
    return wrap;
  }

  /* One tile, whatever the entity is.
   *
   * Which widget it gets and what a tap does come from the action registry in
   * controls.json, not from a chain of `if (domain === ...)` here. That is the
   * difference between "helpers are supported" and "input_boolean, and then
   * somebody adds input_number and edits four files". A domain the registry has
   * never heard of falls through to the default — a toggle — which is right far
   * more often than it is wrong, and is fixed by a JSON entry when it is not. */
  entityTile(cand, section) {
    const st = this._hass.states[cand.entity];
    const attrs = (st && st.attributes) || {};
    /* A bare service-call shortcut has a synthetic key rather than an entity,
     * so there is no state to read and no domain behaviour to look up: it is a
     * button that runs a thing, full stop. */
    const synthetic = String(cand.entity).startsWith('shortcut.');
    const spec = synthetic
      ? { control: 'button', onRule: 'momentary' }
      : Controls.actionFor(cand.entity, FPS_DATA.controls);
    /* A candidate that came from one of the user's shortcuts carries it, and
     * the shortcut wins: it may name its own service, its own data, and the
     * entity whose state decides whether the tile looks lit. */
    const shortcut = cand.action || null;
    const stateOf = (shortcut && shortcut.state) || cand.entity;
    const control = section.readOnly ? 'readout' : (spec.control || 'toggle');
    const friendly = (shortcut && shortcut.label) || cand.label || attrs.friendly_name || cand.entity;
    const text = section.shortLabels ? this.shorten(friendly) : friendly;

    if (control === 'number' || control === 'select' || control === 'text') {
      return this.valueTile(cand, spec, st, text, control);
    }

    const tile = document.createElement('button');
    tile.className = 'fps-tile fps-tile-' + control
      + (this.isOn(stateOf) ? ' on' : '') + (st || synthetic ? '' : ' dead')
      + (cand.shortcut ? ' fps-shortcut' : '');

    if (section.swatch) {
      const dot = document.createElement('span');
      dot.className = 'fps-swatch';
      dot.style.background = this.isOn(cand.entity) ? PlanScene.lampColour(st, this.theme()) : 'transparent';
      tile.appendChild(dot);
    }
    const label = document.createElement('span');
    label.className = 'fps-tile-label';
    label.textContent = text;
    tile.appendChild(label);

    if (control === 'readout') {
      const v = document.createElement('span');
      v.className = 'fps-tile-value';
      v.textContent = st ? `${st.state}${attrs.unit_of_measurement || ''}` : 'unavailable';
      tile.appendChild(v);
      tile.addEventListener('click', () => this.moreInfo(cand.entity));
      return tile;
    }

    /* A hold runs the declared alternative where there is one — Run now for an
     * automation, Cancel for a timer — and opens the entity where there is not.
     * Both are one line of JSON away from each other, which is the point. */
    tile.title = spec.alt ? (spec.altLabel || 'hold for the alternative') : 'hold for details';
    let held = false, timer = null;
    tile.addEventListener('pointerdown', () => {
      held = false;
      timer = setTimeout(() => {
        held = true;
        if (!this.runAction(spec.alt, cand.entity, cand.data)) this.moreInfo(cand.entity);
      }, FPS_TAP_MS);
    });
    tile.addEventListener('pointerup', () => {
      clearTimeout(timer);
      if (held) return;
      if (shortcut) return this.runShortcut(shortcut);
      if (!this.runAction(spec.tap, cand.entity, cand.data)) this.moreInfo(cand.entity);
    });
    tile.addEventListener('pointercancel', () => clearTimeout(timer));
    return tile;
  }

  /* A helper you SET rather than switch: a number, a dropdown, a line of text.
   * The widget writes back through the service the registry names, so adding a
   * settable domain is a JSON entry here too. */
  valueTile(cand, spec, st, text, control) {
    const attrs = (st && st.attributes) || {};
    const wrap = document.createElement('div');
    wrap.className = 'fps-tile fps-tile-' + control + (st ? '' : ' dead');

    const label = document.createElement('span');
    label.className = 'fps-tile-label';
    label.textContent = text;
    label.addEventListener('click', () => this.moreInfo(cand.entity));
    wrap.appendChild(label);

    const set = (value) => {
      if (!spec.set || !spec.set.service) return;
      const [d, s] = spec.set.service.split('.');
      const data = Object.assign({ entity_id: cand.entity }, cand.data || {});
      data[spec.set.field || 'value'] = value;
      this.call(d, s, data);
    };

    if (control === 'select') {
      const sel = document.createElement('select');
      sel.className = 'fps-select';
      const options = attrs[(spec.optionsFrom) || 'options'] || [];
      for (const o of options) {
        const opt = document.createElement('option');
        opt.value = o; opt.textContent = o;
        if (st && st.state === o) opt.selected = true;
        sel.appendChild(opt);
      }
      if (!options.length) sel.disabled = true;
      sel.addEventListener('change', () => set(sel.value));
      wrap.appendChild(sel);
      return wrap;
    }

    if (control === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'fps-input';
      input.value = st ? st.state : '';
      input.addEventListener('change', () => set(input.value));
      wrap.appendChild(input);
      return wrap;
    }

    /* A number with a declared range gets a slider, because a range is what a
     * slider is FOR; one without gets a box, because a slider with invented
     * bounds is a slider that lies. */
    const r = spec.range || {};
    const min = attrs[r.min || 'min'], max = attrs[r.max || 'max'], step = attrs[r.step || 'step'];
    const input = document.createElement('input');
    const ranged = typeof min === 'number' && typeof max === 'number';
    input.type = ranged ? 'range' : 'number';
    input.className = ranged ? 'fps-slider' : 'fps-input';
    if (typeof min === 'number') input.min = String(min);
    if (typeof max === 'number') input.max = String(max);
    if (typeof step === 'number') input.step = String(step);
    input.value = st ? String(st.state) : '';
    const value = document.createElement('span');
    value.className = 'fps-tile-value';
    value.textContent = st ? `${st.state}${attrs.unit_of_measurement || ''}` : '—';
    input.addEventListener('input', () => { value.textContent = `${input.value}${attrs.unit_of_measurement || ''}`; });
    input.addEventListener('change', () => set(Number(input.value)));
    wrap.append(input, value);
    return wrap;
  }

  /* A room's own name is already the heading, so "Master Bedroom Spot 3" can
   * lose the part the user is already looking at. */
  shorten(name) {
    const room = this._open ? ((this._floor.rooms || []).find((r) => r.id === this._open) || {}).name : null;
    let out = String(name);
    if (room) out = out.replace(new RegExp('^' + room.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i'), '');
    return out.length > 22 ? out.slice(0, 21) + '…' : out;
  }

  /* Library labels name the type twice on purpose — "Spot / downlight" so the
   * palette is searchable by either word. A group button has room for one, and
   * the first is the one people say out loud. */
  typeLabel(typeKey) {
    const lib = FPS_DATA.library;
    const t = lib.types['fixture.' + typeKey] || lib.types[typeKey]
      || (lib.aliases[typeKey] && lib.types[lib.aliases[typeKey]]);
    return String((t && t.label) || typeKey).split('/')[0].trim();
  }

  /* "Is this on" is per domain and lives in the action registry — a cover is on
   * when it is not closed, a timer when it is not idle, a scene never. This
   * used to be a hardcoded word list here, which meant the card and the plan
   * could disagree about the same entity. */
  isOn(entity) {
    return Controls.isOn(entity, this._hass.states, FPS_DATA.controls);
  }

  /* --------------------------------------------------------- HA plumbing */

  /* Every service call in this card goes through here, which is what makes the
   * optimistic guess a single place rather than a flag on twenty call sites. */
  call(domain, service, data) {
    const ids = [].concat((data && data.entity_id) || []);
    const guess = this.guessFor(ids[0], `${domain}.${service}`);
    /* The originating call rides along so a retry can re-send exactly it — the
     * same service, the same data, narrowed to the one entity that has not
     * answered. Re-sending the whole batch would command everything that
     * already arrived a second time. */
    if (guess) for (const id of ids) this.guess(id, guess, { domain, service, data });
    this._hass.callService(domain, service, data);
  }

  moreInfo(entityId) {
    const ev = new Event('hass-more-info', { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }
}

customElements.define('fps-floorplan-card', FpsFloorplanCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'fps-floorplan-card',
  name: 'Floorplan Studio plan',
  description: 'A live floor plan generated by the Floorplan Studio app.',
  preview: false,
});
