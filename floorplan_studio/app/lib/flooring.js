/**
 * flooring.js — floor surface generators.
 *
 * A flooring type is DATA plus a named generator. Three generator kinds cover
 * everything without a special case per material:
 *
 *   tile    a repeating <pattern> — planks, tiles, brick, herringbone, deck.
 *           Cheap: one def, reused by every room using that flooring.
 *   field   nodes drawn across the room's own area and clipped to it — marble
 *           veining, terrazzo chips, gravel. Continuous rather than tiled, so
 *           the grain runs THROUGH a doorway instead of restarting at it.
 *   script  a user expression, for anything not covered. See runScript.
 *
 * Randomness is a seeded PRNG keyed off the flooring id and the room id, so a
 * floor looks identical on every reload and on every machine. An unseeded
 * Math.random() would make the plan shimmer on each repaint.
 *
 * Deliberately not feTurbulence: it was tried in the hand-written version and
 * read as grime rather than stone.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Flooring = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  /* Mulberry32 — small, fast, good enough for texture, and identical in Node
   * and every browser, which matters because the export must match the editor. */
  function prng(seedStr) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return function () {
      h |= 0; h = (h + 0x6D2B79F5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Shade a hex colour by a signed amount (-1..1). Used everywhere so a
   * material only has to declare ONE base colour and the generator derives its
   * grain, grout and speckle from it — which is what lets a theme restyle every
   * flooring at once by changing one token. */
  function shade(hex, amt) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '#cccccc'));
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const v = amt >= 0 ? c + (255 - c) * amt : c * (1 + amt);
      return Math.round(Math.max(0, Math.min(255, v)));
    });
    return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
  }

  /* ------------------------------------------------------------- generators */

  /* Each returns { defs: [node], fill: 'url(#id)' } for tile kinds, or
   * { nodes: [node] } for field kinds. `P` projects feet to pixels. */

  const TILE = {
    /* Straight planks with staggered end joints. */
    plank(id, o, P) {
      const wFt = num(o.plankWidth, 0.5), lFt = num(o.plankLength, 4);
      const w = P.S(wFt), l = P.S(lFt);
      const base = o.color || '#e8ddcd';
      const rnd = prng(id + ':plank');
      const rows = 4;
      const kids = [{ tag: 'rect', attrs: { x: 0, y: 0, width: l, height: w * rows, fill: base } }];
      for (let r = 0; r < rows; r++) {
        const y = r * w;
        kids.push({ tag: 'rect', attrs: { x: 0, y, width: l, height: w, fill: shade(base, (rnd() - 0.5) * num(o.variation, 0.10)) } });
        kids.push({ tag: 'line', attrs: { x1: 0, y1: y, x2: l, y2: y, stroke: shade(base, -num(o.jointDepth, 0.22)), 'stroke-width': num(o.jointPx, 0.8) } });
        // staggered butt joint, a different offset per row
        const off = ((r * 0.37 + rnd() * 0.1) % 1) * l;
        kids.push({ tag: 'line', attrs: { x1: off, y1: y, x2: off, y2: y + w, stroke: shade(base, -num(o.jointDepth, 0.22)), 'stroke-width': num(o.jointPx, 0.8) } });
      }
      return {
        defs: [{ tag: 'pattern', attrs: { id, width: l, height: w * rows, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${num(o.angle, 0)})` }, children: kids }],
        fill: `url(#${id})`,
      };
    },

    /* Square or rectangular tiles with a grout line. */
    tile(id, o, P) {
      const w = P.S(num(o.tileW, 2)), hgt = P.S(num(o.tileH, num(o.tileW, 2)));
      const base = o.color || '#dfe6ee';
      const grout = o.grout || shade(base, -0.16);
      return {
        defs: [{
          tag: 'pattern', attrs: { id, width: w, height: hgt, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${num(o.angle, 0)})` },
          children: [
            { tag: 'rect', attrs: { x: 0, y: 0, width: w, height: hgt, fill: base } },
            { tag: 'rect', attrs: { x: 0, y: 0, width: w, height: hgt, fill: 'none', stroke: grout, 'stroke-width': num(o.groutPx, 1.1) } },
          ],
        }],
        fill: `url(#${id})`,
      };
    },

    /* Running-bond brick / paver. */
    brick(id, o, P) {
      const w = P.S(num(o.brickW, 0.75)), hgt = P.S(num(o.brickH, 0.35));
      const base = o.color || '#c98b6b';
      const grout = o.grout || shade(base, -0.28);
      return {
        defs: [{
          tag: 'pattern', attrs: { id, width: w, height: hgt * 2, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${num(o.angle, 0)})` },
          children: [
            { tag: 'rect', attrs: { x: 0, y: 0, width: w, height: hgt * 2, fill: base } },
            { tag: 'rect', attrs: { x: 0, y: 0, width: w, height: hgt, fill: 'none', stroke: grout, 'stroke-width': 1 } },
            { tag: 'rect', attrs: { x: -w / 2, y: hgt, width: w, height: hgt, fill: 'none', stroke: grout, 'stroke-width': 1 } },
            { tag: 'rect', attrs: { x: w / 2, y: hgt, width: w, height: hgt, fill: 'none', stroke: grout, 'stroke-width': 1 } },
          ],
        }],
        fill: `url(#${id})`,
      };
    },

    /* Herringbone — two plank rectangles at 90° to each other. */
    herringbone(id, o, P) {
      const l = P.S(num(o.plankLength, 1.5)), w = P.S(num(o.plankWidth, 0.4));
      const base = o.color || '#e0d0b8';
      const joint = shade(base, -0.24);
      const size = l + w;
      return {
        defs: [{
          tag: 'pattern', attrs: { id, width: size, height: size, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${num(o.angle, 45)})` },
          children: [
            { tag: 'rect', attrs: { x: 0, y: 0, width: size, height: size, fill: base } },
            { tag: 'rect', attrs: { x: 0, y: 0, width: l, height: w, fill: shade(base, 0.05), stroke: joint, 'stroke-width': 0.8 } },
            { tag: 'rect', attrs: { x: l, y: 0, width: w, height: l, fill: shade(base, -0.05), stroke: joint, 'stroke-width': 0.8 } },
            { tag: 'rect', attrs: { x: 0, y: w, width: w, height: l, fill: shade(base, -0.05), stroke: joint, 'stroke-width': 0.8 } },
            { tag: 'rect', attrs: { x: w, y: l, width: l, height: w, fill: shade(base, 0.05), stroke: joint, 'stroke-width': 0.8 } },
          ],
        }],
        fill: `url(#${id})`,
      };
    },

    /* Alternating light/dark squares. */
    checker(id, o, P) {
      const s = P.S(num(o.tileW, 1.5));
      const a = o.color || '#eceff4', b = o.color2 || shade(a, -0.42);
      return {
        defs: [{
          tag: 'pattern', attrs: { id, width: s * 2, height: s * 2, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${num(o.angle, 0)})` },
          children: [
            { tag: 'rect', attrs: { x: 0, y: 0, width: s * 2, height: s * 2, fill: a } },
            { tag: 'rect', attrs: { x: 0, y: 0, width: s, height: s, fill: b } },
            { tag: 'rect', attrs: { x: s, y: s, width: s, height: s, fill: b } },
          ],
        }],
        fill: `url(#${id})`,
      };
    },

    /* Open-jointed deck boards, for terraces. */
    deck(id, o, P) {
      const w = P.S(num(o.boardWidth, 0.5));
      const base = o.color || '#b99a72';
      return {
        defs: [{
          tag: 'pattern', attrs: { id, width: w, height: w, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${num(o.angle, 0)})` },
          children: [
            { tag: 'rect', attrs: { x: 0, y: 0, width: w, height: w, fill: base } },
            { tag: 'line', attrs: { x1: 0, y1: 0, x2: w, y2: 0, stroke: shade(base, -0.35), 'stroke-width': 1.6 } },
          ],
        }],
        fill: `url(#${id})`,
      };
    },

    /* Flat colour — the honest option, and the fastest. */
    plain(id, o) {
      return { defs: [], fill: o.color || '#e6eaf0' };
    },
  };

  const FIELD = {
    /* Marble veining. Continuous across the whole floor and clipped per room,
     * so a vein crossing a doorway does not break at the threshold. */
    marble(id, o, P, ctx) {
      const rnd = prng(id + ':' + (o.seed || 'marble'));
      const nodes = [];
      const { x0, y0, x1, y1 } = ctx.bounds;
      const veins = Math.round(num(o.veins, 18) * ((x1 - x0) * (y1 - y0)) / 900);
      const col = o.veinColor || shade(o.color || '#eef1f5', -0.30);
      for (let v = 0; v < Math.max(4, veins); v++) {
        let x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
        let ang = rnd() * Math.PI * 2;
        let d = `M ${P.X(x)} ${P.Y(y)}`;
        const segs = 4 + Math.floor(rnd() * 5);
        for (let s = 0; s < segs; s++) {
          ang += (rnd() - 0.5) * 1.1;
          const len = 1 + rnd() * 4;
          const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
          const mx = (x + nx) / 2 + (rnd() - 0.5), my = (y + ny) / 2 + (rnd() - 0.5);
          d += ` Q ${P.X(mx)} ${P.Y(my)} ${P.X(nx)} ${P.Y(ny)}`;
          x = nx; y = ny;
        }
        nodes.push({ tag: 'path', attrs: { d, fill: 'none', stroke: col, 'stroke-width': 0.4 + rnd() * 1.1, opacity: 0.16 + rnd() * 0.3, 'stroke-linecap': 'round' } });
      }
      return { nodes };
    },

    /* Terrazzo chips. */
    terrazzo(id, o, P, ctx) {
      const rnd = prng(id + ':terrazzo');
      const nodes = [];
      const { x0, y0, x1, y1 } = ctx.bounds;
      const n = Math.round(num(o.density, 90) * ((x1 - x0) * (y1 - y0)) / 900);
      const palette = o.chips || [shade(o.color || '#eceae4', -0.5), shade(o.color || '#eceae4', -0.25), '#b8a68c'];
      for (let i = 0; i < n; i++) {
        const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
        const r = (0.04 + rnd() * 0.09);
        nodes.push({
          tag: 'ellipse',
          attrs: {
            cx: P.X(x), cy: P.Y(y), rx: P.S(r), ry: P.S(r * (0.5 + rnd() * 0.7)),
            transform: `rotate(${rnd() * 180} ${P.X(x)} ${P.Y(y)})`,
            fill: palette[Math.floor(rnd() * palette.length)], opacity: 0.55,
          },
        });
      }
      return { nodes };
    },

    /* Gravel / pebbles, for setbacks and yards. */
    gravel(id, o, P, ctx) {
      const rnd = prng(id + ':gravel');
      const nodes = [];
      const { x0, y0, x1, y1 } = ctx.bounds;
      const n = Math.round(num(o.density, 140) * ((x1 - x0) * (y1 - y0)) / 900);
      const base = o.color || '#d8d4cb';
      for (let i = 0; i < n; i++) {
        const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
        nodes.push({
          tag: 'circle',
          attrs: { cx: P.X(x), cy: P.Y(y), r: P.S(0.05 + rnd() * 0.07), fill: shade(base, (rnd() - 0.5) * 0.5), opacity: 0.7 },
        });
      }
      return { nodes };
    },

    /* Grass tufts. */
    grass(id, o, P, ctx) {
      const rnd = prng(id + ':grass');
      const nodes = [];
      const { x0, y0, x1, y1 } = ctx.bounds;
      const n = Math.round(num(o.density, 110) * ((x1 - x0) * (y1 - y0)) / 900);
      const base = o.color || '#cfe0c3';
      for (let i = 0; i < n; i++) {
        const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
        const hgt = P.S(0.18 + rnd() * 0.22);
        const lean = (rnd() - 0.5) * hgt * 0.6;
        nodes.push({
          tag: 'path',
          attrs: {
            d: `M ${P.X(x)} ${P.Y(y)} q ${lean / 2} ${-hgt / 2} ${lean} ${-hgt}`,
            fill: 'none', stroke: shade(base, -0.25 + rnd() * 0.2), 'stroke-width': 0.9, 'stroke-linecap': 'round', opacity: 0.75,
          },
        });
      }
      return { nodes };
    },

    /* Fine tonal noise — carpet, matt concrete. */
    speckle(id, o, P, ctx) {
      const rnd = prng(id + ':speckle');
      const nodes = [];
      const { x0, y0, x1, y1 } = ctx.bounds;
      const n = Math.round(num(o.density, 220) * ((x1 - x0) * (y1 - y0)) / 900);
      const base = o.color || '#d8d8d2';
      for (let i = 0; i < n; i++) {
        const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
        nodes.push({ tag: 'circle', attrs: { cx: P.X(x), cy: P.Y(y), r: 0.7 + rnd(), fill: shade(base, (rnd() - 0.5) * 0.35), opacity: 0.35 } });
      }
      return { nodes };
    },
  };

  /* --------------------------------------------------------------- scripting */

  /* Custom flooring. `script` is a function BODY with (ctx) in scope, returning
   * an array of scene nodes. It is the user's own app running the user's own
   * code — the same trust level as editing library.json by hand — but it is
   * still wrapped so a syntax error draws a plain floor and reports itself
   * rather than taking the whole plan down with it.
   *
   * ctx = { o, P, bounds, room, prng, shade, num }
   */
  const scriptCache = new Map();
  function runScript(id, o, P, ctx) {
    try {
      let fn = scriptCache.get(o.script);
      if (!fn) {
        fn = new Function('ctx', `"use strict";\n${o.script}`);
        scriptCache.set(o.script, fn);
      }
      const nodes = fn({ o, P, bounds: ctx.bounds, room: ctx.room, prng, shade, num });
      return { nodes: Array.isArray(nodes) ? nodes : [] };
    } catch (e) {
      return { nodes: [], error: `${id}: ${e.message}` };
    }
  }

  /* ------------------------------------------------------------------ facade */

  /* Resolve '@token' option values against the active theme. Applied to every
   * string option and to arrays of them (terrazzo chips), so a new colour
   * option in a new generator is covered without being listed here. */
  function resolveTokens(options, theme) {
    if (!theme) return options;
    const out = {};
    for (const [k, v] of Object.entries(options)) {
      if (typeof v === 'string' && v[0] === '@') out[k] = theme[v.slice(1)] || v;
      else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === 'string' && x[0] === '@' ? (theme[x.slice(1)] || x) : x));
      else out[k] = v;
    }
    return out;
  }

  function resolve(flooringDoc, key) {
    const types = (flooringDoc && flooringDoc.types) || {};
    return types[key] || types[(flooringDoc && flooringDoc.fallback) || 'plain'] || { generator: 'plain', options: {} };
  }

  /* Build whatever this flooring needs. Returns:
   *   { fill, defs, nodes, error }
   * `fill` is what the room path should be filled with; `nodes` are drawn on
   * top of it and clipped to the room. */
  function build(flooringDoc, key, P, ctx) {
    const def = resolve(flooringDoc, key);
    let o = Object.assign({}, def.options || {});
    if (ctx.overrides) Object.assign(o, ctx.overrides);
    o = resolveTokens(o, ctx.theme);
    const gen = def.generator || 'plain';
    const id = `fl-${String(key).replace(/[^a-z0-9]+/gi, '')}-${Math.round((o.angle || 0))}`;

    if (gen === 'script') {
      const base = TILE.plain(id, o);
      const s = runScript(id, o, P, ctx);
      return { fill: base.fill, defs: [], nodes: s.nodes, error: s.error };
    }
    if (TILE[gen]) {
      const r = TILE[gen](id, o, P);
      return { fill: r.fill, defs: r.defs, nodes: [] };
    }
    if (FIELD[gen]) {
      const base = TILE.plain(id, o);
      const r = FIELD[gen](id, o, P, ctx);
      return { fill: base.fill, defs: [], nodes: r.nodes };
    }
    return { fill: o.color || '#e6eaf0', defs: [], nodes: [], error: `unknown generator "${gen}"` };
  }

  return { build, resolve, resolveTokens, prng, shade, generators: { tile: Object.keys(TILE), field: Object.keys(FIELD) } };
}));
