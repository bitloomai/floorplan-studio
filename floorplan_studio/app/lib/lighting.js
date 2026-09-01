/**
 * Artificial light — the other half of the daylight model in `sun.js`.
 *
 * `sun.js` answers "how much light comes in through the openings"; this answers
 * "how much comes out of the lamps", in the same units, so a room can be lit by
 * either and the plan does not care which. Both end up as a 0..1 level that the
 * scene builder turns into a wash.
 *
 * The chain, per room:
 *
 *     watts x lamp count x efficacy x brightness   ->  lumens
 *     lumens x utilisation / floor area (sq ft)    ->  foot-candles
 *     (fc / targetFc) ^ gamma                      ->  level 0..1
 *
 * Foot-candles rather than lux only because every dimension in this app is in
 * feet; one fc is one lumen per square foot, so the arithmetic stays honest
 * without a unit conversion nobody would remember to check. `targetFc` is what
 * counts as "properly lit" — 18 fc is a normal living room, and everything
 * scales off it, so a house of dim lamps still reads as lit relative to itself.
 *
 * Every constant here is config, exactly like the sun's. Nothing about any
 * particular house or fitting is baked in.
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
    /* How dark the plan goes when there is no daylight at all. This is what
     * makes on/off legible from across the room rather than needing a marker
     * inspected — the single biggest readability win in the whole renderer. */
    scrim: 0.36,
    /* Foot-candles that count as fully lit. */
    targetFc: 18,
    /* Below 1 lifts dim rooms so a single lamp still reads. Perceived
     * brightness is roughly a power law, not linear, so this is not a fudge. */
    gamma: 0.7,
    /* Ceiling on how much a room's wash can lift it out of the scrim. Leaving
     * headroom is deliberate: a lit room at night should still read as night. */
    maxWash: 0.62,
    /* Fraction of a lamp's lumens that lands on the floor of its own room
     * rather than the ceiling, walls, or the next room. */
    utilisation: 0.55,
    /* How much credit a reflective floor gets — see roomLight(). 0.6 means a
     * mirror-polished floor (reflectance 1) would lift the room's utilisation by
     * 60%, and a mid marble at 0.55 by about a third, which is the right order
     * for a real interior. Set it to 0 to switch floor bounce off entirely. */
    bounce: 0.6,
    /* Fallbacks for a fixture type whose library entry says nothing. */
    fallback: { watt: 9, efficacy: 90, beam: 2.6, kelvin: 3000, count: 1 },
    /* A lamp's glow pool grows with its output, but only slowly — a 20 W tube
     * is not four times the radius of a 5 W spot. Radius is
     * beam x (lumens / refLumens) ^ poolGamma. */
    pool: { refLumens: 475, gamma: 0.28, min: 0.5, max: 4 },
    /* Rooms lit by lamps stop taking a daylight wash as well; whichever is
     * brighter wins rather than the two adding up to a blown-out white. */
    combine: 'max',            // 'max' | 'add'
  };

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

  /* What one marker is putting out right now.
   *
   * `count` is the number of PHYSICAL lamps the marker stands for: a spots
   * group is eight downlights on one entity, and a room lit by it should be as
   * bright as eight. Defaulting to 1 keeps every marker that never set it
   * behaving exactly as it did.
   *
   * A light with no `brightness` attribute is not dim — it is a lamp that
   * cannot report, and it is on, so it counts as full. */
  function lampOutput(item, type, state, cfg) {
    const c = cfg || DEFAULTS;
    const fb = c.fallback;
    const p = (item && item.props) || {};
    const d = (type && type.defaults) || {};
    const watt = Math.max(0, num(p.watt, num(d.watt, fb.watt)));
    const count = Math.max(1, Math.round(num(p.count, num(d.count, fb.count))));
    const efficacy = Math.max(1, num(p.efficacy, num(d.efficacy, fb.efficacy)));
    const beam = Math.max(0.2, num(p.beam, num(d.beam, fb.beam)));
    const kelvin = num(p.kelvin, num(d.kelvin, fb.kelvin));

    const a = (state && state.attributes) || {};
    const brightness = typeof a.brightness === 'number' ? clamp(a.brightness / 255, 0, 1) : 1;
    const rated = watt * count * efficacy;

    return {
      watt, count, efficacy, beam, kelvin,
      ratedLumens: rated,
      brightness,
      lumens: rated * brightness,
      /* Pool radius in FEET, so the caller projects it like any other length. */
      poolFt: poolRadius(rated * brightness, beam, c),
    };
  }

  function poolRadius(lumens, beam, cfg) {
    const c = (cfg && cfg.pool) || DEFAULTS.pool;
    if (lumens <= 0) return 0;
    const scale = Math.pow(lumens / Math.max(1, c.refLumens), c.gamma);
    return beam * clamp(scale, c.min, c.max);
  }

  /* ---------------------------------------------------------------- a room */

  /* Everything lighting a room, summed.
   *
   * `lamps` is the list of {item, type, state} for the fixtures that belong to
   * the room — the caller decides membership, because an item's room is data
   * rather than a lookup (a cove marker can sit outside its own slab).
   *
   * The returned colour is the lumen-weighted average of the lamps that are
   * actually on, which is why one red strip in a room of warm downlights tints
   * the wash slightly rather than turning the room red. */
  function roomLight(lamps, areaSqFt, cfg) {
    const c = cfg || DEFAULTS;
    const area = Math.max(1, num(areaSqFt, 1));
    let lumens = 0;
    let r = 0, g = 0, b = 0, weight = 0;

    /* Light is counted per FITTING, the chip is counted per ENTITY.
     *
     * One switch can drive two fittings — a pair of gate lamps, a row of
     * downlights on one relay. For lumens that is genuinely two lamps' worth of
     * light in the room, so the sum below stays per marker. For the chip it is
     * one thing you can switch, and counting the markers made "2/6" out of a
     * single relay and disagreed with the room sheet's own All on/off. A marker
     * with no entity is its own uncountable thing and keys off its identity. */
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

    /* How much of what lands on the floor comes back up.
     *
     * `utilisation` is the CIE-style share of emitted lumens reaching the
     * working plane, and it is a property of the ROOM, not of the fitting — a
     * white polished floor throws light back at the ceiling and round the space
     * again, a dark matt one swallows it. Two identical lamps over black granite
     * and over Statuario are not the same amount of usable light, and until now
     * this model said they were.
     *
     * `reflectance` is the floor's own 0..1, carried by the flooring type and
     * overridable per room. `bounce` scales how much of it is credited, so the
     * effect stays a tunable rather than an article of faith; at bounce 0 the
     * term vanishes and this is arithmetically the old model. */
    const reflectance = clamp(num(c.reflectance, 0), 0, 1);
    const util = c.utilisation * (1 + clamp(num(c.bounce, 0), 0, 2) * reflectance);
    const fc = (lumens * util) / area;
    const level = lumens > 0
      ? clamp(Math.pow(fc / Math.max(0.1, c.targetFc), c.gamma), 0, 1)
      : 0;

    return {
      lumens, fc, level, on: lit.size, total: seen.size,
      colour: weight > 0 ? `rgb(${Math.round(r / weight)},${Math.round(g / weight)},${Math.round(b / weight)})` : null,
    };
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
   * walls, the furniture and the gaps between rooms too — a house at night is
   * dark everywhere, not only inside its rooms. */
  function scrimOpacity(day, cfg) {
    const c = cfg || DEFAULTS;
    if (!c.enabled) return 0;
    return clamp(c.scrim * (1 - clamp(num(day, 1), 0, 1)), 0, 1);
  }

  /* What a room's wash should end up at, given both sources. */
  function washOpacity(lampLevel, daylightAmbient, cfg) {
    const c = cfg || DEFAULTS;
    const lamp = clamp(num(lampLevel, 0), 0, 1) * c.maxWash;
    const day = clamp(num(daylightAmbient, 0), 0, 1) * c.maxWash;
    return c.combine === 'add' ? clamp(lamp + day, 0, c.maxWash) : Math.max(lamp, day);
  }

  return {
    DEFAULTS, mergeConfig, lampOutput, poolRadius, roomLight,
    scrimOpacity, washOpacity, kelvinColour, parseColour,
  };
}));
