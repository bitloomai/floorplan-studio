/**
 * Artificial light — the other half of the daylight model in `sun.js`.
 *
 * `sun.js` answers "how much light comes in through the openings"; this answers
 * "how much comes out of the lamps". Both end up as light on the floor that the
 * scene builder draws.
 *
 * Per LAMP, which is what the plan draws:
 *
 *     watts x lamp count x efficacy x brightness    ->  lumens
 *     lumens x direct share / (pi x throw^2)        ->  foot-candles under it
 *     E(d) = E0 / (1 + (d / throw)^2)^2             ->  foot-candles d feet away
 *     maxWash x (1 - exp(-(E / adapt)^gamma))       ->  how much of the night it lifts
 *
 * `E(d)` is a Lambertian source's light on the floor, and it CONSERVES the
 * lamp's lumens: integrated over the floor it is exactly `lumens x direct`. So
 * wattage decides both how bright the pool is and how far light carries before
 * it stops being visible — a 5 W spot is a bright pool and a faint glow twenty
 * feet away, a 30 W flood reaches much further — and nothing about the reach is
 * a per-type radius somebody picked.
 *
 * The response is exponential because the eye saturates: two lamps side by side
 * are not twice as bright. Drawn as the scrim being CUT (each pool a black
 * gradient in the scrim's luminance mask), overlapping pools compose to
 * `1 - prod(1 - L)`, which is the same saturating sum — so the maths and the
 * compositing agree.
 *
 * Per ROOM, for the light that comes back off walls and ceiling:
 *
 *     lumens x utilisation x (1 + bounce x floor reflectance) / area  ->  fc
 *     fc x fill x enclosure                                           ->  even fill
 *
 * Foot-candles rather than lux only because every dimension in this app is in
 * feet; one fc is one lumen per square foot.
 *
 * Every constant here is config, exactly like the sun's, and `SETTINGS` below is
 * the one list the editor's Light dialog and the help both read — a setting
 * cannot exist without a control, or a control without a setting.
 *
 * Runs unmodified in Node and the browser.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Lighting = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const DEFAULTS = {
    enabled: true,
    /* How dark the plan goes when there is no daylight at all. Lamps cut it
     * back, so a darker night is also what lets a lamp's fading reach show. */
    scrim: 0.5,
    /* Foot-candles that read as fully lit at night — 18 fc is a normal living
     * room. The eye's adaptation is derived from it (see `adaptFc`). */
    targetFc: 18,
    /* The response curve. Below 1 lifts faint light, which is why a single
     * lamp's glow is still visible well away from it. Perceived brightness is
     * roughly a power law, so this is not a fudge. */
    gamma: 0.7,
    /* The most a lit patch of floor takes back from the night, 0..1. At 1 a
     * fully lit floor looks exactly as it does by day. */
    maxWash: 0.92,
    /* How strongly a lamp's colour tints what it lights, 0..1. */
    tint: 0.2,
    /* Scales the soft glow drawn round a lit fitting (the theme sets its base
     * strength). 0 draws none. */
    glow: 1,
    /* Share of a lamp's lumens reaching the floor of its own room rather than
     * the ceiling, walls or the next room. */
    utilisation: 0.55,
    /* How much credit a reflective floor gets — see roomLight(). */
    bounce: 0.6,
    /* Share of a room's light that comes back off its walls and ceiling as an
     * even fill, for a fully walled room. */
    fill: 0.5,
    /* How much of that fill an OUTDOOR area gets. A yard has nothing to throw
     * light back, so its light stays in the pools round each fitting. A roofed
     * space open on some sides sits between, by how much of it is wall. */
    outdoorWash: 0.15,
    /* Fallbacks for a fixture type whose library entry says nothing. `beam` is
     * the pool spread in feet; `direct` is the share of the light thrown at the
     * floor rather than bounced off a ceiling first (a cove is low). */
    fallback: { watt: 9, efficacy: 90, beam: 2.6, kelvin: 3000, count: 1, direct: 0.85 },
    /* The drawn field. `throw` turns a type's pool spread (the radius where
     * the light on the floor has halved) into the Lambertian throw height:
     * half-illuminance falls at 0.644 x throw, so 1.55. `faintest` is the
     * level below which light is no longer drawn — it decides the reach, never
     * a radius. `maxFt` is a safety cap. */
    pool: { throw: 1.55, faintest: 0.012, maxFt: 60 },
    /* A lamp's light is held to its own room, plus a fading patch through each
     * opening reaching `spillFt x that opening's transmission`. */
    zones: { enabled: true, spillFt: 8 },
    motion: true,
  };

  /* Every setting, once. The Light dialog is built from this list and the
   * help's settings table is generated from it, so neither can describe a
   * setting the other does not have. `path` is a dot path under
   * `project.lighting`. `kind`: range | number | toggle. `group` is the
   * dialog's subheading; `advanced` puts it behind the Advanced toggle. */
  const SETTINGS = [
    { path: 'enabled', kind: 'toggle', group: 'Night', label: 'Model artificial light',
      hint: 'Off, the plan draws no darkness and a lit fitting simply glows.' },
    { path: 'scrim', kind: 'range', group: 'Night', label: 'Darkness with no daylight', min: 0, max: 0.9, step: 0.02, unit: '%',
      hint: 'How dark the house goes at night. Lamps cut it back, so a darker night shows how far light carries.' },
    { path: 'maxWash', kind: 'range', group: 'Night', label: 'Most a lit floor takes back', min: 0.1, max: 1, step: 0.02, unit: '%',
      hint: 'At 100% a fully lit floor looks exactly as it does by day.' },
    { path: 'tint', kind: 'range', group: 'Night', label: 'Lamp colour on what it lights', min: 0, max: 1, step: 0.05, unit: '%',
      hint: 'Warm lamps warm the floor under them; a coloured lamp colours it.' },
    { path: 'glow', kind: 'range', group: 'Night', label: 'Glow round a lit fitting', min: 0, max: 2, step: 0.05, unit: '%',
      hint: 'The soft halo at the fitting itself. It is also what shows a lamp is on by day, when its light is lost in the sun.' },
    { path: 'targetFc', kind: 'range', group: 'Brightness', label: 'Fully lit at', min: 2, max: 60, step: 1, unit: 'fc',
      hint: 'Foot-candles that read as fully lit at night. Lower it and every lamp reads brighter and carries further.' },
    { path: 'gamma', kind: 'range', group: 'Brightness', label: 'Response curve', min: 0.3, max: 1.5, step: 0.05, unit: 'x',
      hint: 'Below 1 lifts faint light, so a lamp’s glow stays visible far from it; above 1 keeps light in tight pools.' },
    { path: 'utilisation', kind: 'range', group: 'Brightness', label: 'Light reaching the floor', min: 0.2, max: 1, step: 0.05, unit: '%',
      hint: 'Share of a lamp’s lumens that lands in its own room — what a room’s foot-candle figure is worked out from.' },
    { path: 'fill', kind: 'range', group: 'Brightness', label: 'Even fill in a walled room', min: 0, max: 1, step: 0.05, unit: '%',
      hint: 'Indoors, light comes back off the ceiling and walls, so a walled room lifts evenly as well as round each lamp.' },
    { path: 'outdoorWash', kind: 'range', group: 'Brightness', label: 'How much of that an outdoor area gets', min: 0, max: 1, step: 0.05, unit: '%',
      hint: 'A yard or a car port has little to throw light back, so its light stays in the pools round each fitting.' },
    { path: 'zones.enabled', kind: 'toggle', group: 'Light zones', advanced: true, label: 'Hold light to its room, and let it out through openings',
      hint: 'Off, every lamp’s light washes straight through walls. On, it stops at walls and fades out through each opening by that opening’s own transmission — a blackout blind stops it, a sheer curtain does not.' },
    { path: 'zones.spillFt', kind: 'number', group: 'Light zones', advanced: true, label: 'How far light carries through an opening (ft)', step: 0.5, min: 0,
      hint: 'Multiplied by the opening’s transmission, so this is the reach through a completely clear one.' },
    { path: 'bounce', kind: 'number', group: 'The model', advanced: true, label: 'Credit for a reflective floor', step: 0.05, min: 0, max: 2,
      hint: 'Every flooring carries a reflectance and this decides how much of it counts: polished marble throws light back round the room, dark matt granite swallows it. 0 switches floor bounce off.' },
    { path: 'pool.throw', kind: 'number', group: 'The model', advanced: true, label: 'Throw, as a multiple of pool spread', step: 0.05, min: 0.3, max: 5,
      hint: 'A fitting’s Pool spread is where the light under it has halved. Raising this spreads every lamp’s light wider and dimmer, for the same lumens.' },
    { path: 'pool.faintest', kind: 'number', group: 'The model', advanced: true, label: 'Faintest light drawn', step: 0.002, min: 0.001, max: 0.2,
      hint: 'Below this share of the night lifted, light is not drawn. It sets how far each lamp reaches — there is no radius to set.' },
    { path: 'pool.maxFt', kind: 'number', group: 'The model', advanced: true, label: 'Longest reach (ft)', step: 1, min: 4, max: 200,
      hint: 'A cap on any one lamp’s reach, for very bright fittings.' },
    { path: 'fallback.watt', kind: 'number', group: 'A fitting that says nothing', advanced: true, label: 'Watts', step: 1, min: 0,
      hint: 'What a lamp counts as when neither its marker nor its type gives a wattage.' },
    { path: 'fallback.efficacy', kind: 'number', group: 'A fitting that says nothing', advanced: true, label: 'Lumens per watt', step: 5, min: 1 },
    { path: 'fallback.kelvin', kind: 'number', group: 'A fitting that says nothing', advanced: true, label: 'Colour temperature (K)', step: 100, min: 1800, max: 7000 },
    { path: 'fallback.beam', kind: 'number', group: 'A fitting that says nothing', advanced: true, label: 'Pool spread (ft)', step: 0.2, min: 0.2 },
    { path: 'fallback.direct', kind: 'number', group: 'A fitting that says nothing', advanced: true, label: 'Share thrown at the floor', step: 0.05, min: 0, max: 1,
      hint: 'A downlight throws nearly all of its light at the floor; a cove bounces most of it off the ceiling first.' },
    { path: 'fallback.count', kind: 'number', group: 'A fitting that says nothing', advanced: true, label: 'Lamps one marker stands for', step: 1, min: 1,
      hint: 'A spots group is eight downlights on one entity, and the room should be as bright as eight. Set it per marker where it differs.' },
    { path: 'motion', kind: 'toggle', group: 'Motion', label: 'Animate fans, sirens, airflow and coverage',
      hint: 'Everything animated is state-driven and stops when the state does. A viewer whose system asks for reduced motion gets none of it either way.' },
  ];

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
  }

  function mergeConfig(...layers) {
    const out = JSON.parse(JSON.stringify(DEFAULTS));
    for (const layer of layers) {
      if (!layer) continue;
      for (const [k, v] of Object.entries(layer)) {
        if (v === undefined || v === null) continue;
        if (typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null && !Array.isArray(out[k])) {
          out[k] = Object.assign({}, out[k], v);
        } else out[k] = v;
      }
    }
    return out;
  }

  /* ------------------------------------------------------------ one fixture */

  /* Kelvin -> rgb, the same cheap ramp the marker colour uses. Duplicating the
   * curve would let a lamp's pool and its marker disagree about its own colour,
   * so `plan-scene.js` calls this one. */
  function kelvinColour(k) {
    const t = (clamp(k, 1800, 7000) - 1800) / (7000 - 1800);
    return `rgb(${Math.round(255 - 40 * t)},${Math.round(180 + 55 * t)},${Math.round(110 + 135 * t)})`;
  }

  /* The eye's adaptation at night, in fc: the level at which light reads as
   * about two-thirds lifted. Chosen so that `targetFc` lands at 95% of
   * `maxWash` — which keeps "fully lit at 18 fc" meaning what it says. */
  function adaptFc(cfg) {
    const c = cfg || DEFAULTS;
    const g = clamp(num(c.gamma, 0.7), 0.2, 3);
    return Math.max(0.01, num(c.targetFc, 18)) / Math.pow(3, 1 / g);
  }

  /* Foot-candles -> how much of the night is lifted, 0..maxWash. */
  function response(fc, cfg) {
    const c = cfg || DEFAULTS;
    if (!(fc > 0)) return 0;
    const g = clamp(num(c.gamma, 0.7), 0.2, 3);
    return clamp(num(c.maxWash, 0.92), 0, 1) * (1 - Math.exp(-Math.pow(fc / adaptFc(c), g)));
  }

  /* The foot-candles at which `response` reaches `faintest` — where drawing
   * stops. */
  function faintestFc(cfg) {
    const c = cfg || DEFAULTS;
    const m = clamp(num(c.maxWash, 0.92), 0.01, 1);
    const f = clamp(num((c.pool || {}).faintest, DEFAULTS.pool.faintest), 1e-4, m * 0.99);
    const g = clamp(num(c.gamma, 0.7), 0.2, 3);
    return adaptFc(c) * Math.pow(-Math.log(1 - f / m), 1 / g);
  }

  /* What one marker is putting out right now.
   *
   * `count` is the number of PHYSICAL lamps the marker stands for: a spots
   * group is eight downlights on one entity, and a room lit by it should be as
   * bright as eight. Defaulting to 1 keeps every marker that never set it
   * behaving exactly as it did.
   *
   * A light with no `brightness` attribute is not dim — it is a lamp that
   * cannot report, and it is on, so it counts as full.
   *
   * The pool spread is the marker's own `spread` or `beam`, else its type's,
   * else the fallback: the radius at which the light under the fitting has
   * halved. */
  function lampOutput(item, type, state, cfg) {
    const c = cfg || DEFAULTS;
    const fb = Object.assign({}, DEFAULTS.fallback, c.fallback || {});
    const p = (item && item.props) || {};
    const d = (type && type.defaults) || {};
    const watt = Math.max(0, num(p.watt, num(d.watt, fb.watt)));
    const count = Math.max(1, Math.round(num(p.count, num(d.count, fb.count))));
    const efficacy = Math.max(1, num(p.efficacy, num(d.efficacy, fb.efficacy)));
    const beam = Math.max(0.2, num(p.spread, num(p.beam, num(d.spread, num(d.beam, fb.beam)))));
    const kelvin = num(p.kelvin, num(d.kelvin, fb.kelvin));
    const direct = clamp(num(p.direct, num(d.direct, fb.direct)), 0, 1);

    const a = (state && state.attributes) || {};
    const brightness = typeof a.brightness === 'number' ? clamp(a.brightness / 255, 0, 1) : 1;
    const rated = watt * count * efficacy;
    const lumens = rated * brightness;
    const field = lampField(lumens * direct, beam, c);

    return {
      watt, count, efficacy, beam, kelvin, direct,
      ratedLumens: rated,
      brightness,
      lumens,
      /* Feet, so the caller projects them like any other length. */
      throwFt: field.throwFt,
      peakFc: field.peakFc,
      poolFt: field.reachFt,
    };
  }

  /* The light a point source throws on the floor.
   *
   * `lumens` are the ones aimed at the floor; `spreadFt` is where the light has
   * halved. Returns the throw, the foot-candles directly under it, and how far
   * it reaches before it is fainter than `pool.faintest`. */
  function lampField(lumens, spreadFt, cfg) {
    const c = cfg || DEFAULTS;
    const pc = Object.assign({}, DEFAULTS.pool, c.pool || {});
    const throwFt = Math.max(0.2, num(spreadFt, DEFAULTS.fallback.beam) * clamp(num(pc.throw, 1.55), 0.1, 10));
    const peakFc = lumens > 0 ? lumens / (Math.PI * throwFt * throwFt) : 0;
    return { throwFt, peakFc, reachFt: reachFor(peakFc, throwFt, c) };
  }

  /* Distance at which `E0 / (1 + (d/h)^2)^2` falls to the faintest drawn
   * level. Zero when even the light under the fitting is fainter than that. */
  function reachFor(peakFc, throwFt, cfg) {
    const c = cfg || DEFAULTS;
    const pc = Object.assign({}, DEFAULTS.pool, c.pool || {});
    const floorFc = faintestFc(c);
    if (!(peakFc > floorFc)) return 0;
    const r = throwFt * Math.sqrt(Math.max(0, Math.sqrt(peakFc / floorFc) - 1));
    return clamp(r, 0, Math.max(1, num(pc.maxFt, 60)));
  }

  /* Foot-candles `d` feet from a point source. */
  function fcAt(peakFc, throwFt, d) {
    const q = d / Math.max(0.01, throwFt);
    return peakFc / Math.pow(1 + q * q, 2);
  }

  /* The drawn profile of one lamp, as gradient stops from centre (t=0) to
   * reach (t=1): [[t, level]]. Denser near the centre, where it changes
   * fastest. The last stop is forced to 0 so nothing ends in an edge. */
  function fieldStops(peakFc, throwFt, reachFt, cfg, n) {
    const N = Math.max(4, n || 11);
    const out = [];
    for (let i = 0; i <= N; i++) {
      const t = Math.pow(i / N, 1.7);
      out.push([t, i === N ? 0 : response(fcAt(peakFc, throwFt, t * reachFt), cfg)]);
    }
    return out;
  }

  /* Back-compat name: how far a lamp of `lumens` with this pool spread reaches. */
  function poolRadius(lumens, beam, cfg) {
    return lampField(lumens, beam, cfg).reachFt;
  }

  /* ---------------------------------------------------------------- a room */

  /* Everything lighting a room, summed.
   *
   * `lamps` is the list of {item, type, state, on, output, colour} for the
   * fixtures that belong to the room — the caller decides membership, because
   * an item's room is data rather than a lookup.
   *
   * The returned colour is the lumen-weighted average of the lamps that are
   * actually on, which is why one red strip in a room of warm downlights tints
   * the fill slightly rather than turning the room red. */
  function roomLight(lamps, areaSqFt, cfg) {
    const c = cfg || DEFAULTS;
    const area = Math.max(1, num(areaSqFt, 1));
    let lumens = 0;
    let r = 0, g = 0, b = 0, weight = 0;

    /* Light is counted per FITTING, the chip is counted per ENTITY. One switch
     * can drive two fittings: for lumens that is two lamps' worth of light, for
     * the chip it is one thing you can switch. */
    const seen = new Set();
    const lit = new Set();

    for (const l of lamps || []) {
      const key = (l && l.item && l.item.entity) || (l && l.item && ('#' + l.item.id)) || Symbol('lamp');
      seen.add(key);
      if (!l || !l.on) continue;
      lit.add(key);
      const out = l.output || lampOutput(l.item, l.type, l.state, c);
      lumens += out.lumens;
      const rgb = parseColour(l.colour) || parseColour(kelvinColour(out.kelvin));
      if (rgb) { r += rgb[0] * out.lumens; g += rgb[1] * out.lumens; b += rgb[2] * out.lumens; weight += out.lumens; }
    }

    /* How much of what lands on the floor comes back up. `reflectance` is the
     * floor's own 0..1; `bounce` scales how much of it is credited, and at 0
     * the term vanishes. */
    const reflectance = clamp(num(c.reflectance, 0), 0, 1);
    const util = c.utilisation * (1 + clamp(num(c.bounce, 0), 0, 2) * reflectance);
    const fc = (lumens * util) / area;
    const level = lumens > 0 ? response(fc, c) / Math.max(0.01, clamp(num(c.maxWash, 0.92), 0, 1)) : 0;

    return {
      lumens, fc, level, on: lit.size, total: seen.size,
      colour: weight > 0 ? `rgb(${Math.round(r / weight)},${Math.round(g / weight)},${Math.round(b / weight)})` : null,
    };
  }

  /* The even fill a room's light gives back, in fc, given how much of the room
   * is walled (`enclosure` 0..1) and whether it is outdoors. */
  function fillFc(fc, enclosure, outdoor, cfg) {
    const c = cfg || DEFAULTS;
    const trace = clamp(num(c.outdoorWash, 0.15), 0, 1);
    const share = outdoor ? trace : trace + (1 - trace) * clamp(num(enclosure, 1), 0, 1);
    return Math.max(0, num(fc, 0)) * clamp(num(c.fill, 0.5), 0, 1) * share;
  }

  /* `rgb(r,g,b)` or `#rrggbb` -> [r,g,b]. Anything else -> null, and the caller
   * falls back to the lamp's declared colour temperature. */
  function parseColour(s) {
    if (!s || typeof s !== 'string') return null;
    let m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
    if (m) return [+m[1], +m[2], +m[3]];
    m = /^#([0-9a-f]{6})$/i.exec(s.trim());
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/.exec(s);
    if (m) return hslToRgb(+m[1], +m[2] / 100, +m[3] / 100);
    return null;
  }

  function hslToRgb(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }

  /* ------------------------------------------------------------- the scrim */

  /* One flat dim over the whole plan, strongest at night and gone by day. It is
   * a single node rather than a per-room shade because it has to darken the
   * walls, the furniture and the gaps between rooms too. Lamps cut it. */
  function scrimOpacity(day, cfg) {
    const c = cfg || DEFAULTS;
    if (!c.enabled) return 0;
    /* Squared, because the eye adapts: an overcast noon at half the sky's
     * strength is still broad daylight indoors, not a quarter of the way to
     * night. The dark only really gathers through dusk. */
    const dark = 1 - clamp(num(day, 1), 0, 1);
    return clamp(c.scrim * dark * dark, 0, 1);
  }

  return {
    DEFAULTS, SETTINGS, getPath, mergeConfig, lampOutput, lampField, reachFor, fcAt, fieldStops,
    poolRadius, adaptFc, response, faintestFc, roomLight, fillFc,
    scrimOpacity, kelvinColour, parseColour,
  };
}));
