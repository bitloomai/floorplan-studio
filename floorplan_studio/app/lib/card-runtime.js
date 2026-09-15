/**
 * The live card: `custom:fps-floorplan-card`.
 *
 * NOT a UMD module and not loaded on its own. `card-build.js` concatenates the
 * shared scene libraries and this file into one Lovelace module resource, with
 * the project baked in. Inside that bundle `Shapes`, `Flooring`, `SunModel`,
 * `Controls`, `Lighting`, `PlanScene`, `EntityBindings` and `FPS_DATA` are
 * already in scope.
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

/* The app's theme, on a card's host as CSS custom properties.
 *
 * The plan has always been drawn in the chosen theme; the controls round it —
 * a room's sheet, its buttons and tiles, the house and floor cards — were Home
 * Assistant's greys with a hard-coded amber. Now one theme drives both: its
 * `ui` tokens are the sheet's surface, ink, lines and accent, and its lamp
 * colour is what "on" looks like. A theme that follows Home Assistant resolves
 * to its light or dark base by the host's own text colour, exactly as the plan
 * does. The stylesheet keeps Home Assistant's variables behind every one, and
 * a house's own CSS still wins. Shared by all three cards. */
function fpsApplyTheme(host, config) {
  const doc = (FPS_DATA && FPS_DATA.themes) || { themes: {} };
  const id = (config && config.theme) || (FPS_DATA.project.dashboard || {}).theme || 'ha';
  const t = doc.themes[id] || doc.themes[FPS_DATA.project.activeTheme] || doc.themes[doc.active] || {};
  let base = t;
  if (t.follows) {
    const cs = getComputedStyle(host);
    const rgb = FpsFloorplanCard.parseRgb(cs.getPropertyValue('--primary-text-color').trim() || cs.color);
    const dark = !!rgb && (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.55;
    base = doc.themes[t.follows[dark ? 'dark' : 'light']] || t;
  }
  const key = id + '|' + (base.name || '');
  if (host._fpsThemeKey === key) return;
  host._fpsThemeKey = key;
  const ui = Object.assign({}, t.ui, base.ui);
  const plan = Object.assign({}, t.plan, base.plan);
  const vars = {
    '--fps-surface': ui.panelBg, '--fps-surface-2': ui.railBg || ui.appBg,
    '--fps-ink': ui.ink, '--fps-ink-soft': ui.inkSoft, '--fps-line': ui.panelBorder,
    '--fps-accent': ui.accent, '--fps-accent-ink': ui.accentInk, '--fps-live': ui.accent,
    '--fps-lamp': plan.lampRim || plan.lampWarm,
    /* Everything the popup draws on its own surface is a token (card-contrast
     * lists them). A rule that fell back to a Home Assistant variable instead
     * was at the mercy of glass themes, which make dividers near-white. */
    '--fps-swatch-ring': ui.swatchRing, '--fps-scrim': ui.scrim,
  };
  /* Through the prototype's getter, not `host.style`: a card may define its
   * own `style` member — the floor card's `style()` says which layout it
   * draws — and that shadows the element's CSS declaration. */
  const css = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style').get.call(host);
  for (const [k, v] of Object.entries(vars)) {
    if (v) css.setProperty(k, v); else css.removeProperty(k);
  }
}

class FpsFloorplanCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sig = null;
    this._hass = null;
    this._open = null;        // room id whose control surface is showing
    this._clock = null;
    this._layoutTop = null;
    this._resizeObserver = null;
    this._onWindowResize = null;
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
    this._bound = null;
    this._sig = null;
    this._built = false;
    this._layoutTop = null;
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
    this.attachResponsiveFit();
    /* Escape closes the open control surface. On DOCUMENT, because the surface
     * is not focusable and a keystroke aimed at "the dialog" arrives at the
     * body; guarded by `_open` so a card with nothing showing never swallows a
     * key another card wanted. The room's own `dismiss.escape` decides. */
    if (!this._onKey) {
      this._onKey = (ev) => {
        if (ev.key !== 'Escape' || !this._open) return;
        const room = (this._floor.rooms || []).find((r) => r.id === this._open);
        if (!room) return;
        const cfg = Controls.resolve(FPS_DATA.controls, FPS_DATA.project, this._floor, room);
        if ((cfg.dismiss || {}).escape === false) return;
        ev.stopPropagation();
        this.closeControls();
      };
      document.addEventListener('keydown', this._onKey);
    }
  }

  disconnectedCallback() {
    if (this._clock) { clearInterval(this._clock); this._clock = null; }
    if (this._onKey) { document.removeEventListener('keydown', this._onKey); this._onKey = null; }
    /* In-flight retries go with the card. A timer that outlived it would fire a
     * service call from a card nobody is looking at, and a retry only makes
     * sense as the tail of a tap that is still on screen. */
    if (this._guesses) {
      for (const g of this._guesses.values()) clearTimeout(g.timer);
      this._guesses.clear();
    }
    if (this._movingTimer) { clearTimeout(this._movingTimer); this._movingTimer = null; }
    if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
    if (this._onWindowResize) { window.removeEventListener('resize', this._onWindowResize); this._onWindowResize = null; }
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
    this._bound = EntityBindings.floor(FPS_DATA.project, this._floor, FPS_DATA.controls);
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
    if (op.sensor || op.cover) {
      const status = PlanScene.openingState(op, t, this._hass.states);
      bits.push(status.known ? `${status.state} · ${Math.round(status.position * 100)}% open` : 'unknown — default drawing');
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
    /* The commands in flight, because the pulse is drawn from them. A guess
     * Home Assistant confirms is retired inside stateMap(), timer and all, at
     * the moment the entity is already showing the state it was guessed at —
     * so nothing above differs from the guessed paint. Without this the
     * repaint that takes the pulse off was skipped, and the marker blinked
     * until something else on the floor changed. Anything whose drawn
     * attributes do not move with its state hit it: a switch, a fan that keeps
     * its speed while off. A lamp mostly escaped because its brightness moves. */
    parts.push('pending=' + [...this.pendingSet()].sort().join(','));
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
    /* Not while the view is moving. A state update mid-pinch rebuilt the whole
     * scene under the fingers, and with many lamps lit that rebuild is the
     * expensive thing; the gesture moves the plan as last painted, and the
     * update is drawn once, when the view settles (markMoving). */
    if (this._movingTimer && this._built) { this._renderHeld = true; return; }
    const states = this.stateMap();
    const sig = this.signature(states);
    if (sig === this._sig) return;
    this._sig = sig;

    const theme = this.theme();
    fpsApplyTheme(this, this._config);
    const scene = PlanScene.build(FPS_DATA.project, this._floor, FPS_DATA.library, theme, {
      states,
      boundaries: FPS_DATA.boundaries,
      flooring: FPS_DATA.flooring,
      lighting: this._config.lighting,
      motion: this._config.motion !== false,
      pending: this.pendingSet(),
      /* No `when`: the scene uses now to the whole minute. A millisecond here
       * made every redraw a new sun, and the redraw that follows a night
       * bitmap landing never settled between dawn and dusk (plan-scene). */
      grid: { show: false },
      /* Flat unless a dashboard asks otherwise: blend modes made the plan tear
       * on a desktop GPU and masks made it crawl (plan-scene, `flat`).
       * `compositing: 'blend'` on the card or the dashboard puts them back. */
      compositing: this._config.compositing || (FPS_DATA.project.dashboard || {}).compositing || 'flat',
    });
    this._scene = scene;

    if (!this._built) this.buildShell(theme);
    this.paintPlan(scene, theme, states);
    if (this._config.header !== false) this.paintHeader(scene, states);
    if (this._open) this.paintControls(this._open, states);
    this.fitWide();
  }

  buildShell(theme) {
    const style = document.createElement('style');
    style.textContent = FPS_CARD_CSS;
    const root = document.createElement('div');
    root.className = 'fps-card fps-plan-card';
    root.innerHTML = '<div class="fps-head" part="head"></div>'
      + '<div class="fps-plan"></div>'
      + '<div class="fps-surface" hidden></div>';
    this.shadowRoot.replaceChildren(style, root);
    /* Capture, so it runs before the backdrop's own listener: see swallowTapClick. */
    root.addEventListener('click', (ev) => this.swallowTapClick(ev), true);
    this._root = root;
    this._built = true;
    this.attachResponsiveFit();
  }

  /* On a wide display, width:100% makes a roughly square plan almost as tall
   * as the screen is wide. The old AK card solved that by narrowing the WHOLE
   * card until the plan, its header and the summary below fit the viewport
   * height. Keep that invariant here: letterboxing only the SVG would break
   * the pan/zoom coordinate frame and leave a large empty card around it. */
  attachResponsiveFit() {
    if (!this.isConnected || !this._root) return;
    if (!this._resizeObserver && window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => this.fitWide());
      this._resizeObserver.observe(this);
    }
    if (!this._onWindowResize) {
      this._onWindowResize = () => this.fitWide();
      window.addEventListener('resize', this._onWindowResize);
    }
  }

  fitWide() {
    if (!this._root || !this._extent) return;
    /* At every width, not only a wide screen: the plan has to be in view
     * without scrolling on a phone as well, while the floor snapshot under it
     * may scroll (user, 2026-09-13, with the old card on a phone as the model).
     * Where the plan already fits its width the cap is wider than the card and
     * changes nothing. The top is measured again when the width changes — a
     * phone turned on its side is a different layout. */
    const BELOW = 12;          // a little air under the plan; the snapshot scrolls
    const FALLBACK_TOP = 130;  // Home Assistant header, house card and gaps
    const MIN_H = 280;
    if (this._layoutTop == null || this._layoutWidth !== window.innerWidth) {
      const top = this.getBoundingClientRect().top;
      this._layoutTop = top > 0 && top < window.innerHeight * .6 ? top : (this._layoutTop || FALLBACK_TOP);
      this._layoutWidth = window.innerWidth;
    }
    const head = this._root.querySelector('.fps-head');
    const headerH = head ? (head.getBoundingClientRect().height || 43) : 0;
    const availableH = Math.max(MIN_H, window.innerHeight - this._layoutTop - headerH - BELOW);
    const width = Math.round(availableH * (this._extent.w / this._extent.h));
    this._root.style.maxWidth = width + 'px';
  }

  paintPlan(scene, theme, states) {
    const NS = 'http://www.w3.org/2000/svg';
    const viewport = this._root.querySelector('.fps-plan');
    /* One SVG for the life of the shell, updated in place below. A new shell
     * (a floor switched in setConfig) is a new viewport, which starts fresh. */
    const fresh = !this._svg || this._svg.parentNode !== viewport;
    const svg = fresh ? document.createElementNS(NS, 'svg') : this._svg;
    if (fresh) {
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('class', 'fps-svg');
    }
    svg.setAttribute('viewBox', `0 0 ${scene.width} ${scene.height}`);
    svg.style.background = theme.sheet || 'transparent';

    const el = (tag, attrs, text) => {
      const n = document.createElementNS(NS, tag);
      /* A blend mode is a CSS property, not an SVG presentation attribute: set
       * as an attribute the browser ignores it and a screened wash paints as
       * a flat veil. */
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v === undefined || v === null) continue;
        if (PlanScene.STYLE_ONLY.has(k)) n.style.setProperty(k, v); else n.setAttribute(k, v);
      }
      if (text !== undefined) n.textContent = text;
      return n;
    };
    const toEl = (n) => {
      const e = el(n.tag, n.attrs, n.text);
      for (const c of n.children || []) e.appendChild(toEl(c));
      return e;
    };

    /* Updated in place, layer by layer and node by node.
     *
     * The plan used to be rebuilt as a new SVG on every state change the floor
     * cares about. A floor carrying power readings did that every second or two
     * (21 rebuilds in a row in the user's console), and each one made the
     * browser repaint the whole plan, light and all. Every node is now compared
     * with what is on screen by its serialised form and only the ones that
     * changed are replaced — a watt reading repaints its label, not the house,
     * and a spinning fan keeps spinning instead of restarting. A layer whose
     * node count moved is rebuilt whole. */
    const prev = fresh ? {} : (this._painted || {});
    const next = {};
    const scrim = scene.scrimDoc ? this.scrimImage(scene) : null;
    /* Taps come off the SAME geometry the editor drags, via
     * PlanScene.hitTargets — so a marker that was easy to grab while placing it
     * is easy to hit here. */
    const hitNodes = PlanScene.hitTargets(this._floor, FPS_DATA.library, scene.projector, states, scene.chips)
      .map((t) => ({ tag: t.tag, attrs: Object.assign({ fill: t.tag === 'line' ? 'none' : 'transparent' }, t.attrs,
        { class: 'fps-hit fps-hit-' + t.target, 'data-target': t.target, 'data-id': t.id }) }));
    const groups = [['defs', scene.layers.defs]]
      .concat(scene.order.map((key) => [key, key === 'scrim' && scrim
        ? PlanScene.scrimLayer(scene, scrim)
        : (scene.layers[key] || [])]))
      .concat([['hits', hitNodes]]);
    let after = null;
    for (const [key, nodes] of groups) {
      const strs = nodes.map((n) => PlanScene.nodeToSvg(n));
      const had = prev[key];
      let g = had && had.g;
      if (!g) {
        g = key === 'defs' ? el('defs') : el('g', key === 'hits' ? { class: 'fps-hits' } : { 'pointer-events': 'none' });
        g.replaceChildren(...nodes.map(toEl));
        svg.insertBefore(g, after ? after.nextSibling : svg.firstChild);
      } else if (key === 'scrim' && scrim && strs.length === 1 && had.strs.length === 1) {
        /* A new night is swapped in whole, once decoded (swapScrim). Replaced
         * outright, the floor showed with no night for the frames the browser
         * took to paint the new image, so switching any light after dark
         * flashed the plan. */
        if (strs[0] !== had.strs[0]) this.swapScrim(g, toEl(nodes[0]));
      } else if (had.strs.length !== strs.length) {
        /* Whatever is shown now overtakes a night still being decoded. */
        if (key === 'scrim') this._scrimSeq = (this._scrimSeq || 0) + 1;
        g.replaceChildren(...nodes.map(toEl));
      } else {
        for (let i = 0; i < strs.length; i++) {
          if (strs[i] !== had.strs[i]) g.replaceChild(toEl(nodes[i]), g.childNodes[i]);
        }
      }
      next[key] = { g, strs };
      after = g;
    }
    this._painted = next;

    if (fresh) {
      svg.addEventListener('pointerdown', (ev) => this.onPointerDown(ev));
      svg.addEventListener('pointerup', (ev) => this.onPointerUp(ev));
      svg.addEventListener('pointercancel', () => { this._press = null; });
      if (this.tooltipsOn()) {
        svg.addEventListener('pointermove', (ev) => this.onHover(ev));
        svg.addEventListener('pointerleave', () => this.hideTip());
      }
      if (this._movingTimer) svg.classList.add('fps-zooming');
    }

    this._svg = svg;
    this._extent = { w: scene.width, h: scene.height };
    /* Once per viewport: the listeners outlive any one paint, so a pinch is
     * never dropped by a lamp somewhere else reporting in. */
    if (this._config.zoom !== false && !viewport._fpsPanZoom) {
      viewport._fpsPanZoom = true;
      this.attachPanZoom(viewport);
    }
    this.applyView();
    if (fresh) viewport.replaceChildren(svg);
  }

  /* The night scrim as a bitmap.
   *
   * In flat compositing the scrim's luminance mask — the dark cut by every lit
   * lamp and held to its walls — is the one effect with no mask-free
   * equivalent, so the scene also hands it back as a small self-contained SVG.
   * That is drawn into a canvas off the page, once per lighting change, and the
   * plan shows the bitmap: the page composites a picture, not a mask. Until the
   * first bitmap exists the masked scrim is shown; after that the previous
   * bitmap stays up while its replacement is drawn, so a lamp switching on
   * never flashes the plan. If the browser cannot draw it, the masked scrim
   * stays for good. */
  scrimImage(scene) {
    this._scrimBitmaps = this._scrimBitmaps || PlanScene.scrimBitmaps();
    return this._scrimBitmaps.get(scene, () => { this._sig = null; this.render(); });
  }

  /* The old night stays, alone, until the new one is decoded; then one step
   * swaps them. Two earlier shapes each flickered on a desktop GPU: replacing
   * the image at once left the floor with NO night for the frames its decode
   * took (a bright flash), and laying the new one over the old until it loaded
   * stacked two translucent nights for those frames (a dark flash). The
   * newest swap wins: one still decoding when a later one arrives is dropped,
   * so the plan never steps back to an older night. */
  swapScrim(g, next) {
    const seq = (this._scrimSeq = (this._scrimSeq || 0) + 1);
    let done = false;
    const put = () => {
      if (done) return;
      done = true;
      if (seq === this._scrimSeq) g.replaceChildren(next);
    };
    if (typeof next.decode === 'function') next.decode().then(put, put);
    else put();
    setTimeout(put, 1000);
  }

  /* ------------------------------------------------------------ pan/zoom

     A whole floor at once is the right default and the wrong thing to work
     with: on a phone a marker is four millimetres across.

     Zoom is a CSS transform on the SVG inside a clipping viewport — how the
     old AK card did it — and never a viewBox change. Rewriting the viewBox on
     every wheel or pinch frame asked the browser to repaint the whole scene
     each frame, light masks, blend groups and the daylight blur included, and
     on a real house it could not keep up: the plan tore and left holes until
     the gesture stopped. A transform moves tiles that are already painted.
     Walls and labels scale with the plan, as a map's do.

     `will-change` is on only while the view is moving (`fps-zooming`). Held
     for good, it pins the raster at the scale the plan was first painted at,
     so a plan zoomed to 3x stays a soft 1x bitmap; dropped when the view
     settles, the browser repaints it sharp at the new scale, once.

     The gestures are the old card's. Pinch, or Ctrl/Cmd + wheel (which is what
     a trackpad pinch sends), zooms about the fingers or the pointer. A plain
     wheel pans a zoomed plan and scrolls the page past a fitted one, so the
     dashboard still scrolls under a mouse. A drag pans only once it has moved
     far enough to be a drag, so the plan stays tappable one-handed.         */

  attachPanZoom(viewport) {
    const pts = new Map();
    let start = null;
    const box = () => viewport.getBoundingClientRect();

    viewport.addEventListener('wheel', (ev) => {
      const r = box();
      if (ev.ctrlKey || ev.metaKey) {
        ev.preventDefault();
        /* About 1.3x for a mouse notch (deltaY 100), while a trackpad pinch's
         * small deltas stay smooth. */
        this.zoomAt(Math.exp(-ev.deltaY * 0.0025), (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
        return;
      }
      const v = this.view();
      if (v.k <= 1.001) return;                   // fitted: the wheel belongs to the page
      ev.preventDefault();
      this.setView({ k: v.k, x: v.x + (ev.deltaX / r.width) / v.k, y: v.y + (ev.deltaY / r.height) / v.k });
    }, { passive: false });

    /* The marker's own pointerdown has already run by the time this bubbles
     * up, so a second finger can cancel the tap the first one started. */
    viewport.addEventListener('pointerdown', (ev) => {
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const r = box();
        start = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          mid: [(a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top],
          view: Object.assign({}, this.view()),
        };
        this._press = null;                       // a second finger cancels the tap
      }
    });

    viewport.addEventListener('pointermove', (ev) => {
      if (!pts.has(ev.pointerId)) return;
      const prev = pts.get(ev.pointerId);
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

      if (pts.size === 2 && start) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (start.dist > 4) {
          const r = box();
          const k = Math.max(1, Math.min(this.maxZoom(), start.view.k * (dist / start.dist)));
          /* The point that sat under the fingers' first midpoint stays under
           * wherever that midpoint is now, so pinching and two-finger dragging
           * are one movement. */
          const mid = [(a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top];
          const contentX = start.view.x + (start.mid[0] / r.width) / start.view.k;
          const contentY = start.view.y + (start.mid[1] / r.height) / start.view.k;
          this.setView({
            k,
            x: contentX - (mid[0] / r.width) / k,
            y: contentY - (mid[1] / r.height) / k,
          });
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
      /* Captured, so a drag that runs off the card keeps panning and its
       * release cannot land on a marker as a tap. */
      if (viewport.setPointerCapture && !(viewport.hasPointerCapture && viewport.hasPointerCapture(ev.pointerId))) {
        try { viewport.setPointerCapture(ev.pointerId); } catch (e) { /* the pointer is already gone */ }
      }
      const r = box();
      this.setView({ k: v.k, x: v.x - (dx / r.width) / v.k, y: v.y - (dy / r.height) / v.k });
    });

    const end = (ev) => { pts.delete(ev.pointerId); if (pts.size < 2) start = null; };
    viewport.addEventListener('pointerup', end);
    viewport.addEventListener('pointercancel', end);
    /* Double-tap is the universal "put it back", and the one gesture nobody has
     * to be told about. */
    viewport.addEventListener('dblclick', (ev) => { ev.preventDefault(); this.setView({ k: 1, x: 0, y: 0 }, true); });
  }

  view() { return this._view || (this._view = { k: 1, x: 0, y: 0 }); }

  maxZoom() { return Math.max(1, Number(this._config.maxZoom) || 6); }

  /* `smooth` is for the buttons: a 1.6x step reads as a zoom when it eases and
   * as a cut when it does not. A gesture is continuous already. */
  setView(v, smooth) {
    const k = Math.max(1, Math.min(this.maxZoom(), v.k || 1));
    const span = 1 / k;
    this._view = {
      k,
      x: Math.max(0, Math.min(1 - span, v.x || 0)),
      y: Math.max(0, Math.min(1 - span, v.y || 0)),
    };
    if (this._svg) this._svg.classList.toggle('fps-smooth', !!smooth);
    this.markMoving(smooth ? 300 : 180);
    this.applyView();
    this.syncZoomControls();
  }

  zoomAt(factor, px, py, smooth) {
    const v = this.view();
    const k = Math.max(1, Math.min(this.maxZoom(), v.k * factor));
    /* Keep the point under the cursor where it is, which is the difference
     * between zooming and jumping. */
    const span = 1 / v.k, nspan = 1 / k;
    this.setView({ k, x: v.x + (px * (span - nspan)), y: v.y + (py * (span - nspan)) }, smooth);
  }

  /* On the compositor while the view is changing; back to an ordinary, sharp
   * paint once it has held still for a moment. */
  markMoving(ms) {
    if (!this._svg) return;
    this._svg.classList.add('fps-zooming');
    clearTimeout(this._movingTimer);
    this._movingTimer = setTimeout(() => {
      this._movingTimer = null;
      if (this._svg) this._svg.classList.remove('fps-zooming', 'fps-smooth');
      /* The state update held back while the view moved, drawn once now. */
      if (this._renderHeld) { this._renderHeld = false; this.render(); }
    }, ms);
  }

  /* translate3d even at 1x, so the plan keeps one layer of its own for the
   * card's whole life instead of being lifted out of the page's paint the
   * moment a zoom starts. The translate is a percentage of the SVG's own size,
   * which is why the view survives the card changing width with no re-clamp. */
  applyView() {
    if (!this._svg || !this._root) return;
    const v = this.view();
    const zoomed = v.k > 1.001;
    const viewport = this._root.querySelector('.fps-plan');
    this._svg.style.transform = `translate3d(${(-v.x * v.k * 100).toFixed(4)}%, ${(-v.y * v.k * 100).toFixed(4)}%, 0) scale(${v.k.toFixed(4)})`;
    viewport.style.touchAction = zoomed ? 'none' : 'pan-y';
    viewport.classList.toggle('fps-pannable', zoomed);
  }

  paintHeader(scene, states) {
    /* Counted per ENTITY across the floor, the rule every other count on the
     * dashboard uses. Summing the rooms' own counts counted a relay shared by
     * two rooms twice and a lamp in no room not at all, so this line and the
     * floor card under the same plan disagreed ("9 of 33" over "8 of 31"). */
    const lamps = [...new Set(PlanScene.lightItems(this._floor.items)
      .filter((i) => (i.kind || 'fixture') === 'fixture' && i.entity).map((i) => i.entity))];
    const on = lamps.filter((e) => this.isOn(e)).length;
    const total = lamps.length;
    const sun = scene.sun;
    const bits = [`${on} of ${total} lights on`];
    if (sun && typeof sun.elevation === 'number') {
      const sunCfg = FPS_DATA.project.sun || {};
      const wx = states[sunCfg.weatherEntity || (sunCfg.weather || {}).entity
        || ((FPS_DATA.project.dashboard || {}).house || {}).weather];
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
    if (this._config.zoom !== false) head.append(this.zoomControls());
    else this._zoomControls = null;
    this.syncZoomControls();
  }

  /* The old card's control, and in the header as it was there: floating over
   * the plan, every corner of a real floor covers a marker somebody needs. A
   * plan you can zoom needs a visible way back out, and a way in for anyone on
   * a mouse who never thinks to pinch. */
  zoomControls() {
    const ctl = document.createElement('div');
    ctl.className = 'fps-zoomctl';
    ctl.setAttribute('aria-label', 'Plan zoom');
    const button = (text, title, cls) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = text; b.title = title;
      b.setAttribute('aria-label', title);
      if (cls) b.className = cls;
      return b;
    };
    const out = button('−', 'Zoom out');
    const level = document.createElement('span');
    level.className = 'fps-zoom-level';
    const into = button('+', 'Zoom in');
    const fit = button('⤾', 'Fit to card', 'fps-zoom-fit');
    out.addEventListener('click', () => this.zoomAt(1 / 1.6, .5, .5, true));
    into.addEventListener('click', () => this.zoomAt(1.6, .5, .5, true));
    fit.addEventListener('click', () => this.setView({ k: 1, x: 0, y: 0 }, true));
    ctl.append(out, level, into, fit);
    this._zoomControls = { ctl, out, level, into };
    return ctl;
  }

  syncZoomControls() {
    if (!this._zoomControls) return;
    const k = this.view().k;
    this._zoomControls.ctl.classList.toggle('fps-fit', k <= 1.001);
    this._zoomControls.out.disabled = k <= 1.001;
    this._zoomControls.into.disabled = k >= this.maxZoom() - .001;
    this._zoomControls.level.textContent = `${k.toFixed(1)}×`;
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
    this._tapEndedAt = ev.timeStamp;
    if (p.target === 'item') return held ? this.holdItem(p.id) : this.primaryForItem(p.id);
    if (p.target === 'opening') return this.moreInfoForOpening(p.id);
    if (p.target === 'chip') return this.toggleControls(p.id, held, 'chip');
    if (p.target === 'room') return this.toggleControls(p.id, held, 'floor');
  }

  /* The click a FINGER leaves behind. A tap opens the sheet on pointerup, and
   * a touch browser only then sends the tap's compatibility click — hit-tested
   * again at the same spot, where the sheet's backdrop now is. So on a phone
   * the room opened and the backdrop closed it in the same instant: tapping
   * empty floor looked like it did nothing (user, 2026-09-15). A mouse's click
   * goes to the element the press began on, which is why a desk never saw it.
   * Headless Edge with real touch input logged exactly
   * `pointerup:touch → click:fps-backdrop → closeControls`.
   *
   * Only a click on the surface is dropped, only once, and only one that
   * belongs to a press the plan just handled; a genuine tap on the backdrop
   * begins with its own pointerdown there and arrives long after. */
  swallowTapClick(ev) {
    const at = this._tapEndedAt;
    if (at == null) return;
    this._tapEndedAt = null;
    if (ev.timeStamp - at > 700) return;
    if (!(ev.target && ev.target.closest && ev.target.closest('.fps-surface'))) return;
    ev.stopPropagation();
    ev.preventDefault();
  }

  /* What a LONG PRESS on a marker does, which is a per-house choice rather
   * than a constant: `moreInfo` (the default, and what this always did),
   * `controls` for a plan where the sheet is the thing you actually want, and
   * `none` for a wall tablet where a resting hand should not open anything. */
  holdItem(id) {
    const it = this.item(id);
    const room = it && this.roomOf(it);
    const cfg = room ? Controls.resolve(FPS_DATA.controls, FPS_DATA.project, this._floor, room) : {};
    const mode = (cfg.openOn || {}).markerHold || 'moreInfo';
    if (mode === 'none') return undefined;
    if (mode === 'controls') return this.toggleControls(this.roomIdOf(it), false, 'floor');
    /* A marker with nothing to switch has one thing to do, so a hold left at
     * its default does what a tap does rather than a second, different open.
     * Except when a tap is set to do nothing: then the hold is the only way in
     * and keeps opening. */
    if (this.oneGesture(it) && (cfg.openOn || {}).markerTap !== 'none') return this.primaryForItem(id);
    return this.moreInfoForItem(id);
  }

  /* One gesture's worth of behaviour: a read-only entity (a presence sensor, a
   * door contact, a person) with no service to tap, no alternative to hold for
   * and no separate entity to hold open. A camera is not one — its dialog is
   * the stream, and its hold opens who it saw. */
  oneGesture(it) {
    if (!it || !it.entity) return false;
    const spec = Controls.actionFor(it.entity, FPS_DATA.controls);
    return (spec.control || 'toggle') === 'readout' && !spec.tap && !spec.alt && this.holdTargetFor(it) === it.entity;
  }

  /* Which page of Home Assistant's dialog to open. A read-only entity has
   * nothing on the first page it does not already show on the plan; what it
   * did lately is the useful part, so it opens on History. A domain can name
   * its own `view` in controls.json (`info` puts the plain dialog back); a
   * Home Assistant too old to know `view` ignores it and opens the dialog. */
  infoView(entityId, readout) {
    const spec = Controls.actionFor(entityId, FPS_DATA.controls);
    const view = spec.view || (readout ? 'history' : null);
    return view && view !== 'info' ? view : null;
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
    if ((type.render || {}).tapAction === 'moreInfo') return this.moreInfo(it.entity, this.infoView(it.entity, this.oneGesture(it)));

    /* What a TAP does, which is a per-house choice for the same reason a hold
     * is. It used to be hard-coded to the domain action, and that left one
     * configuration with no way in at all: a plan with `markerHold: "none"` —
     * a wall tablet, where a resting hand must not open dialogs — could toggle
     * a light but could never open it.
     *
     * `auto` is the default and the fix: run the action, unless holding does
     * nothing, in which case a tap is the only gesture left and opening is
     * more useful than toggling. Everything else is named outright. */
    const tapRoom = this.roomOf(it);
    const tapCfg = tapRoom ? Controls.resolve(FPS_DATA.controls, FPS_DATA.project, this._floor, tapRoom) : {};
    const openOn = tapCfg.openOn || {};
    const tapMode = openOn.markerTap || 'auto';
    if (tapMode === 'none') return undefined;
    if (tapMode === 'moreInfo') return this.moreInfoForItem(id);
    if (tapMode === 'controls') return this.toggleControls(this.roomIdOf(it), false, 'floor');
    if (tapMode === 'auto' && (openOn.markerHold || 'moreInfo') === 'none') return this.moreInfoForItem(id);
    /* In a GANGED room the lamps share one physical switch, so tapping either
     * marker has to act on all of them — drawing two independently tappable
     * markers and then switching one would be a lie about the wiring. The
     * room's master group is used when it has one, since that is what the
     * house's own automations act on. */
    const room = tapRoom;
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
    return this.runAction(spec.tap, it.entity, (it.props || {}).data)
      || this.moreInfo(it.entity, this.infoView(it.entity, this.oneGesture(it)));
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
    /* A fan with a light in it: tap works the fan, hold opens its light. */
    if (typeof p.light === 'string' && p.light) return p.light;
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
    const it = this.item(id);
    const target = this.holdTargetFor(it);
    if (target) this.moreInfo(target, this.infoView(target, this.oneGesture(it)));
  }

  /* A door is tapped and never held, so its contact sensor is one gesture by
   * definition; a cover has services and opens on its controls. */
  moreInfoForOpening(id) {
    const op = (this._floor.openings || []).find((o) => o.id === id);
    const target = op && (op.sensor || op.cover);
    if (!target) return;
    const spec = Controls.actionFor(target, FPS_DATA.controls);
    this.moreInfo(target, this.infoView(target, (spec.control || 'toggle') === 'readout' && !spec.tap));
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

  /* `via` is 'chip' (the room's name label) or 'floor' (anywhere else in it).
   * They are separately switchable because they mean different things on a
   * touch screen: a plan you mostly pan around wants only the label to open a
   * sheet, so a stray thumb on the floor does not; a wall tablet nobody pans
   * wants the whole room to be the button. */
  toggleControls(roomId, held, via) {
    if (!roomId || this._config.controls === false) return;
    const room = (this._floor.rooms || []).find((r) => r.id === roomId);
    if (!room) return;
    const cfg = Controls.resolve(FPS_DATA.controls, FPS_DATA.project, this._floor, room);
    if (!cfg.enabled) return;
    const openOn = cfg.openOn || {};
    if (via === 'chip' && openOn.chipTap === false) return;
    if (via === 'floor' && openOn.floorTap === false) return;
    /* Hold on a room is "all on" without going through the sheet, because that
     * is the one action worth a shortcut — the openOn config decides. */
    if (held && openOn.chipHold === 'allOn') return this.roomAction(room, 'allOn', null, cfg);
    /* Tapping the room that is already open closes it — unless the surface
     * says otherwise. A docked panel is `persistent`: it lives beside the plan
     * rather than over it, so closing it on a second tap would make the plan
     * jump about while you are using it. */
    if (this._open === roomId) {
      const spec = cfg.designSpec || {};
      if ((cfg.dismiss || {}).retap === false || spec.persistent) return this.paintControls(roomId, this.stateMap());
      this._open = null;
    } else {
      this._open = roomId;
    }
    this._sig = null;
    if (this._open) this.paintControls(this._open, this.stateMap());
    else this.closeControls();
  }

  closeControls() {
    this._open = null;
    this._surfaceFor = null;
    const s = this._root.querySelector('.fps-surface');
    s.hidden = true;
    s.replaceChildren();
  }

  /* ------------------------------------------------------ control surface */

  /* A fan's built-in light is one of the room's lights: see PlanScene.lightItems. */
  roomItems(room) {
    return PlanScene.lightItems(this._floor.items).filter((i) => {
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
    /* Opening, or repainting what is already open? Every state change repaints
     * the sheet, and replaying its slide-up each time made it jump under the
     * finger whenever a light was switched from it — and threw its scroll back
     * to the top. It arrives once; a repaint keeps its place. */
    const opening = box.hidden || this._surfaceFor !== roomId;
    const oldPanel = opening ? null : box.querySelector('.fps-panel');
    const scrollTop = oldPanel ? oldPanel.scrollTop : 0;
    box.hidden = false;
    box.className = 'fps-surface fps-surface-' + (spec.surface || 'sheet') + ' fps-anchor-' + (spec.anchor || 'bottom')
      + (opening ? ' fps-opening' : '');
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
    /* `inlineSections` is the compact bar's shape: sections run along one row
     * instead of stacking, which is the only way a 62 px strip can carry more
     * than one of them. It implies flattening — a heading above a row that is
     * one line tall is most of the strip. */
    panel.className = 'fps-panel' + (spec.tiles ? ' fps-tiles' : '') + (spec.inlineSections ? ' fps-inline' : '')
      /* `density` and `animation` are the design's own words for how tight it
       * sits and how it arrives. Both are carried as classes rather than
       * inline styles so a house's own CSS can override either. */
      + ' fps-density-' + (spec.density || 'comfortable')
      + (opening ? ' fps-anim-' + (spec.animation || 'none') : '');
    if (spec.grabBar) {
      const bar = document.createElement('div');
      bar.className = 'fps-grab';
      /* The bar is a handle whether or not it closes: it is what tells you the
       * sheet is draggable-looking and where its top edge is. Only the CLICK
       * is conditional. */
      if ((cfg.dismiss || {}).grabBar !== false) bar.addEventListener('click', () => this.closeControls());
      panel.appendChild(bar);
    }

    if ((cfg.header || {}).show !== false) panel.appendChild(this.controlHeader(cfg, room, items));

    for (const section of cfg.sections || []) {
      const node = this.controlSection(section, cfg, room, items, ctx, spec);
      if (node) panel.appendChild(node);
    }
    box.appendChild(panel);
    if (scrollTop) panel.scrollTop = scrollTop;
    this._surfaceFor = roomId;
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
      /* A surface with no way out is a trap, so Close is only droppable when
       * something else can still dismiss it. */
      if (b.action === 'close' && (cfg.dismiss || {}).close === false) continue;
      const target = Controls.resolveTarget(b.target, cfg.shortcuts, room);
      const btn = document.createElement('button');
      btn.className = 'fps-btn' + (target && this.isOn(target) ? ' on' : '');
      /* The action as an attribute, so a stylesheet can tell All on from All
       * off without relying on the label a house may have renamed. */
      btn.dataset.action = b.action;
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
    if (section.label && !spec.flattenSections && !spec.inlineSections) {
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
      /* The level as a number beside it. A bare slider says "about here", and
       * the room's lights report a real value worth reading. */
      const pct = document.createElement('span');
      pct.className = 'fps-pct';
      const showPct = () => { pct.textContent = Math.round((Number(slider.value) / 255) * 100) + '%'; };
      showPct();
      slider.addEventListener('input', showPct);
      slider.addEventListener('change', () => {
        this.call('light', 'turn_on', { entity_id: [...new Set(dimmable)], brightness: Number(slider.value) });
      });
      const row = document.createElement('div');
      row.className = 'fps-slider-row';
      row.append(slider, pct);
      wrap.appendChild(row);
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
      + (cand.shortcut ? ' fps-shortcut' : '')
      + (section.source === 'devices' ? ' fps-tile-device' : '');

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
      /* A readout has one gesture, like its marker: it opens on History. */
      tile.addEventListener('click', () => this.moreInfo(cand.entity, this.infoView(cand.entity, true)));
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

  /* `view` is Home Assistant's own MoreInfoDialogParams key ('history',
   * 'settings', 'related'); left out, the dialog opens on its first page. */
  moreInfo(entityId, view) {
    const ev = new Event('hass-more-info', { bubbles: true, composed: true });
    ev.detail = view ? { entityId, view } : { entityId };
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
