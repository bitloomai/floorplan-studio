/**
 * flooring.js — floor surface generators.
 *
 * A flooring type is DATA plus a named generator. Three generator kinds cover
 * everything without a special case per material:
 *
 *   tile    a repeating <pattern> — planks, tiles, brick, herringbone, deck.
 *           Cheap: one def, reused by every room using that flooring.
 *   field   nodes drawn across the room's own area and clipped to it — marble
 *           veining, terrazzo chips, the stones in a gravel bed. Continuous
 *           rather than tiled, so the grain runs THROUGH a doorway instead of
 *           restarting at it. A field generator may also bring a pattern of
 *           its own for the fine half of the surface: see "granular surfaces".
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

  /* A short stable name for a bag of options — the same everywhere, because
   * it is the same FNV hash the PRNG seeds with. */
  function fingerprint(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
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

  const pattern = (id, o, width, height, children) => ({
    defs: [{ tag: 'pattern', attrs: { id, width, height, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${num(o.angle, 0)})` }, children }],
    fill: `url(#${id})`,
  });

  const TILE = {
    /* Mitred parallelograms meet at a continuous spine. Rotating herringbone
     * cannot produce chevron: its rectangular ends never form this joint. */
    chevron(id, o, P) {
      const w = P.S(Math.max(0.05, num(o.plankWidth, 0.3)));
      const l = Math.min(w * 64, P.S(Math.max(0.1, num(o.plankLength, 1.5))));
      const base = o.color || '#b9986c', kids = [];
      for (let row = -Math.ceil(l / w); row < 2; row++) {
        const y = row * w;
        for (const [points, tone] of [
          [`0,${y} ${l},${y + l} ${l},${y + l + w} 0,${y + w}`, 0.04],
          [`${l},${y + l} ${2 * l},${y} ${2 * l},${y + w} ${l},${y + l + w}`, -0.04],
        ]) kids.push({ tag: 'polygon', attrs: { points, fill: shade(base, tone), stroke: shade(base, -0.24), 'stroke-width': num(o.jointPx, 0.6) } });
      }
      return pattern(id, o, 2 * l, w, kids);
    },

    /* Three strips per block, with neighbouring blocks turned a quarter turn. */
    basketweave(id, o, P) {
      const s = P.S(Math.max(0.1, num(o.blockSize, 1.5)));
      const base = o.color || '#be966b', kids = [];
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
        const vertical = (x + y) % 2;
        for (let i = 0; i < 3; i++) {
          const bx = x * s + (vertical ? i * s / 3 : 0);
          const by = y * s + (vertical ? 0 : i * s / 3);
          const width = vertical ? s / 3 : s, height = vertical ? s : s / 3;
          kids.push({ tag: 'rect', attrs: { x: bx, y: by, width, height, fill: shade(base, (i - 1) * 0.035 + (vertical ? -0.04 : 0.04)), stroke: shade(base, -0.25), 'stroke-width': num(o.jointPx, 0.6) } });
          kids.push({ tag: 'line', attrs: { x1: bx + width * 0.2, y1: by + height * 0.2, x2: bx + width * (vertical ? 0.2 : 0.8), y2: by + height * (vertical ? 0.8 : 0.2), stroke: shade(base, -0.13), 'stroke-width': 0.5 } });
        }
      }
      return pattern(id, o, s * 2, s * 2, kids);
    },

    hexagon(id, o, P) {
      const r = P.S(Math.max(0.05, num(o.tileW, 0.8))) / Math.sqrt(3);
      const h = Math.sqrt(3) * r, base = o.color || '#dfdcd4';
      const kids = [];
      for (let col = -1; col <= 2; col++) for (let row = -1; row <= 1; row++) {
        const cx = col * 1.5 * r, cy = (row + (col % 2 ? 0.5 : 0)) * h;
        const points = Array.from({ length: 6 }, (_, i) => `${cx + r * Math.cos(i * Math.PI / 3)},${cy + r * Math.sin(i * Math.PI / 3)}`).join(' ');
        kids.push({ tag: 'polygon', attrs: { points, fill: shade(base, (((col + 2) % 2) - 0.5) * num(o.variation, 0.035)), stroke: o.grout || shade(base, -0.2), 'stroke-width': num(o.groutPx, 0.8) } });
      }
      return pattern(id, o, 3 * r, h, kids);
    },

    /* Thread spacing is physical, so sisal stays coarse beside fine carpet.
     * Over-under strokes distinguish woven material from random stone chips. */
    weave(id, o, P) {
      const s = P.S(Math.max(0.02, num(o.threadWidth, 0.08)));
      const base = o.color || '#c8b895', yarn = o.color2 || shade(base, -0.13);
      const kids = [{ tag: 'rect', attrs: { width: s * 2, height: s * 2, fill: base } }];
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
        const vertical = (x + y) % 2;
        kids.push({ tag: 'line', attrs: { x1: (x + (vertical ? 0.5 : 0.1)) * s, y1: (y + (vertical ? 0.1 : 0.5)) * s,
          x2: (x + (vertical ? 0.5 : 0.9)) * s, y2: (y + (vertical ? 0.9 : 0.5)) * s, stroke: yarn, 'stroke-width': s * 0.35, opacity: 0.65 } });
      }
      return pattern(id, o, s * 2, s * 2, kids);
    },

    /* A four-petal cement motif, repeated within an actual grouted tile. */
    encaustic(id, o, P) {
      const s = P.S(Math.max(0.1, num(o.tileW, 0.66))), mid = s / 2;
      const base = o.color || '#e4dcca', ink = o.color2 || '#567272';
      const kids = [{ tag: 'rect', attrs: { width: s, height: s, fill: base, stroke: o.grout || shade(base, -0.22), 'stroke-width': num(o.groutPx, 0.7) } }];
      for (let a = 0; a < 360; a += 90) kids.push({ tag: 'path', attrs: {
        d: `M ${mid} ${mid} Q ${s * 0.08} ${s * 0.08} ${mid} ${s * 0.08} Q ${s * 0.92} ${s * 0.08} ${mid} ${mid} Z`,
        fill: ink, transform: `rotate(${a} ${mid} ${mid})`,
      } });
      kids.push({ tag: 'circle', attrs: { cx: mid, cy: mid, r: s * 0.085, fill: o.color3 || '#b77851' } });
      return pattern(id, o, s, s, kids);
    },

    stud(id, o, P) {
      const s = P.S(Math.max(0.05, num(o.spacing, 0.16))), base = o.color || '#42474a';
      return pattern(id, o, s, s, [
        { tag: 'rect', attrs: { width: s, height: s, fill: base } },
        { tag: 'circle', attrs: { cx: s / 2, cy: s / 2, r: s * 0.32, fill: shade(base, 0.09), stroke: shade(base, -0.22), 'stroke-width': 0.5 } },
      ]);
    },
    /* Straight planks with staggered end joints.
     *
     * `grain` (default 0, off) draws lengthwise figure inside each plank. It
     * exists because without it a plank pattern is a grid of uniform blocks
     * with a dark line round each one — which is a drawing of BRICKWORK, and
     * reads as brickwork the moment the joints are anything but hairline. The
     * grain is what says timber: it runs along the plank, it is the only
     * feature that does, and it is why you can tell a wood floor from a tiled
     * one at a glance in real life. Every finish that does not ask for it
     * draws exactly as it did before the option existed.
     */
    plank(id, o, P) {
      const wFt = num(o.plankWidth, 0.5), lFt = num(o.plankLength, 4);
      const w = P.S(wFt), l = P.S(lFt);
      const base = o.color || '#e8ddcd';
      const rnd = prng(id + ':plank');
      const rows = 4;
      const grain = Math.max(0, Math.round(num(o.grain, 0)));
      const kids = [{ tag: 'rect', attrs: { x: 0, y: 0, width: l, height: w * rows, fill: base } }];
      for (let r = 0; r < rows; r++) {
        const y = r * w;
        const face = shade(base, (rnd() - 0.5) * num(o.variation, 0.10));
        kids.push({ tag: 'rect', attrs: { x: 0, y, width: l, height: w, fill: face } });
        /* Figure first, so the joints below still read as the edges of the
         * board rather than as one more streak among many. Each streak is a
         * shallow wave the length of the plank, drawn in the board's own
         * colour darkened a little — never in the joint colour, which would
         * make one plank look like several. */
        for (let g = 0; g < grain; g++) {
          const gy = y + w * (0.16 + (0.68 * (g + 0.5)) / grain) + (rnd() - 0.5) * w * 0.12;
          const bow = (rnd() - 0.5) * w * 0.5;
          kids.push({
            tag: 'path',
            attrs: {
              d: `M 0 ${gy} Q ${l * 0.5} ${gy + bow} ${l} ${gy}`,
              fill: 'none', stroke: shade(face, -0.14 - rnd() * 0.12),
              'stroke-width': 0.5 + rnd() * 0.7, opacity: 0.5 + rnd() * 0.35,
            },
          });
        }
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
      if (num(o.variation, 0) > 0) {
        const rnd = prng(id + ':tile'), kids = [];
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) kids.push({ tag: 'rect', attrs: {
          x: x * w, y: y * hgt, width: w, height: hgt,
          fill: shade(base, (rnd() - 0.5) * Math.min(1, o.variation)), stroke: grout, 'stroke-width': num(o.groutPx, 1.1),
        } });
        return pattern(id, o, w * 4, hgt * 4, kids);
      }
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

    /* The two-board cell repeats along diagonal lattice vectors. Four boards
     * around a square left an unjointed hole at the centre of every repeat. */
    herringbone(id, o, P) {
      const w = P.S(Math.max(0.05, num(o.plankWidth, 0.4)));
      const ratio = Math.max(2, Math.min(24, Math.round(num(o.plankLength, 1.5) / Math.max(0.05, num(o.plankWidth, 0.4)))));
      const l = w * ratio;
      const base = o.color || '#e0d0b8';
      const joint = shade(base, -0.24);
      const size = 2 * l, kids = [];
      for (let a = -1; a <= 2; a++) for (let b = -2 * ratio; b <= 2 * ratio; b++) {
        const x = a * l - b * w, y = a * l + b * w;
        for (const [bx, by, width, height, tone] of [[x, y, l, w, 0.05], [x + l, y, w, l, -0.05]]) {
          if (bx >= size || by >= size || bx + width <= 0 || by + height <= 0) continue;
          kids.push({ tag: 'rect', attrs: { x: bx, y: by, width, height, fill: shade(base, tone), stroke: joint, 'stroke-width': 0.8 } });
        }
      }
      return pattern(id, Object.assign({ angle: 45 }, o), size, size, kids);
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

  /* ------------------------------------------------- granular surfaces ----
   *
   * Loose ground — soil, gravel, turf — and the fine-grained hard finishes
   * were a handful of dots scattered over a flat colour, because `density`
   * counted nodes per 900 SQUARE FEET. Bare soil in a 120 sq ft setback
   * therefore got seventeen specks: a flat brown panel with the plan's
   * one-foot grid ruled across it, which is a drawing of BRICKWORK. The
   * material itself was never on the page at all.
   *
   * Every granular surface is now two layers:
   *
   *   grain   the fine half — grit, clods, the packed bed of a gravel path —
   *           drawn ONCE into a <pattern> tile a couple of feet across and
   *           repeated by the browser. Its cost does not grow with the room,
   *           so a 1,400 sq ft yard can be as dense as a doormat.
   *   relief  the big half — stones, tufts, tonal drift — drawn across the
   *           room's own area like any other field generator. It never
   *           repeats, which is what hides the fact that the grain does.
   *
   * The tile WRAPS: anything within its own radius of an edge is drawn again
   * on the far side. A tile that does not wrap shows a seam at every repeat —
   * a ruled grid, the exact defect this layer exists to remove.
   *
   * Light comes from the top left for all of it: a stone is a lump with a pale
   * cap on that side and its contact shadow on the other. That convention, not
   * the outline, is what separates "stones" from "circles".
   *
   * `density` still holds the numbers it always held — no registry needed
   * rewriting — but it is read RELATIVE to what the stock finish ships with,
   * so 320 means "twice as busy as ordinary carpet" instead of an absolute
   * count that only ever made sense on a 30 ft square room.
   */

  /* A tenth of a pixel. Texture is thousands of numbers, they are all rounded
   * the same way, and the second decimal place of a 0.4 px speck of grit is
   * weight in every plan, export and dashboard payload that carries it. */
  const px2 = (v) => Math.round(v * 10) / 10;

  /* Copies of an item that overlaps a tile edge, so the tile joins itself. */
  function wrapTile(x, y, r, T, emit) {
    const xs = x < r ? [x, x + T] : (x > T - r ? [x, x - T] : [x]);
    const ys = y < r ? [y, y + T] : (y > T - r ? [y, y - T] : [y]);
    for (const wx of xs) for (const wy of ys) emit(wx, wy);
  }

  /* An irregular lump. Aggregate is never circular, and at plan scale the
   * outline is most of what tells you which material you are looking at. */
  function lump(rnd, cx, cy, r, sides) {
    const turn = rnd() * Math.PI * 2, n = sides || 7, pts = [];
    for (let i = 0; i < n; i++) {
      const a = turn + (i + (rnd() - 0.5) * 0.45) * Math.PI * 2 / n;
      const rad = r * (0.6 + rnd() * 0.5);
      pts.push(px2(cx + Math.cos(a) * rad) + ',' + px2(cy + Math.sin(a) * rad));
    }
    return pts.join(' ');
  }

  /* Two soft brushes — one lighter than the surface, one darker — as radial
   * gradients that fade to nothing. Hard-edged ellipses read as spilt paint;
   * a blur filter would cost a raster pass per room. */
  function washDefs(id, base, tone) {
    return ['L', 'D'].map((k, i) => ({
      tag: 'radialGradient',
      attrs: { id: `${id}-w${k}` },
      children: [
        { tag: 'stop', attrs: { offset: '0%', 'stop-color': shade(base, i ? -tone : tone), 'stop-opacity': 0.55 } },
        { tag: 'stop', attrs: { offset: '55%', 'stop-color': shade(base, i ? -tone : tone), 'stop-opacity': 0.28 } },
        { tag: 'stop', attrs: { offset: '100%', 'stop-color': shade(base, i ? -tone : tone), 'stop-opacity': 0 } },
      ],
    }));
  }

  /* Broad tonal drift across the ACTUAL room: the layer that stops a big floor
   * reading as one flat panel. Deliberately outside the grain tile — a soft
   * patch two feet wide repeating every two feet is a pattern, not a surface. */
  function wash(id, P, ctx, per, opacity) {
    const rnd = prng(id + ':wash');
    const { x0, y0, x1, y1 } = ctx.bounds;
    const n = Math.max(3, Math.min(150, Math.round(per * (x1 - x0) * (y1 - y0))));
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const x = P.X(x0 + rnd() * (x1 - x0)), y = P.Y(y0 + rnd() * (y1 - y0));
      const r = P.S(1.4 + rnd() * 3.6);
      nodes.push({
        tag: 'ellipse',
        attrs: {
          cx: px2(x), cy: px2(y), rx: px2(r), ry: px2(r * (0.45 + rnd() * 0.6)),
          transform: `rotate(${Math.round(rnd() * 180)} ${px2(x)} ${px2(y)})`,
          fill: `url(#${id}-w${rnd() < 0.5 ? 'L' : 'D'})`, opacity: px2(opacity * (0.4 + rnd() * 0.7)),
        },
      });
    }
    return nodes;
  }

  /* Scattered stones over the room, each with the shadow it casts. Kept sparse
   * on purpose: these are the features the eye locks onto, and the grain tile
   * underneath supplies everything smaller. */
  function stones(id, base, P, ctx, per, rFt, pale) {
    const rnd = prng(id + ':stones');
    const { x0, y0, x1, y1 } = ctx.bounds;
    const n = Math.max(2, Math.min(1200, Math.round(per * (x1 - x0) * (y1 - y0))));
    const nodes = [];
    for (let i = 0; i < n; i++) {
      const x = P.X(x0 + rnd() * (x1 - x0)), y = P.Y(y0 + rnd() * (y1 - y0));
      const r = P.S(rFt * (0.7 + rnd() * 0.75));
      const face = shade(base, -0.13 + pale * (0.4 + rnd() * 1.3));
      nodes.push({ tag: 'polygon', attrs: { points: lump(rnd, x + r * 0.28, y + r * 0.3, r * 1.02, 7), fill: shade(base, -0.32), opacity: 0.45 } });
      nodes.push({ tag: 'polygon', attrs: { points: lump(rnd, x, y, r, 7), fill: face } });
      nodes.push({ tag: 'polygon', attrs: { points: lump(rnd, x - r * 0.22, y - r * 0.24, r * 0.5, 6), fill: shade(face, 0.16), opacity: 0.5 } });
    }
    return nodes;
  }

  const FIELD = {
    /* Marble veining. Continuous across the whole floor and clipped per room,
     * so a vein crossing a doorway does not break at the threshold.
     *
     * Optionally the TILE it is printed on, too.
     *
     * A marble-look glazed vitrified tile is the commonest bedroom floor in a
     * modern house here, and neither generator could draw one: `tile` has a
     * grid and no veins, `marble` had veins and no grid. Setting `tileW` gives
     * this one the grid too, laid by the same `tile` pattern so a 4x2 floor
     * sets out identically whichever finish draws it.
     *
     * `veinColor2` is the other half of that look. Statuario and Calacatta
     * carry two vein systems — a grey structural one and a sparser, finer gold
     * — and drawing both in one colour is what makes a printed tile read as a
     * flat grey slab. The second set is deliberately fewer and thinner.
     *
     * A finish that sets neither draws exactly what it drew before both
     * existed: the first loop is untouched and the second one does not run. */
    marble(id, o, P, ctx) {
      const rnd = prng(id + ':' + (o.seed || 'marble'));
      const nodes = [];
      const { x0, y0, x1, y1 } = ctx.bounds;
      const area = ((x1 - x0) * (y1 - y0)) / 900;
      const veins = Math.round(num(o.veins, 18) * area);
      const col = o.veinColor || shade(o.color || '#eef1f5', -0.30);
      const draw = (rng, count, colour, thin) => {
        for (let v = 0; v < count; v++) {
          let x = x0 + rng() * (x1 - x0), y = y0 + rng() * (y1 - y0);
          let ang = rng() * Math.PI * 2;
          let d = `M ${P.X(x)} ${P.Y(y)}`;
          const segs = 4 + Math.floor(rng() * 5);
          for (let s = 0; s < segs; s++) {
            ang += (rng() - 0.5) * 1.1;
            const len = 1 + rng() * 4;
            const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
            const mx = (x + nx) / 2 + (rng() - 0.5), my = (y + ny) / 2 + (rng() - 0.5);
            d += ` Q ${P.X(mx)} ${P.Y(my)} ${P.X(nx)} ${P.Y(ny)}`;
            x = nx; y = ny;
          }
          /* `veinWidth` and `veinOpacity` multiply the natural-slab defaults,
           * which are deliberately faint — real marble veining is. A PRINTED
           * tile is not faint: the pattern is inked onto every tile and reads
           * from across the room, and at plan scale the slab's sub-pixel
           * hairlines at a third opacity are drawn and invisible, which is the
           * worst of both. Both default to 1, so every existing finish keeps
           * exactly the veining it had. */
          const wMul = num(o.veinWidth, 1), oMul = num(o.veinOpacity, 1);
          nodes.push({
            tag: 'path',
            attrs: {
              d, fill: 'none', stroke: colour,
              'stroke-width': (thin ? 0.25 + rng() * 0.5 : 0.4 + rng() * 1.1) * wMul,
              opacity: Math.min(1, (thin ? 0.22 + rng() * 0.3 : 0.16 + rng() * 0.3) * oMul),
              'stroke-linecap': 'round',
            },
          });
        }
      };
      draw(rnd, Math.max(4, veins), col, false);
      /* Its own generator, so adding the gold cannot shift a single grey vein
       * on a floor somebody has already looked at. */
      if (o.veinColor2) {
        draw(prng(id + ':' + (o.seed || 'marble') + ':2'), Math.max(2, Math.round(veins * 0.4)), o.veinColor2, true);
      }
      /* The grid, when this finish is a tile rather than a slab. Drawn by the
       * tile generator itself rather than by a second copy of it here. */
      const base = num(o.tileW, 0) > 0 ? TILE.tile(id, o, P) : null;
      return base ? { defs: base.defs, fill: base.fill, nodes } : { nodes };
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
        const r = (0.04 + rnd() * 0.09) * Math.max(0.1, num(o.chipScale, 1));
        const sides = Math.min(8, Math.max(0, Math.round(num(o.chipSides, 0))));
        if (sides >= 3) {
          const turn = rnd() * Math.PI * 2;
          const points = Array.from({ length: sides }, (_, j) => {
            const a = turn + j * Math.PI * 2 / sides, radius = r * (0.65 + rnd() * 0.35);
            return `${P.X(x + Math.cos(a) * radius)},${P.Y(y + Math.sin(a) * radius)}`;
          }).join(' ');
          nodes.push({ tag: 'polygon', attrs: { points, fill: palette[Math.floor(rnd() * palette.length)], opacity: 0.8 } });
          continue;
        }
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

    /* Bare earth. Tilled ground is not a colour: it is clods a couple of
     * inches across, each with its own shadow where it sits proud of the ones
     * beside it, a finer grit worked through the gaps, and the odd stone
     * catching the light. The SIZES matter more than the count — a surface of
     * evenly sized specks is sandpaper, not soil — so clods run from two to
     * six inches with the big ones rare, which is how a spade leaves them. */
    soil(id, o, P, ctx) {
      const base = o.color || '#6b4a35';
      const rel = Math.max(0.15, Math.min(4, num(o.density, 130) / 130));
      const tileFt = 2.2, T = P.S(tileFt), area = tileFt * tileFt;
      const rnd = prng(id + ':soil');
      const kids = [{ tag: 'rect', attrs: { width: px2(T), height: px2(T), fill: shade(base, -0.17) } }];
      for (let i = 0, n = Math.round(13 * rel * area); i < n; i++) {
        const x = rnd() * T, y = rnd() * T;
        const s = rnd() * rnd();
        const r = P.S(0.075 + s * 0.16);
        const face = shade(base, 0.03 + rnd() * 0.17);
        const body = lump(rnd, 0, 0, r, 6);
        const cast = lump(rnd, r * 0.3, r * 0.32, r * 0.95, 6);
        const cap = s > 0.25 ? lump(rnd, -r * 0.24, -r * 0.26, r * 0.46, 5) : null;
        wrapTile(x, y, r * 1.4, T, (cx, cy) => {
          const t = `translate(${px2(cx)} ${px2(cy)})`;
          kids.push({ tag: 'polygon', attrs: { points: cast, transform: t, fill: shade(base, -0.42), opacity: 0.45 } });
          kids.push({ tag: 'polygon', attrs: { points: body, transform: t, fill: face } });
          if (cap) kids.push({ tag: 'polygon', attrs: { points: cap, transform: t, fill: shade(face, 0.16), opacity: 0.75 } });
        });
      }
      for (let i = 0, n = Math.round(85 * rel * area); i < n; i++) {
        const x = rnd() * T, y = rnd() * T, r = px2(0.3 + rnd() * 0.9);
        const fill = shade(base, rnd() < 0.6 ? -0.2 - rnd() * 0.26 : 0.16 + rnd() * 0.26);
        const opacity = px2(0.3 + rnd() * 0.45);
        wrapTile(x, y, r, T, (cx, cy) => kids.push({ tag: 'circle', attrs: { cx: px2(cx), cy: px2(cy), r, fill, opacity } }));
      }
      const p = pattern(id, o, px2(T), px2(T), kids);
      return {
        defs: p.defs.concat(washDefs(id, base, 0.22)),
        fill: p.fill,
        nodes: wash(id, P, ctx, 0.1, 0.85).concat(stones(id, base, P, ctx, 0.22 * rel, 0.1, 0.13)),
      };
    },

    /* Gravel is STONES, packed, the shade between them the darkest thing on
     * the surface — not dots sprinkled over sand. Sizes run from grit to the
     * occasional big one, because graded aggregate does. `stoneScale` is the
     * whole difference between pea shingle and a cobbled yard: the stones
     * grow, the bed thins out to suit, and the tile grows with them so a
     * cobble does not repeat on the same short pitch as gravel. */
    gravel(id, o, P, ctx) {
      const base = o.color || '#d8d4cb';
      const rel = Math.max(0.15, Math.min(4, num(o.density, 140) / 140));
      const sc = Math.max(0.3, Math.min(6, num(o.stoneScale, 1)));
      const tileFt = Math.max(1.8, Math.min(4.5, 2.3 * sc)), T = P.S(tileFt);
      const rnd = prng(id + ':gravel');
      const kids = [{ tag: 'rect', attrs: { width: px2(T), height: px2(T), fill: shade(base, -0.32) } }];
      for (let i = 0, n = Math.round(32 * rel * tileFt * tileFt / (sc * sc)); i < n; i++) {
        const x = rnd() * T, y = rnd() * T, r = px2(0.35 + rnd() * 0.8);
        const fill = shade(base, -0.1 + rnd() * 0.3);
        wrapTile(x, y, r, T, (cx, cy) => kids.push({ tag: 'circle', attrs: { cx: px2(cx), cy: px2(cy), r, fill, opacity: 0.5 } }));
      }
      for (let i = 0, n = Math.round(Math.min(560, 52 * rel * tileFt * tileFt / (sc * sc))); i < n; i++) {
        const x = rnd() * T, y = rnd() * T;
        const s = rnd() * rnd();
        const r = P.S((0.045 + s * 0.085) * sc);
        const face = shade(base, (rnd() - 0.62) * 0.36);
        const body = lump(rnd, 0, 0, r, 6 + Math.floor(rnd() * 2));
        const cast = lump(rnd, r * 0.26, r * 0.3, r, 6);
        const cap = rnd() < 0.6 ? lump(rnd, -r * 0.22, -r * 0.24, r * 0.48, 5) : null;
        wrapTile(x, y, r * 1.4, T, (cx, cy) => {
          const t = `translate(${px2(cx)} ${px2(cy)})`;
          kids.push({ tag: 'polygon', attrs: { points: cast, transform: t, fill: shade(base, -0.5), opacity: 0.5 } });
          kids.push({ tag: 'polygon', attrs: { points: body, transform: t, fill: face } });
          if (cap) kids.push({ tag: 'polygon', attrs: { points: cap, transform: t, fill: shade(face, 0.2), opacity: 0.5 } });
        });
      }
      const p = pattern(id, o, px2(T), px2(T), kids);
      return {
        defs: p.defs.concat(washDefs(id, base, 0.14)),
        fill: p.fill,
        nodes: wash(id, P, ctx, 0.06, 0.5).concat(stones(id, base, P, ctx, 0.35 * rel / (sc * sc), 0.13 * sc, 0.1)),
      };
    },

    /* Turf. The tile carries the mat of short blades; the room carries the
     * tufts and the mown drift, so no two lawns are the same lawn and the
     * tile's repeat never comes to the surface. */
    grass(id, o, P, ctx) {
      const base = o.color || '#56853d';
      const rel = Math.max(0.15, Math.min(4, num(o.density, 110) / 110));
      const tileFt = 1.6, T = P.S(tileFt), area = tileFt * tileFt;
      const rnd = prng(id + ':grass');
      const kids = [{ tag: 'rect', attrs: { width: px2(T), height: px2(T), fill: shade(base, -0.1) } }];
      for (let i = 0, n = Math.round(110 * rel * area); i < n; i++) {
        const x = rnd() * T, y = rnd() * T;
        const h = P.S(0.12 + rnd() * 0.18), lean = (rnd() - 0.5) * h * 0.9;
        const d = `M 0 0 q ${px2(lean / 2)} ${px2(-h / 2)} ${px2(lean)} ${px2(-h)}`;
        const attrs = {
          d, fill: 'none', stroke: shade(base, -0.4 + rnd() * 0.55),
          'stroke-width': px2(0.6 + rnd() * 0.6), 'stroke-linecap': 'round', opacity: px2(0.5 + rnd() * 0.45),
        };
        wrapTile(x, y, h, T, (cx, cy) => kids.push({ tag: 'path', attrs: Object.assign({ transform: `translate(${px2(cx)} ${px2(cy)})` }, attrs) }));
      }
      const p = pattern(id, o, px2(T), px2(T), kids);
      /* A tuft is one path of three blades: three blades of lawn for the price
       * of one node, which is what makes a whole garden affordable. */
      const trnd = prng(id + ':tuft');
      const { x0, y0, x1, y1 } = ctx.bounds;
      const tufts = [];
      for (let i = 0, n = Math.max(4, Math.min(1500, Math.round(0.9 * rel * (x1 - x0) * (y1 - y0)))); i < n; i++) {
        const x = P.X(x0 + trnd() * (x1 - x0)), y = P.Y(y0 + trnd() * (y1 - y0));
        let d = '';
        for (let b = 0; b < 3; b++) {
          const bx = (trnd() - 0.5) * P.S(0.16), h = P.S(0.22 + trnd() * 0.24), lean = (trnd() - 0.5) * h;
          d += ` M ${px2(bx)} 0 q ${px2(lean / 2)} ${px2(-h / 2)} ${px2(lean)} ${px2(-h)}`;
        }
        tufts.push({ tag: 'path', attrs: {
          d: d.trim(), transform: `translate(${px2(x)} ${px2(y)})`, fill: 'none',
          stroke: shade(base, -0.34 + trnd() * 0.6), 'stroke-width': px2(0.7 + trnd() * 0.6),
          'stroke-linecap': 'round', opacity: px2(0.55 + trnd() * 0.4),
        } });
      }
      return { defs: p.defs.concat(washDefs(id, base, 0.16)), fill: p.fill, nodes: wash(id, P, ctx, 0.08, 0.7).concat(tufts) };
    },

    /* Fine tonal noise — concrete, screed, carpet, cork, linoleum: everything
     * whose character is a grain too small to have a shape. All of it lives in
     * the tile; only the tonal drift is drawn per room, because a floor of one
     * flat colour is the thing that reads as a printed block. */
    speckle(id, o, P, ctx) {
      const base = o.color || '#d8d8d2';
      const rel = Math.max(0.15, Math.min(4, num(o.density, 180) / 180));
      const tileFt = 1.9, T = P.S(tileFt), area = tileFt * tileFt;
      const rnd = prng(id + ':speckle');
      const kids = [{ tag: 'rect', attrs: { width: px2(T), height: px2(T), fill: base } }];
      for (let i = 0, n = Math.round(Math.min(420, 85 * rel * area)); i < n; i++) {
        const x = rnd() * T, y = rnd() * T, r = px2(0.4 + rnd() * 0.8);
        const fill = shade(base, (rnd() - 0.5) * 0.46);
        const opacity = px2(0.25 + rnd() * 0.4);
        wrapTile(x, y, r, T, (cx, cy) => kids.push({ tag: 'circle', attrs: { cx: px2(cx), cy: px2(cy), r, fill, opacity } }));
      }
      const p = pattern(id, o, px2(T), px2(T), kids);
      return { defs: p.defs.concat(washDefs(id, base, 0.07)), fill: p.fill, nodes: wash(id, P, ctx, 0.05, 0.35) };
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
  /* Name this build's defs after what they DRAW.
   *
   * A pattern is shared by id: the renderer keeps the first def it sees for a
   * given id and skips every later one. Two rooms on the same finish with
   * different per-room colours — a red-earth setback beside a grey-earth one,
   * which is exactly what `room.flooringOptions` is for — were therefore both
   * drawn in whichever colour reached the renderer first.
   *
   * So the id carries a fingerprint of the def's own contents. Same drawing,
   * same name, one def shared as before; different drawing, different name.
   * Fingerprinting the OPTIONS instead would have been cheaper and wrong: an
   * option set to the value it already had by default draws the identical
   * floor and must not be given a second copy of the same pattern under a
   * second name. The generator still seeds its randomness from the plain id,
   * so those two rooms get the same arrangement of stones in two colours, and
   * adding an option to a finish moves nothing that was already drawn.
   *
   * A generator names its own defs and points at them from its own fill and
   * nodes, which is the only place the id can appear — never inside a pattern,
   * which has no reason to refer to itself. */
  function renameDefs(out, id) {
    if (!out.defs.length) return out;
    const unique = `${id}-${fingerprint(JSON.stringify(out.defs))}`;
    const swap = (v) => (typeof v === 'string' && v.includes(id) ? v.split(id).join(unique) : v);
    for (const node of out.defs) for (const k of Object.keys(node.attrs || {})) node.attrs[k] = swap(node.attrs[k]);
    for (const node of out.nodes) for (const k of Object.keys(node.attrs || {})) node.attrs[k] = swap(node.attrs[k]);
    out.fill = swap(out.fill);
    return out;
  }

  function build(flooringDoc, key, P, ctx) {
    const def = resolve(flooringDoc, key);
    let o = Object.assign({}, def.options || {});
    if (ctx.overrides) Object.assign(o, ctx.overrides);
    o = resolveTokens(o, ctx.theme);
    const gen = def.generator || 'plain';
    /* The id a generator is handed is the finish and its angle, and nothing
     * else, because it is also the SEED: adding an option to a finish must not
     * shuffle the veining of the floor somebody is already looking at. What
     * the def is finally CALLED is that id plus a fingerprint of the resolved
     * options — see renameDefs. */
    const id = `fl-${String(key).replace(/[^a-z0-9]+/gi, '')}-${Math.round((o.angle || 0))}`;

    if (gen === 'script') {
      const base = TILE.plain(id, o);
      const s = runScript(id, o, P, ctx);
      return { fill: base.fill, defs: [], nodes: s.nodes, error: s.error };
    }
    if (TILE[gen]) {
      const r = TILE[gen](id, o, P);
      return renameDefs({ fill: r.fill, defs: r.defs, nodes: [] }, id);
    }
    if (FIELD[gen]) {
      const r = FIELD[gen](id, o, P, ctx);
      /* A field generator may bring its own BASE rather than take a flat
       * colour. A marble-look tile is the case that needed it: it is a tile
       * pattern with veining drawn over the top, and neither half is the whole
       * floor — the grid alone is a plain vitrified tile and the veins alone
       * are a slab. Anything that returns only nodes still gets exactly the
       * plain base it always got. */
      const base = r.fill ? r : TILE.plain(id, o);
      return renameDefs({ fill: base.fill, defs: r.defs || [], nodes: r.nodes }, id);
    }
    return { fill: o.color || '#e6eaf0', defs: [], nodes: [], error: `unknown generator "${gen}"` };
  }

  return { build, resolve, resolveTokens, prng, shade, generators: { tile: Object.keys(TILE), field: Object.keys(FIELD) } };
}));
