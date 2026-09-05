/**
 * shapes.js — how things actually look.
 *
 * Two registries:
 *
 *   FURNITURE  plan-view outlines drawn from the object's real footprint. A bed
 *              gets pillows and a turned-down duvet, a hob gets four burners, a
 *              WC gets a cistern. The point is recognition at a glance without
 *              reading a label.
 *
 *   ICONS      device glyphs as drawn PATHS, never Unicode characters. Inside
 *              an <svg>, characters like ⏻ ⛶ ◈ fall back to tofu boxes on
 *              Windows and Android — that is a real, reported failure in the
 *              hand-written version of this plan, not a theoretical one. A path
 *              renders identically everywhere. Recolouring one must set stroke
 *              AND fill, which is why every icon returns a flat node list rather
 *              than a pre-styled group.
 *
 * Every drawer receives feet and returns scene nodes in pixels. Adding a shape
 * is adding one function and one library entry; nothing else changes.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Shapes = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  /* ------------------------------------------------------------- furniture */

  /* ctx = { x, y, w, h, P, t (theme), p (props), fill, line, rot } */
  function frame(c, extra) {
    return Object.assign({ x: c.X, y: c.Y, width: c.W, height: c.H, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 }, extra || {});
  }

  const FURNITURE = {
    rect: (c) => [{ tag: 'rect', attrs: frame(c, { rx: num(c.p.radius, 0) }) }],

    /* Mattress, turned-down duvet, and pillows on the head end. `faces` names
     * the wall the pillows sit against, which is how a bed's orientation is
     * actually described out loud. */
    bed(c) {
      const faces = c.p.faces || 's';
      const vertical = faces === 'n' || faces === 's';
      const pillowDepth = c.P.S(1.35);
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 4 }) }];
      let px = c.X, py = c.Y, pw = c.W, ph = pillowDepth;
      if (faces === 's') py = c.Y + c.H - pillowDepth;
      if (faces === 'e') { px = c.X + c.W - pillowDepth; pw = pillowDepth; ph = c.H; }
      if (faces === 'w') { pw = pillowDepth; ph = c.H; }
      // duvet fold: a line across the bed a third in from the foot
      const foldAt = 0.42;
      if (vertical) {
        const fy = faces === 's' ? c.Y + c.H * foldAt : c.Y + c.H * (1 - foldAt);
        n.push({ tag: 'line', attrs: { x1: c.X, y1: fy, x2: c.X + c.W, y2: fy, stroke: c.line, 'stroke-width': 1 } });
      } else {
        const fx = faces === 'e' ? c.X + c.W * foldAt : c.X + c.W * (1 - foldAt);
        n.push({ tag: 'line', attrs: { x1: fx, y1: c.Y, x2: fx, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 1 } });
      }
      // two pillows, unless it is a single bed
      const single = (c.p.w || 6) < 4.2;
      const inset = c.P.S(0.28);
      if (single) {
        n.push({ tag: 'rect', attrs: { x: px + inset, y: py + inset, width: pw - inset * 2, height: ph - inset * 2, rx: 3, fill: c.line, opacity: 0.4 } });
      } else if (vertical) {
        const half = (pw - inset * 3) / 2;
        n.push({ tag: 'rect', attrs: { x: px + inset, y: py + inset, width: half, height: ph - inset * 2, rx: 3, fill: c.line, opacity: 0.4 } });
        n.push({ tag: 'rect', attrs: { x: px + inset * 2 + half, y: py + inset, width: half, height: ph - inset * 2, rx: 3, fill: c.line, opacity: 0.4 } });
      } else {
        const half = (ph - inset * 3) / 2;
        n.push({ tag: 'rect', attrs: { x: px + inset, y: py + inset, width: pw - inset * 2, height: half, rx: 3, fill: c.line, opacity: 0.4 } });
        n.push({ tag: 'rect', attrs: { x: px + inset, y: py + inset * 2 + half, width: pw - inset * 2, height: half, rx: 3, fill: c.line, opacity: 0.4 } });
      }
      return n;
    },

    /* Two mattresses and a ladder, seen from above. Keeping the bunks
     * slightly offset makes the stacked levels readable without pretending
     * this architectural symbol is a side elevation. */
    bunk(c) {
      const gap = Math.min(c.W * 0.08, c.P.S(0.25));
      const mw = (c.W - gap) * 0.58;
      const n = [];
      /* `faces` is the wall the pillows are against — the same word, and the
       * same meaning, as on a single bed. The bunk drawer declared it and put
       * the pillows at the top whatever you said, so a bunk turned to face the
       * other way was drawn head-to-foot. Only the head end moves: which side
       * the ladder is on is a separate thing, and the two mattresses stay
       * side by side because that is the footprint. */
      const faces = c.p.faces || 'n';
      const headAtEnd = faces === 's';
      for (const x of [c.X, c.X + c.W - mw]) {
        n.push({ tag: 'rect', attrs: { x, y: c.Y, width: mw, height: c.H, rx: 3, fill: c.fill, stroke: c.line, 'stroke-width': 1.1 } });
        const py = headAtEnd ? c.Y + c.H * 0.74 : c.Y + c.H * 0.06;
        n.push({ tag: 'rect', attrs: { x: x + mw * 0.12, y: py, width: mw * 0.76, height: c.H * 0.2, rx: 2, fill: c.line, opacity: 0.34 } });
      }
      const lx = c.X + c.W / 2;
      n.push({ tag: 'line', attrs: { x1: lx - gap, y1: c.Y + c.H * 0.2, x2: lx - gap, y2: c.Y + c.H * 0.82, stroke: c.line, 'stroke-width': 1.4 } });
      n.push({ tag: 'line', attrs: { x1: lx + gap, y1: c.Y + c.H * 0.2, x2: lx + gap, y2: c.Y + c.H * 0.82, stroke: c.line, 'stroke-width': 1.4 } });
      for (let i = 1; i < 5; i++) n.push({ tag: 'line', attrs: { x1: lx - gap, y1: c.Y + c.H * (0.2 + i * 0.12), x2: lx + gap, y2: c.Y + c.H * (0.2 + i * 0.12), stroke: c.line, 'stroke-width': 1 } });
      return n;
    },

    /* Back, two arms, seat cushions. */
    sofa(c) {
      const back = Math.min(c.H * 0.3, c.P.S(0.7));
      const arm = Math.min(c.W * 0.14, c.P.S(0.7));
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 4 }) }];
      n.push({ tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: back, rx: 3, fill: c.line, opacity: 0.32 } });
      n.push({ tag: 'rect', attrs: { x: c.X, y: c.Y, width: arm, height: c.H, rx: 3, fill: c.line, opacity: 0.26 } });
      n.push({ tag: 'rect', attrs: { x: c.X + c.W - arm, y: c.Y, width: arm, height: c.H, rx: 3, fill: c.line, opacity: 0.26 } });
      const seats = Math.max(1, Math.round(num(c.p.seats, (c.p.w || 6) / 2.2)));
      for (let i = 1; i < seats; i++) {
        const x = c.X + arm + ((c.W - arm * 2) * i) / seats;
        n.push({ tag: 'line', attrs: { x1: x, y1: c.Y + back, x2: x, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 1 } });
      }
      return n;
    },

    armchair(c) {
      const back = c.H * 0.3, arm = c.W * 0.18;
      return [
        { tag: 'rect', attrs: frame(c, { rx: 5 }) },
        { tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: back, rx: 3, fill: c.line, opacity: 0.32 } },
        { tag: 'rect', attrs: { x: c.X, y: c.Y, width: arm, height: c.H, rx: 3, fill: c.line, opacity: 0.26 } },
        { tag: 'rect', attrs: { x: c.X + c.W - arm, y: c.Y, width: arm, height: c.H, rx: 3, fill: c.line, opacity: 0.26 } },
      ];
    },

    /* L-shaped seating needs its actual footprint; a straight sofa with a
     * different label is actively misleading when laying out a room. */
    sectional(c) {
      const back = Math.min(c.H * 0.22, c.P.S(0.7));
      const returnW = Math.max(c.W * 0.3, c.P.S(2));
      const d = `M ${c.X} ${c.Y} H ${c.X + c.W} V ${c.Y + c.H * 0.48} H ${c.X + returnW} V ${c.Y + c.H} H ${c.X} Z`;
      const n = [
        { tag: 'path', attrs: { d, fill: c.fill, stroke: c.line, 'stroke-width': 1.2, 'stroke-linejoin': 'round' } },
        { tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: back, rx: 3, fill: c.line, opacity: 0.3 } },
        { tag: 'rect', attrs: { x: c.X, y: c.Y, width: Math.min(returnW * 0.28, back), height: c.H, rx: 3, fill: c.line, opacity: 0.26 } },
        { tag: 'line', attrs: { x1: c.X + returnW, y1: c.Y + back, x2: c.X + returnW, y2: c.Y + c.H * 0.48, stroke: c.line, 'stroke-width': 1 } },
      ];
      /* Seat divisions along the long run. `seats` counts the WHOLE piece,
       * including the one on the return, which is how a sectional is sold —
       * so the long arm carries the rest. It was declared and drawn as two
       * fixed lines regardless, which made a four-seater and an eight-seater
       * the same picture. */
      const seats = Math.max(2, Math.round(num(c.p.seats, 4)));
      const onArm = Math.max(1, seats - 1);
      for (let i = 1; i < onArm; i++) {
        const x = c.X + returnW + ((c.W - returnW) * i) / onArm;
        n.push({ tag: 'line', attrs: { x1: x, y1: c.Y + back, x2: x, y2: c.Y + c.H * 0.48, stroke: c.line, 'stroke-width': 1 } });
      }
      return n;
    },

    recliner(c) {
      const cx = c.X + c.W / 2;
      return [
        { tag: 'rect', attrs: frame(c, { rx: Math.min(c.W, c.H) * 0.18 }) },
        { tag: 'rect', attrs: { x: c.X + c.W * 0.08, y: c.Y + c.H * 0.05, width: c.W * 0.84, height: c.H * 0.3, rx: 4, fill: c.line, opacity: 0.3 } },
        { tag: 'rect', attrs: { x: c.X, y: c.Y + c.H * 0.25, width: c.W * 0.17, height: c.H * 0.5, rx: 3, fill: c.line, opacity: 0.24 } },
        { tag: 'rect', attrs: { x: c.X + c.W * 0.83, y: c.Y + c.H * 0.25, width: c.W * 0.17, height: c.H * 0.5, rx: 3, fill: c.line, opacity: 0.24 } },
        { tag: 'path', attrs: { d: `M ${c.X + c.W * 0.18} ${c.Y + c.H * 0.7} Q ${cx} ${c.Y + c.H * 0.78} ${c.X + c.W * 0.82} ${c.Y + c.H * 0.7} L ${c.X + c.W * 0.75} ${c.Y + c.H * 0.96} H ${c.X + c.W * 0.25} Z`, fill: 'none', stroke: c.line, 'stroke-width': 1 } },
      ];
    },

    /* Table with chairs tucked around it — reads as "dining" instantly. */
    table_dining(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 3 }) }];
      const seat = c.P.S(num(c.p.seatSize, 1.15)), gap = c.P.S(0.18);
      const along = (len) => Math.max(1, Math.floor(len / (seat + gap)));
      // seatsX/seatsY set the count per side explicitly; 0 means "no chairs on
      // that side", which is how a table pushed against a wall is drawn.
      const nx = c.p.seatsX !== undefined ? Math.max(0, num(c.p.seatsX, 0)) : along(c.W);
      const ny = c.p.seatsY !== undefined ? Math.max(0, num(c.p.seatsY, 0)) : along(c.H);
      const chair = (x, y, w, hh) => n.push({ tag: 'rect', attrs: { x, y, width: w, height: hh, rx: 3, fill: 'none', stroke: c.line, 'stroke-width': 1 } });
      for (let i = 0; i < nx; i++) {
        const x = c.X + (c.W * (i + 0.5)) / nx - seat / 2;
        chair(x, c.Y - seat * 0.62, seat, seat * 0.55);
        chair(x, c.Y + c.H + seat * 0.07, seat, seat * 0.55);
      }
      for (let i = 0; i < ny; i++) {
        const y = c.Y + (c.H * (i + 0.5)) / ny - seat / 2;
        chair(c.X - seat * 0.62, y, seat * 0.55, seat);
        chair(c.X + c.W + seat * 0.07, y, seat * 0.55, seat);
      }
      return n;
    },

    table_round(c) {
      const r = Math.min(c.W, c.H) / 2;
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2;
      const n = [{ tag: 'circle', attrs: { cx, cy, r, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } }];
      const seats = Math.max(0, Math.round(num(c.p.seats, 4)));
      for (let i = 0; i < seats; i++) {
        const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
        const sx = cx + Math.cos(a) * (r + c.P.S(0.5)), sy = cy + Math.sin(a) * (r + c.P.S(0.5));
        n.push({ tag: 'circle', attrs: { cx: sx, cy: sy, r: c.P.S(0.5), fill: 'none', stroke: c.line, 'stroke-width': 1 } });
      }
      return n;
    },

    trampoline(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, r = Math.min(c.W, c.H) / 2;
      const n = [
        { tag: 'circle', attrs: { cx, cy, r, fill: c.fill, stroke: c.line, 'stroke-width': 2.4 } },
        { tag: 'circle', attrs: { cx, cy, r: r * 0.78, fill: 'none', stroke: c.line, 'stroke-width': 1.1, 'stroke-dasharray': '3 2', opacity: 0.72 } },
      ];
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        n.push({ tag: 'line', attrs: { x1: cx + Math.cos(a) * r * 0.79, y1: cy + Math.sin(a) * r * 0.79, x2: cx + Math.cos(a) * r * 0.96, y2: cy + Math.sin(a) * r * 0.96, stroke: c.line, 'stroke-width': 0.8, opacity: 0.65 } });
      }
      return n;
    },

    fire_pit(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, r = Math.min(c.W, c.H) / 2;
      const n = [{ tag: 'circle', attrs: { cx, cy, r, fill: c.fill, stroke: c.line, 'stroke-width': 1.8 } }, { tag: 'circle', attrs: { cx, cy, r: r * 0.58, fill: c.line, opacity: 0.18, stroke: c.line, 'stroke-width': 1 } }];
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        n.push({ tag: 'ellipse', attrs: { cx: cx + Math.cos(a) * r * 0.79, cy: cy + Math.sin(a) * r * 0.79, rx: r * 0.16, ry: r * 0.1, fill: c.fill, stroke: c.line, 'stroke-width': 0.8, transform: `rotate(${i * 45} ${cx + Math.cos(a) * r * 0.79} ${cy + Math.sin(a) * r * 0.79})` } });
      }
      n.push({ tag: 'path', attrs: { d: `M ${cx} ${cy + r * 0.35} C ${cx - r * 0.28} ${cy + r * 0.08} ${cx - r * 0.02} ${cy - r * 0.14} ${cx} ${cy - r * 0.4} C ${cx + r * 0.34} ${cy - r * 0.12} ${cx + r * 0.3} ${cy + r * 0.22} ${cx} ${cy + r * 0.35} Z`, fill: c.line, opacity: 0.62 } });
      return n;
    },

    parasol(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, r = Math.min(c.W, c.H) / 2;
      const n = [{ tag: 'circle', attrs: { cx, cy, r, fill: c.fill, stroke: c.line, 'stroke-width': 1.5 } }];
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; n.push({ tag: 'line', attrs: { x1: cx, y1: cy, x2: cx + Math.cos(a) * r, y2: cy + Math.sin(a) * r, stroke: c.line, 'stroke-width': 0.9, opacity: 0.7 } }); }
      n.push({ tag: 'circle', attrs: { cx, cy, r: Math.max(2, r * 0.08), fill: c.line } });
      return n;
    },

    statue(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, r = Math.min(c.W, c.H) / 2;
      return [
        { tag: 'rect', attrs: frame(c, { rx: r * 0.12 }) },
        { tag: 'circle', attrs: { cx, cy: cy - r * 0.28, r: r * 0.2, fill: c.line, opacity: 0.7 } },
        { tag: 'path', attrs: { d: `M ${cx - r * 0.35} ${cy + r * 0.38} Q ${cx} ${cy - r * 0.05} ${cx + r * 0.35} ${cy + r * 0.38} Z`, fill: c.line, opacity: 0.52 } },
      ];
    },

    bird_bath(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, r = Math.min(c.W, c.H) / 2;
      return [
        { tag: 'circle', attrs: { cx, cy, r, fill: c.t.coolTint, stroke: c.line, 'stroke-width': 1.5 } },
        { tag: 'circle', attrs: { cx, cy, r: r * 0.72, fill: 'none', stroke: c.t.coolRim, 'stroke-width': 1 } },
        { tag: 'path', attrs: { d: `M ${cx - r * 0.42} ${cy} q ${r * 0.2} ${-r * 0.16} ${r * 0.4} 0 q ${r * 0.2} ${r * 0.16} ${r * 0.4} 0`, fill: 'none', stroke: c.t.coolRim, 'stroke-width': 0.9, opacity: 0.65 } },
      ];
    },

    desk(c) {
      /* The pedestal on the right, divided into the drawers it actually has —
       * the property existed from the start and drew nothing, so every desk
       * had one anonymous box under it whatever you set. */
      const drawers = Math.max(0, Math.min(6, Math.round(num(c.p.drawers, 3))));
      const px = c.X + c.W * 0.62, pw = c.W * 0.33, py = c.Y + c.H * 0.12, ph = c.H * 0.76;
      const n = [
        { tag: 'rect', attrs: frame(c, { rx: 2 }) },
        { tag: 'rect', attrs: { x: px, y: py, width: pw, height: ph, rx: 2, fill: 'none', stroke: c.line, 'stroke-width': 1 } },
        { tag: 'circle', attrs: { cx: c.X + c.W / 2, cy: c.Y + c.H + c.P.S(0.7), r: c.P.S(0.55), fill: 'none', stroke: c.line, 'stroke-width': 1 } },
      ];
      for (let i = 1; i < drawers; i++) {
        const x = px + (pw * i) / drawers;
        n.push({ tag: 'line', attrs: { x1: x, y1: py, x2: x, y2: py + ph, stroke: c.line, 'stroke-width': 0.8, opacity: 0.75 } });
      }
      return n;
    },

    ironing_board(c) {
      const cx = c.X + c.W / 2;
      return [
        { tag: 'path', attrs: { d: `M ${c.X + c.W * 0.14} ${c.Y} H ${c.X + c.W * 0.86} Q ${c.X + c.W} ${c.Y} ${c.X + c.W} ${c.Y + c.H * 0.16} V ${c.Y + c.H * 0.84} Q ${c.X + c.W} ${c.Y + c.H} ${c.X + c.W * 0.86} ${c.Y + c.H} H ${c.X + c.W * 0.14} L ${c.X} ${c.Y + c.H / 2} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } },
        { tag: 'line', attrs: { x1: cx - c.W * 0.22, y1: c.Y + c.H * 0.22, x2: cx + c.W * 0.22, y2: c.Y + c.H * 0.78, stroke: c.line, 'stroke-width': 1, opacity: 0.55 } },
        { tag: 'line', attrs: { x1: cx + c.W * 0.22, y1: c.Y + c.H * 0.22, x2: cx - c.W * 0.22, y2: c.Y + c.H * 0.78, stroke: c.line, 'stroke-width': 1, opacity: 0.55 } },
      ];
    },

    chair(c) {
      const variant = c.p.variant || 'dining';
      if (variant === 'stool') {
        const r = Math.min(c.W, c.H) / 2;
        return [{ tag: 'circle', attrs: { cx: c.X + c.W / 2, cy: c.Y + c.H / 2, r, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } }, { tag: 'circle', attrs: { cx: c.X + c.W / 2, cy: c.Y + c.H / 2, r: r * 0.58, fill: 'none', stroke: c.line, 'stroke-width': 0.9 } }];
      }
      if (variant === 'office') {
        const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, r = Math.min(c.W, c.H) * 0.12;
        const n = [
          { tag: 'rect', attrs: frame(c, { rx: 5 }) },
          { tag: 'rect', attrs: { x: c.X + c.W * 0.08, y: c.Y, width: c.W * 0.84, height: c.H * 0.28, rx: 3, fill: c.line, opacity: 0.3 } },
        ];
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; n.push({ tag: 'line', attrs: { x1: cx, y1: cy, x2: cx + Math.cos(a) * c.W * 0.46, y2: cy + Math.sin(a) * c.H * 0.46, stroke: c.line, 'stroke-width': 0.9 } }); n.push({ tag: 'circle', attrs: { cx: cx + Math.cos(a) * c.W * 0.46, cy: cy + Math.sin(a) * c.H * 0.46, r, fill: c.line, opacity: 0.55 } }); }
        return n;
      }
      return [
        { tag: 'rect', attrs: frame(c, { rx: 3 }) },
        { tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H * 0.26, rx: 2, fill: c.line, opacity: 0.3 } },
      ];
    },

    /* Doors as leaf divisions plus handles. */
    wardrobe(c) {
      const n = [{ tag: 'rect', attrs: frame(c) }];
      const vertical = c.H > c.W;
      const leaves = Math.max(1, Math.round(num(c.p.leaves, (vertical ? c.p.h || 6 : c.p.w || 6) / 2.2)));
      for (let i = 1; i < leaves; i++) {
        const t = i / leaves;
        if (vertical) n.push({ tag: 'line', attrs: { x1: c.X, y1: c.Y + c.H * t, x2: c.X + c.W, y2: c.Y + c.H * t, stroke: c.line, 'stroke-width': 1 } });
        else n.push({ tag: 'line', attrs: { x1: c.X + c.W * t, y1: c.Y, x2: c.X + c.W * t, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 1 } });
      }
      // handles down the opening edge
      for (let i = 0; i < leaves; i++) {
        const t = (i + 0.85) / leaves;
        if (vertical) n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.72, y1: c.Y + c.H * t, x2: c.X + c.W * 0.72, y2: c.Y + c.H * (t - 0.12), stroke: c.line, 'stroke-width': 1.8 } });
        else n.push({ tag: 'line', attrs: { x1: c.X + c.W * t, y1: c.Y + c.H * 0.72, x2: c.X + c.W * (t - 0.12), y2: c.Y + c.H * 0.72, stroke: c.line, 'stroke-width': 1.8 } });
      }
      return n;
    },

    bookshelf(c) {
      const n = [{ tag: 'rect', attrs: frame(c) }];
      const vertical = c.H > c.W;
      const shelves = Math.max(1, Math.round(num(c.p.shelves, (vertical ? c.p.h || 4 : c.p.w || 4) / 1.1)));
      for (let i = 1; i < shelves; i++) {
        const t = i / shelves;
        if (vertical) n.push({ tag: 'line', attrs: { x1: c.X, y1: c.Y + c.H * t, x2: c.X + c.W, y2: c.Y + c.H * t, stroke: c.line, 'stroke-width': 0.9 } });
        else n.push({ tag: 'line', attrs: { x1: c.X + c.W * t, y1: c.Y, x2: c.X + c.W * t, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 0.9 } });
      }
      return n;
    },

    /* Two doors, freezer split, handle. */
    fridge(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 2 }) }];
      const split = num(c.p.freezerAt, 0.34);
      n.push({ tag: 'line', attrs: { x1: c.X, y1: c.Y + c.H * split, x2: c.X + c.W, y2: c.Y + c.H * split, stroke: c.line, 'stroke-width': 1.1 } });
      if (c.p.doors !== 1) {
        n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.5, y1: c.Y + c.H * split, x2: c.X + c.W * 0.5, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 1.1 } });
      }
      n.push({ tag: 'rect', attrs: { x: c.X + c.W * 0.46, y: c.Y + c.H * (split + 0.08), width: c.W * 0.08, height: c.H * 0.2, rx: 1.5, fill: c.line, opacity: 0.5 } });
      return n;
    },

    /* Four burners. */
    hob(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 2 }) }];
      const r = Math.min(c.W, c.H) * 0.17;
      const burners = Math.max(1, Math.round(num(c.p.burners, 4)));
      const layout = burners <= 2
        ? [[0.5, 0.29], [0.5, 0.71]].slice(0, burners)
        : [[0.29, 0.29], [0.71, 0.29], [0.29, 0.71], [0.71, 0.71], [0.5, 0.5], [0.5, 0.08]].slice(0, burners);
      for (const [fx, fy] of layout) {
        n.push({ tag: 'circle', attrs: { cx: c.X + c.W * fx, cy: c.Y + c.H * fy, r, fill: 'none', stroke: c.line, 'stroke-width': 1.2 } });
        n.push({ tag: 'circle', attrs: { cx: c.X + c.W * fx, cy: c.Y + c.H * fy, r: r * 0.4, fill: c.line, opacity: 0.35 } });
      }
      return n;
    },

    /* Counter run with an inset sink bowl and tap. */
    counter(c) {
      const n = [{ tag: 'rect', attrs: frame(c) }];
      if (c.p.sink !== false) {
        const sw = Math.min(c.W * 0.3, c.P.S(1.8)), sh = Math.min(c.H * 0.62, c.P.S(1.4));
        const sx = c.X + c.W * num(c.p.sinkAt, 0.5) - sw / 2, sy = c.Y + (c.H - sh) / 2;
        n.push({ tag: 'rect', attrs: { x: sx, y: sy, width: sw, height: sh, rx: 3, fill: 'none', stroke: c.line, 'stroke-width': 1.1 } });
        n.push({ tag: 'circle', attrs: { cx: sx + sw / 2, cy: sy + sh * 0.5, r: 1.6, fill: c.line, opacity: 0.6 } });
      }
      return n;
    },

    sink(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2;
      return [
        { tag: 'rect', attrs: frame(c, { rx: 4 }) },
        { tag: 'ellipse', attrs: { cx, cy: cy + c.H * 0.08, rx: c.W * 0.34, ry: c.H * 0.3, fill: 'none', stroke: c.line, 'stroke-width': 1.1 } },
        { tag: 'circle', attrs: { cx, cy: c.Y + c.H * 0.16, r: 1.8, fill: c.line, opacity: 0.6 } },
      ];
    },

    /* ---- sanitaryware ----
     *
     * These four had one drawing each, and a plan identifies a bathroom fitting
     * almost entirely by its OUTLINE: an alcove tub and a corner tub are not
     * the same object seen from different angles, and a squat pan and a
     * close-coupled WC are not either. One rounded rectangle for every tub in
     * every house threw away the only information the symbol carries.
     *
     * Each variant below is a distinct plan SYMBOL, not a restyling — the way a
     * drawing-office legend distinguishes them — and each keeps its waste or
     * outlet drawn, because that is what tells a reader which way the fitting
     * is used and which wall the plumbing is in.
     */

    /* Bowl + cistern, oriented by `faces` (the wall the cistern is against). */
    wc(c) {
      const variant = c.p.variant || 'close_coupled';
      const cx = c.X + c.W / 2;
      const n = [];

      /* A squat pan is flush with the floor: an oval trap between two foot
       * pads, and no cistern mass at all. Drawn as a plan symbol rather than a
       * shrunken pedestal WC because that is what it is. */
      if (variant === 'squat') {
        n.push({ tag: 'rect', attrs: frame(c, { rx: 3 }) });
        n.push({ tag: 'ellipse', attrs: { cx, cy: c.Y + c.H * 0.5, rx: c.W * 0.2, ry: c.H * 0.34, fill: 'none', stroke: c.line, 'stroke-width': 1.2 } });
        n.push({ tag: 'circle', attrs: { cx, cy: c.Y + c.H * 0.5, r: Math.max(1.4, Math.min(c.W, c.H) * 0.07), fill: c.line, opacity: 0.55 } });
        for (const side of [0.16, 0.84]) {
          n.push({ tag: 'rect', attrs: { x: c.X + c.W * side - c.W * 0.09, y: c.Y + c.H * 0.28, width: c.W * 0.18, height: c.H * 0.44, rx: 2, fill: 'none', stroke: c.line, 'stroke-width': 0.9, opacity: 0.7 } });
        }
        return n;
      }

      /* close_coupled draws the cistern as a solid block; back_to_wall hides it
       * in a duct, drawn as a thinner panel; wall_hung has none at all and
       * shows the bracket line instead. */
      if (variant === 'close_coupled') {
        n.push({ tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H * 0.26, rx: 2, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } });
      } else if (variant === 'back_to_wall') {
        n.push({ tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H * 0.16, rx: 1, fill: c.fill, stroke: c.line, 'stroke-width': 1, opacity: 0.75 } });
      } else {
        n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.16, y1: c.Y + c.H * 0.08, x2: c.X + c.W * 0.84, y2: c.Y + c.H * 0.08, stroke: c.line, 'stroke-width': 1.6, 'stroke-linecap': 'round' } });
      }
      const bowlY = variant === 'close_coupled' ? 0.62 : 0.56;
      n.push({ tag: 'ellipse', attrs: { cx, cy: c.Y + c.H * bowlY, rx: c.W * 0.38, ry: c.H * 0.32, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } });
      n.push({ tag: 'ellipse', attrs: { cx, cy: c.Y + c.H * bowlY, rx: c.W * 0.24, ry: c.H * 0.2, fill: 'none', stroke: c.line, 'stroke-width': 0.9 } });
      return n;
    },

    bidet(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2;
      return [
        { tag: 'ellipse', attrs: { cx, cy, rx: c.W * 0.47, ry: c.H * 0.47, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } },
        { tag: 'ellipse', attrs: { cx, cy: cy + c.H * 0.06, rx: c.W * 0.3, ry: c.H * 0.28, fill: 'none', stroke: c.line, 'stroke-width': 0.9 } },
        { tag: 'circle', attrs: { cx, cy: c.Y + c.H * 0.13, r: Math.max(1.5, Math.min(c.W, c.H) * 0.06), fill: c.line } },
      ];
    },

    basin(c) {
      const variant = c.p.variant || 'counter_top';
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2;
      const n = [];
      const tap = { tag: 'circle', attrs: { cx, cy: c.Y + c.H * 0.18, r: 1.6, fill: c.line, opacity: 0.6 } };

      /* A pedestal basin has no counter round it, so drawing one is a lie about
       * how much of the wall it takes: the bowl is the outline, and the
       * pedestal is the narrow rectangle showing through beneath it. */
      if (variant === 'pedestal') {
        n.push({ tag: 'rect', attrs: { x: cx - c.W * 0.14, y: cy, width: c.W * 0.28, height: c.H * 0.5, rx: 2, fill: c.fill, stroke: c.line, 'stroke-width': 0.9, opacity: 0.75 } });
        n.push({ tag: 'ellipse', attrs: { cx, cy: cy - c.H * 0.04, rx: c.W * 0.46, ry: c.H * 0.4, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } });
        n.push(tap);
        return n;
      }
      /* Wall-hung: the bowl and the bracket line it hangs off, nothing else. */
      if (variant === 'wall_hung') {
        n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.1, y1: c.Y + c.H * 0.1, x2: c.X + c.W * 0.9, y2: c.Y + c.H * 0.1, stroke: c.line, 'stroke-width': 1.6, 'stroke-linecap': 'round' } });
        n.push({ tag: 'ellipse', attrs: { cx, cy: cy + c.H * 0.06, rx: c.W * 0.44, ry: c.H * 0.38, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } });
        n.push(tap);
        return n;
      }
      /* Counter-top and under-counter share a counter and differ only in
       * whether the bowl sits ON it or hangs BELOW — which a plan shows by
       * drawing the hidden one dashed, the ordinary convention for anything
       * under the cut plane. */
      n.push({ tag: 'rect', attrs: frame(c, { rx: 4 }) });
      const under = variant === 'under_counter';
      n.push({
        tag: 'ellipse',
        attrs: {
          cx, cy: cy + c.H * 0.06, rx: c.W * 0.36, ry: c.H * 0.32, fill: 'none',
          stroke: c.line, 'stroke-width': 1.1,
          'stroke-dasharray': under ? '3 2' : null,
          opacity: under ? 0.75 : 1,
        },
      });
      n.push(tap);
      return n;
    },

    /* Tray, screen line, and a drain. */
    shower(c) {
      const variant = c.p.variant || 'square';
      const n = [];
      const drainR = Math.min(c.W, c.H) * 0.11;
      const drain = (dx, dy) => ({ tag: 'circle', attrs: { cx: dx, cy: dy, r: drainR, fill: 'none', stroke: c.line, 'stroke-width': 1.2 } });

      /* A quadrant tray's whole point is the curved front that keeps it out of
       * the walking line; squaring it off loses the reason it was chosen. */
      if (variant === 'quadrant') {
        n.push({ tag: 'path', attrs: { d: `M ${c.X} ${c.Y} L ${c.X + c.W} ${c.Y} L ${c.X + c.W} ${c.Y + c.H * 0.25} A ${c.W * 0.75} ${c.H * 0.75} 0 0 1 ${c.X + c.W * 0.25} ${c.Y + c.H} L ${c.X} ${c.Y + c.H} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } });
        n.push(drain(c.X + c.W * 0.3, c.Y + c.H * 0.3));
        return n;
      }
      /* A wet room has no tray at all — the floor IS the tray. Only the drain
       * and the fall towards it are drawable, so that is all it draws. */
      if (variant === 'wet_room') {
        n.push({ tag: 'rect', attrs: frame(c, { rx: 2, fill: 'none', 'stroke-dasharray': '4 3', opacity: 0.6 }) });
        n.push(drain(c.X + c.W / 2, c.Y + c.H / 2));
        for (const a of [0, 90, 180, 270]) {
          const r = a * Math.PI / 180;
          const ox = Math.cos(r), oy = Math.sin(r);
          n.push({ tag: 'line', attrs: { x1: c.X + c.W / 2 + ox * c.W * 0.4, y1: c.Y + c.H / 2 + oy * c.H * 0.4, x2: c.X + c.W / 2 + ox * drainR * 1.7, y2: c.Y + c.H / 2 + oy * drainR * 1.7, stroke: c.line, 'stroke-width': 0.8, opacity: 0.45 } });
        }
        return n;
      }
      /* Walk-in: open on one side, so three sides are drawn solid, the fourth
       * carries the screen, and the drain is a linear channel rather than a
       * point. */
      if (variant === 'walk_in') {
        n.push({ tag: 'path', attrs: { d: `M ${c.X + c.W} ${c.Y} L ${c.X} ${c.Y} L ${c.X} ${c.Y + c.H} L ${c.X + c.W} ${c.Y + c.H}`, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } });
        n.push({ tag: 'line', attrs: { x1: c.X + c.W, y1: c.Y, x2: c.X + c.W, y2: c.Y + c.H * 0.55, stroke: c.line, 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.8 } });
        n.push({ tag: 'rect', attrs: { x: c.X + c.W * 0.1, y: c.Y + c.H * 0.44, width: c.W * 0.8, height: c.H * 0.12, rx: 1.5, fill: 'none', stroke: c.line, 'stroke-width': 1.2 } });
        return n;
      }
      n.push({ tag: 'rect', attrs: frame(c, { rx: 2 }) });
      n.push({ tag: 'line', attrs: { x1: c.X, y1: c.Y, x2: c.X + c.W, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 0.8, opacity: 0.5 } });
      n.push({ tag: 'line', attrs: { x1: c.X + c.W, y1: c.Y, x2: c.X, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 0.8, opacity: 0.5 } });
      n.push(drain(c.X + c.W / 2, c.Y + c.H / 2));
      return n;
    },

    bathtub(c) {
      const variant = c.p.variant || 'alcove';
      const inset = Math.min(c.W, c.H) * 0.12;
      const n = [];
      /* The waste always sits at the tap end, which is what says which way the
       * tub is used and which wall carries the plumbing. */
      const waste = (wx, wy) => ({ tag: 'circle', attrs: { cx: wx, cy: wy, r: 1.8, fill: c.line, opacity: 0.55 } });

      /* A corner tub is a quarter-round, not a rectangle. Drawn against the
       * top-left of its box, which is the corner it is pushed into. */
      if (variant === 'corner') {
        n.push({ tag: 'path', attrs: { d: `M ${c.X} ${c.Y + c.H} L ${c.X} ${c.Y} L ${c.X + c.W} ${c.Y} A ${c.W} ${c.H} 0 0 1 ${c.X} ${c.Y + c.H} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } });
        n.push({ tag: 'path', attrs: { d: `M ${c.X + inset} ${c.Y + c.H - inset} L ${c.X + inset} ${c.Y + inset} L ${c.X + c.W - inset} ${c.Y + inset} A ${c.W - inset * 2} ${c.H - inset * 2} 0 0 1 ${c.X + inset} ${c.Y + c.H - inset} Z`, fill: 'none', stroke: c.line, 'stroke-width': 1.1 } });
        n.push(waste(c.X + c.W * 0.24, c.Y + c.H * 0.24));
        return n;
      }
      /* Freestanding: an oval standing clear of every wall, and the gap all
       * round is the point — it is why the room had to be big enough. */
      if (variant === 'freestanding') {
        n.push({ tag: 'ellipse', attrs: { cx: c.X + c.W / 2, cy: c.Y + c.H / 2, rx: c.W * 0.46, ry: c.H * 0.46, fill: c.fill, stroke: c.line, 'stroke-width': 1.3 } });
        n.push({ tag: 'ellipse', attrs: { cx: c.X + c.W / 2, cy: c.Y + c.H / 2, rx: c.W * 0.37, ry: c.H * 0.36, fill: 'none', stroke: c.line, 'stroke-width': 1 } });
        n.push(waste(c.X + c.W * 0.5, c.Y + c.H * 0.74));
        return n;
      }

      n.push({ tag: 'rect', attrs: frame(c, { rx: 5 }) });
      n.push({ tag: 'rect', attrs: { x: c.X + inset, y: c.Y + inset, width: c.W - inset * 2, height: c.H - inset * 2, rx: 6, fill: 'none', stroke: c.line, 'stroke-width': 1.1 } });
      n.push(waste(c.X + c.W * 0.5, c.Y + c.H * 0.82));

      /* A jacuzzi is an alcove tub with jets; a shower-bath is one with a
       * screen across the tap end and a head above it. Both are the same
       * outline plus the thing that makes them different. */
      if (variant === 'jacuzzi') {
        for (const t of [0.24, 0.5, 0.76]) {
          for (const side of [inset * 1.7, c.H - inset * 1.7]) {
            n.push({ tag: 'circle', attrs: { cx: c.X + c.W * t, cy: c.Y + side, r: 1.5, fill: 'none', stroke: c.line, 'stroke-width': 0.9, opacity: 0.7 } });
          }
        }
      } else if (variant === 'shower_bath') {
        n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.28, y1: c.Y + inset, x2: c.X + c.W * 0.28, y2: c.Y + c.H - inset, stroke: c.line, 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.8 } });
        n.push({ tag: 'circle', attrs: { cx: c.X + c.W * 0.14, cy: c.Y + c.H * 0.5, r: Math.min(c.W, c.H) * 0.1, fill: 'none', stroke: c.line, 'stroke-width': 1.2 } });
      }
      return n;
    },

    /* ---- stairs ----
     *
     * A flight is architecture, not a box with lines in it: which way it turns
     * decides how the plan reads, and a spiral is a different object from a
     * straight run rather than the same one squashed. Five variants, each drawn
     * from the same three numbers a real flight has — how many steps, which way
     * you climb, and which axis the treads run across.
     *
     * `lighting` draws what is ON the steps: nothing, a pip each side, a lit
     * nosing, or both. `lightEvery` is the cadence — every step, every second,
     * every fourth — because that is how step lighting is actually installed.
     * When the flight is bound to an entity and that entity is on, the lit parts
     * take the lamp colour. `sequence` says what that looks like: `together`,
     * which is what most step lighting does, or `progressive`, which climbs the
     * flight one step at a time the way a motion-triggered stair light does.
     * A stair with no arrow is ambiguous, so every variant draws one.
     */
    stairs(c) {
      const variant = c.p.variant || 'straight';
      const steps = Math.max(2, Math.round(num(c.p.steps, 9)));
      const up = c.p.dir !== 'down';
      const lighting = c.p.lighting || 'none';
      const every = Math.max(1, Math.round(num(c.p.lightEvery, 1)));
      /* Two things step lighting can do when it comes on, and they are
       * different products: most of it simply lights, and a progressive stair
       * light climbs the flight from the step you are standing on. Neither is
       * the default for the other, so it is asked rather than assumed. */
      const progressive = c.p.sequence === 'progressive';
      const lit = !!c.on;
      const glow = lit ? (c.accent || '#ffc88c') : c.line;
      /* Where the floor plane cuts the flight.
       *
       * A stair on a floor plan is a stair CUT: you are looking at a horizontal
       * slice taken about four feet above this floor, so the treads past that
       * height belong to the storey above and are conventionally shown beyond a
       * break line — faint, or not at all. Drawing every tread solid, which is
       * what this did, says the flight begins and ends on this floor, which is
       * true of almost no stair in a house.
       *
       *   none  one flight, drawn whole — a short stoop, a stage step
       *   cut   what is past the break belongs to the next storey and is
       *         drawn faint. Which way it goes is `dir`, as it always was;
       *         two direction controls that could disagree would be worse
       *         than one
       *   both  an up run and a down run either side of the break, which is
       *         what a plan of any middle floor of a house actually shows
       *
       * `cutAt` is how far along the flight the slice falls. It is a real
       * number rather than a fixed half because where the plane lands depends
       * on the riser height, and a flight of six deep treads is cut much later
       * than a flight of eighteen. */
      const continues = c.p.continues || 'none';
      const cutFrac = Math.max(0.15, Math.min(0.9, num(c.p.cutAt, 0.6)));
      const cutIdx = continues === 'none' ? steps + 1 : Math.max(1, Math.min(steps - 1, Math.round(steps * cutFrac)));
      /* `both` keeps everything solid — both runs are on this floor's plan —
       * where a single cut flight fades what is no longer on it. */
      const fadePast = continues === 'cut';
      const n = [];

      /* One lit step. `i` is its index up the flight, so the chase delay can be
       * proportional and the light appears to climb rather than blink. */
      const stepLight = (x1, y1, x2, y2, i) => {
        if (lighting === 'none') return;
        if (i % every !== 0) return;
        /* The chase only runs when the flight is lit, set to climb, and motion
         * is allowed; `class` (not a bare `cls`) is what the serialiser writes
         * out, the same way every other animated shape in this file declares
         * one. Lit-together steps are the same nodes without the animation, so
         * turning the chase off never dims the flight. */
        const chase = lit && progressive && c.motion ? 'fps-step' : null;
        const style = chase ? `--fps-i:${i}` : null;
        if (lighting === 'edge' || lighting === 'both') {
          n.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: glow, 'stroke-width': lit ? 2.2 : 1.2, 'stroke-linecap': 'round', opacity: lit ? 0.95 : 0.5, class: chase, style } });
        }
        if (lighting === 'side' || lighting === 'both') {
          const r = lit ? 1.9 : 1.3;
          n.push({ tag: 'circle', attrs: { cx: x1, cy: y1, r, fill: glow, opacity: lit ? 0.95 : 0.5, class: chase, style } });
          n.push({ tag: 'circle', attrs: { cx: x2, cy: y2, r, fill: glow, opacity: lit ? 0.95 : 0.5, class: chase, style } });
        }
      };

      /* UP / DN the way a drawing says it, laid over the treads with a halo in
       * the floor colour so it stays readable on top of them. Only drawn when
       * the flight is cut: on a single uncut flight the arrow alone is
       * unambiguous, and two letters on a stoop is noise. */
      const label = (x, y, text) => {
        if (!text) return;
        /* Sized in FEET, not in a share of the box: two letters that are a
         * quarter of the shape are fine on a plan and swamp the 36-pixel
         * swatch in the Look picker, which draws the same flight at a third of
         * the scale. Nine inches of lettering is right at both. */
        const size = Math.max(3.2, Math.min(11, c.P.S(0.85)));
        n.push({
          tag: 'text', text,
          attrs: {
            x, y, 'font-size': size, 'font-weight': 600, 'text-anchor': 'middle',
            'dominant-baseline': 'middle', fill: c.line, opacity: 0.85,
            'paint-order': 'stroke', stroke: c.fill, 'stroke-width': 2.6, 'stroke-linejoin': 'round',
          },
        });
      };

      const arrow = (x0, y0, x1, y1, text) => {
        const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, px = -uy, py = ux;
        n.push({ tag: 'line', attrs: { x1: x0, y1: y0, x2: x1, y2: y1, stroke: c.line, 'stroke-width': 1.6 } });
        n.push({ tag: 'path', attrs: { d: `M ${x1 - ux * 6 - px * 4} ${y1 - uy * 6 - py * 4} L ${x1} ${y1} L ${x1 - ux * 6 + px * 4} ${y1 - uy * 6 + py * 4}`, fill: 'none', stroke: c.line, 'stroke-width': 1.6 } });
        label(x0 + ux * 7, y0 + uy * 7, text);
      };

      /* The travel arrow along one straight run — or two of them, a down run
       * and an up run either side of the break, which is what a middle floor
       * of a house actually shows. */
      const travelArrow = (x0, y0, x1, y1) => {
        if (continues !== 'both') return arrow(x0, y0, x1, y1, travelLabel);
        const t = cutIdx / steps;
        const mx = x0 + (x1 - x0) * t, my = y0 + (y1 - y0) * t;
        arrow(mx - (x1 - x0) * 0.05, my - (y1 - y0) * 0.05, x0, y0, downWord);
        arrow(mx + (x1 - x0) * 0.05, my + (y1 - y0) * 0.05, x1, y1, upWord);
      };

      /* The floor plane, drawn where a drawing draws it: a pair of parallel
       * lines leaning across the run. Two rather than one, because a single
       * diagonal across a flight of treads reads as another tread. */
      const breakMark = (x, y, w, h, axis, t) => {
        if (continues === 'none') return;
        /* Both numbers come from the flight's WIDTH, not its length: the mark
         * leans across the treads at a fixed angle, so it reads the same on a
         * six-step stoop and an eighteen-step run. Taken off the length
         * instead, a long flight got a near-horizontal slash indistinguishable
         * from one more tread. */
        const across = axis === 'ns' ? w : h;
        const gap = Math.max(1.5, Math.min(3.5, across * 0.07));
        const lean = across * 0.55;
        for (const o of [-gap, gap]) {
          if (axis === 'ns') {
            const yy = y + h * t + o;
            n.push({ tag: 'line', attrs: { x1: x, y1: yy + lean / 2, x2: x + w, y2: yy - lean / 2, stroke: c.line, 'stroke-width': 1.4 } });
          } else {
            const xx = x + w * t + o;
            n.push({ tag: 'line', attrs: { x1: xx + lean / 2, y1: y, x2: xx - lean / 2, y2: y + h, stroke: c.line, 'stroke-width': 1.4 } });
          }
        }
      };

      /* A straight run of `count` treads filling the given box, treads
       * perpendicular to `axis`. Shared by every variant that is made of
       * straight flights, which is all of them but the spiral.
       *
       * `from` is the index of this run's first tread up the whole flight, so
       * a two-leg stair numbers straight through the turn — which is what lets
       * the cut and the lighting cadence land in the right place on the second
       * leg rather than restarting at it.
       *
       * `reverse` says the climb runs against the box: the treads are drawn
       * top-to-bottom while you walk them bottom-to-top. It has to be told
       * rather than inferred, because a U-switchback climbs its two legs in
       * opposite directions across the page. Getting it wrong put the floor
       * cut — and the progressive lighting chase — at the wrong end of the
       * flight, which is the sort of error that looks like a shading choice. */
      const flight = (x, y, w, h, count, axis, from, reverse) => {
        const stepAt = (slot) => from + (reverse ? count - 1 - slot : slot);
        for (let i = 1; i < count; i++) {
          const t = i / count;
          const far = fadePast && Math.min(stepAt(i - 1), stepAt(i)) >= cutIdx;
          const a = { stroke: c.line, 'stroke-width': 1, opacity: far ? 0.38 : 1, 'stroke-dasharray': far ? '3 2.5' : null };
          if (axis === 'ns') n.push({ tag: 'line', attrs: Object.assign({ x1: x, y1: y + h * t, x2: x + w, y2: y + h * t }, a) });
          else n.push({ tag: 'line', attrs: Object.assign({ x1: x + w * t, y1: y, x2: x + w * t, y2: y + h }, a) });
        }
        for (let i = 0; i < count; i++) {
          const t = (i + 0.5) / count;
          if (fadePast && stepAt(i) >= cutIdx) continue;   // past the cut is another storey's lighting
          if (axis === 'ns') stepLight(x, y + h * t, x + w, y + h * t, stepAt(i));
          else stepLight(x + w * t, y, x + w * t, y + h, stepAt(i));
        }
        if (cutIdx > from && cutIdx <= from + count) {
          const along = (cutIdx - from) / count;
          breakMark(x, y, w, h, axis, reverse ? 1 - along : along);
        }
      };

      /* What the arrow says. A cut flight names the direction it goes on past
       * the break; an uncut one says nothing, because there is nothing to
       * disambiguate. */
      const upWord = up ? 'UP' : 'DN', downWord = up ? 'DN' : 'UP';
      const travelLabel = continues === 'none' ? null : upWord;

      n.push({ tag: 'rect', attrs: frame(c) });

      if (variant === 'spiral') {
        const cx = c.X + c.W / 2, cy = c.Y + c.H / 2;
        const rOut = Math.min(c.W, c.H) / 2, rIn = rOut * num(c.p.newel, 0.22);
        const sweep = num(c.p.sweep, 330) * (up ? 1 : -1);
        for (let i = 0; i <= steps; i++) {
          const a = ((i / steps) * sweep - 90) * Math.PI / 180;
          const x1 = cx + Math.cos(a) * rIn, y1 = cy + Math.sin(a) * rIn;
          const x2 = cx + Math.cos(a) * rOut, y2 = cy + Math.sin(a) * rOut;
          if (i >= steps) break;
          const far = fadePast && i >= cutIdx;
          n.push({ tag: 'line', attrs: { x1, y1, x2, y2, stroke: c.line, 'stroke-width': 1, opacity: far ? 0.38 : 1, 'stroke-dasharray': far ? '3 2.5' : null } });
          if (!far) stepLight(x1, y1, x2, y2, i);
          /* The break on a spiral runs along a radius, because that is where
           * the floor plane crosses it — the same cut, in polar. */
          if (continues !== 'none' && i === cutIdx) {
            for (const o of [-0.055, 0.055]) {
              const b = a + o;
              n.push({ tag: 'line', attrs: { x1: cx + Math.cos(b) * rIn * 0.9, y1: cy + Math.sin(b) * rIn * 0.9, x2: cx + Math.cos(b) * rOut * 1.04, y2: cy + Math.sin(b) * rOut * 1.04, stroke: c.line, 'stroke-width': 1.3 } });
            }
          }
        }
        n.push({ tag: 'circle', attrs: { cx, cy, r: rIn, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } });
        const aEnd = ((0.5 * sweep) - 90) * Math.PI / 180;
        arrow(cx + Math.cos(-Math.PI / 2) * rOut * 0.66, cy + Math.sin(-Math.PI / 2) * rOut * 0.66,
          cx + Math.cos(aEnd) * rOut * 0.66, cy + Math.sin(aEnd) * rOut * 0.66, travelLabel);
        return n;
      }

      if (variant === 'l_shaped' || variant === 'winder') {
        /* Two runs meeting at a corner. `winder` differs only in that the
         * corner is turned on tapered treads rather than a flat landing,
         * which at plan scale is the fan of lines in the corner square.
         *
         * The arm width is the flight's own walking width, so it is capped
         * against BOTH sides of the box rather than taken off the shorter one:
         * a stairwell drawn 3.5 ft by 10 ft used to get arms 1.5 ft wide with
         * a two-foot leg, and five treads were then packed into that leg. */
        const armW = Math.min(Math.min(c.W, c.H) * 0.45, c.W / 2.2, c.H / 2.2);
        const legA = Math.max(1, c.W - armW), legB = Math.max(1, c.H - armW);
        /* Winders ARE steps — three tapered treads is how the turn is built —
         * so they come out of the flight's own count rather than being drawn
         * on top of it, which used to make a nine-step stair draw twelve. */
        const winders = variant === 'winder' ? Math.min(3, Math.max(0, steps - 2)) : 0;
        const straight = steps - winders;
        /* Treads split by how long each leg really is. Half and half is only
         * right when the legs are equal, and they almost never are. */
        const first = Math.max(1, Math.min(straight - 1, Math.round((straight * legA) / (legA + legB))));
        const second = straight - first;
        flight(c.X, c.Y, legA, armW, first, 'ew', 0, !up);
        flight(c.X + c.W - armW, c.Y + armW, armW, legB, second, 'ns', first + winders, !up);
        const kx = c.X + c.W - armW, ky = c.Y;
        if (winders) {
          for (let i = 1; i < winders; i++) {
            const a = (i / winders) * (Math.PI / 2);
            const x2 = kx + Math.sin(a) * armW, y2 = ky + armW - Math.cos(a) * armW;
            const far = fadePast && first + i >= cutIdx;
            n.push({ tag: 'line', attrs: { x1: kx, y1: ky + armW, x2, y2, stroke: c.line, 'stroke-width': 1, opacity: far ? 0.38 : 1, 'stroke-dasharray': far ? '3 2.5' : null } });
            if (!far) stepLight(kx, ky + armW, x2, y2, first + i);
          }
        } else {
          n.push({ tag: 'rect', attrs: { x: kx, y: ky, width: armW, height: armW, fill: 'none', stroke: c.line, 'stroke-width': 1.2 } });
        }
        /* The travel arrow follows the L rather than cutting the corner off,
         * which is the difference between "these two runs are one stair" and
         * "something is drawn diagonally across a stairwell". */
        const midA = c.Y + armW / 2, midB = c.X + c.W - armW / 2;
        const tail = up ? [c.X + 6, midA] : [midB, c.Y + c.H - 6];
        const head = up ? [midB, c.Y + c.H - 6] : [c.X + 6, midA];
        n.push({ tag: 'line', attrs: { x1: tail[0], y1: tail[1], x2: midB, y2: midA, stroke: c.line, 'stroke-width': 1.6 } });
        arrow(midB, midA, head[0], head[1], null);
        label(tail[0] + (up ? 7 : 0), tail[1] + (up ? 0 : -7), travelLabel);
        return n;
      }

      if (variant === 'u_switchback') {
        /* Two parallel flights with a landing across the far end — the shape
         * almost every Indian stairwell actually is. You climb the first, turn
         * through 180° on the landing, and keep climbing back the other way.
         *
         * `axis` is which way the flights RUN, and this variant now reads it
         * instead of assuming north-south. A switchback in a well that is wider
         * than it is deep runs east-west, and drawing it the other way turns a
         * real staircase through ninety degrees — which is what the private
         * house's main shaft (10.5 ft across, 7.875 ft deep, entered from the
         * west) showed. Every other variant already honoured the prop; this one
         * declared it and ignored it.
         *
         * Rotating the ITEM is not the alternative: furniture `at` is its
         * top-left corner, so a rotated flight's real footprint is a box
         * neither the document nor `audit-plan.js` can describe, and the audit
         * reports it as being outside the room it names. */
        const ew = (c.p.axis || 'ns') === 'ew';
        const first = Math.ceil(steps / 2), second = steps - first;
        /* Where the plan shows an up run AND a down run, both of them leave
         * from THIS floor and both arrows point away from it — which is what a
         * stair drawing shows and what the house's own section confirms. The
         * second arrow doubles back only when the two runs are halves of one
         * climb, which is what `none` and `cut` mean. */
        const bothWays = continues === 'both';
        if (ew) {
          const half = (c.H - 4) / 2;
          const landing = Math.min(c.W * 0.22, half);
          const run = c.W - landing;
          flight(c.X, c.Y, run, half, first, 'ew', 0, up);
          flight(c.X, c.Y + half + 4, run, half, second, 'ew', first, !up);
          n.push({ tag: 'rect', attrs: { x: c.X + run, y: c.Y, width: landing, height: c.H, fill: 'none', stroke: c.line, 'stroke-width': 1.2 } });
          n.push({ tag: 'line', attrs: { x1: c.X, y1: c.Y + half + 2, x2: c.X + run, y2: c.Y + half + 2, stroke: c.line, 'stroke-width': 1.4 } });
          arrow(c.X + 6, c.Y + half / 2, c.X + run - 6, c.Y + half / 2, travelLabel);
          const backY = c.Y + half + 4 + half / 2;
          arrow(bothWays ? c.X + 6 : c.X + run - 6, backY, bothWays ? c.X + run - 6 : c.X + 6, backY,
            bothWays ? downWord : null);
        } else {
          const half = (c.W - 4) / 2;
          const landing = Math.min(c.H * 0.22, half);
          flight(c.X, c.Y + landing, half, c.H - landing, first, 'ns', 0, up);
          flight(c.X + half + 4, c.Y + landing, half, c.H - landing, second, 'ns', first, !up);
          n.push({ tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: landing, fill: 'none', stroke: c.line, 'stroke-width': 1.2 } });
          n.push({ tag: 'line', attrs: { x1: c.X + half + 2, y1: c.Y + landing, x2: c.X + half + 2, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 1.4 } });
          arrow(c.X + half / 2, c.Y + c.H - 6, c.X + half / 2, c.Y + landing + 6, travelLabel);
          const backX = c.X + half + 4 + half / 2;
          arrow(backX, bothWays ? c.Y + c.H - 6 : c.Y + landing + 6, backX, bothWays ? c.Y + landing + 6 : c.Y + c.H - 6,
            bothWays ? downWord : null);
        }
        return n;
      }

      /* straight — treads across the run, one travel arrow. */
      const axis = c.p.axis || (c.H >= c.W ? 'ns' : 'ew');
      flight(c.X, c.Y, c.W, c.H, steps, axis, 0, up);
      if (axis === 'ns') {
        const x = c.X + c.W / 2;
        travelArrow(x, up ? c.Y + c.H * 0.85 : c.Y + c.H * 0.15, x, up ? c.Y + c.H * 0.15 : c.Y + c.H * 0.85);
      } else {
        const y = c.Y + c.H / 2;
        travelArrow(up ? c.X + c.W * 0.85 : c.X + c.W * 0.15, y, up ? c.X + c.W * 0.15 : c.X + c.W * 0.85, y);
      }
      return n;
    },

    /* ---- lift ----
     *
     * A shaft on a plan is read by its CAR, and the car is the thing that
     * differs: a traction lift is a rectangle in a rectangle with centre-opening
     * doors, a pneumatic vacuum lift is a cylinder — the shaft IS the tube — and
     * a platform lift has no enclosure to speak of. Drawing all three as one
     * squared-off box lost the only distinction anyone cares about. */
    lift(c) {
      const variant = c.p.variant || 'traction';
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2;
      const n = [];

      if (variant === 'vacuum') {
        /* Cylindrical pneumatic lift: the shaft is a sealed tube, so the plan
         * symbol is a circle, not a rectangle inside one. */
        const rOut = Math.min(c.W, c.H) / 2;
        n.push({ tag: 'circle', attrs: { cx, cy, r: rOut, fill: c.fill, stroke: c.line, 'stroke-width': 1.4 } });
        n.push({ tag: 'circle', attrs: { cx, cy, r: rOut * 0.78, fill: 'none', stroke: c.line, 'stroke-width': 0.9, opacity: 0.8 } });
        /* The curved door segment, drawn as a gap in the inner tube. */
        const a0 = -0.55, a1 = 0.55;
        n.push({ tag: 'path', attrs: { d: `M ${cx + Math.cos(a0) * rOut * 0.78} ${cy + Math.sin(a0) * rOut * 0.78} A ${rOut * 0.78} ${rOut * 0.78} 0 0 1 ${cx + Math.cos(a1) * rOut * 0.78} ${cy + Math.sin(a1) * rOut * 0.78}`, fill: 'none', stroke: c.fill, 'stroke-width': 2.6 } });
        n.push({ tag: 'circle', attrs: { cx, cy, r: rOut * 0.16, fill: 'none', stroke: c.line, 'stroke-width': 1 } });
        return n;
      }

      if (variant === 'platform') {
        /* Open platform / wheelchair lift: a deck and its guide rail, no cab. */
        n.push({ tag: 'rect', attrs: frame(c, { rx: 2 }) });
        n.push({ tag: 'line', attrs: { x1: c.X + 2, y1: c.Y + 2, x2: c.X + 2, y2: c.Y + c.H - 2, stroke: c.line, 'stroke-width': 2.4 } });
        for (let i = 1; i < 4; i++) {
          n.push({ tag: 'line', attrs: { x1: c.X + (c.W * i) / 4, y1: c.Y + 3, x2: c.X + (c.W * i) / 4, y2: c.Y + c.H - 3, stroke: c.line, 'stroke-width': 0.7, opacity: 0.6 } });
        }
        return n;
      }

      const inset = Math.min(c.W, c.H) * 0.14;
      n.push({ tag: 'rect', attrs: frame(c) });
      n.push({ tag: 'rect', attrs: { x: c.X + inset, y: c.Y + inset, width: c.W - inset * 2, height: c.H - inset * 2, fill: 'none', stroke: c.line, 'stroke-width': 0.9 } });
      if (variant === 'dumbwaiter') {
        /* Too small to walk into, so it is drawn as a hatch rather than a car —
         * the cross says "not a room you enter". */
        n.push({ tag: 'line', attrs: { x1: c.X + inset, y1: c.Y + inset, x2: c.X + c.W - inset, y2: c.Y + c.H - inset, stroke: c.line, 'stroke-width': 0.8 } });
        n.push({ tag: 'line', attrs: { x1: c.X + c.W - inset, y1: c.Y + inset, x2: c.X + inset, y2: c.Y + c.H - inset, stroke: c.line, 'stroke-width': 0.8 } });
        return n;
      }
      /* traction / hydraulic: centre-opening doors on the long side. */
      n.push({ tag: 'line', attrs: { x1: cx, y1: c.Y + inset, x2: cx, y2: c.Y + c.H - inset, stroke: c.line, 'stroke-width': 1.1 } });
      return n;
    },

    /* Body, cabin taper, wheels. */
    car(c) {
      const variant = c.p.variant || 'sedan';
      const n = [];
      n.push({ tag: 'rect', attrs: frame(c, { rx: variant === 'suv' ? Math.min(c.W, c.H) * 0.12 : Math.min(c.W, c.H) * 0.22 }) });
      const inset = c.W * 0.16;
      if (variant === 'pickup') {
        n.push({ tag: 'rect', attrs: { x: c.X + inset, y: c.Y + c.H * 0.13, width: c.W - inset * 2, height: c.H * 0.28, rx: 3, fill: c.line, opacity: 0.22 } });
        n.push({ tag: 'rect', attrs: { x: c.X + c.W * 0.1, y: c.Y + c.H * 0.53, width: c.W * 0.8, height: c.H * 0.34, rx: 2, fill: 'none', stroke: c.line, 'stroke-width': 1.1 } });
      } else {
        n.push({ tag: 'rect', attrs: { x: c.X + inset, y: c.Y + c.H * (variant === 'suv' ? 0.15 : 0.22), width: c.W - inset * 2, height: c.H * (variant === 'suv' ? 0.5 : 0.34), rx: 4, fill: c.line, opacity: 0.22 } });
        n.push({ tag: 'line', attrs: { x1: c.X + inset, y1: c.Y + c.H * 0.42, x2: c.X + c.W - inset, y2: c.Y + c.H * 0.42, stroke: c.line, 'stroke-width': 0.8, opacity: 0.55 } });
      }
      for (const fy of [0.18, 0.82]) for (const fx of [0.0, 1.0]) {
        n.push({ tag: 'rect', attrs: { x: c.X + c.W * fx - c.W * 0.06, y: c.Y + c.H * fy - c.H * 0.055, width: c.W * 0.12, height: c.H * 0.11, rx: 2, fill: c.line, opacity: 0.5 } });
      }
      return n;
    },

    /* Plants are strict plan views. The old version put a flowerpot UNDER the
     * foliage like a side elevation and built the canopy from overlapping
     * circles. That read as clip-art on an architectural plan. These leaves
     * radiate from the crown, and a pot (when present) is a rim seen from
     * above. */
    plant(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, r = Math.min(c.W, c.H) / 2;
      const variant = c.p.variant || 'potted';
      const n = [];
      const leaf = (angle, len, width, offset, opacity) => {
        const y0 = cy - num(offset, 0);
        n.push({ tag: 'path', attrs: {
          d: `M ${cx} ${y0} C ${cx - width} ${y0 - len * 0.28} ${cx - width * 0.72} ${y0 - len * 0.78} ${cx} ${y0 - len} C ${cx + width * 0.72} ${y0 - len * 0.78} ${cx + width} ${y0 - len * 0.28} ${cx} ${y0} Z`,
          fill: c.fill, stroke: c.line, 'stroke-width': 1, opacity: num(opacity, 0.9),
          transform: `rotate(${angle} ${cx} ${cy})`, 'stroke-linejoin': 'round',
        } });
      };
      const vein = (angle, len, offset, opacity) => {
        const y0 = cy - num(offset, 0);
        n.push({ tag: 'line', attrs: {
          x1: cx, y1: y0, x2: cx, y2: y0 - len,
          stroke: c.line, 'stroke-width': 0.65, opacity: num(opacity, 0.55),
          transform: `rotate(${angle} ${cx} ${cy})`, 'stroke-linecap': 'round',
        } });
      };
      if (variant === 'bush') {
        const radii = [0.86, 0.98, 0.88, 1, 0.9, 0.96, 0.84, 1, 0.9, 0.97, 0.86, 0.94];
        const pts = radii.map((rr, i) => {
          const a = (i / radii.length) * Math.PI * 2 - Math.PI / 2;
          return [cx + Math.cos(a) * r * rr, cy + Math.sin(a) * r * rr];
        });
        let d = `M ${(pts[pts.length - 1][0] + pts[0][0]) / 2} ${(pts[pts.length - 1][1] + pts[0][1]) / 2}`;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], q = pts[(i + 1) % pts.length];
          d += ` Q ${p[0]} ${p[1]} ${(p[0] + q[0]) / 2} ${(p[1] + q[1]) / 2}`;
        }
        d += ' Z';
        n.push({ tag: 'path', attrs: { d, fill: c.fill, stroke: c.line, 'stroke-width': 1.2, 'stroke-linejoin': 'round' } });
        /* Overlapping leaf masses give the crown depth without returning to
         * the old stack-of-circles cartoon. */
        for (let i = 0; i < 9; i++) {
          const a = i * 40 + 8;
          leaf(a, r * (0.5 + (i % 3) * 0.11), r * 0.14, 0, 0.34);
        }
        for (let i = 0; i < 7; i++) {
          const a = i * 360 / 7 + 12;
          vein(a, r * (0.46 + (i % 2) * 0.1), 0, 0.38);
        }
        n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.11, fill: c.line, opacity: 0.42 } });
        return n;
      }
      if (variant === 'succulent') {
        n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.78, fill: c.fill, stroke: c.line, 'stroke-width': 1.1, opacity: 0.34 } });
        const leaves = Math.max(6, Math.round(num(c.p.leaves, 10)));
        for (let ring = 0; ring < 2; ring++) {
          const count = ring ? Math.max(5, leaves - 3) : leaves;
          for (let i = 0; i < count; i++) leaf(i * 360 / count + ring * 18, r * (ring ? 0.48 : 0.78), r * (ring ? 0.13 : 0.17), 0, ring ? 0.96 : 0.78);
        }
        n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.1, fill: c.line, opacity: 0.55 } });
        return n;
      }
      if (variant === 'fern') {
        const fronds = Math.max(6, Math.round(num(c.p.leaves, 8)));
        for (let i = 0; i < fronds; i++) {
          const a = i * 360 / fronds + (i % 2) * 7;
          const len = r * (0.78 + (i % 3) * 0.08);
          leaf(a, len, r * 0.105, 0, 0.42);
          n.push({ tag: 'path', attrs: { d: `M ${cx} ${cy} C ${cx - r * 0.1} ${cy - len * 0.28} ${cx + r * 0.08} ${cy - len * 0.7} ${cx} ${cy - len}`, fill: 'none', stroke: c.line, 'stroke-width': 1.25, transform: `rotate(${a} ${cx} ${cy})`, 'stroke-linecap': 'round' } });
          for (let k = 1; k <= 4; k++) {
            const y = cy - len * k / 5, spread = r * (0.2 - k * 0.026);
            n.push({ tag: 'path', attrs: { d: `M ${cx} ${y} Q ${cx - spread * 0.65} ${y - len * 0.02} ${cx - spread} ${y - len * 0.09} Q ${cx - spread * 0.45} ${y - len * 0.105} ${cx} ${y} M ${cx} ${y} Q ${cx + spread * 0.65} ${y - len * 0.02} ${cx + spread} ${y - len * 0.09} Q ${cx + spread * 0.45} ${y - len * 0.105} ${cx} ${y}`, fill: c.fill, stroke: c.line, 'stroke-width': 0.65, opacity: 0.82, transform: `rotate(${a} ${cx} ${cy})`, 'stroke-linejoin': 'round' } });
          }
        }
        n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.13, fill: c.line, opacity: 0.5 } });
        return n;
      }
      if (variant === 'flowering') {
        n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.7, fill: c.fill, stroke: c.line, 'stroke-width': 1, opacity: 0.28 } });
        for (let i = 0; i < 9; i++) leaf(i * 40, r * (0.62 + (i % 2) * 0.15), r * 0.18, 0, 0.82);
        for (let i = 0; i < 5; i++) {
          const a = (i * 72 - 90) * Math.PI / 180;
          n.push({ tag: 'circle', attrs: { cx: cx + Math.cos(a) * r * 0.3, cy: cy + Math.sin(a) * r * 0.3, r: r * 0.13, fill: c.fill, stroke: c.line, 'stroke-width': 0.8 } });
        }
        n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.09, fill: c.line, opacity: 0.6 } });
        return n;
      }
      if (variant === 'monstera') {
        n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.63, fill: c.fill, stroke: c.line, 'stroke-width': 1.1, opacity: 0.3 } });
        for (let i = 0; i < 6; i++) {
          const a = i * 60 + 12;
          leaf(a, r * 0.86, r * 0.29, 0, 0.9);
          vein(a, r * 0.72, 0, 0.65);
        }
        n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.12, fill: c.line, opacity: 0.5 } });
        return n;
      }
      // Potted broadleaf: circular rim/soil under a crown, all seen from above.
      n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.66, fill: c.fill, stroke: c.line, 'stroke-width': 1.25 } });
      n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.54, fill: c.line, opacity: 0.14 } });
      for (let i = 0; i < 8; i++) {
        const a = i * 45 + (i % 2) * 8;
        leaf(a, r * (0.62 + (i % 3) * 0.1), r * 0.16, 0, 0.88);
        vein(a, r * 0.48, 0, 0.5);
      }
      n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.1, fill: c.line, opacity: 0.55 } });
      return n;
    },

    /* A real tree, top-down, drawn as its own thing rather than a bigger
     * plant() — a conifer's tiered points and a palm's radiating fronds have
     * nothing in common with a houseplant's leaf clumps, and forcing them
     * through the same function would mean every variant fighting the same
     * "clump" shape language instead of looking like what it is. */
    tree(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, r = Math.min(c.W, c.H) / 2;
      const variant = c.p.variant || 'deciduous';
      const n = [];
      if (variant === 'pine') {
        // Radial needle sprays, not a side-view Christmas-tree star.
        n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.72, fill: c.fill, stroke: c.line, 'stroke-width': 1, opacity: 0.35 } });
        for (let i = 0; i < 18; i++) {
          const a = i * 20 + (i % 2) * 4;
          const len = r * (0.68 + (i % 4) * 0.08);
          n.push({ tag: 'path', attrs: {
            d: `M ${cx} ${cy} C ${cx - r * 0.07} ${cy - len * 0.3} ${cx - r * 0.06} ${cy - len * 0.72} ${cx} ${cy - len} C ${cx + r * 0.06} ${cy - len * 0.72} ${cx + r * 0.07} ${cy - len * 0.3} ${cx} ${cy} Z`,
            fill: c.fill, stroke: c.line, 'stroke-width': 0.75, opacity: i % 2 ? 0.68 : 0.9,
            transform: `rotate(${a} ${cx} ${cy})`, 'stroke-linejoin': 'round',
          } });
        }
        n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.12, fill: c.line, opacity: 0.55 } });
        return n;
      }
      if (variant === 'palm') {
        const fronds = Math.max(6, Math.round(num(c.p.fronds, 8)));
        for (let i = 0; i < fronds; i++) {
          const a = i * 360 / fronds + (i % 2) * 5;
          const len = r * (0.82 + (i % 3) * 0.08);
          n.push({ tag: 'path', attrs: {
            d: `M ${cx} ${cy} C ${cx - r * 0.12} ${cy - len * 0.24} ${cx - r * 0.14} ${cy - len * 0.68} ${cx} ${cy - len} C ${cx + r * 0.1} ${cy - len * 0.62} ${cx + r * 0.1} ${cy - len * 0.22} ${cx} ${cy} Z`,
            fill: c.fill, stroke: c.line, 'stroke-width': 0.9, opacity: 0.88,
            transform: `rotate(${a} ${cx} ${cy})`, 'stroke-linejoin': 'round',
          } });
          n.push({ tag: 'line', attrs: { x1: cx, y1: cy, x2: cx, y2: cy - len * 0.9, stroke: c.line, 'stroke-width': 0.65, opacity: 0.65, transform: `rotate(${a} ${cx} ${cy})` } });
        }
        n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.17, fill: c.line, opacity: 0.55 } });
        return n;
      }
      // Smooth, irregular crown. Quadratic joins avoid the gear/star outline
      // of the previous polygon while retaining enough variation to read as a
      // living canopy rather than a perfect green disc.
      const radii = variant === 'flowering'
        ? [0.86, 0.98, 0.9, 1, 0.88, 0.95, 0.84, 1, 0.9, 0.97, 0.87, 0.94]
        : [0.9, 1, 0.86, 0.96, 0.89, 1, 0.85, 0.98, 0.91, 0.96, 0.87, 1];
      const pts = radii.map((rr, i) => {
        const a = (i / radii.length) * Math.PI * 2 - Math.PI / 2;
        return [cx + Math.cos(a) * r * rr, cy + Math.sin(a) * r * rr];
      });
      let d = `M ${(pts[pts.length - 1][0] + pts[0][0]) / 2} ${(pts[pts.length - 1][1] + pts[0][1]) / 2}`;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        d += ` Q ${p[0]} ${p[1]} ${(p[0] + q[0]) / 2} ${(p[1] + q[1]) / 2}`;
      }
      d += ' Z';
      n.push({ tag: 'path', attrs: { d, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } });
      /* Sub-crowns are contour lines of foliage height, the plan-view
       * equivalent of shading. They keep a large tree from reading as one
       * featureless green sticker. */
      for (const [ox, oy, sx, sy] of [[-0.28, -0.18, 0.36, 0.3], [0.27, -0.12, 0.3, 0.28], [-0.05, 0.27, 0.4, 0.26]]) {
        const x = cx + r * ox, y = cy + r * oy, rx = r * sx, ry = r * sy;
        n.push({ tag: 'path', attrs: { d: `M ${x - rx} ${y} C ${x - rx * 0.84} ${y - ry * 0.86} ${x - rx * 0.15} ${y - ry * 1.12} ${x + rx * 0.24} ${y - ry * 0.9} C ${x + rx * 0.92} ${y - ry * 0.62} ${x + rx} ${y + ry * 0.28} ${x + rx * 0.55} ${y + ry * 0.72} C ${x + rx * 0.05} ${y + ry * 1.08} ${x - rx * 0.77} ${y + ry * 0.72} ${x - rx} ${y} Z`, fill: 'none', stroke: c.line, 'stroke-width': 0.75, opacity: 0.32 } });
      }
      for (let i = 0; i < 6; i++) {
        const a = (i * 60 + 20) * Math.PI / 180;
        const x = cx + Math.cos(a) * r * 0.42, y = cy + Math.sin(a) * r * 0.42;
        n.push({ tag: 'path', attrs: { d: `M ${cx} ${cy} Q ${(cx + x) / 2 + Math.sin(a) * r * 0.08} ${(cy + y) / 2 - Math.cos(a) * r * 0.08} ${x} ${y}`, fill: 'none', stroke: c.line, 'stroke-width': 0.8, opacity: 0.38, 'stroke-linecap': 'round' } });
      }
      if (variant === 'flowering') {
        for (let i = 0; i < 7; i++) {
          const a = (i * 137.5) * Math.PI / 180, rr = r * (0.25 + (i % 3) * 0.18);
          n.push({ tag: 'circle', attrs: { cx: cx + Math.cos(a) * rr, cy: cy + Math.sin(a) * rr, r: r * 0.075, fill: c.fill, stroke: c.line, 'stroke-width': 0.65 } });
        }
      }
      n.push({ tag: 'circle', attrs: { cx, cy, r: r * 0.16, fill: c.line, opacity: 0.45 } });
      return n;
    },

    rug(c) {
      return [
        { tag: 'rect', attrs: frame(c, { rx: 3, 'stroke-dasharray': '6 3', opacity: 0.75 }) },
        { tag: 'rect', attrs: { x: c.X + 4, y: c.Y + 4, width: c.W - 8, height: c.H - 8, rx: 2, fill: 'none', stroke: c.line, 'stroke-width': 0.8, opacity: 0.6 } },
      ];
    },

    /* Drum door, for a front-loader. */
    washer(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2;
      return [
        { tag: 'rect', attrs: frame(c, { rx: 2 }) },
        { tag: 'circle', attrs: { cx, cy, r: Math.min(c.W, c.H) * 0.31, fill: 'none', stroke: c.line, 'stroke-width': 1.3 } },
        { tag: 'circle', attrs: { cx, cy, r: Math.min(c.W, c.H) * 0.17, fill: c.line, opacity: 0.18 } },
      ];
    },

    /* Keys along the front edge. */
    piano(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 3 }) }];
      const keys = Math.max(3, Math.round(num(c.p.keys, 14)));
      for (let i = 1; i < keys; i++) {
        const x = c.X + (c.W * i) / keys;
        n.push({ tag: 'line', attrs: { x1: x, y1: c.Y + c.H * 0.62, x2: x, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 0.8 } });
      }
      return n;
    },

    /* Water body inset by the wall thickness — walls-with-water, not a block. */
    /* ---- water ----
     *
     * Most domestic overhead tanks are cylinders, not boxes, and drawing a
     * Sintex as a rectangle is the same class of error as drawing a vacuum
     * lift as one. `rect` stays the default so nothing already on a plan
     * moves; `cylindrical` is what most houses should pick.
     *
     * The `cls` key this used to carry did nothing at all — the serialiser
     * reads `attrs` only, so a top-level `cls` never reaches the DOM, and
     * nothing in the app or the card ever defined `fps-water` to begin with. */
    water(c) {
      const wall = c.P.S(num(c.p.wall, 0.33));
      const variant = c.p.variant || 'rect';
      if (variant === 'cylindrical') {
        const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, r = Math.min(c.W, c.H) / 2;
        return [
          { tag: 'circle', attrs: { cx, cy, r, fill: c.fill, stroke: c.line, 'stroke-width': 1.4 } },
          { tag: 'circle', attrs: { cx, cy, r: Math.max(1, r - wall), fill: '#1d4e78', opacity: 0.75, stroke: c.t.levelOk, 'stroke-width': 2 } },
          /* The inspection lid, which is what tells a cylindrical tank apart
           * from a round planter at a glance. Struck in the furniture fill
           * rather than the level colour: it has to read against the dark
           * water below it, and the level colour is close enough to disappear. */
          { tag: 'circle', attrs: { cx, cy, r: r * 0.3, fill: 'none', stroke: c.fill, 'stroke-width': 1.6, opacity: 0.9 } },
        ];
      }
      if (variant === 'sump') {
        /* Below ground: a dashed outline, because you are looking at it
         * through the slab. */
        return [
          { tag: 'rect', attrs: Object.assign(frame(c), { 'stroke-dasharray': '5 3' }) },
          { tag: 'rect', attrs: { x: c.X + wall, y: c.Y + wall, width: c.W - wall * 2, height: c.H - wall * 2, fill: '#1d4e78', opacity: 0.55, stroke: c.t.levelOk, 'stroke-width': 1.6, 'stroke-dasharray': '5 3' } },
        ];
      }
      return [
        { tag: 'rect', attrs: frame(c) },
        { tag: 'rect', attrs: { x: c.X + wall, y: c.Y + wall, width: c.W - wall * 2, height: c.H - wall * 2, fill: '#1d4e78', opacity: 0.75, stroke: c.t.levelOk, 'stroke-width': 2 } },
      ];
    },

    /* Panel grid with cell lines, drawn dark because a panel is near-black glass. */
    solar(c) {
      // cols/rows win over the legacy [cols, rows] grid array, which the old
      // specs used. Either says the same thing; the pair is editable.
      const cols = Math.max(1, num(c.p.cols, num(c.p.grid && c.p.grid[0], 1)));
      const rows = Math.max(1, num(c.p.rows, num(c.p.grid && c.p.grid[1], 1)));
      const gap = c.P.S(num(c.p.gap, 0.15));
      const pw = (c.W - gap * (cols - 1)) / cols, ph = (c.H - gap * (rows - 1)) / rows;
      const cells = Math.max(2, Math.round(num(c.p.cells, 3)));
      const n = [];
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        const x = c.X + i * (pw + gap), y = c.Y + j * (ph + gap);
        n.push({ tag: 'rect', attrs: { x, y, width: pw, height: ph, fill: c.p.color || '#16202f', stroke: '#3c4f6b', 'stroke-width': 1.1 } });
        // cell lines run along the panel's short axis, which is what a real
        // module looks like from above
        const vertical = ph >= pw;
        for (let k = 1; k < cells; k++) {
          n.push(vertical
            ? { tag: 'line', attrs: { x1: x + (pw * k) / cells, y1: y, x2: x + (pw * k) / cells, y2: y + ph, stroke: '#3c4f6b', 'stroke-width': 0.6, opacity: 0.8 } }
            : { tag: 'line', attrs: { x1: x, y1: y + (ph * k) / cells, x2: x + pw, y2: y + (ph * k) / cells, stroke: '#3c4f6b', 'stroke-width': 0.6, opacity: 0.8 } });
        }
      }
      return n;
    },

    hatch(c) {
      return [
        { tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H, fill: 'none', stroke: c.line, 'stroke-width': 1.6 } },
        { tag: 'line', attrs: { x1: c.X, y1: c.Y, x2: c.X + c.W, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 1.2 } },
      ];
    },

    glazing(c) {
      return [
        { tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H, fill: c.t.apertureGlass, opacity: 0.2, stroke: c.t.apertureGlass, 'stroke-width': 1.4 } },
        { tag: 'line', attrs: { x1: c.X, y1: c.Y, x2: c.X + c.W, y2: c.Y + c.H, stroke: c.t.apertureGlass, 'stroke-width': 0.8, opacity: 0.6 } },
      ];
    },

    /* Beams one way, joists the other. */
    pergola(c) {
      const n = [{ tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H, fill: 'none', stroke: c.line, 'stroke-width': 1.2, 'stroke-dasharray': '5 3' } }];
      const pitch = c.P.S(num(c.p.pitch, 1));
      for (let x = c.X + pitch; x < c.X + c.W; x += pitch) {
        n.push({ tag: 'line', attrs: { x1: x, y1: c.Y, x2: x, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 0.8, opacity: 0.65 } });
      }
      // A cross-battened pergola casts a lattice rather than stripes, which
      // matters if its shading is ever modelled.
      if (c.p.cross) {
        for (let y = c.Y + pitch; y < c.Y + c.H; y += pitch) {
          n.push({ tag: 'line', attrs: { x1: c.X, y1: y, x2: c.X + c.W, y2: y, stroke: c.line, 'stroke-width': 0.8, opacity: 0.5 } });
        }
      }
      return n;
    },

    pooja(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 2 }) }];
      const cx = c.X + c.W / 2;
      n.push({ tag: 'path', attrs: { d: `M ${cx} ${c.Y + c.H * 0.18} L ${c.X + c.W * 0.78} ${c.Y + c.H * 0.5} L ${c.X + c.W * 0.22} ${c.Y + c.H * 0.5} Z`, fill: c.line, opacity: 0.3 } });
      return n;
    },

    oven(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 2 }) }];
      for (const [fx, fy] of [[.3,.3],[.7,.3],[.3,.7],[.7,.7]]) n.push({ tag: 'circle', attrs: { cx: c.X + c.W * fx, cy: c.Y + c.H * fy, r: Math.min(c.W,c.H) * .14, fill: 'none', stroke: c.line, 'stroke-width': 1 } });
      return n;
    },

    microwave(c) {
      return [
        { tag: 'rect', attrs: frame(c, { rx: 2 }) },
        { tag: 'rect', attrs: { x: c.X + c.W * .08, y: c.Y + c.H * .12, width: c.W * .66, height: c.H * .76, rx: 2, fill: 'none', stroke: c.line, 'stroke-width': 1 } },
        { tag: 'circle', attrs: { cx: c.X + c.W * .86, cy: c.Y + c.H * .32, r: Math.min(c.W,c.H) * .06, fill: c.line } },
        { tag: 'line', attrs: { x1: c.X + c.W * .82, y1: c.Y + c.H * .58, x2: c.X + c.W * .9, y2: c.Y + c.H * .58, stroke: c.line, 'stroke-width': 1.4 } },
      ];
    },

    changing_table(c) {
      return [
        { tag: 'rect', attrs: frame(c, { rx: 2 }) },
        { tag: 'rect', attrs: { x: c.X + c.W * .1, y: c.Y + c.H * .1, width: c.W * .8, height: c.H * .8, rx: Math.min(c.W,c.H) * .24, fill: 'none', stroke: c.line, 'stroke-width': 1 } },
        { tag: 'line', attrs: { x1: c.X + c.W * .5, y1: c.Y + c.H * .15, x2: c.X + c.W * .5, y2: c.Y + c.H * .85, stroke: c.line, 'stroke-width': .8, opacity: .5 } },
      ];
    },

    dressing_table(c) {
      return [
        { tag: 'rect', attrs: frame(c, { rx: 2 }) },
        { tag: 'ellipse', attrs: { cx: c.X + c.W * .5, cy: c.Y + c.H * .25, rx: c.W * .25, ry: c.H * .18, fill: 'none', stroke: c.line, 'stroke-width': 1.1 } },
        { tag: 'rect', attrs: { x: c.X + c.W * .12, y: c.Y + c.H * .58, width: c.W * .25, height: c.H * .26, rx: 1, fill: 'none', stroke: c.line, 'stroke-width': .9 } },
        { tag: 'rect', attrs: { x: c.X + c.W * .63, y: c.Y + c.H * .58, width: c.W * .25, height: c.H * .26, rx: 1, fill: 'none', stroke: c.line, 'stroke-width': .9 } },
      ];
    },

    console_table(c) {
      return [
        { tag: 'rect', attrs: frame(c, { rx: 2 }) },
        { tag: 'line', attrs: { x1: c.X + c.W * .5, y1: c.Y, x2: c.X + c.W * .5, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 1 } },
        { tag: 'circle', attrs: { cx: c.X + c.W * .45, cy: c.Y + c.H * .5, r: Math.min(c.W,c.H) * .06, fill: c.line } },
        { tag: 'circle', attrs: { cx: c.X + c.W * .55, cy: c.Y + c.H * .5, r: Math.min(c.W,c.H) * .06, fill: c.line } },
      ];
    },

    bar_counter(c) {
      const n=[{tag:'rect',attrs:frame(c,{rx:2})}];
      /* Stools you SET, falling back to what the counter has room for. It was
       * derived only, so the declared property changed nothing. */
      const seats=Math.max(0,Math.round(num(c.p.seats,Math.max(2,Math.round(c.W/Math.max(12,c.H))))));
      for(let i=0;i<seats;i++)n.push({tag:'circle',attrs:{cx:c.X+c.W*(i+.5)/seats,cy:c.Y+c.H+c.P.S(.55),r:c.P.S(.42),fill:'none',stroke:c.line,'stroke-width':1}});
      n.push({tag:'line',attrs:{x1:c.X+c.W*.08,y1:c.Y+c.H*.25,x2:c.X+c.W*.92,y2:c.Y+c.H*.25,stroke:c.line,'stroke-width':.9,opacity:.55}});
      return n;
    },

    kitchen_trolley(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 2 }) }, { tag: 'rect', attrs: { x: c.X + c.W * .12, y: c.Y + c.H * .16, width: c.W * .76, height: c.H * .68, rx: 2, fill: 'none', stroke: c.line, 'stroke-width': .9 } }];
      for (const [fx,fy] of [[.08,.12],[.92,.12],[.08,.88],[.92,.88]]) n.push({ tag: 'circle', attrs: { cx: c.X+c.W*fx, cy:c.Y+c.H*fy, r:Math.min(c.W,c.H)*.07, fill:c.line, opacity:.6 } });
      return n;
    },

    workbench(c) {
      return [
        { tag: 'rect', attrs: frame(c, { rx: 1 }) },
        { tag: 'line', attrs: { x1: c.X + c.W * .1, y1: c.Y + c.H * .34, x2: c.X + c.W * .9, y2: c.Y + c.H * .34, stroke: c.line, 'stroke-width': 1 } },
        { tag: 'rect', attrs: { x: c.X + c.W * .14, y: c.Y + c.H * .52, width: c.W * .22, height: c.H * .3, rx: 1, fill: 'none', stroke: c.line, 'stroke-width': .9 } },
        { tag: 'circle', attrs: { cx: c.X + c.W * .75, cy: c.Y + c.H * .66, r: Math.min(c.W,c.H)*.13, fill:'none', stroke:c.line, 'stroke-width':1 } },
      ];
    },

    wine_rack(c) {
      const n=[{tag:'rect',attrs:frame(c,{rx:1})}];
      /* Rows of bottle ends. `shelves` is the number of rows; the columns
       * follow from how wide the rack is, so a 6 ft rack is not drawn with
       * the same four bottles as a 2 ft one. */
      const rows=Math.max(1,Math.min(8,Math.round(num(c.p.shelves,3))));
      const cols=Math.max(2,Math.min(14,Math.round((c.W/Math.max(1,c.H))*rows)));
      for(let i=0;i<rows;i++)for(let j=0;j<cols;j++)n.push({tag:'circle',attrs:{cx:c.X+c.W*(j+.5)/cols,cy:c.Y+c.H*(i+.5)/rows,r:Math.min(c.W/cols,c.H/rows)*.32,fill:'none',stroke:c.line,'stroke-width':.9}});
      return n;
    },

    filing_cabinet(c) {
      const n=[{tag:'rect',attrs:frame(c,{rx:1})}];
      /* Drawers, from the declared count rather than a hard-coded four — a
       * two-drawer and a five-drawer cabinet are different objects. */
      const d=Math.max(1,Math.min(8,Math.round(num(c.p.shelves,4))));
      for(let i=1;i<d;i++)n.push({tag:'line',attrs:{x1:c.X,y1:c.Y+c.H*i/d,x2:c.X+c.W,y2:c.Y+c.H*i/d,stroke:c.line,'stroke-width':1}});
      for(let i=0;i<d;i++)n.push({tag:'line',attrs:{x1:c.X+c.W*.42,y1:c.Y+c.H*(i+.5)/d,x2:c.X+c.W*.58,y2:c.Y+c.H*(i+.5)/d,stroke:c.line,'stroke-width':1.3}});
      return n;
    },

    generator_set(c) {
      return [
        { tag:'rect', attrs:frame(c,{rx:3}) },
        { tag:'circle', attrs:{cx:c.X+c.W*.34,cy:c.Y+c.H*.5,r:Math.min(c.W,c.H)*.24,fill:'none',stroke:c.line,'stroke-width':1.2} },
        { tag:'rect', attrs:{x:c.X+c.W*.64,y:c.Y+c.H*.22,width:c.W*.22,height:c.H*.56,rx:1,fill:'none',stroke:c.line,'stroke-width':1} },
        { tag:'line', attrs:{x1:c.X+c.W*.1,y1:c.Y+c.H*.88,x2:c.X+c.W*.9,y2:c.Y+c.H*.88,stroke:c.line,'stroke-width':1.6} },
      ];
    },

    ups_rack(c) {
      const n=[{tag:'rect',attrs:frame(c,{rx:2})}];
      /* One box per battery/UPS unit on the rack, from the declared count. */
      const u=Math.max(1,Math.min(8,Math.round(num(c.p.shelves,3))));
      const pitch=.88/u;
      for(let i=0;i<u;i++){const y=c.Y+c.H*(.06+i*pitch);const bh=c.H*pitch*.72;n.push({tag:'rect',attrs:{x:c.X+c.W*.12,y,width:c.W*.76,height:bh,rx:1,fill:'none',stroke:c.line,'stroke-width':.9}});n.push({tag:'circle',attrs:{cx:c.X+c.W*.78,cy:y+bh/2,r:Math.min(c.W,c.H)*.035,fill:c.line}})}
      return n;
    },

    boiler_unit(c) {
      return [
        { tag:'rect', attrs:frame(c,{rx:Math.min(c.W,c.H)*.18}) },
        { tag:'ellipse', attrs:{cx:c.X+c.W/2,cy:c.Y+c.H*.28,rx:c.W*.36,ry:c.H*.18,fill:'none',stroke:c.line,'stroke-width':1.1} },
        { tag:'circle', attrs:{cx:c.X+c.W/2,cy:c.Y+c.H*.67,r:Math.min(c.W,c.H)*.13,fill:'none',stroke:c.line,'stroke-width':1} },
      ];
    },

    softener_unit(c) {
      return [
        { tag:'ellipse', attrs:{cx:c.X+c.W*.3,cy:c.Y+c.H/2,rx:c.W*.28,ry:c.H*.48,fill:c.fill,stroke:c.line,'stroke-width':1.2} },
        { tag:'ellipse', attrs:{cx:c.X+c.W*.72,cy:c.Y+c.H/2,rx:c.W*.24,ry:c.H*.4,fill:c.fill,stroke:c.line,'stroke-width':1.2} },
        { tag:'line', attrs:{x1:c.X+c.W*.3,y1:c.Y+c.H*.12,x2:c.X+c.W*.72,y2:c.Y+c.H*.18,stroke:c.line,'stroke-width':1} },
      ];
    },

    sump(c) {
      const wall=Math.min(c.W,c.H)*.1;
      return [
        {tag:'rect',attrs:frame(c)},
        {tag:'rect',attrs:{x:c.X+wall,y:c.Y+wall,width:c.W-wall*2,height:c.H-wall*2,fill:c.t.coolTint,stroke:c.t.coolRim,'stroke-width':1}},
        {tag:'circle',attrs:{cx:c.X+c.W*.78,cy:c.Y+c.H*.28,r:Math.min(c.W,c.H)*.09,fill:'none',stroke:c.line,'stroke-width':1.2}},
      ];
    },

    septic(c) {
      return [
        {tag:'rect',attrs:frame(c,{rx:Math.min(c.W,c.H)*.28})},
        {tag:'line',attrs:{x1:c.X+c.W/2,y1:c.Y,x2:c.X+c.W/2,y2:c.Y+c.H,stroke:c.line,'stroke-width':1}},
        {tag:'circle',attrs:{cx:c.X+c.W*.25,cy:c.Y+c.H/2,r:Math.min(c.W,c.H)*.1,fill:'none',stroke:c.line,'stroke-width':1}},
        {tag:'circle',attrs:{cx:c.X+c.W*.75,cy:c.Y+c.H/2,r:Math.min(c.W,c.H)*.1,fill:'none',stroke:c.line,'stroke-width':1}},
      ];
    },

    appliance: (c) => [{ tag: 'rect', attrs: frame(c, { rx: 2 }) },
      { tag: 'circle', attrs: { cx: c.X + c.W * 0.5, cy: c.Y + c.H * 0.5, r: Math.min(c.W, c.H) * 0.2, fill: 'none', stroke: c.line, 'stroke-width': 1 } }],

    /* ---- tv_unit ----
     *
     * A media console seen from above is a low cabinet with the television
     * standing on the back of it, and the television is what makes the object
     * recognisable — a bare box with a line down the middle could equally be a
     * sideboard, a chest or a radiator. `shelves` is the number of bays across
     * the front, which is what the property has always meant and what nothing
     * used to draw.
     *
     * The back edge is the wall side. Rotation is applied by the caller, so
     * "back" here simply means the top of the unrotated footprint. */
    tv_unit(c) {
      const variant = c.p.variant || 'console';
      const bays = Math.max(0, Math.min(8, Math.round(num(c.p.shelves, 2))));
      const n = [];
      const bodyY = variant === 'floating' ? c.Y + c.H * 0.22 : c.Y;
      const bodyH = variant === 'floating' ? c.H * 0.78 : c.H;

      if (variant === 'floating') {
        /* Wall-hung: the gap under it is the whole point of the look. */
        n.push({ tag: 'line', attrs: { x1: c.X, y1: c.Y + 1, x2: c.X + c.W, y2: c.Y + 1, stroke: c.line, 'stroke-width': 1, opacity: 0.5, 'stroke-dasharray': '4 3' } });
      }
      n.push({
        tag: 'rect',
        attrs: {
          x: c.X, y: bodyY, width: c.W, height: bodyH, rx: 2,
          fill: variant === 'open_shelf' ? 'none' : c.fill, stroke: c.line, 'stroke-width': 1.2,
        },
      });
      for (let i = 1; i < bays; i++) {
        const x = c.X + (c.W * i) / bays;
        n.push({ tag: 'line', attrs: { x1: x, y1: bodyY, x2: x, y2: bodyY + bodyH, stroke: c.line, 'stroke-width': 1 } });
      }
      /* Door pulls, on the variants that have doors. Two short marks either
       * side of a division is how a cabinet elevation reads at this scale. */
      if (variant === 'cabinet' || variant === 'console' || variant === 'floating') {
        for (let i = 0; i < bays; i++) {
          const x = c.X + (c.W * (i + 0.5)) / bays;
          n.push({ tag: 'line', attrs: { x1: x - c.W * 0.03, y1: bodyY + bodyH - 2.5, x2: x + c.W * 0.03, y2: bodyY + bodyH - 2.5, stroke: c.line, 'stroke-width': 1.4, opacity: 0.7 } });
        }
      }
      if (variant === 'open_shelf') {
        n.push({ tag: 'line', attrs: { x1: c.X, y1: bodyY + bodyH * 0.5, x2: c.X + c.W, y2: bodyY + bodyH * 0.5, stroke: c.line, 'stroke-width': 0.9, opacity: 0.6 } });
      }
      /* The set itself, standing on the back edge and slightly wider than the
       * cabinet is deep — which is exactly how a television reads from above. */
      if (variant !== 'cabinet') {
        const panel = Math.max(2, Math.min(bodyH * 0.34, c.P.S(0.32)));
        const tvW = c.W * 0.72;
        n.push({ tag: 'rect', attrs: { x: c.X + (c.W - tvW) / 2, y: bodyY - panel * 0.5, width: tvW, height: panel, rx: panel * 0.3, fill: c.line, opacity: 0.62, stroke: c.line, 'stroke-width': 0.8 } });
        n.push({ tag: 'line', attrs: { x1: c.X + c.W / 2 - tvW * 0.09, y1: bodyY + panel * 0.9, x2: c.X + c.W / 2 + tvW * 0.09, y2: bodyY + panel * 0.9, stroke: c.line, 'stroke-width': 1.3, opacity: 0.7 } });
      }
      return n;
    },

    /* ---- screen ----
     *
     * The set on its own, with no cabinet under it. Four of them, because from
     * above they are genuinely different objects rather than the same slab with
     * different labels: a flat panel is a line, a curved panel is an arc, a CRT
     * is mostly tube and is the one thing here with real depth, and a
     * projection screen is a roller cassette with a sheet hanging off it.
     *
     * A CRT drawn at a flat panel's 5-inch depth is a lie; the Look picker
     * offers this shape's own footprint per variant so choosing one on an
     * untouched item gives it the depth it really has. */
    screen(c) {
      const variant = c.p.variant || 'flat';
      const cx = c.X + c.W / 2;
      const n = [];

      if (variant === 'crt') {
        /* Tube at the back, glass at the front. Front is the BOTTOM of the
         * unrotated footprint — the same way round as the panel on a TV unit,
         * which stands against the wall at the top and faces the room. The
         * cabinet tapers toward the neck, which is the silhouette that says
         * "this is two feet of television" rather than "this is a slab". */
        const faceH = Math.max(2, c.H * 0.22);
        const back = c.Y, front = c.Y + c.H - faceH;
        n.push({
          tag: 'path',
          attrs: {
            d: `M ${c.X + c.W * 0.14} ${back} L ${c.X + c.W * 0.86} ${back} L ${c.X + c.W} ${front} L ${c.X} ${front} Z`,
            fill: c.fill, stroke: c.line, 'stroke-width': 1.2, 'stroke-linejoin': 'round',
          },
        });
        n.push({ tag: 'rect', attrs: { x: c.X, y: front, width: c.W, height: faceH, rx: faceH * 0.35, fill: c.line, opacity: 0.45, stroke: c.line, 'stroke-width': 1 } });
        n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.36, y1: back + 2, x2: c.X + c.W * 0.64, y2: back + 2, stroke: c.line, 'stroke-width': 1, opacity: 0.6 } });
        return n;
      }

      if (variant === 'curved') {
        const bow = Math.max(2, c.H * 0.9);
        n.push({
          tag: 'path',
          attrs: {
            d: `M ${c.X} ${c.Y + c.H} Q ${cx} ${c.Y + c.H - bow * 2} ${c.X + c.W} ${c.Y + c.H}`,
            fill: 'none', stroke: c.line, 'stroke-width': Math.max(2.4, c.H * 0.7), 'stroke-linecap': 'round', opacity: 0.55,
          },
        });
        n.push({ tag: 'line', attrs: { x1: cx - c.W * 0.07, y1: c.Y + c.H - bow * 0.6, x2: cx + c.W * 0.07, y2: c.Y + c.H - bow * 0.6, stroke: c.line, 'stroke-width': 1.4 } });
        return n;
      }

      if (variant === 'projector') {
        /* Roller cassette across the back, sheet hanging in front of it. The
         * sheet is the wide thin line — that is all a dropped screen is on a
         * plan, and drawing it as a solid slab makes it read as a wall. */
        const cass = Math.max(2, Math.min(c.H, c.P.S(0.32)));
        n.push({ tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: cass, rx: cass * 0.45, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } });
        n.push({ tag: 'circle', attrs: { cx: c.X + cass * 0.5, cy: c.Y + cass * 0.5, r: Math.max(0.8, cass * 0.2), fill: c.line, opacity: 0.55 } });
        n.push({ tag: 'circle', attrs: { cx: c.X + c.W - cass * 0.5, cy: c.Y + cass * 0.5, r: Math.max(0.8, cass * 0.2), fill: c.line, opacity: 0.55 } });
        n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.02, y1: c.Y + cass + 1.6, x2: c.X + c.W * 0.98, y2: c.Y + cass + 1.6, stroke: c.line, 'stroke-width': 2, opacity: 0.5, 'stroke-linecap': 'round' } });
        return n;
      }

      /* flat — a panel and its pedestal. */
      n.push({ tag: 'rect', attrs: frame(c, { rx: 1.5 }) });
      n.push({ tag: 'rect', attrs: { x: c.X + 2, y: c.Y + 1.5, width: Math.max(1, c.W - 4), height: Math.max(1, c.H - 3), fill: c.line, opacity: 0.35 } });
      n.push({ tag: 'rect', attrs: { x: cx - c.W * 0.09, y: c.Y + c.H, width: c.W * 0.18, height: Math.max(1.4, c.H * 0.55), rx: 1, fill: c.line, opacity: 0.45 } });
      return n;
    },

    bench(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 2 }) }];
      const slats = Math.max(2, Math.round(num(c.p.slats, 4)));
      for (let i = 1; i < slats; i++) {
        const y = c.Y + (c.H * i) / slats;
        n.push({ tag: 'line', attrs: { x1: c.X, y1: y, x2: c.X + c.W, y2: y, stroke: c.line, 'stroke-width': 0.8 } });
      }
      return n;
    },

    mirror(c) {
      return [{ tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H, fill: c.t.apertureGlass, opacity: 0.28, stroke: c.line, 'stroke-width': 1.4 } }];
    },

    curtain(c) {
      const n = [];
      const waves = Math.max(3, Math.round(c.W / 8));
      let d = `M ${c.X} ${c.Y}`;
      for (let i = 0; i < waves; i++) {
        const x0 = c.X + (c.W * i) / waves, x1 = c.X + (c.W * (i + 1)) / waves;
        d += ` Q ${(x0 + x1) / 2} ${c.Y + c.H * (i % 2 ? -0.6 : 1.6)} ${x1} ${c.Y}`;
      }
      n.push({ tag: 'path', attrs: { d, fill: 'none', stroke: c.line, 'stroke-width': 1.6, opacity: 0.8 } });
      return n;
    },

    /* ---------------------------------------------------------- outdoors */

    /* Water reads as water: a tinted body with ripple lines across it, and a
     * ladder on the near edge so a pool is not just a blue rectangle. `shape`
     * makes it a kidney or a circle without a second function. */
    pool(c) {
      const variant = c.p.variant || c.p.shape || 'rectangular';
      const round = variant === 'round' || variant === 'oval';
      const kidney = variant === 'kidney';
      if (kidney) {
        const x = c.X, y = c.Y, w = c.W, h = c.H;
        return [
          { tag: 'path', attrs: { d: `M ${x + w * 0.12} ${y + h * 0.2} C ${x + w * 0.34} ${y - h * 0.08} ${x + w * 0.62} ${y + h * 0.14} ${x + w * 0.78} ${y + h * 0.06} C ${x + w * 1.02} ${y - h * 0.02} ${x + w * 1.07} ${y + h * 0.52} ${x + w * 0.84} ${y + h * 0.74} C ${x + w * 0.66} ${y + h * 0.93} ${x + w * 0.47} ${y + h * 0.7} ${x + w * 0.28} ${y + h * 0.92} C ${x + w * 0.04} ${y + h * 1.07} ${x - w * 0.08} ${y + h * 0.43} ${x + w * 0.12} ${y + h * 0.2} Z`, fill: c.t.coolTint, stroke: c.t.coolRim, 'stroke-width': 1.6 } },
          { tag: 'path', attrs: { d: `M ${x + w * 0.2} ${y + h * 0.46} Q ${x + w * 0.36} ${y + h * 0.38} ${x + w * 0.52} ${y + h * 0.46} T ${x + w * 0.82} ${y + h * 0.46}`, fill: 'none', stroke: c.t.coolRim, 'stroke-width': 1, opacity: 0.55 } },
        ];
      }
      const n = [{
        tag: round ? 'ellipse' : 'rect',
        attrs: round
          ? { cx: c.X + c.W / 2, cy: c.Y + c.H / 2, rx: c.W / 2, ry: c.H / 2, fill: c.t.coolTint, stroke: c.t.coolRim, 'stroke-width': 1.6 }
          : { x: c.X, y: c.Y, width: c.W, height: c.H, rx: num(c.p.radius, 6), fill: c.t.coolTint, stroke: c.t.coolRim, 'stroke-width': 1.6 },
      }];
      const rows = Math.max(2, Math.round(c.H / 26));
      for (let i = 1; i <= rows; i++) {
        const y = c.Y + (c.H * i) / (rows + 1);
        const inset = c.W * 0.12;
        n.push({
          tag: 'path',
          attrs: {
            d: `M ${c.X + inset} ${y} q ${c.W * 0.13} -3 ${c.W * 0.26} 0 q ${c.W * 0.13} 3 ${c.W * 0.26} 0`,
            fill: 'none', stroke: c.t.coolRim, 'stroke-width': 1.1, opacity: 0.5,
          },
        });
      }
      if (c.p.ladder !== false) {
        const lx = c.X + c.W * 0.78, ly = c.Y - 2, lw = Math.min(c.P.S(2), c.W * 0.16);
        n.push({ tag: 'line', attrs: { x1: lx, y1: ly, x2: lx, y2: ly + 8, stroke: c.line, 'stroke-width': 1.4 } });
        n.push({ tag: 'line', attrs: { x1: lx + lw, y1: ly, x2: lx + lw, y2: ly + 8, stroke: c.line, 'stroke-width': 1.4 } });
        n.push({ tag: 'line', attrs: { x1: lx, y1: ly + 4, x2: lx + lw, y2: ly + 4, stroke: c.line, 'stroke-width': 1.2 } });
      }
      return n;
    },

    /* Mown grass. Tufts on a seeded grid rather than randomly, so the lawn does
     * not shimmer on every repaint — the same rule the flooring generators use. */
    lawn(c) {
      const n = [{ tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H, rx: 3, fill: c.t.levelOk, opacity: 0.16, stroke: c.t.levelOk, 'stroke-width': 1.2 } }];
      const step = 11;
      for (let x = c.X + 5; x < c.X + c.W - 3; x += step) {
        for (let y = c.Y + 6; y < c.Y + c.H - 3; y += step) {
          const j = ((x * 7 + y * 13) % 5) - 2;
          n.push({ tag: 'path', attrs: { d: `M ${x + j} ${y} l -1.6 -3.4 M ${x + j} ${y} l 0 -4.2 M ${x + j} ${y} l 1.6 -3.4`, stroke: c.t.levelOk, 'stroke-width': 0.9, fill: 'none', opacity: 0.55 } });
        }
      }
      return n;
    },

    garden_bed(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 2, 'stroke-width': 2 }) }];
      const rows = Math.max(2, Math.min(6, Math.round(c.H / Math.max(8, c.W * 0.12))));
      for (let i = 0; i < rows; i++) {
        const y = c.Y + c.H * (i + 0.5) / rows;
        n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.08, y1: y, x2: c.X + c.W * 0.92, y2: y, stroke: c.line, 'stroke-width': 0.9, opacity: 0.65 } });
        for (let j = 1; j < 6; j++) n.push({ tag: 'circle', attrs: { cx: c.X + c.W * j / 6, cy: y, r: Math.max(1, Math.min(c.W, c.H) * 0.035), fill: c.line, opacity: 0.45 } });
      }
      return n;
    },

    hedge(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2;
      const horizontal = c.W >= c.H;
      const count = Math.max(3, Math.round((horizontal ? c.W : c.H) / Math.max(8, (horizontal ? c.H : c.W) * 0.55)));
      const n = [];
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        n.push({ tag: 'ellipse', attrs: horizontal
          ? { cx: c.X + c.W * t, cy: cy + (i % 2 ? c.H * 0.05 : -c.H * 0.05), rx: c.W / count * 0.68, ry: c.H * 0.48, fill: c.fill, stroke: c.line, 'stroke-width': 1 }
          : { cx: cx + (i % 2 ? c.W * 0.05 : -c.W * 0.05), cy: c.Y + c.H * t, rx: c.W * 0.48, ry: c.H / count * 0.68, fill: c.fill, stroke: c.line, 'stroke-width': 1 } });
      }
      return n;
    },

    pond(c) {
      return [
        { tag: 'ellipse', attrs: { cx: c.X + c.W / 2, cy: c.Y + c.H / 2, rx: c.W / 2, ry: c.H / 2, fill: c.t.coolTint, stroke: c.t.coolRim, 'stroke-width': 1.4 } },
        { tag: 'ellipse', attrs: { cx: c.X + c.W * 0.42, cy: c.Y + c.H * 0.45, rx: c.W * 0.16, ry: c.H * 0.13, fill: 'none', stroke: c.t.coolRim, 'stroke-width': 1, opacity: 0.6 } },
        { tag: 'ellipse', attrs: { cx: c.X + c.W * 0.62, cy: c.Y + c.H * 0.6, rx: c.W * 0.1, ry: c.H * 0.08, fill: 'none', stroke: c.t.coolRim, 'stroke-width': 1, opacity: 0.45 } },
      ];
    },

    fountain(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, r = Math.min(c.W, c.H) / 2;
      const n = [
        { tag: 'circle', attrs: { cx, cy, r, fill: c.t.coolTint, stroke: c.t.coolRim, 'stroke-width': 1.6 } },
        { tag: 'circle', attrs: { cx, cy, r: r * 0.72, fill: 'none', stroke: c.t.coolRim, 'stroke-width': 1 } },
        { tag: 'circle', attrs: { cx, cy, r: r * 0.2, fill: c.fill, stroke: c.line, 'stroke-width': 1.1 } },
      ];
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; n.push({ tag: 'path', attrs: { d: `M ${cx + Math.cos(a) * r * 0.23} ${cy + Math.sin(a) * r * 0.23} Q ${cx + Math.cos(a) * r * 0.52} ${cy + Math.sin(a) * r * 0.52} ${cx + Math.cos(a) * r * 0.68} ${cy + Math.sin(a) * r * 0.68}`, fill: 'none', stroke: c.t.coolRim, 'stroke-width': 1, opacity: 0.7 } }); }
      return n;
    },

    gazebo(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, rx = c.W / 2, ry = c.H / 2;
      const pts = [];
      for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + i * Math.PI / 4; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
      const polygon = pts.map((p) => p.join(',')).join(' ');
      const n = [{ tag: 'polygon', attrs: { points: polygon, fill: c.fill, 'fill-opacity': 0.35, stroke: c.line, 'stroke-width': 1.5 } }];
      for (let i = 0; i < 8; i++) {
        n.push({ tag: 'line', attrs: { x1: cx, y1: cy, x2: pts[i][0], y2: pts[i][1], stroke: c.line, 'stroke-width': 0.8, opacity: 0.55 } });
        n.push({ tag: 'circle', attrs: { cx: pts[i][0], cy: pts[i][1], r: Math.max(1.5, Math.min(c.W, c.H) * 0.025), fill: c.line } });
      }
      return n;
    },

    deck_chair(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 4 }) }];
      const split = c.Y + c.H * 0.36;
      n.push({ tag: 'line', attrs: { x1: c.X, y1: split, x2: c.X + c.W, y2: split, stroke: c.line, 'stroke-width': 1.2 } });
      for (let i = 1; i < 5; i++) n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.12, y1: c.Y + c.H * (0.36 + i * 0.11), x2: c.X + c.W * 0.88, y2: c.Y + c.H * (0.36 + i * 0.11), stroke: c.line, 'stroke-width': 0.8, opacity: 0.6 } });
      n.push({ tag: 'rect', attrs: { x: c.X + c.W * 0.1, y: c.Y + c.H * 0.06, width: c.W * 0.8, height: c.H * 0.22, rx: 3, fill: c.line, opacity: 0.28 } });
      return n;
    },

    hammock(c) {
      const cy = c.Y + c.H / 2;
      return [
        { tag: 'circle', attrs: { cx: c.X + c.W * 0.06, cy, r: Math.max(2, c.H * 0.22), fill: c.fill, stroke: c.line, 'stroke-width': 1.4 } },
        { tag: 'circle', attrs: { cx: c.X + c.W * 0.94, cy, r: Math.max(2, c.H * 0.22), fill: c.fill, stroke: c.line, 'stroke-width': 1.4 } },
        { tag: 'path', attrs: { d: `M ${c.X + c.W * 0.1} ${c.Y + c.H * 0.18} Q ${c.X + c.W / 2} ${c.Y + c.H * 0.82} ${c.X + c.W * 0.9} ${c.Y + c.H * 0.18} L ${c.X + c.W * 0.86} ${c.Y + c.H * 0.36} Q ${c.X + c.W / 2} ${c.Y + c.H * 0.98} ${c.X + c.W * 0.14} ${c.Y + c.H * 0.36} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } },
        { tag: 'line', attrs: { x1: c.X + c.W * 0.12, y1: c.Y + c.H * 0.28, x2: c.X + c.W * 0.88, y2: c.Y + c.H * 0.28, stroke: c.line, 'stroke-width': 0.8, 'stroke-dasharray': '3 2', opacity: 0.65 } },
      ];
    },

    swing_set(c) {
      const n = [];
      for (const x of [c.X + c.W * 0.08, c.X + c.W * 0.92]) {
        n.push({ tag: 'line', attrs: { x1: x, y1: c.Y, x2: x - c.W * 0.06, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 1.6 } });
        n.push({ tag: 'line', attrs: { x1: x, y1: c.Y, x2: x + c.W * 0.06, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 1.6 } });
      }
      n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.08, y1: c.Y + c.H * 0.08, x2: c.X + c.W * 0.92, y2: c.Y + c.H * 0.08, stroke: c.line, 'stroke-width': 2 } });
      for (const x of [c.X + c.W * 0.38, c.X + c.W * 0.62]) {
        n.push({ tag: 'line', attrs: { x1: x - c.W * 0.045, y1: c.Y + c.H * 0.1, x2: x - c.W * 0.045, y2: c.Y + c.H * 0.66, stroke: c.line, 'stroke-width': 1 } });
        n.push({ tag: 'line', attrs: { x1: x + c.W * 0.045, y1: c.Y + c.H * 0.1, x2: x + c.W * 0.045, y2: c.Y + c.H * 0.66, stroke: c.line, 'stroke-width': 1 } });
        n.push({ tag: 'rect', attrs: { x: x - c.W * 0.08, y: c.Y + c.H * 0.64, width: c.W * 0.16, height: c.H * 0.14, rx: 2, fill: c.fill, stroke: c.line, 'stroke-width': 1 } });
      }
      return n;
    },

    slide(c) {
      const n = [{ tag: 'path', attrs: { d: `M ${c.X + c.W * 0.18} ${c.Y} H ${c.X + c.W * 0.82} L ${c.X + c.W} ${c.Y + c.H} H ${c.X} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.4 } }];
      n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.5, y1: c.Y + c.H * 0.08, x2: c.X + c.W * 0.5, y2: c.Y + c.H * 0.9, stroke: c.line, 'stroke-width': 0.9, opacity: 0.5 } });
      for (let i = 1; i < 5; i++) n.push({ tag: 'line', attrs: { x1: c.X + c.W * 0.18, y1: c.Y + c.H * i * 0.1, x2: c.X + c.W * 0.5, y2: c.Y + c.H * i * 0.1, stroke: c.line, 'stroke-width': 0.9 } });
      return n;
    },

    /* A grill: hood, grate lines, and legs. */
    grill(c) {
      const variant = c.p.variant || 'cart';
      if (variant === 'kamado') {
        const cx = c.X + c.W / 2, cy = c.Y + c.H / 2, r = Math.min(c.W, c.H) / 2;
        const n = [{ tag: 'circle', attrs: { cx, cy, r, fill: c.fill, stroke: c.line, 'stroke-width': 1.5 } }, { tag: 'circle', attrs: { cx, cy, r: r * 0.68, fill: 'none', stroke: c.line, 'stroke-width': 1 } }];
        for (let i = -2; i <= 2; i++) n.push({ tag: 'line', attrs: { x1: cx + i * r * 0.22, y1: cy - r * 0.55, x2: cx + i * r * 0.22, y2: cy + r * 0.55, stroke: c.line, 'stroke-width': 0.8 } });
        return n;
      }
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 3 }) }];
      const bars = Math.max(3, Math.round(c.W / 7));
      for (let i = 1; i < bars; i++) {
        const x = c.X + (c.W * i) / bars;
        n.push({ tag: 'line', attrs: { x1: x, y1: c.Y + 2.5, x2: x, y2: c.Y + c.H - 2.5, stroke: c.line, 'stroke-width': 1 } });
      }
      n.push({ tag: 'line', attrs: { x1: c.X + 2, y1: c.Y + c.H, x2: c.X + 2, y2: c.Y + c.H + 4, stroke: c.line, 'stroke-width': 1.3 } });
      n.push({ tag: 'line', attrs: { x1: c.X + c.W - 2, y1: c.Y + c.H, x2: c.X + c.W - 2, y2: c.Y + c.H + 4, stroke: c.line, 'stroke-width': 1.3 } });
      return n;
    },

    /* ------------------------------------------------------------ indoor */

    /* A belt with a console at one end — a treadmill from above. */
    treadmill(c) {
      return [
        { tag: 'rect', attrs: frame(c, { rx: 2 }) },
        { tag: 'rect', attrs: { x: c.X + 1.5, y: c.Y + c.H * 0.28, width: c.W - 3, height: c.H * 0.62, rx: 2, fill: c.line, opacity: 0.22 } },
        { tag: 'rect', attrs: { x: c.X + 1.5, y: c.Y + 1.5, width: c.W - 3, height: c.H * 0.2, rx: 1.5, fill: 'none', stroke: c.line, 'stroke-width': 1.2 } },
      ];
    },

    /* Cloth, cushions, and the pockets that say which table it is. */
    pool_table(c) {
      const n = [
        { tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H, rx: 3, fill: c.t.levelOk, opacity: 0.2, stroke: c.line, 'stroke-width': 1.6 } },
        { tag: 'rect', attrs: { x: c.X + 3, y: c.Y + 3, width: c.W - 6, height: c.H - 6, rx: 2, fill: 'none', stroke: c.line, 'stroke-width': 0.9, opacity: 0.6 } },
      ];
      for (const [px, py] of [[0, 0], [0.5, 0], [1, 0], [0, 1], [0.5, 1], [1, 1]]) {
        n.push({ tag: 'circle', attrs: { cx: c.X + c.W * px, cy: c.Y + c.H * py, r: 2.1, fill: c.line, opacity: 0.55 } });
      }
      return n;
    },

    table_tennis(c) {
      const n = [{ tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H, rx: 2, fill: c.fill, stroke: c.line, 'stroke-width': 1.5 } }];
      const vertical = c.W >= c.H;
      if (vertical) n.push({ tag: 'line', attrs: { x1: c.X + c.W / 2, y1: c.Y - 2, x2: c.X + c.W / 2, y2: c.Y + c.H + 2, stroke: c.line, 'stroke-width': 1.6 } });
      else n.push({ tag: 'line', attrs: { x1: c.X - 2, y1: c.Y + c.H / 2, x2: c.X + c.W + 2, y2: c.Y + c.H / 2, stroke: c.line, 'stroke-width': 1.6 } });
      n.push({ tag: 'circle', attrs: { cx: c.X + c.W * 0.25, cy: c.Y + c.H * 0.3, r: Math.max(1.4, Math.min(c.W, c.H) * 0.035), fill: c.line } });
      n.push({ tag: 'circle', attrs: { cx: c.X + c.W * 0.75, cy: c.Y + c.H * 0.7, r: Math.max(1.4, Math.min(c.W, c.H) * 0.035), fill: c.line } });
      return n;
    },

    gym_bench(c) {
      const n = [
        { tag: 'rect', attrs: { x: c.X + c.W * 0.22, y: c.Y + c.H * 0.08, width: c.W * 0.56, height: c.H * 0.84, rx: 4, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } },
        { tag: 'line', attrs: { x1: c.X + c.W * 0.05, y1: c.Y + c.H * 0.15, x2: c.X + c.W * 0.05, y2: c.Y + c.H * 0.85, stroke: c.line, 'stroke-width': 1.6 } },
        { tag: 'line', attrs: { x1: c.X + c.W * 0.95, y1: c.Y + c.H * 0.15, x2: c.X + c.W * 0.95, y2: c.Y + c.H * 0.85, stroke: c.line, 'stroke-width': 1.6 } },
        { tag: 'line', attrs: { x1: c.X, y1: c.Y + c.H * 0.26, x2: c.X + c.W, y2: c.Y + c.H * 0.26, stroke: c.line, 'stroke-width': 2 } },
      ];
      for (const x of [c.X + c.W * 0.1, c.X + c.W * 0.9]) n.push({ tag: 'circle', attrs: { cx: x, cy: c.Y + c.H * 0.26, r: Math.min(c.W, c.H) * 0.13, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } });
      return n;
    },

    aquarium(c) {
      const n = [
        { tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H, rx: 2, fill: c.t.coolTint, stroke: c.t.coolRim, 'stroke-width': 1.6 } },
        { tag: 'rect', attrs: { x: c.X + c.W * 0.08, y: c.Y + c.H * 0.1, width: c.W * 0.84, height: c.H * 0.8, rx: 2, fill: 'none', stroke: c.t.coolRim, 'stroke-width': 0.8, opacity: 0.7 } },
      ];
      for (const [fx, fy] of [[0.25, 0.35], [0.58, 0.62], [0.78, 0.3]]) {
        const x = c.X + c.W * fx, y = c.Y + c.H * fy, s = Math.min(c.W, c.H) * 0.11;
        n.push({ tag: 'path', attrs: { d: `M ${x - s} ${y} Q ${x} ${y - s * 0.7} ${x + s} ${y} Q ${x} ${y + s * 0.7} ${x - s} ${y} M ${x - s} ${y} L ${x - s * 1.55} ${y - s * 0.65} L ${x - s * 1.55} ${y + s * 0.65} Z`, fill: 'none', stroke: c.line, 'stroke-width': 0.9 } });
      }
      return n;
    },

    /* Uprights and shelves — a server rack, a wine rack, a storage bay. */
    rack(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 1.5 }) }];
      const shelves = Math.max(2, Math.round(num(c.p.shelves, 4)));
      for (let i = 1; i < shelves; i++) {
        const y = c.Y + (c.H * i) / shelves;
        n.push({ tag: 'line', attrs: { x1: c.X + 1, y1: y, x2: c.X + c.W - 1, y2: y, stroke: c.line, 'stroke-width': 1 } });
      }
      return n;
    },

    /* A cot: frame plus the bars that make it one. */
    crib(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 3 }) }];
      const bars = Math.max(3, Math.round(c.W / 6));
      for (let i = 1; i < bars; i++) {
        const x = c.X + (c.W * i) / bars;
        n.push({ tag: 'line', attrs: { x1: x, y1: c.Y + 2, x2: x, y2: c.Y + c.H - 2, stroke: c.line, 'stroke-width': 0.9, opacity: 0.75 } });
      }
      return n;
    },

    /* A pitched-roof outline — a shed, a greenhouse, a dog house. */
    shed(c) {
      return [
        { tag: 'rect', attrs: frame(c, { rx: 1.5 }) },
        { tag: 'path', attrs: { d: `M ${c.X} ${c.Y + c.H * 0.34} L ${c.X + c.W / 2} ${c.Y} L ${c.X + c.W} ${c.Y + c.H * 0.34}`, fill: 'none', stroke: c.line, 'stroke-width': 1.3 } },
      ];
    },

    greenhouse(c) {
      const n = [{ tag: 'rect', attrs: { x: c.X, y: c.Y, width: c.W, height: c.H, rx: 1.5, fill: c.t.apertureGlass, 'fill-opacity': 0.2, stroke: c.line, 'stroke-width': 1.4 } }];
      n.push({ tag: 'line', attrs: { x1: c.X + c.W / 2, y1: c.Y, x2: c.X + c.W / 2, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 1.2 } });
      for (let i = 1; i < 4; i++) n.push({ tag: 'line', attrs: { x1: c.X, y1: c.Y + c.H * i / 4, x2: c.X + c.W, y2: c.Y + c.H * i / 4, stroke: c.line, 'stroke-width': 0.8, opacity: 0.55 } });
      for (let i = 0; i < 3; i++) n.push({ tag: 'circle', attrs: { cx: c.X + c.W * 0.25, cy: c.Y + c.H * (i + 0.5) / 3, r: Math.min(c.W, c.H) * 0.05, fill: c.line, opacity: 0.42 } });
      return n;
    },

    dog_house(c) {
      return [
        { tag: 'path', attrs: { d: `M ${c.X + c.W / 2} ${c.Y} L ${c.X + c.W} ${c.Y + c.H * 0.25} V ${c.Y + c.H} H ${c.X} V ${c.Y + c.H * 0.25} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.4, 'stroke-linejoin': 'round' } },
        { tag: 'line', attrs: { x1: c.X + c.W / 2, y1: c.Y, x2: c.X + c.W / 2, y2: c.Y + c.H * 0.72, stroke: c.line, 'stroke-width': 0.9 } },
        { tag: 'path', attrs: { d: `M ${c.X + c.W * 0.34} ${c.Y + c.H} V ${c.Y + c.H * 0.72} A ${c.W * 0.16} ${c.H * 0.16} 0 0 1 ${c.X + c.W * 0.66} ${c.Y + c.H * 0.72} V ${c.Y + c.H}`, fill: 'none', stroke: c.line, 'stroke-width': 1.2 } },
      ];
    },

    /* A bicycle from directly overhead. Wheels are narrow capsules because a
     * tyre seen from above is an edge, never the two side-view circles the old
     * drawing used. The diamond frame, crank, saddle and bars remain legible
     * down to palette size. */
    bike(c) {
      const cx = c.X + c.W / 2, variant = c.p.variant || 'city';
      const sw = Math.max(1, Math.min(c.W, c.H) * 0.035);
      const tyreW = Math.max(2, c.W * 0.12), tyreH = c.H * 0.2;
      const frontY = c.Y + c.H * 0.02, rearY = c.Y + c.H * 0.78;
      const frontAxle = frontY + tyreH * 0.64, rearAxle = rearY + tyreH * 0.38;
      const headY = c.Y + c.H * 0.31, seatY = c.Y + c.H * 0.53, crankY = c.Y + c.H * 0.61;
      const halfFrame = c.W * (variant === 'cargo' ? 0.22 : 0.17);
      const n = [
        { tag: 'rect', attrs: { x: cx - tyreW / 2, y: frontY, width: tyreW, height: tyreH, rx: tyreW / 2, fill: c.line, opacity: 0.82 } },
        { tag: 'rect', attrs: { x: cx - tyreW / 2, y: rearY, width: tyreW, height: tyreH, rx: tyreW / 2, fill: c.line, opacity: 0.82 } },
        { tag: 'line', attrs: { x1: cx, y1: frontAxle, x2: cx, y2: headY, stroke: c.line, 'stroke-width': sw * 1.15, 'stroke-linecap': 'round' } },
        { tag: 'path', attrs: { d: `M ${cx} ${headY} L ${cx - halfFrame} ${seatY} L ${cx} ${crankY} L ${cx + halfFrame} ${seatY} Z M ${cx - halfFrame} ${seatY} L ${cx} ${rearAxle} M ${cx} ${crankY} L ${cx} ${rearAxle}`, fill: 'none', stroke: c.line, 'stroke-width': sw, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' } },
        { tag: 'circle', attrs: { cx, cy: crankY, r: Math.max(1.5, c.W * 0.09), fill: c.fill, stroke: c.line, 'stroke-width': sw * 0.8 } },
        { tag: 'line', attrs: { x1: cx - c.W * 0.2, y1: crankY, x2: cx + c.W * 0.2, y2: crankY, stroke: c.line, 'stroke-width': sw * 0.8, 'stroke-linecap': 'round' } },
        { tag: 'rect', attrs: { x: cx - c.W * 0.17, y: seatY - c.H * 0.016, width: c.W * 0.34, height: Math.max(2, c.H * 0.055), rx: c.H * 0.025, fill: c.line, opacity: 0.9 } },
      ];
      if (variant === 'road') {
        n.push({ tag: 'path', attrs: { d: `M ${cx - c.W * 0.38} ${c.Y + c.H * 0.235} Q ${cx - c.W * 0.46} ${c.Y + c.H * 0.27} ${cx - c.W * 0.34} ${c.Y + c.H * 0.31} M ${cx + c.W * 0.38} ${c.Y + c.H * 0.235} Q ${cx + c.W * 0.46} ${c.Y + c.H * 0.27} ${cx + c.W * 0.34} ${c.Y + c.H * 0.31} M ${cx - c.W * 0.38} ${c.Y + c.H * 0.235} L ${cx + c.W * 0.38} ${c.Y + c.H * 0.235}`, fill: 'none', stroke: c.line, 'stroke-width': sw * 1.2, 'stroke-linecap': 'round' } });
      } else {
        n.push({ tag: 'path', attrs: { d: `M ${cx - c.W * 0.39} ${c.Y + c.H * 0.25} Q ${cx} ${c.Y + c.H * 0.22} ${cx + c.W * 0.39} ${c.Y + c.H * 0.25}`, fill: 'none', stroke: c.line, 'stroke-width': sw * 1.25, 'stroke-linecap': 'round' } });
      }
      if (variant === 'cargo') {
        n.push({ tag: 'rect', attrs: { x: cx - c.W * 0.34, y: c.Y + c.H * 0.65, width: c.W * 0.68, height: c.H * 0.16, rx: 2, fill: c.fill, stroke: c.line, 'stroke-width': sw } });
        n.push({ tag: 'line', attrs: { x1: cx - c.W * 0.29, y1: c.Y + c.H * 0.69, x2: cx + c.W * 0.29, y2: c.Y + c.H * 0.69, stroke: c.line, 'stroke-width': sw * 0.7, opacity: 0.55 } });
      } else if (variant === 'city') {
        n.push({ tag: 'path', attrs: { d: `M ${cx - c.W * 0.3} ${c.Y + c.H * 0.18} Q ${cx} ${c.Y + c.H * 0.12} ${cx + c.W * 0.3} ${c.Y + c.H * 0.18} L ${cx + c.W * 0.25} ${c.Y + c.H * 0.23} L ${cx - c.W * 0.25} ${c.Y + c.H * 0.23} Z`, fill: c.fill, stroke: c.line, 'stroke-width': sw * 0.8, opacity: 0.78 } });
      }
      return n;
    },

    /* Motor scooter / moped, overhead. The silhouette follows the attached
     * reference: narrow tyres, broad handlebars and front apron, pinched
     * footwell, then a long saddle over the engine and rear wheel. */
    scooter(c) {
      const cx = c.X + c.W / 2, v = c.p.variant || 'classic';
      const sw = Math.max(1, Math.min(c.W, c.H) * 0.035);
      const tyreW = Math.max(2.2, c.W * 0.13);
      const n = [
        { tag: 'rect', attrs: { x: cx - tyreW / 2, y: c.Y + c.H * 0.01, width: tyreW, height: c.H * 0.15, rx: tyreW / 2, fill: c.line } },
        { tag: 'rect', attrs: { x: cx - tyreW / 2, y: c.Y + c.H * 0.82, width: tyreW, height: c.H * 0.17, rx: tyreW / 2, fill: c.line } },
        { tag: 'path', attrs: { d: `M ${cx - c.W * 0.42} ${c.Y + c.H * 0.21} Q ${cx} ${c.Y + c.H * 0.17} ${cx + c.W * 0.42} ${c.Y + c.H * 0.21}`, fill: 'none', stroke: c.line, 'stroke-width': sw * 1.55, 'stroke-linecap': 'round' } },
        { tag: 'line', attrs: { x1: cx, y1: c.Y + c.H * 0.12, x2: cx, y2: c.Y + c.H * 0.27, stroke: c.line, 'stroke-width': sw * 1.2, 'stroke-linecap': 'round' } },
        { tag: 'path', attrs: { d: `M ${cx} ${c.Y + c.H * 0.24} C ${cx - c.W * 0.36} ${c.Y + c.H * 0.27} ${cx - c.W * 0.39} ${c.Y + c.H * 0.39} ${cx - c.W * 0.25} ${c.Y + c.H * 0.47} C ${cx - c.W * 0.15} ${c.Y + c.H * 0.52} ${cx - c.W * 0.19} ${c.Y + c.H * 0.62} ${cx - c.W * 0.31} ${c.Y + c.H * 0.69} C ${cx - c.W * 0.28} ${c.Y + c.H * 0.79} ${cx - c.W * 0.17} ${c.Y + c.H * 0.87} ${cx} ${c.Y + c.H * 0.9} C ${cx + c.W * 0.17} ${c.Y + c.H * 0.87} ${cx + c.W * 0.28} ${c.Y + c.H * 0.79} ${cx + c.W * 0.31} ${c.Y + c.H * 0.69} C ${cx + c.W * 0.19} ${c.Y + c.H * 0.62} ${cx + c.W * 0.15} ${c.Y + c.H * 0.52} ${cx + c.W * 0.25} ${c.Y + c.H * 0.47} C ${cx + c.W * 0.39} ${c.Y + c.H * 0.39} ${cx + c.W * 0.36} ${c.Y + c.H * 0.27} ${cx} ${c.Y + c.H * 0.24} Z`, fill: c.fill, stroke: c.line, 'stroke-width': sw, 'stroke-linejoin': 'round' } },
        { tag: 'path', attrs: { d: `M ${cx - c.W * 0.17} ${c.Y + c.H * 0.51} Q ${cx} ${c.Y + c.H * 0.46} ${cx + c.W * 0.17} ${c.Y + c.H * 0.51} L ${cx + c.W * 0.2} ${c.Y + c.H * 0.75} Q ${cx} ${c.Y + c.H * 0.81} ${cx - c.W * 0.2} ${c.Y + c.H * 0.75} Z`, fill: c.line, stroke: c.line, 'stroke-width': sw * 0.5, opacity: 0.72 } },
        { tag: 'line', attrs: { x1: cx - c.W * 0.36, y1: c.Y + c.H * 0.43, x2: cx - c.W * 0.49, y2: c.Y + c.H * 0.46, stroke: c.line, 'stroke-width': sw, 'stroke-linecap': 'round' } },
        { tag: 'line', attrs: { x1: cx + c.W * 0.36, y1: c.Y + c.H * 0.43, x2: cx + c.W * 0.49, y2: c.Y + c.H * 0.46, stroke: c.line, 'stroke-width': sw, 'stroke-linecap': 'round' } },
      ];
      if (v === 'maxi') {
        n.push({ tag: 'path', attrs: { d: `M ${cx - c.W * 0.31} ${c.Y + c.H * 0.56} Q ${cx} ${c.Y + c.H * 0.48} ${cx + c.W * 0.31} ${c.Y + c.H * 0.56} L ${cx + c.W * 0.27} ${c.Y + c.H * 0.79} Q ${cx} ${c.Y + c.H * 0.86} ${cx - c.W * 0.27} ${c.Y + c.H * 0.79} Z`, fill: c.line, opacity: 0.32 } });
      } else if (v === 'vintage') {
        n.push({ tag: 'ellipse', attrs: { cx, cy: c.Y + c.H * 0.34, rx: c.W * 0.27, ry: c.H * 0.095, fill: c.fill, stroke: c.line, 'stroke-width': sw * 0.8 } });
      }
      return n;
    },

    /* Motorcycle from above: wheels and forks on the centreline, a sculpted
     * tank and saddle, pegs/exhaust outside the body. Sport and cruiser remain
     * the same class of object without collapsing into one generic lozenge. */
    motorcycle(c) {
      const cx = c.X + c.W / 2, v = c.p.variant || 'standard';
      const sw = Math.max(1, Math.min(c.W, c.H) * 0.035);
      const tyreW = Math.max(2.4, c.W * (v === 'cruiser' ? 0.17 : 0.13));
      const n = [
        { tag: 'rect', attrs: { x: cx - tyreW / 2, y: c.Y, width: tyreW, height: c.H * 0.19, rx: tyreW / 2, fill: c.line } },
        { tag: 'rect', attrs: { x: cx - tyreW / 2, y: c.Y + c.H * 0.79, width: tyreW, height: c.H * 0.21, rx: tyreW / 2, fill: c.line } },
        { tag: 'line', attrs: { x1: cx - c.W * 0.11, y1: c.Y + c.H * 0.14, x2: cx - c.W * 0.08, y2: c.Y + c.H * 0.34, stroke: c.line, 'stroke-width': sw, 'stroke-linecap': 'round' } },
        { tag: 'line', attrs: { x1: cx + c.W * 0.11, y1: c.Y + c.H * 0.14, x2: cx + c.W * 0.08, y2: c.Y + c.H * 0.34, stroke: c.line, 'stroke-width': sw, 'stroke-linecap': 'round' } },
        { tag: 'path', attrs: { d: `M ${cx - c.W * (v === 'cruiser' ? 0.46 : 0.39)} ${c.Y + c.H * 0.22} Q ${cx} ${c.Y + c.H * 0.17} ${cx + c.W * (v === 'cruiser' ? 0.46 : 0.39)} ${c.Y + c.H * 0.22}`, fill: 'none', stroke: c.line, 'stroke-width': sw * 1.5, 'stroke-linecap': 'round' } },
        { tag: 'path', attrs: { d: `M ${cx} ${c.Y + c.H * 0.29} C ${cx - c.W * 0.3} ${c.Y + c.H * 0.32} ${cx - c.W * 0.34} ${c.Y + c.H * 0.47} ${cx - c.W * 0.19} ${c.Y + c.H * 0.56} Q ${cx} ${c.Y + c.H * 0.63} ${cx + c.W * 0.19} ${c.Y + c.H * 0.56} C ${cx + c.W * 0.34} ${c.Y + c.H * 0.47} ${cx + c.W * 0.3} ${c.Y + c.H * 0.32} ${cx} ${c.Y + c.H * 0.29} Z`, fill: c.fill, stroke: c.line, 'stroke-width': sw } },
        { tag: 'ellipse', attrs: { cx, cy: c.Y + c.H * 0.44, rx: c.W * 0.2, ry: c.H * 0.12, fill: c.fill, stroke: c.line, 'stroke-width': sw * 0.85 } },
        { tag: 'path', attrs: { d: `M ${cx - c.W * 0.2} ${c.Y + c.H * 0.55} Q ${cx} ${c.Y + c.H * 0.5} ${cx + c.W * 0.2} ${c.Y + c.H * 0.55} L ${cx + c.W * (v === 'sport' ? 0.13 : 0.18)} ${c.Y + c.H * 0.78} Q ${cx} ${c.Y + c.H * 0.82} ${cx - c.W * (v === 'sport' ? 0.13 : 0.18)} ${c.Y + c.H * 0.78} Z`, fill: c.line, opacity: 0.7 } },
        { tag: 'line', attrs: { x1: cx - c.W * 0.38, y1: c.Y + c.H * 0.61, x2: cx + c.W * 0.38, y2: c.Y + c.H * 0.61, stroke: c.line, 'stroke-width': sw, 'stroke-linecap': 'round' } },
        { tag: 'path', attrs: { d: `M ${cx + c.W * 0.22} ${c.Y + c.H * 0.56} Q ${cx + c.W * 0.42} ${c.Y + c.H * 0.68} ${cx + c.W * 0.31} ${c.Y + c.H * 0.84}`, fill: 'none', stroke: c.line, 'stroke-width': sw * 1.3, 'stroke-linecap': 'round' } },
      ];
      if (v === 'sport') n.push({ tag: 'path', attrs: { d: `M ${cx - c.W * 0.22} ${c.Y + c.H * 0.31} Q ${cx} ${c.Y + c.H * 0.22} ${cx + c.W * 0.22} ${c.Y + c.H * 0.31}`, fill: c.fill, stroke: c.line, 'stroke-width': sw * 0.8 } });
      if (v === 'cruiser') n.push({ tag: 'rect', attrs: { x: cx - c.W * 0.29, y: c.Y + c.H * 0.68, width: c.W * 0.58, height: c.H * 0.11, rx: c.H * 0.04, fill: c.fill, stroke: c.line, 'stroke-width': sw * 0.8 } });
      return n;
    },

    /* A flywheel, a frame bar, a handlebar post and a seat post — a
     * stationary bike has no rear wheel to draw, which is the whole
     * difference from `bike` above. */
    exercise_bike(c) {
      const wheelR = Math.min(c.H, c.W) * 0.42;
      const wcx = c.X + wheelR + 2, wcy = c.Y + c.H / 2;
      const postX = c.X + c.W - Math.max(3, c.W * 0.14);
      const topY = c.Y + c.H * 0.18, botY = c.Y + c.H * 0.86;
      return [
        { tag: 'circle', attrs: { cx: wcx, cy: wcy, r: wheelR, fill: 'none', stroke: c.line, 'stroke-width': 1.6 } },
        { tag: 'circle', attrs: { cx: wcx, cy: wcy, r: wheelR * 0.16, fill: c.line } },
        { tag: 'line', attrs: { x1: wcx, y1: wcy, x2: postX, y2: topY, stroke: c.line, 'stroke-width': 1.3 } },
        { tag: 'line', attrs: { x1: wcx, y1: wcy, x2: postX, y2: botY, stroke: c.line, 'stroke-width': 1.3 } },
        { tag: 'line', attrs: { x1: postX - 3, y1: topY, x2: postX + 4, y2: topY, stroke: c.line, 'stroke-width': 1.6, 'stroke-linecap': 'round' } },
        { tag: 'line', attrs: { x1: postX - 3, y1: botY, x2: postX + 4, y2: botY, stroke: c.line, 'stroke-width': 1.6, 'stroke-linecap': 'round' } },
      ];
    },

    /* A single drawer and a knob — the small cousin of `wardrobe`. */
    nightstand(c) {
      return [
        { tag: 'rect', attrs: frame(c, { rx: 2 }) },
        { tag: 'line', attrs: { x1: c.X, y1: c.Y + c.H * 0.52, x2: c.X + c.W, y2: c.Y + c.H * 0.52, stroke: c.line, 'stroke-width': 1 } },
        { tag: 'circle', attrs: { cx: c.X + c.W / 2, cy: c.Y + c.H * 0.76, r: Math.min(c.W, c.H) * 0.09, fill: c.line, opacity: 0.6 } },
      ];
    },

    /* A glass-topped low table — an inset edge, not a second box like
     * `desk`'s keyboard tray, so it doesn't read as a work surface. */
    coffee_table(c) {
      return [
        { tag: 'rect', attrs: frame(c, { rx: Math.min(c.W, c.H) * 0.22 }) },
        { tag: 'rect', attrs: { x: c.X + c.W * 0.12, y: c.Y + c.H * 0.12, width: c.W * 0.76, height: c.H * 0.76, rx: 3, fill: 'none', stroke: c.line, 'stroke-width': 0.8, opacity: 0.55 } },
      ];
    },

    /* A timber-edged frame with a scatter of sand, not a lawn's solid fill
     * or a rug's dashed border — both already mean something else. */
    sandpit(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: 2, 'stroke-width': 2.2 }) }];
      for (const [fx, fy] of [[0.28, 0.32], [0.6, 0.5], [0.4, 0.68], [0.72, 0.28], [0.5, 0.5]]) {
        n.push({ tag: 'circle', attrs: { cx: c.X + c.W * fx, cy: c.Y + c.H * fy, r: Math.min(c.W, c.H) * 0.045, fill: c.line, opacity: 0.4 } });
      }
      return n;
    },

    /* A tapered bin — narrower at the base, the one shape trait that says
     * "bin" rather than "box" at this size. */
    compost(c) {
      const taperTop = c.W * 0.06, taperBot = c.W * 0.16;
      const d = `M ${c.X + taperTop} ${c.Y} L ${c.X + c.W - taperTop} ${c.Y} `
        + `L ${c.X + c.W - taperBot} ${c.Y + c.H} L ${c.X + taperBot} ${c.Y + c.H} Z`;
      return [
        { tag: 'path', attrs: { d, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 } },
        { tag: 'line', attrs: { x1: c.X + c.W * 0.18, y1: c.Y + c.H * 0.3, x2: c.X + c.W * 0.82, y2: c.Y + c.H * 0.3, stroke: c.line, 'stroke-width': 0.8, opacity: 0.5 } },
      ];
    },

    /* A line between two posts with a few pegs along it, not a bare bar —
     * this is a fixture whose whole footprint IS the line. */
    clothesline(c) {
      const y = c.Y + c.H / 2;
      const n = [
        { tag: 'line', attrs: { x1: c.X, y1: y, x2: c.X + c.W, y2: y, stroke: c.line, 'stroke-width': 1.2 } },
        { tag: 'circle', attrs: { cx: c.X, cy: y, r: 2, fill: c.line } },
        { tag: 'circle', attrs: { cx: c.X + c.W, cy: y, r: 2, fill: c.line } },
      ];
      for (const fx of [0.25, 0.5, 0.75]) {
        n.push({ tag: 'line', attrs: { x1: c.X + c.W * fx, y1: y, x2: c.X + c.W * fx, y2: y + 3, stroke: c.line, 'stroke-width': 1, opacity: 0.6 } });
      }
      return n;
    },

    /* A gate's own leaf: a hinge post, the leaf bar, and its diagonal brace —
     * distinct from `clothesline`'s pegs at the same thin footprint. */
    gate_leaf(c) {
      const y = c.Y + c.H / 2;
      return [
        { tag: 'line', attrs: { x1: c.X, y1: y, x2: c.X + c.W, y2: y, stroke: c.line, 'stroke-width': 1.6 } },
        { tag: 'line', attrs: { x1: c.X + c.W * 0.1, y1: c.Y, x2: c.X + c.W * 0.9, y2: c.Y + c.H, stroke: c.line, 'stroke-width': 0.8, opacity: 0.55 } },
        { tag: 'circle', attrs: { cx: c.X, cy: y, r: 2.2, fill: c.line } },
      ];
    },

    /* Two crossed lines of stitching, the one detail that separates a padded
     * footstool from a plain low box. */
    ottoman(c) {
      return [
        { tag: 'rect', attrs: frame(c, { rx: Math.min(c.W, c.H) * 0.3 }) },
        { tag: 'line', attrs: { x1: c.X + c.W * 0.25, y1: c.Y + c.H * 0.25, x2: c.X + c.W * 0.75, y2: c.Y + c.H * 0.75, stroke: c.line, 'stroke-width': 0.7, opacity: 0.4 } },
        { tag: 'line', attrs: { x1: c.X + c.W * 0.75, y1: c.Y + c.H * 0.25, x2: c.X + c.W * 0.25, y2: c.Y + c.H * 0.75, stroke: c.line, 'stroke-width': 0.7, opacity: 0.4 } },
      ];
    },

    /* A recessed dial and a handle bar — small and locked, not just small. */
    safe(c) {
      const cx = c.X + c.W / 2, cy = c.Y + c.H / 2;
      return [
        { tag: 'rect', attrs: frame(c, { rx: 2 }) },
        { tag: 'circle', attrs: { cx, cy, r: Math.min(c.W, c.H) * 0.24, fill: 'none', stroke: c.line, 'stroke-width': 1.1 } },
        { tag: 'circle', attrs: { cx, cy, r: Math.min(c.W, c.H) * 0.06, fill: c.line } },
        { tag: 'line', attrs: { x1: c.X + c.W * 0.8, y1: c.Y + c.H * 0.28, x2: c.X + c.W * 0.8, y2: c.Y + c.H * 0.72, stroke: c.line, 'stroke-width': 1.8, 'stroke-linecap': 'round' } },
      ];
    },

    /* Woven uprights, the same idea as `rack`'s shelves turned diagonal so
     * it doesn't read as storage furniture rather than a basket. */
    laundry_basket(c) {
      const n = [{ tag: 'rect', attrs: frame(c, { rx: Math.min(c.W, c.H) * 0.35 }) }];
      for (let i = 1; i < 4; i++) {
        const x = c.X + (c.W * i) / 4;
        n.push({ tag: 'line', attrs: { x1: x, y1: c.Y + 1, x2: x, y2: c.Y + c.H - 1, stroke: c.line, 'stroke-width': 0.8, opacity: 0.4 } });
      }
      return n;
    },
  };

  /* ---------------------------------------------------------------- markers */

  /* MARKERS — device marker VARIANTS: the whole body of a marker, not the glyph
   * inside it.
   *
   * A disc with a fan icon in it is a label for a fan. A hub with three blades
   * that turn is a fan. The difference matters on a floor plan, where the point
   * is recognising the room from across it without reading anything — the same
   * argument FURNITURE already makes for a bed having pillows.
   *
   * Organised by FAMILY, because that is the grain at which real objects
   * actually differ. Every device type names a family; a bullet camera and a
   * dome camera are two ways of drawing `camera`, while eleven flavours of
   * binary sensor are one way of drawing `sense`. A type that names no family
   * still gets the old disc-and-icon, which is why this is additive.
   *
   * Each variant receives, and returns flat scene nodes in absolute px:
   *
   *   cx, cy   centre
   *   R        drawn radius — this is what the resize handles change
   *   fill     body fill        line   body stroke
   *   glyph    detail colour    accent the live colour (a running fan's blades)
   *   facing   screen degrees, 0 = up, positive clockwise
   *   on       is it active     pct    0..100 where the domain reports one
   *   spin     animate — state is on AND motion is enabled
   *   p        the item's own props
   *
   * A variant must look right at any R: draw everything in terms of R, never in
   * fixed px, or resizing produces a big circle with a tiny glyph marooned in
   * it. `u = R / 10` is the unit every variant below scales by.
   */

  const MARKERS = {};

  /* Primitives. Terse on purpose — a variant should read as the object it
   * draws, not as a wall of attribute literals. */
  const mk = (tag, attrs) => ({ tag, attrs });
  const body = (c, extra) => mk('circle', Object.assign({ cx: c.cx, cy: c.cy, r: c.R, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }, extra || {}));
  const boxBody = (c, w, h, rx) => mk('rect', {
    x: c.cx - w / 2, y: c.cy - h / 2, width: w, height: h, rx: rx === undefined ? 2 : rx,
    fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2,
  });
  /* Detail stroke: everything drawn INSIDE a body, in the glyph colour. */
  const d = (c, path, w) => mk('path', { d: path, fill: 'none', stroke: c.glyph, 'stroke-width': w || 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const ln = (c, x1, y1, x2, y2, w) => mk('line', { x1, y1, x2, y2, stroke: c.glyph, 'stroke-width': w || 1.3, 'stroke-linecap': 'round' });
  const dot = (c, x, y, r, col) => mk('circle', { cx: x, cy: y, r, fill: col || c.glyph });
  /* A lit bulb, for the lamp families below: opacity carries the dimmer level
   * (`c.bright`, 0.15..1) the same way the room's own glow pool already does,
   * so a fixture dimmed to 20% doesn't draw as fully lit as one at 100% —
   * only the families that pass `bright` (see plan-scene.js) use this; every
   * other caller of `dot` is untouched. A switch that cannot report a level
   * gets `bright` defaulted to 1, matching `lampOutput`'s own "cannot report
   * -> full" rule, so a dumb on/off lamp still reads as fully lit. */
  const bulbDot = (c, x, y, r) => mk('circle', {
    cx: x, cy: y, r, fill: c.on ? c.accent : c.glyph,
    opacity: c.on ? 0.4 + 0.6 * num(c.bright, 1) : 1,
  });
  const rect = (c, x, y, w, h, extra) => mk('rect', Object.assign({ x, y, width: w, height: h, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2 }, extra || {}));
  /* Turn a node list about the marker centre, for variants with a front. */
  const face = (c, nodes) => (c.facing % 360 === 0 ? nodes : nodes.map((n) => ({
    tag: n.tag,
    text: n.text,
    children: n.children,
    attrs: Object.assign({}, n.attrs, { transform: `rotate(${c.facing} ${c.cx} ${c.cy})` }),
  })));

  /* ---- fan ----
   * The blades are a group so one CSS animation turns all of them; `facing` is
   * baked into each blade's own angle rather than wrapping the group in a
   * second rotate, because a presentation transform would lose to the spin. */
  function bladeGroup(c, count, shape) {
    const g = { tag: 'g', attrs: { class: c.spin ? 'fps-spin' : null, style: c.spin ? `--fps-o:${c.cx}px ${c.cy}px;--fps-d:${c.period || '1.4s'}` : null, 'pointer-events': 'none' }, children: [] };
    for (let i = 0; i < count; i++) {
      const a = c.facing + (i * 360) / count;
      let d;
      if (shape === 'tapered') {
        d = `M ${c.cx - c.R * 0.065} ${c.cy - c.R * 0.13} C ${c.cx - c.R * 0.09} ${c.cy - c.R * 0.42} ${c.cx - c.R * 0.12} ${c.cy - c.R * 0.83} ${c.cx - c.R * 0.07} ${c.cy - c.R * 0.96} C ${c.cx} ${c.cy - c.R * 1.01} ${c.cx + c.R * 0.09} ${c.cy - c.R * 0.96} ${c.cx + c.R * 0.1} ${c.cy - c.R * 0.83} L ${c.cx + c.R * 0.065} ${c.cy - c.R * 0.13} Z`;
      } else if (shape === 'paddle') {
        /* A broad, nearly straight blade with a softly rounded outer end. */
        d = `M ${c.cx - c.R * 0.085} ${c.cy - c.R * 0.13} L ${c.cx - c.R * 0.18} ${c.cy - c.R * 0.82} Q ${c.cx - c.R * 0.17} ${c.cy - c.R * 1.01} ${c.cx} ${c.cy - c.R * 1.02} Q ${c.cx + c.R * 0.17} ${c.cy - c.R * 1.01} ${c.cx + c.R * 0.18} ${c.cy - c.R * 0.82} L ${c.cx + c.R * 0.085} ${c.cy - c.R * 0.13} Z`;
      } else if (shape === 'scimitar') {
        /* A swept wing: both edges bend to the same side instead of making a
         * symmetric petal, so its direction remains legible while stopped. */
        d = `M ${c.cx - c.R * 0.07} ${c.cy - c.R * 0.13} C ${c.cx - c.R * 0.18} ${c.cy - c.R * 0.4} ${c.cx - c.R * 0.43} ${c.cy - c.R * 0.64} ${c.cx - c.R * 0.5} ${c.cy - c.R * 0.82} C ${c.cx - c.R * 0.55} ${c.cy - c.R * 0.96} ${c.cx - c.R * 0.4} ${c.cy - c.R * 1.04} ${c.cx - c.R * 0.24} ${c.cy - c.R * 0.95} C ${c.cx - c.R * 0.05} ${c.cy - c.R * 0.84} ${c.cx + c.R * 0.07} ${c.cy - c.R * 0.48} ${c.cx + c.R * 0.09} ${c.cy - c.R * 0.13} Z`;
      } else if (shape === 'tropical') {
        /* Leaf fans are intentionally widest through the middle rather than
         * at the tip; this is a plan-view leaf, not a generic fat airfoil. */
        d = `M ${c.cx - c.R * 0.07} ${c.cy - c.R * 0.13} C ${c.cx - c.R * 0.35} ${c.cy - c.R * 0.36} ${c.cx - c.R * 0.43} ${c.cy - c.R * 0.7} ${c.cx - c.R * 0.15} ${c.cy - c.R * 0.96} Q ${c.cx} ${c.cy - c.R * 1.08} ${c.cx + c.R * 0.16} ${c.cy - c.R * 0.95} C ${c.cx + c.R * 0.43} ${c.cy - c.R * 0.69} ${c.cx + c.R * 0.34} ${c.cy - c.R * 0.35} ${c.cx + c.R * 0.07} ${c.cy - c.R * 0.13} Z`;
      } else if (shape === 'industrial') {
        /* Narrow stamped-metal wings, with a slight rake and clipped end. */
        d = `M ${c.cx - c.R * 0.055} ${c.cy - c.R * 0.13} L ${c.cx - c.R * 0.13} ${c.cy - c.R * 0.91} L ${c.cx - c.R * 0.04} ${c.cy - c.R} L ${c.cx + c.R * 0.1} ${c.cy - c.R * 0.94} L ${c.cx + c.R * 0.055} ${c.cy - c.R * 0.13} Z`;
      }
      if (d) {
        g.children.push(mk('path', {
          d,
          fill: c.on ? c.accent : c.glyph, opacity: c.spin ? 0.6 : 0.85,
          transform: `rotate(${a} ${c.cx} ${c.cy})`,
        }));
      } else {
        /* Swept airfoil blade: narrow at the hub, broad through its outer
         * third, rounded at the end. Unlike an ellipse it does not overlap the
         * neighbouring blades into a three-petal cartoon. */
        g.children.push(mk('path', {
          d: `M ${c.cx - c.R * 0.08} ${c.cy - c.R * 0.13} C ${c.cx - c.R * 0.1} ${c.cy - c.R * 0.34} ${c.cx - c.R * 0.31} ${c.cy - c.R * 0.68} ${c.cx - c.R * 0.24} ${c.cy - c.R * 0.88} C ${c.cx - c.R * 0.18} ${c.cy - c.R * 1.01} ${c.cx + c.R * 0.07} ${c.cy - c.R * 1.01} ${c.cx + c.R * 0.13} ${c.cy - c.R * 0.9} C ${c.cx + c.R * 0.18} ${c.cy - c.R * 0.7} ${c.cx + c.R * 0.08} ${c.cy - c.R * 0.36} ${c.cx + c.R * 0.08} ${c.cy - c.R * 0.13} Z`,
          fill: c.on ? c.accent : c.glyph, opacity: c.spin ? 0.6 : 0.85,
          transform: `rotate(${a} ${c.cx} ${c.cy})`,
        }));
      }
    }
    return g;
  }
  MARKERS.fan = {
    /* The three-blade hub the hand-written AK plan draws, kept as the default
     * so an existing plan looks the same after this landed. */
    /* A ceiling fan has no full-size circular shell. `body(c)` used to draw
     * one behind the blades; the exposed pieces of its rim were the mysterious
     * extra arcs in the user's screenshot. Only the hub belongs here. */
    blades3: (c) => [bladeGroup(c, 3), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.23, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }), dot(c, c.cx, c.cy, c.R * 0.1, c.line)],
    blades4: (c) => [bladeGroup(c, 4), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.23, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }), dot(c, c.cx, c.cy, c.R * 0.1, c.line)],
    blades5: (c) => [bladeGroup(c, 5), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.23, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }), dot(c, c.cx, c.cy, c.R * 0.1, c.line)],
    /* A DC fan's blades are wide and few, and that is most of how you tell one
     * from a builder's-special three-blade at a glance. */
    slim: (c) => [bladeGroup(c, 2, 'tapered'), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.19, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }), dot(c, c.cx, c.cy, c.R * 0.08, c.line)],
    paddle3: (c) => [bladeGroup(c, 3, 'paddle'), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.22, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }), dot(c, c.cx, c.cy, c.R * 0.09, c.line)],
    scimitar3: (c) => [bladeGroup(c, 3, 'scimitar'), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.2, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }), dot(c, c.cx, c.cy, c.R * 0.08, c.line)],
    tropical3: (c) => [bladeGroup(c, 3, 'tropical'), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.24, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }), dot(c, c.cx, c.cy, c.R * 0.1, c.line)],
    industrial4: (c) => [bladeGroup(c, 4, 'industrial'), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.17, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }), dot(c, c.cx, c.cy, c.R * 0.07, c.line)],
    /* The count field predates the Look grid. Keeping one variable-count look
     * makes that field truthful while the named looks keep recognisable,
     * stable silhouettes. Hand-edited values are clamped where they draw. */
    custom: (c) => [bladeGroup(c, Math.max(2, Math.min(8, Math.round(num(c.p && c.p.blades, 3)))), 'industrial'), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.23, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }), dot(c, c.cx, c.cy, c.R * 0.1, c.line)],
    /* Extractor: blades behind a grille, which is the whole visual difference
     * between a fan you stand under and one in a wall. */
    caged: (c) => {
      const u = c.R / 10;
      const inner = Object.assign({}, c, { R: c.R * 0.7 });
      const n = [body(c), bladeGroup(inner, 5)];
      for (let i = -1; i <= 1; i++) n.push(ln(c, c.cx - c.R * 0.82, c.cy + i * 3.4 * u, c.cx + c.R * 0.82, c.cy + i * 3.4 * u, 1));
      n.push(mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.86, fill: 'none', stroke: c.line, 'stroke-width': 1.1 }));
      return n;
    },
  };

  /* ---- camera ---- the body shape IS the type you bought */
  MARKERS.camera = {
    bullet: (c) => {
      const u = c.R / 10;
      return face(c, [
        rect(c, c.cx - 3.4 * u, c.cy - 2.6 * u, 6.8 * u, 5.2 * u, { rx: 1.4 * u, fill: c.fill, stroke: c.line, 'stroke-width': 1.4 }),
        mk('path', { d: `M ${c.cx + 3.4 * u} ${c.cy - 1.7 * u} L ${c.cx + 6.4 * u} ${c.cy - 3.1 * u} L ${c.cx + 6.4 * u} ${c.cy + 3.1 * u} L ${c.cx + 3.4 * u} ${c.cy + 1.7 * u} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.3 }),
        ln(c, c.cx - 1.4 * u, c.cy + 2.6 * u, c.cx - 1.4 * u, c.cy + 5 * u, 1.4),
      ]);
    },
    dome: (c) => {
      const u = c.R / 10;
      return face(c, [
        mk('path', { d: `M ${c.cx - c.R} ${c.cy + 2.2 * u} A ${c.R} ${c.R} 0 0 1 ${c.cx + c.R} ${c.cy + 2.2 * u} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.4 }),
        ln(c, c.cx - c.R, c.cy + 2.2 * u, c.cx + c.R, c.cy + 2.2 * u, 1.4),
        dot(c, c.cx, c.cy - 1 * u, 1.9 * u),
      ]);
    },
    turret: (c) => {
      const u = c.R / 10;
      return face(c, [body(c), mk('circle', { cx: c.cx, cy: c.cy - 0.6 * u, r: c.R * 0.52, fill: 'none', stroke: c.glyph, 'stroke-width': 1.4 }), dot(c, c.cx, c.cy - 0.6 * u, 1.5 * u)]);
    },
    ptz: (c) => {
      const u = c.R / 10;
      return face(c, [
        body(c),
        d(c, `M ${c.cx - 5.6 * u} ${c.cy + 1.4 * u} A ${5.8 * u} ${5.8 * u} 0 0 1 ${c.cx + 5.6 * u} ${c.cy + 1.4 * u}`, 1.2),
        dot(c, c.cx, c.cy - 0.4 * u, 1.8 * u),
        ln(c, c.cx - 3 * u, c.cy + 4.2 * u, c.cx + 3 * u, c.cy + 4.2 * u, 1.4),
      ]);
    },
    cube: (c) => {
      const u = c.R / 10;
      return face(c, [boxBody(c, c.R * 1.7, c.R * 1.7, 1.5 * u), dot(c, c.cx, c.cy, 1.9 * u), ln(c, c.cx, c.cy + 4.6 * u, c.cx, c.cy + 6.4 * u, 1.4)]);
    },
  };

  /* ---- screen ---- */
  MARKERS.screen = {
    flat: (c) => {
      const u = c.R / 10;
      return face(c, [boxBody(c, c.R * 2.3, c.R * 1.4, 1 * u), ln(c, c.cx - 2.4 * u, c.cy + 8.2 * u, c.cx + 2.4 * u, c.cy + 8.2 * u, 1.4), ln(c, c.cx, c.cy + 7 * u, c.cx, c.cy + 8.2 * u, 1.2)]);
    },
    frame: (c) => {
      const u = c.R / 10;
      return face(c, [boxBody(c, c.R * 2.3, c.R * 1.5, 0.6 * u), rect(c, c.cx - c.R * 0.94, c.cy - c.R * 0.56, c.R * 1.88, c.R * 1.12, { rx: 0.4 * u })]);
    },
    projector: (c) => {
      const u = c.R / 10;
      return face(c, [
        boxBody(c, c.R * 1.6, c.R * 1.1, 1.2 * u),
        mk('path', { d: `M ${c.cx + c.R * 0.8} ${c.cy - 2 * u} L ${c.cx + c.R * 1.9} ${c.cy - 4.4 * u} L ${c.cx + c.R * 1.9} ${c.cy + 4.4 * u} L ${c.cx + c.R * 0.8} ${c.cy + 2 * u} Z`, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2, opacity: 0.75 }),
      ]);
    },
    box: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 2, c.R * 0.9, 1 * u), dot(c, c.cx + c.R * 0.66, c.cy, 1.1 * u), ln(c, c.cx - c.R * 0.8, c.cy, c.cx - c.R * 0.1, c.cy, 1.2)];
    },
    /* A CRT is mostly tube: deep, narrower at the back, with a fat bezel round
     * a small glass. Drawn as the same slab as a flat panel it was
     * indistinguishable from one, which is the whole reason to offer it. */
    crt: (c) => {
      const u = c.R / 10;
      return face(c, [
        mk('path', {
          d: `M ${c.cx - 8.4 * u} ${c.cy - 6.4 * u} L ${c.cx + 8.4 * u} ${c.cy - 6.4 * u} L ${c.cx + 6 * u} ${c.cy + 6.4 * u} L ${c.cx - 6 * u} ${c.cy + 6.4 * u} Z`,
          fill: c.fill, stroke: c.line, 'stroke-width': 1.3, 'stroke-linejoin': 'round',
        }),
        rect(c, c.cx - 6.2 * u, c.cy - 5.2 * u, 12.4 * u, 7.4 * u, { rx: 1.6 * u }),
        ln(c, c.cx - 2.2 * u, c.cy + 4.6 * u, c.cx + 2.2 * u, c.cy + 4.6 * u, 1.2),
      ]);
    },
    /* A projection screen, rolled down: cassette across the back, sheet under
     * it. Distinct from `projector`, which is the machine throwing at it. */
    drop_screen: (c) => {
      const u = c.R / 10;
      return face(c, [
        mk('rect', { x: c.cx - 8 * u, y: c.cy - 5.4 * u, width: 16 * u, height: 2.4 * u, rx: 1 * u, fill: c.fill, stroke: c.line, 'stroke-width': 1.3 }),
        mk('rect', { x: c.cx - 7.2 * u, y: c.cy - 3 * u, width: 14.4 * u, height: 7.4 * u, fill: c.glyph, opacity: 0.22 }),
        ln(c, c.cx - 7.2 * u, c.cy + 4.4 * u, c.cx + 7.2 * u, c.cy + 4.4 * u, 1.5),
      ]);
    },
  };

  /* ---- speaker ---- */
  MARKERS.speaker = {
    box: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.5, c.R * 2.1, 1.2 * u), mk('circle', { cx: c.cx, cy: c.cy - 4 * u, r: 2.4 * u, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2 }), mk('circle', { cx: c.cx, cy: c.cy + 3.4 * u, r: 3.4 * u, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2 })];
    },
    round: (c) => [body(c), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.62, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2 }), dot(c, c.cx, c.cy, c.R * 0.2)],
    bar: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 2.6, c.R * 0.85, 1.6 * u)];
      for (let i = -1; i <= 1; i++) n.push(mk('circle', { cx: c.cx + i * 7.4 * u, cy: c.cy, r: 2 * u, fill: 'none', stroke: c.glyph, 'stroke-width': 1.1 }));
      return n;
    },
    horn: (c) => {
      const u = c.R / 10;
      return face(c, [
        mk('path', { d: `M ${c.cx - 4.6 * u} ${c.cy - 2.2 * u} L ${c.cx - 1.4 * u} ${c.cy - 2.2 * u} L ${c.cx + 4.4 * u} ${c.cy - 5.6 * u} L ${c.cx + 4.4 * u} ${c.cy + 5.6 * u} L ${c.cx - 1.4 * u} ${c.cy + 2.2 * u} L ${c.cx - 4.6 * u} ${c.cy + 2.2 * u} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }),
      ]);
    },
  };

  /* ---- cool ---- air conditioning, by how the box is mounted */
  MARKERS.cool = {
    split: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 2.4, c.R * 1.05, 1.6 * u)];
      for (let i = -1; i <= 1; i++) n.push(ln(c, c.cx - c.R * 0.9, c.cy + i * 1.9 * u + 1 * u, c.cx + c.R * 0.9, c.cy + i * 1.9 * u + 1 * u, 1));
      return n;
    },
    cassette: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 1.9, c.R * 1.9, 1.4 * u), rect(c, c.cx - c.R * 0.5, c.cy - c.R * 0.5, c.R, c.R, { rx: 0.6 * u })];
      n.push(ln(c, c.cx - c.R * 0.95, c.cy - c.R * 0.95, c.cx - c.R * 0.5, c.cy - c.R * 0.5, 1));
      n.push(ln(c, c.cx + c.R * 0.95, c.cy - c.R * 0.95, c.cx + c.R * 0.5, c.cy - c.R * 0.5, 1));
      n.push(ln(c, c.cx - c.R * 0.95, c.cy + c.R * 0.95, c.cx - c.R * 0.5, c.cy + c.R * 0.5, 1));
      n.push(ln(c, c.cx + c.R * 0.95, c.cy + c.R * 0.95, c.cx + c.R * 0.5, c.cy + c.R * 0.5, 1));
      return n;
    },
    window: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 1.9, c.R * 1.4, 1 * u)];
      for (let i = 0; i < 4; i++) n.push(ln(c, c.cx - c.R * 0.7 + i * c.R * 0.47, c.cy - c.R * 0.5, c.cx - c.R * 0.7 + i * c.R * 0.47, c.cy + c.R * 0.5, 1));
      return n;
    },
    outdoor: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 2, c.R * 1.6, 1.2 * u), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.56, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2 }), dot(c, c.cx, c.cy, 1.1 * u)];
    },
    portable: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.2, c.R * 2, 1.6 * u), ln(c, c.cx - c.R * 0.4, c.cy - c.R * 0.6, c.cx + c.R * 0.4, c.cy - c.R * 0.6, 1.1), ln(c, c.cx - c.R * 0.4, c.cy - c.R * 0.2, c.cx + c.R * 0.4, c.cy - c.R * 0.2, 1.1), d(c, `M ${c.cx + c.R * 0.6} ${c.cy + c.R * 0.7} q ${2 * u} ${-2 * u} ${4 * u} 0`, 1.1)];
    },
  };

  /* ---- heat ---- */
  MARKERS.heat = {
    radiant: (c) => {
      const u = c.R / 10;
      const n = [body(c)];
      for (let i = -1; i <= 1; i++) n.push(d(c, `M ${c.cx + i * 3.2 * u} ${c.cy + 4 * u} q ${-1.6 * u} ${-2.6 * u} 0 ${-4.4 * u} q ${1.6 * u} ${-2 * u} 0 ${-3.8 * u}`, 1.2));
      return n;
    },
    convector: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 2, c.R * 1.5, 1 * u)];
      for (let i = 0; i < 5; i++) n.push(ln(c, c.cx - c.R * 0.76 + i * c.R * 0.38, c.cy - c.R * 0.55, c.cx - c.R * 0.76 + i * c.R * 0.38, c.cy + c.R * 0.55, 1));
      return n;
    },
    oven: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.9, c.R * 1.9, 1.2 * u), ln(c, c.cx - c.R * 0.9, c.cy - c.R * 0.42, c.cx + c.R * 0.9, c.cy - c.R * 0.42, 1.1), rect(c, c.cx - c.R * 0.6, c.cy - c.R * 0.15, c.R * 1.2, c.R * 0.8, { rx: 0.4 * u }), dot(c, c.cx - c.R * 0.62, c.cy - c.R * 0.7, 0.9 * u)];
    },
    boiler: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.4, c.R * 2, 1.4 * u), mk('circle', { cx: c.cx, cy: c.cy - c.R * 0.4, r: c.R * 0.34, fill: 'none', stroke: c.glyph, 'stroke-width': 1.1 }), ln(c, c.cx - c.R * 0.5, c.cy + c.R * 0.55, c.cx + c.R * 0.5, c.cy + c.R * 0.55, 1.1)];
    },
    element: (c) => {
      const u = c.R / 10;
      return [body(c), d(c, `M ${c.cx - 5 * u} ${c.cy + 2 * u} q ${2.5 * u} ${-5 * u} ${5 * u} 0 q ${2.5 * u} ${5 * u} ${5 * u} 0`, 1.5)];
    },
  };

  /* ---- water ---- */
  MARKERS.water = {
    drop: (c) => {
      const u = c.R / 10;
      return [body(c), d(c, `M ${c.cx} ${c.cy - 5 * u} C ${c.cx + 3 * u} ${c.cy - 1.4 * u} ${c.cx + 4 * u} ${c.cy + 0.6 * u} ${c.cx + 4 * u} ${c.cy + 2.2 * u} A ${4 * u} ${4 * u} 0 0 1 ${c.cx - 4 * u} ${c.cy + 2.2 * u} C ${c.cx - 4 * u} ${c.cy + 0.6 * u} ${c.cx - 3 * u} ${c.cy - 1.4 * u} ${c.cx} ${c.cy - 5 * u} Z`, 1.3)];
    },
    tank: (c) => {
      const u = c.R / 10;
      const lvl = Math.max(0, Math.min(100, num(c.pct, 60))) / 100;
      const w = c.R * 1.5, h = c.R * 1.9;
      const x = c.cx - w / 2, y = c.cy - h / 2;
      return [
        boxBody(c, w, h, 1.6 * u),
        mk('rect', { x: x + 1.2, y: y + h - (h - 2.4) * lvl - 1.2, width: w - 2.4, height: (h - 2.4) * lvl, fill: c.on ? c.accent : c.glyph, opacity: 0.35, rx: 1 }),
        ln(c, x, y + h * 0.5, x + w * 0.22, y + h * 0.5, 1),
      ];
    },
    tap: (c) => {
      const u = c.R / 10;
      return face(c, [body(c), d(c, `M ${c.cx - 3.6 * u} ${c.cy + 4 * u} L ${c.cx - 3.6 * u} ${c.cy - 2 * u} q 0 ${-3 * u} ${3.4 * u} ${-3 * u} L ${c.cx + 4 * u} ${c.cy - 5 * u}`, 1.4), ln(c, c.cx + 3.4 * u, c.cy - 5 * u, c.cx + 3.4 * u, c.cy - 2.6 * u, 1.3)]);
    },
    pump: (c) => {
      const u = c.R / 10;
      const g = { tag: 'g', attrs: { class: c.spin ? 'fps-spin' : null, style: c.spin ? `--fps-o:${c.cx}px ${c.cy}px;--fps-d:${c.period || '1.1s'}` : null, 'pointer-events': 'none' }, children: [] };
      for (let i = 0; i < 3; i++) g.children.push(mk('path', { d: `M ${c.cx} ${c.cy} q ${3.4 * u} ${-1.6 * u} ${4.6 * u} ${-3.4 * u}`, fill: 'none', stroke: c.on ? c.accent : c.glyph, 'stroke-width': 1.5, 'stroke-linecap': 'round', transform: `rotate(${i * 120} ${c.cx} ${c.cy})` }));
      return [body(c), g, dot(c, c.cx, c.cy, 1.2 * u, c.line)];
    },
    meter: (c) => {
      const u = c.R / 10;
      return [body(c), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.6, fill: 'none', stroke: c.glyph, 'stroke-width': 1.1 }), ln(c, c.cx, c.cy, c.cx + c.R * 0.4, c.cy - c.R * 0.34, 1.3)];
    },
  };

  /* ---- motion / presence ---- */
  MARKERS.motion = {
    dome: (c) => {
      const u = c.R / 10;
      return [body(c), dot(c, c.cx, c.cy, 1.9 * u), d(c, `M ${c.cx - 3.6 * u} ${c.cy - 3.6 * u} A ${5.1 * u} ${5.1 * u} 0 0 1 ${c.cx + 3.6 * u} ${c.cy - 3.6 * u}`, 1.3), d(c, `M ${c.cx - 5.6 * u} ${c.cy - 5.6 * u} A ${7.9 * u} ${7.9 * u} 0 0 1 ${c.cx + 5.6 * u} ${c.cy - 5.6 * u}`, 1.1)];
    },
    wall: (c) => {
      const u = c.R / 10;
      return face(c, [
        mk('path', { d: `M ${c.cx - 4.4 * u} ${c.cy + 3.6 * u} L ${c.cx - 4.4 * u} ${c.cy - 2 * u} q ${4.4 * u} ${-4 * u} ${8.8 * u} 0 L ${c.cx + 4.4 * u} ${c.cy + 3.6 * u} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }),
        dot(c, c.cx, c.cy + 0.4 * u, 1.5 * u),
      ]);
    },
    radar: (c) => {
      const u = c.R / 10;
      const n = [body(c), dot(c, c.cx, c.cy, 1.4 * u)];
      for (let i = 1; i <= 3; i++) n.push(mk('circle', { cx: c.cx, cy: c.cy, r: c.R * (0.3 + i * 0.22), fill: 'none', stroke: c.glyph, 'stroke-width': 1, opacity: 1 - i * 0.22, class: c.spin ? 'fps-breathe' : null }));
      return n;
    },
    vibration: (c) => {
      const u = c.R / 10;
      return [body(c), ln(c, c.cx, c.cy - 4 * u, c.cx, c.cy + 4 * u, 1.5), d(c, `M ${c.cx - 4.4 * u} ${c.cy - 2.4 * u} q ${-1.6 * u} ${2.4 * u} 0 ${4.8 * u}`, 1.1), d(c, `M ${c.cx + 4.4 * u} ${c.cy - 2.4 * u} q ${1.6 * u} ${2.4 * u} 0 ${4.8 * u}`, 1.1)];
    },
  };

  /* ---- contact / openings ---- */
  MARKERS.contact = {
    reed: (c) => {
      const u = c.R / 10;
      return [body(c), rect(c, c.cx - 5.2 * u, c.cy - 3.8 * u, 4.4 * u, 7.6 * u, { rx: 0.8 * u }), rect(c, c.cx + 0.8 * u, c.cy - 3.8 * u, 4.4 * u, 7.6 * u, { rx: 0.8 * u })];
    },
    garage: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 2, c.R * 1.7, 1 * u)];
      for (let i = 0; i < 3; i++) n.push(ln(c, c.cx - c.R * 0.85, c.cy - c.R * 0.4 + i * c.R * 0.44, c.cx + c.R * 0.85, c.cy - c.R * 0.4 + i * c.R * 0.44, 1));
      return n;
    },
    gate: (c) => {
      const u = c.R / 10;
      const n = [body(c)];
      for (let i = -2; i <= 2; i++) n.push(ln(c, c.cx + i * 2.2 * u, c.cy - 4.4 * u, c.cx + i * 2.2 * u, c.cy + 4.4 * u, 1.1));
      n.push(ln(c, c.cx - 5 * u, c.cy, c.cx + 5 * u, c.cy, 1.1));
      return n;
    },
  };

  /* ---- lock ---- */
  MARKERS.lock = {
    deadbolt: (c) => {
      const u = c.R / 10;
      return [body(c), rect(c, c.cx - 4 * u, c.cy - 1 * u, 8 * u, 5.6 * u, { rx: 1 * u }), d(c, `M ${c.cx - 2.2 * u} ${c.cy - 1 * u} v ${-2 * u} a ${2.2 * u} ${2.2 * u} 0 0 1 ${4.4 * u} 0 v ${2 * u}`, 1.3)];
    },
    padlock: (c) => {
      const u = c.R / 10;
      return [body(c), rect(c, c.cx - 3.4 * u, c.cy - 0.4 * u, 6.8 * u, 5 * u, { rx: 1.2 * u }), d(c, `M ${c.cx - 2 * u} ${c.cy - 0.4 * u} v ${-2.4 * u} a ${2 * u} ${2 * u} 0 0 1 ${4 * u} 0 v ${2.4 * u}`, 1.3), dot(c, c.cx, c.cy + 2 * u, 0.8 * u)];
    },
    keypad: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 1.4, c.R * 1.9, 1.4 * u)];
      for (let r = 0; r < 3; r++) for (let k = -1; k <= 1; k++) n.push(dot(c, c.cx + k * 2.2 * u, c.cy - 3.4 * u + r * 2.6 * u, 0.7 * u));
      return n;
    },
  };

  /* ---- alarm ---- */
  MARKERS.alarm = {
    bell: (c) => {
      const u = c.R / 10;
      return [body(c), d(c, `M ${c.cx - 4 * u} ${c.cy + 2 * u} q 0 ${-6.4 * u} ${4 * u} ${-6.4 * u} q ${4 * u} 0 ${4 * u} ${6.4 * u} Z`, 1.3), ln(c, c.cx - 5 * u, c.cy + 2 * u, c.cx + 5 * u, c.cy + 2 * u, 1.2), dot(c, c.cx, c.cy + 3.8 * u, 1.1 * u)];
    },
    horn: (c) => {
      const u = c.R / 10;
      const n = [body(c), mk('path', { d: `M ${c.cx - 4.6 * u} ${c.cy - 2.4 * u} L ${c.cx + 1 * u} ${c.cy - 4.8 * u} L ${c.cx + 1 * u} ${c.cy + 4.8 * u} L ${c.cx - 4.6 * u} ${c.cy + 2.4 * u} Z`, fill: 'none', stroke: c.glyph, 'stroke-width': 1.3, 'stroke-linejoin': 'round' })];
      for (let i = 1; i <= 2; i++) n.push(mk('path', { d: `M ${c.cx + 1.8 * u + i * 1.6 * u} ${c.cy - 2.2 * u} a ${2.6 * u} ${2.6 * u} 0 0 1 0 ${4.4 * u}`, fill: 'none', stroke: c.glyph, 'stroke-width': 1.1, opacity: 1 - i * 0.25, class: c.spin ? 'fps-pulse' : null }));
      return n;
    },
    smoke: (c) => {
      const u = c.R / 10;
      const n = [body(c), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.62, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2 })];
      for (let i = 0; i < 6; i++) {
        const a = (i * 60) * Math.PI / 180;
        n.push(ln(c, c.cx + Math.cos(a) * c.R * 0.28, c.cy + Math.sin(a) * c.R * 0.28, c.cx + Math.cos(a) * c.R * 0.54, c.cy + Math.sin(a) * c.R * 0.54, 1));
      }
      return n;
    },
    button: (c) => [body(c), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.55, fill: c.on ? c.accent : 'none', stroke: c.glyph, 'stroke-width': 1.4 })],
  };

  /* ---- plug / socket ---- */
  MARKERS.plug = {
    socket: (c) => {
      const u = c.R / 10;
      return [body(c), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.62, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2 }), dot(c, c.cx - 2 * u, c.cy - 0.6 * u, 0.9 * u), dot(c, c.cx + 2 * u, c.cy - 0.6 * u, 0.9 * u)];
    },
    pins3: (c) => {
      const u = c.R / 10;
      return [body(c), rect(c, c.cx - 3.6 * u, c.cy - 3.4 * u, 7.2 * u, 6.8 * u, { rx: 1.2 * u }), ln(c, c.cx, c.cy - 2.2 * u, c.cx, c.cy - 0.4 * u, 1.4), ln(c, c.cx - 1.9 * u, c.cy + 0.6 * u, c.cx - 1.9 * u, c.cy + 2.2 * u, 1.4), ln(c, c.cx + 1.9 * u, c.cy + 0.6 * u, c.cx + 1.9 * u, c.cy + 2.2 * u, 1.4)];
    },
    ev: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.3, c.R * 1.9, 1.4 * u), mk('circle', { cx: c.cx, cy: c.cy - 2 * u, r: 2 * u, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2 }), d(c, `M ${c.cx - 2.6 * u} ${c.cy + 2 * u} q ${2.6 * u} ${3.4 * u} ${5.2 * u} 0`, 1.2)];
    },
  };

  /* ---- power ---- */
  MARKERS.power = {
    symbol: (c) => {
      const u = c.R / 10;
      return [body(c), d(c, `M ${c.cx - 3.4 * u} ${c.cy - 1.6 * u} A ${4.4 * u} ${4.4 * u} 0 1 0 ${c.cx + 3.4 * u} ${c.cy - 1.6 * u}`, 1.5), ln(c, c.cx, c.cy - 5 * u, c.cx, c.cy - 0.4 * u, 1.5)];
    },
    breaker: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.3, c.R * 1.9, 1 * u), ln(c, c.cx, c.cy - 3 * u, c.cx, c.cy + 1 * u, 1.5), dot(c, c.cx, c.cy + 2.6 * u, 1 * u)];
    },
    module: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 2, c.R * 1.3, 1 * u)];
      for (let i = -1; i <= 1; i++) n.push(ln(c, c.cx + i * 3.4 * u, c.cy - 2.4 * u, c.cx + i * 3.4 * u, c.cy + 2.4 * u, 1.1));
      return n;
    },
  };

  /* ---- switch ----
   *
   * The wall switch is the one device where the interesting number is how many
   * of it there are on one plate. A 3-gang plate by the door is three separate
   * Home Assistant entities behind one piece of plastic, and drawing it as a
   * single disc cannot say WHICH of the three is on — the same argument
   * `device.extension` already makes for a multi-outlet board, which is why
   * this reuses that entry's `channels` machinery rather than inventing a
   * second one.
   *
   * Every variant lays its gangs out through `plateOf` and asks `gangOn(c, i)`
   * for each cell's state, so a 3-gang rocker and a 3-gang keypad are the same
   * object with different buttons on it. Adding a variant means drawing one
   * cell, not re-deriving the plate.
   *
   * `gangOn` degrades on purpose: it reads the item's `channels` (one entity
   * per gang) where they are bound, and falls back to the marker's own single
   * entity where they are not. So a switch is useful the moment it is placed,
   * gets more truthful as you bind gangs to it, and never needs all N entities
   * to exist before it will draw. */
  const SWITCH_MAX_GANGS = 5;

  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  /* `c.gangs` is the resolved per-gang state array the renderer supplies for a
   * placed item. `p.gangs` is what the Look picker and the palette swatch have,
   * since those draw a TYPE rather than an item and pass `p: {}` or the type's
   * defaults — hence the 2 here, which makes an unconfigured preview show what
   * ganging looks like instead of a lone cell. */
  const gangCount = (c) => {
    const n = Array.isArray(c.gangs) && c.gangs.length
      ? c.gangs.length
      : Math.round(num(c.p && c.p.gangs, 2));
    return cl(n, 1, SWITCH_MAX_GANGS);
  };
  const gangOn = (c, i) => (Array.isArray(c.gangs) && i < c.gangs.length ? !!c.gangs[i] : !!c.on);
  /* Off gangs stay in the glyph colour rather than vanishing, so an all-off
   * plate still reads as a plate. */
  const gangInk = (c, on) => (on ? c.accent : c.glyph);
  const gln = (col, x1, y1, x2, y2, w) => mk('line', { x1, y1, x2, y2, stroke: col, 'stroke-width': w || 1.2, 'stroke-linecap': 'round' });
  const gdot = (col, x, y, r) => mk('circle', { cx: x, cy: y, r, fill: col });

  /* One plate, N cells, laid out along the long axis. `vertical` turns the
   * plate on its end for the architrave, which is the same switch in a jamb. */
  function plateOf(c, n, vertical) {
    const cell = c.R * 0.58;
    const pad = c.R * 0.24;
    const long = n * cell + pad * 2;
    const short = c.R * 1.34;
    const w = vertical ? short : long;
    const h = vertical ? long : short;
    return {
      w, h, cell, pad, x: c.cx - w / 2, y: c.cy - h / 2,
      cx: (i) => (vertical ? c.cx : c.cx - w / 2 + pad + cell * (i + 0.5)),
      cy: (i) => (vertical ? c.cy - h / 2 + pad + cell * (i + 0.5) : c.cy),
    };
  }
  const switchPlate = (c, pl, rx) => mk('rect', {
    x: pl.x, y: pl.y, width: pl.w, height: pl.h, rx: rx === undefined ? c.R * 0.16 : rx,
    fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2,
  });

  MARKERS.switch = {
    /* Wide UK/EU rocker per gang, split across its middle so it reads as
     * something you press. Which half is depressed carries the state a second
     * time, for a plan printed in mono. */
    rocker: (c) => {
      const n = gangCount(c), pl = plateOf(c, n);
      const out = [switchPlate(c, pl)];
      const rw = pl.cell * 0.72, rh = pl.h * 0.6;
      for (let i = 0; i < n; i++) {
        const on = gangOn(c, i), x = pl.cx(i), ink = gangInk(c, on);
        out.push(mk('rect', {
          x: x - rw / 2, y: c.cy - rh / 2, width: rw, height: rh, rx: c.R * 0.07,
          fill: on ? c.accent : 'none', opacity: on ? 0.8 : 1, stroke: ink, 'stroke-width': 1.1,
        }));
        out.push(gln(on ? c.line : ink, x - rw / 2, c.cy + (on ? -rh * 0.15 : rh * 0.15),
          x + rw / 2, c.cy + (on ? -rh * 0.15 : rh * 0.15), 1));
      }
      return face(c, out);
    },
    /* US toggle: a lever in a slot, up for on. */
    toggle: (c) => {
      const n = gangCount(c), pl = plateOf(c, n);
      const out = [switchPlate(c, pl)];
      const sw = pl.cell * 0.36, sh = pl.h * 0.62;
      for (let i = 0; i < n; i++) {
        const on = gangOn(c, i), x = pl.cx(i), ink = gangInk(c, on);
        out.push(mk('rect', { x: x - sw / 2, y: c.cy - sh / 2, width: sw, height: sh, rx: sw / 2, fill: 'none', stroke: ink, 'stroke-width': 1.1 }));
        out.push(mk('rect', {
          x: x - sw / 2, y: on ? c.cy - sh / 2 : c.cy, width: sw, height: sh / 2, rx: sw / 2,
          fill: ink, opacity: on ? 0.9 : 0.75,
        }));
      }
      return face(c, out);
    },
    /* Momentary push buttons — a scene switch, not a load switch. */
    push: (c) => {
      const n = gangCount(c), pl = plateOf(c, n);
      const out = [switchPlate(c, pl)];
      const r = pl.cell * 0.32;
      for (let i = 0; i < n; i++) {
        const on = gangOn(c, i), ink = gangInk(c, on);
        out.push(mk('circle', { cx: pl.cx(i), cy: c.cy, r, fill: on ? c.accent : 'none', opacity: on ? 0.8 : 1, stroke: ink, 'stroke-width': 1.1 }));
        out.push(gdot(on ? c.line : ink, pl.cx(i), c.cy, r * 0.34));
      }
      return face(c, out);
    },
    /* Modular square pads with a status LED under each — the common Indian and
     * Middle-Eastern plate, and the one where the LED is the state. */
    square: (c) => {
      const n = gangCount(c), pl = plateOf(c, n);
      const out = [switchPlate(c, pl)];
      const s = pl.cell * 0.62;
      for (let i = 0; i < n; i++) {
        const on = gangOn(c, i), x = pl.cx(i), ink = gangInk(c, on);
        out.push(mk('rect', { x: x - s / 2, y: c.cy - s * 0.66, width: s, height: s, rx: c.R * 0.05, fill: 'none', stroke: ink, 'stroke-width': 1.1 }));
        out.push(gdot(ink, x, c.cy + s * 0.62, Math.max(0.7, c.R * 0.075)));
      }
      return face(c, out);
    },
    /* Rocker plus a level track. The knob sits at `pct`, so a plate dimmed to
     * 20% does not draw the same as one at full. */
    dimmer: (c) => {
      const n = gangCount(c), pl = plateOf(c, n);
      const out = [switchPlate(c, pl)];
      const tw = pl.cell * 0.2, th = pl.h * 0.62;
      const level = cl(num(c.pct, 60), 0, 100) / 100;
      for (let i = 0; i < n; i++) {
        const on = gangOn(c, i), x = pl.cx(i), ink = gangInk(c, on);
        out.push(mk('rect', { x: x - tw / 2, y: c.cy - th / 2, width: tw, height: th, rx: tw / 2, fill: 'none', stroke: ink, 'stroke-width': 1 }));
        const ky = on ? c.cy + th / 2 - th * level : c.cy + th * 0.34;
        out.push(mk('rect', { x: x - pl.cell * 0.3, y: ky - c.R * 0.07, width: pl.cell * 0.6, height: c.R * 0.14, rx: c.R * 0.07, fill: ink }));
      }
      return face(c, out);
    },
    /* Rotary dimmer: a knob with a pointer, the pointer angle carrying level. */
    rotary: (c) => {
      const n = gangCount(c), pl = plateOf(c, n);
      const out = [switchPlate(c, pl)];
      const r = pl.cell * 0.34;
      const level = cl(num(c.pct, 60), 0, 100) / 100;
      for (let i = 0; i < n; i++) {
        const on = gangOn(c, i), x = pl.cx(i), ink = gangInk(c, on);
        /* Sweep 240 degrees from bottom-left round to bottom-right, the way a
         * real knob is end-stopped. */
        const a = (-210 + 240 * (on ? level : 0)) * Math.PI / 180;
        out.push(mk('circle', { cx: x, cy: c.cy, r, fill: 'none', stroke: ink, 'stroke-width': 1.1 }));
        out.push(gln(ink, x, c.cy, x + Math.cos(a) * r * 0.85, c.cy + Math.sin(a) * r * 0.85, 1.2));
      }
      return face(c, out);
    },
    /* Flat glass touch panel: no bezel, capacitive rings instead of buttons. */
    touch: (c) => {
      const n = gangCount(c), pl = plateOf(c, n);
      const out = [mk('rect', {
        x: pl.x, y: pl.y, width: pl.w, height: pl.h, rx: c.R * 0.28,
        fill: c.fill, stroke: c.line, 'stroke-width': 1,
      })];
      const r = pl.cell * 0.3;
      for (let i = 0; i < n; i++) {
        const on = gangOn(c, i), ink = gangInk(c, on);
        out.push(mk('circle', { cx: pl.cx(i), cy: c.cy, r, fill: 'none', stroke: ink, 'stroke-width': on ? 1.6 : 1 }));
        if (on) out.push(gdot(c.accent, pl.cx(i), c.cy, r * 0.42));
      }
      return face(c, out);
    },
    /* Scene keypad: wide labelled bars, each with its own indicator. */
    keypad: (c) => {
      const n = gangCount(c), pl = plateOf(c, n, true);
      const out = [switchPlate(c, pl)];
      /* The indicator sits left of its bar, so both have to fit between the
       * plate edges: LED at -0.30w, bar spanning -0.17w to +0.35w. An earlier
       * pass sized the bar off its own width and pushed it against the right
       * bezel. */
      const bw = pl.w * 0.52, bh = pl.cell * 0.52, bx = c.cx - pl.w * 0.17;
      for (let i = 0; i < n; i++) {
        const on = gangOn(c, i), y = pl.cy(i), ink = gangInk(c, on);
        out.push(mk('rect', { x: bx, y: y - bh / 2, width: bw, height: bh, rx: bh / 2, fill: on ? c.accent : 'none', opacity: on ? 0.75 : 1, stroke: ink, 'stroke-width': 1 }));
        out.push(gdot(ink, c.cx - pl.w * 0.30, y, Math.max(0.6, c.R * 0.06)));
      }
      return face(c, out);
    },
    /* Architrave: the narrow plate that fits a door jamb. Same switch, stood on
     * its end, so the gangs stack instead of spreading. */
    architrave: (c) => {
      const n = gangCount(c), pl = plateOf(c, n, true);
      const out = [switchPlate(c, pl, c.R * 0.1)];
      const rw = pl.w * 0.56, rh = pl.cell * 0.66;
      for (let i = 0; i < n; i++) {
        const on = gangOn(c, i), y = pl.cy(i), ink = gangInk(c, on);
        out.push(mk('rect', { x: c.cx - rw / 2, y: y - rh / 2, width: rw, height: rh, rx: c.R * 0.06, fill: on ? c.accent : 'none', opacity: on ? 0.8 : 1, stroke: ink, 'stroke-width': 1.1 }));
      }
      return face(c, out);
    },
    /* Weatherproof / metal-clad: heavier plate, corner fixings, round levers.
     * The screws are what say "outbuilding" at a glance. */
    industrial: (c) => {
      const n = gangCount(c), pl = plateOf(c, n);
      const out = [mk('rect', {
        x: pl.x, y: pl.y, width: pl.w, height: pl.h, rx: c.R * 0.06,
        fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 2 : 1.5,
      })];
      const inset = c.R * 0.14;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        out.push(gdot(c.glyph, c.cx + sx * (pl.w / 2 - inset), c.cy + sy * (pl.h / 2 - inset), Math.max(0.55, c.R * 0.055)));
      }
      const r = pl.cell * 0.28;
      for (let i = 0; i < n; i++) {
        const on = gangOn(c, i), x = pl.cx(i), ink = gangInk(c, on);
        out.push(mk('circle', { cx: x, cy: c.cy, r, fill: 'none', stroke: ink, 'stroke-width': 1.2 }));
        out.push(gln(ink, x, c.cy, x, c.cy + (on ? -r * 0.8 : r * 0.8), 1.4));
      }
      return face(c, out);
    },
  };

  /* ---- network ---- */
  MARKERS.network = {
    router: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 2, c.R * 0.9, 1.2 * u), ln(c, c.cx - 3 * u, c.cy - 4.4 * u, c.cx - 4.4 * u, c.cy - 0.8 * u, 1.2), ln(c, c.cx + 3 * u, c.cy - 4.4 * u, c.cx + 4.4 * u, c.cy - 0.8 * u, 1.2), dot(c, c.cx, c.cy + 0.2 * u, 0.9 * u)];
    },
    ap: (c) => {
      const u = c.R / 10;
      const n = [body(c), dot(c, c.cx, c.cy + 2 * u, 1.2 * u)];
      for (let i = 1; i <= 3; i++) n.push(d(c, `M ${c.cx - i * 2 * u} ${c.cy + 1 * u} a ${i * 2 * u} ${i * 2 * u} 0 0 1 ${i * 4 * u} 0`, 1.1));
      return n;
    },
    ports: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 2.2, c.R * 1, 0.8 * u)];
      for (let i = -2; i <= 2; i++) n.push(rect(c, c.cx + i * 2.2 * u - 0.8 * u, c.cy - 1.2 * u, 1.6 * u, 2.4 * u, { 'stroke-width': 1 }));
      return n;
    },
    server: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 1.5, c.R * 2, 1 * u)];
      for (let i = -1; i <= 1; i++) { n.push(ln(c, c.cx - c.R * 0.6, c.cy + i * 3.2 * u, c.cx + c.R * 0.35, c.cy + i * 3.2 * u, 1.1)); n.push(dot(c, c.cx + c.R * 0.55, c.cy + i * 3.2 * u, 0.7 * u)); }
      return n;
    },
  };

  /* ---- cover ---- */
  MARKERS.cover = {
    curtain: (c) => {
      const u = c.R / 10;
      const n = [body(c), ln(c, c.cx - 5.4 * u, c.cy - 4.2 * u, c.cx + 5.4 * u, c.cy - 4.2 * u, 1.4)];
      for (let i = -1; i <= 1; i += 2) n.push(d(c, `M ${c.cx + i * 2 * u} ${c.cy - 4 * u} q ${i * 2.6 * u} ${3.4 * u} 0 ${7.4 * u}`, 1.2));
      return n;
    },
    roller: (c) => {
      const u = c.R / 10;
      const pos = Math.max(0, Math.min(100, num(c.pct, 50))) / 100;
      return [body(c), mk('rect', { x: c.cx - 5 * u, y: c.cy - 4.6 * u, width: 10 * u, height: Math.max(1.2, 8.6 * u * (1 - pos)), fill: c.glyph, opacity: 0.3 }), ln(c, c.cx - 5.4 * u, c.cy - 4.6 * u, c.cx + 5.4 * u, c.cy - 4.6 * u, 1.4)];
    },
    venetian: (c) => {
      const u = c.R / 10;
      const n = [body(c)];
      for (let i = 0; i < 5; i++) n.push(ln(c, c.cx - 4.6 * u, c.cy - 4 * u + i * 2 * u, c.cx + 4.6 * u, c.cy - 4 * u + i * 2 * u, 1.1));
      return n;
    },
    shutter: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 1.9, c.R * 1.9, 0.8 * u)];
      for (let i = 0; i < 4; i++) n.push(ln(c, c.cx - c.R * 0.8, c.cy - c.R * 0.6 + i * c.R * 0.4, c.cx + c.R * 0.8, c.cy - c.R * 0.6 + i * c.R * 0.4, 1));
      return n;
    },
    awning: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 2.1, c.R * 1.35, 1 * u)];
      for (let i = 0; i < 5; i++) n.push(mk('path', { d: `M ${c.cx - c.R * 0.85 + i * c.R * 0.42} ${c.cy - c.R * 0.62} L ${c.cx - c.R * 0.72 + i * c.R * 0.36} ${c.cy + c.R * 0.55}`, fill: 'none', stroke: c.glyph, 'stroke-width': 1 }));
      n.push(ln(c, c.cx - c.R, c.cy + c.R * 0.56, c.cx + c.R, c.cy + c.R * 0.56, 1.4));
      return face(c, n);
    },
    damper: (c) => {
      const u = c.R / 10;
      return face(c, [boxBody(c, c.R * 2, c.R * 1.25, 1 * u), ln(c, c.cx - c.R * 0.72, c.cy + c.R * 0.45, c.cx + c.R * 0.72, c.cy - c.R * 0.45, 1.8), dot(c, c.cx, c.cy, 1.1 * u)]);
    },
    /* A motorised projection screen is a cover like any other — a cassette
     * with a sheet that runs down out of it — so it belongs in this family
     * rather than beside the television. `pct` drives how far it has dropped,
     * the same way the roller blind reads its own position. */
    projection: (c) => {
      const u = c.R / 10;
      const pos = Math.max(0, Math.min(100, num(c.pct, 100))) / 100;
      const drop = Math.max(1.2, 8 * u * pos);
      return [
        mk('rect', { x: c.cx - 6 * u, y: c.cy - 5.6 * u, width: 12 * u, height: 2.6 * u, rx: 1.1 * u, fill: c.fill, stroke: c.line, 'stroke-width': 1.3 }),
        mk('rect', { x: c.cx - 5.2 * u, y: c.cy - 3 * u, width: 10.4 * u, height: drop, fill: c.glyph, opacity: 0.26 }),
        ln(c, c.cx - 5.2 * u, c.cy - 3 * u + drop, c.cx + 5.2 * u, c.cy - 3 * u + drop, 1.5),
      ];
    },
  };

  /* ---- laundry ---- */
  MARKERS.laundry = {
    frontload: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.8, c.R * 1.9, 1.2 * u), mk('circle', { cx: c.cx, cy: c.cy + 0.6 * u, r: c.R * 0.5, fill: 'none', stroke: c.glyph, 'stroke-width': 1.3, class: c.spin ? 'fps-spin' : null, style: c.spin ? `--fps-o:${c.cx}px ${c.cy + 0.6 * u}px;--fps-d:2.4s` : null }), ln(c, c.cx - c.R * 0.7, c.cy - c.R * 0.68, c.cx + c.R * 0.2, c.cy - c.R * 0.68, 1.1)];
    },
    toploaded: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.7, c.R * 2, 1.2 * u), ln(c, c.cx - c.R * 0.75, c.cy - c.R * 0.5, c.cx + c.R * 0.75, c.cy - c.R * 0.5, 1.2), mk('circle', { cx: c.cx, cy: c.cy + c.R * 0.3, r: c.R * 0.42, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2 })];
    },
    dishwasher: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 1.8, c.R * 1.9, 1.2 * u), ln(c, c.cx - c.R * 0.8, c.cy - c.R * 0.55, c.cx + c.R * 0.8, c.cy - c.R * 0.55, 1.2)];
      for (let i = 0; i < 2; i++) n.push(ln(c, c.cx - c.R * 0.55, c.cy + i * c.R * 0.5, c.cx + c.R * 0.55, c.cy + i * c.R * 0.5, 1));
      return n;
    },
  };

  /* ---- robot / air ---- */
  MARKERS.robot = {
    round: (c) => {
      const u = c.R / 10;
      return [body(c), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.6, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2 }), dot(c, c.cx, c.cy - c.R * 0.6, 1 * u)];
    },
    dock: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.6, c.R * 1.2, 1.2 * u), d(c, `M ${c.cx - 2.2 * u} ${c.cy + 1 * u} l ${2.2 * u} ${-2.4 * u} l ${2.2 * u} ${2.4 * u}`, 1.3), ln(c, c.cx - c.R * 0.7, c.cy + c.R * 0.5, c.cx + c.R * 0.7, c.cy + c.R * 0.5, 1.2)];
    },
    handheld: (c) => {
      const u = c.R / 10;
      return face(c, [body(c), d(c, `M ${c.cx - 4.4 * u} ${c.cy + 3 * u} l ${4 * u} ${-4.4 * u} l ${4.4 * u} 0`, 1.4), rect(c, c.cx + 2.4 * u, c.cy - 3 * u, 3 * u, 3.2 * u, { rx: 0.6 * u })]);
    },
    purifier: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 1.2, c.R * 2, 2 * u)];
      for (let i = -1; i <= 1; i++) n.push(d(c, `M ${c.cx + i * 2 * u} ${c.cy + 1 * u} q ${1.6 * u} ${-2.4 * u} 0 ${-4.4 * u}`, 1.1, c.spin));
      return n;
    },
    mower: (c) => {
      const u = c.R / 10;
      return face(c, [
        mk('path', { d: `M ${c.cx} ${c.cy - c.R} Q ${c.cx + c.R * 0.86} ${c.cy - c.R * 0.7} ${c.cx + c.R * 0.82} ${c.cy + c.R * 0.62} Q ${c.cx} ${c.cy + c.R} ${c.cx - c.R * 0.82} ${c.cy + c.R * 0.62} Q ${c.cx - c.R * 0.86} ${c.cy - c.R * 0.7} ${c.cx} ${c.cy - c.R} Z`, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }),
        mk('circle', { cx: c.cx, cy: c.cy + c.R * 0.2, r: c.R * 0.43, fill: 'none', stroke: c.glyph, 'stroke-width': 1.1, 'stroke-dasharray': `${2.2 * u} ${1.6 * u}` }),
        ln(c, c.cx - c.R * 0.48, c.cy - c.R * 0.45, c.cx + c.R * 0.48, c.cy - c.R * 0.45, 1.3),
        dot(c, c.cx, c.cy - c.R * 0.64, 1.1 * u),
      ]);
    },
  };

  /* ---- thermostat ---- */
  MARKERS.thermostat = {
    dial: (c) => {
      const u = c.R / 10;
      const n = [body(c), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.66, fill: 'none', stroke: c.glyph, 'stroke-width': 1.2 })];
      for (let i = 0; i < 8; i++) {
        const a = (i * 45 - 90) * Math.PI / 180;
        n.push(ln(c, c.cx + Math.cos(a) * c.R * 0.74, c.cy + Math.sin(a) * c.R * 0.74, c.cx + Math.cos(a) * c.R * 0.9, c.cy + Math.sin(a) * c.R * 0.9, 1));
      }
      n.push(ln(c, c.cx, c.cy, c.cx + c.R * 0.42, c.cy - c.R * 0.36, 1.4));
      return n;
    },
    wall: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.7, c.R * 1.2, 1.4 * u), ln(c, c.cx - c.R * 0.5, c.cy - c.R * 0.1, c.cx + c.R * 0.1, c.cy - c.R * 0.1, 1.4), ln(c, c.cx - c.R * 0.5, c.cy + c.R * 0.3, c.cx + c.R * 0.35, c.cy + c.R * 0.3, 1.2)];
    },
    probe: (c) => {
      const u = c.R / 10;
      return [body(c), d(c, `M ${c.cx} ${c.cy - 4.4 * u} v ${5.4 * u}`, 1.5), mk('circle', { cx: c.cx, cy: c.cy + 2.8 * u, r: 1.9 * u, fill: c.on ? c.accent : 'none', stroke: c.glyph, 'stroke-width': 1.3 })];
    },
  };

  /* ---- energy ---- */
  MARKERS.energy = {
    bolt: (c) => {
      const u = c.R / 10;
      return [body(c), d(c, `M ${c.cx + 1.4 * u} ${c.cy - 5.4 * u} L ${c.cx - 3 * u} ${c.cy + 0.6 * u} L ${c.cx + 0.4 * u} ${c.cy + 0.6 * u} L ${c.cx - 1 * u} ${c.cy + 5.4 * u} L ${c.cx + 3.4 * u} ${c.cy - 0.8 * u} L ${c.cx} ${c.cy - 0.8 * u} Z`, 1.2)];
    },
    meter: (c) => {
      const u = c.R / 10;
      const n = [boxBody(c, c.R * 1.7, c.R * 1.9, 1.4 * u), mk('circle', { cx: c.cx, cy: c.cy - c.R * 0.4, r: c.R * 0.4, fill: 'none', stroke: c.glyph, 'stroke-width': 1.1 })];
      n.push(rect(c, c.cx - c.R * 0.6, c.cy + c.R * 0.28, c.R * 1.2, c.R * 0.42, { 'stroke-width': 1 }));
      return n;
    },
    battery: (c) => {
      const u = c.R / 10;
      const lvl = Math.max(0, Math.min(100, num(c.pct, 70))) / 100;
      const w = c.R * 1.1, h = c.R * 1.8;
      const x = c.cx - w / 2, y = c.cy - h / 2 + 1 * u;
      return [
        boxBody(c, w, h, 1 * u),
        mk('rect', { x: c.cx - 1.6 * u, y: y - 2.4 * u, width: 3.2 * u, height: 1.6 * u, rx: 0.5 * u, fill: c.line }),
        mk('rect', { x: x + 1.4, y: y + h - (h - 2.8) * lvl - 1.4, width: w - 2.8, height: Math.max(1, (h - 2.8) * lvl), fill: c.on ? c.accent : c.glyph, opacity: 0.4, rx: 0.8 }),
      ];
    },
    inverter: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.6, c.R * 1.9, 1.2 * u), d(c, `M ${c.cx - 3.4 * u} ${c.cy + 1 * u} q ${1.7 * u} ${-4 * u} ${3.4 * u} 0 q ${1.7 * u} ${4 * u} ${3.4 * u} 0`, 1.3)];
    },
  };

  /* ---- valve ---- */
  MARKERS.valve = {
    gate: (c) => {
      const u = c.R / 10;
      return [body(c), mk('path', { d: `M ${c.cx - 4.4 * u} ${c.cy - 3.2 * u} L ${c.cx - 4.4 * u} ${c.cy + 3.2 * u} L ${c.cx} ${c.cy} Z`, fill: 'none', stroke: c.glyph, 'stroke-width': 1.3 }), mk('path', { d: `M ${c.cx + 4.4 * u} ${c.cy - 3.2 * u} L ${c.cx + 4.4 * u} ${c.cy + 3.2 * u} L ${c.cx} ${c.cy} Z`, fill: 'none', stroke: c.glyph, 'stroke-width': 1.3 }), ln(c, c.cx, c.cy, c.cx, c.cy - 4.6 * u, 1.3)];
    },
    ball: (c) => {
      const u = c.R / 10;
      return [body(c), mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.46, fill: 'none', stroke: c.glyph, 'stroke-width': 1.3 }), ln(c, c.cx - c.R * 0.9, c.cy, c.cx + c.R * 0.9, c.cy, 1.2), ln(c, c.cx, c.cy - c.R * 0.46, c.cx, c.cy - c.R, 1.4)];
    },
    solenoid: (c) => {
      const u = c.R / 10;
      const n = [body(c), ln(c, c.cx - c.R * 0.9, c.cy + 2 * u, c.cx + c.R * 0.9, c.cy + 2 * u, 1.3)];
      for (let i = 0; i < 3; i++) n.push(mk('circle', { cx: c.cx - 2.2 * u + i * 2.2 * u, cy: c.cy - 2 * u, r: 1.4 * u, fill: 'none', stroke: c.glyph, 'stroke-width': 1.1 }));
      return n;
    },
  };

  /* ---- solar ---- */
  MARKERS.solar = {
    panel: (c) => {
      const u = c.R / 10;
      const n = [mk('path', { d: `M ${c.cx - c.R} ${c.cy + c.R * 0.66} L ${c.cx - c.R * 0.6} ${c.cy - c.R * 0.66} L ${c.cx + c.R} ${c.cy - c.R * 0.66} L ${c.cx + c.R * 0.6} ${c.cy + c.R * 0.66} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.3, 'stroke-linejoin': 'round' })];
      for (let i = 1; i <= 2; i++) n.push(ln(c, c.cx - c.R + i * c.R * 0.53, c.cy + c.R * 0.66, c.cx - c.R * 0.6 + i * c.R * 0.53, c.cy - c.R * 0.66, 1));
      n.push(ln(c, c.cx - c.R * 0.8, c.cy, c.cx + c.R * 0.8, c.cy, 1));
      return n;
    },
    array: (c) => {
      const u = c.R / 10;
      const one = (dy) => mk('path', { d: `M ${c.cx - c.R} ${c.cy + dy + c.R * 0.3} L ${c.cx - c.R * 0.75} ${c.cy + dy - c.R * 0.3} L ${c.cx + c.R} ${c.cy + dy - c.R * 0.3} L ${c.cx + c.R * 0.75} ${c.cy + dy + c.R * 0.3} Z`, fill: c.fill, stroke: c.line, 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
      return [one(-c.R * 0.42), one(c.R * 0.5)];
    },
  };

  /* ---- sense ---- the honest fallback: a disc that carries its type's icon.
   * Every device that has no more specific family still gets variants here, so
   * "pick a look" is never an empty list. */
  MARKERS.sense = {
    disc: (c) => [body(c)],
    tag: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.9, c.R * 1.3, 3 * u)];
    },
    square: (c) => {
      const u = c.R / 10;
      return [boxBody(c, c.R * 1.7, c.R * 1.7, 1.4 * u)];
    },
    diamond: (c) => [mk('path', { d: `M ${c.cx} ${c.cy - c.R} L ${c.cx + c.R} ${c.cy} L ${c.cx} ${c.cy + c.R} L ${c.cx - c.R} ${c.cy} Z`, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 })],
  };

  /* ---- chandelier ----
   * The one family here that reads `c.p` — every other marker's look is
   * chosen by NAME (variant), never by a number on the item — because a
   * chandelier's arm count is exactly the kind of thing a real one has a
   * specific number of, the same reason a fan's blade count is a number and
   * not five separate variants called "3 blades", "4 blades"... `count`
   * already means "how many lamps for the lighting model to add up" for
   * every fixture that has it (`lighting.js`), so reading it here for the
   * arm count too means the drawing and the lumen total can never disagree
   * about how many lights are on this one marker. */
  MARKERS.chandelier = {
    classic: (c) => {
      const n = Math.max(3, Math.min(12, Math.round(num(c.p.count, 6))));
      const arm = c.R * 0.82;
      const nodes = [dot(c, c.cx, c.cy, c.R * 0.2, c.line)];
      for (let i = 0; i < n; i++) {
        const a = (c.facing + (i * 360) / n) * Math.PI / 180;
        const ex = c.cx + Math.cos(a) * arm, ey = c.cy + Math.sin(a) * arm;
        nodes.push(ln(c, c.cx, c.cy, ex, ey, 1));
        nodes.push(mk('circle', { cx: ex, cy: ey, r: c.R * 0.17, fill: c.on ? c.accent : c.fill, stroke: c.line, 'stroke-width': 1, opacity: c.on ? 0.4 + 0.6 * num(c.bright, 1) : 1 }));
      }
      return nodes;
    },
    /* A drum shade with the arms' lamps peeking out along its lower rim —
     * the modern-fixture answer to the classic candle-arm frame above. */
    drum: (c) => {
      const n = Math.max(3, Math.min(10, Math.round(num(c.p.count, 5))));
      const w = c.R * 1.5, h = c.R * 1.05;
      const nodes = [boxBody(c, w, h, c.R * 0.12)];
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const x = c.cx - w / 2 + 0.14 * w + t * 0.72 * w;
        nodes.push(bulbDot(c, x, c.cy + h / 2 - c.R * 0.08, c.R * 0.09));
      }
      return nodes;
    },
  };

  /* ---- pendant ---- a light hung from a cord, the cord itself part of what
   * says "hanging fixture" rather than "ceiling fixture" at a glance. */
  MARKERS.pendant = {
    dome: (c) => [
      ln(c, c.cx, c.cy - c.R, c.cx, c.cy - c.R * 0.42, 1.2),
      mk('path', { d: `M ${c.cx - c.R * 0.78} ${c.cy - c.R * 0.1} A ${c.R * 0.78} ${c.R * 0.55} 0 0 1 ${c.cx + c.R * 0.78} ${c.cy - c.R * 0.1}`, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }),
      ln(c, c.cx - c.R * 0.78, c.cy - c.R * 0.1, c.cx + c.R * 0.78, c.cy - c.R * 0.1, 1.3),
      bulbDot(c, c.cx, c.cy + c.R * 0.14, c.R * 0.15),
    ],
    drum: (c) => [
      ln(c, c.cx, c.cy - c.R, c.cx, c.cy - c.R * 0.5, 1.2),
      boxBody(c, c.R * 1.05, c.R * 0.85, c.R * 0.1),
      bulbDot(c, c.cx, c.cy + c.R * 0.42, c.R * 0.14),
    ],
    globe: (c) => [
      ln(c, c.cx, c.cy - c.R, c.cx, c.cy - c.R * 0.6, 1.2),
      mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.6, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }),
      bulbDot(c, c.cx, c.cy, c.R * 0.24),
    ],
    /* Several small pendants at staggered heights on one line — the kitchen-
     * island look, and `count` earns its keep again: this is one item on the
     * plan drawing several fittings, which is exactly what the lighting
     * model already assumed "count" meant for a fixture like this. */
    cluster: (c) => {
      const n = Math.max(2, Math.min(6, Math.round(num(c.p.count, 3))));
      const nodes = [];
      const span = c.R * 1.5;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const x = c.cx - span / 2 + span * t;
        const dy = Math.sin(t * Math.PI) * c.R * 0.35;
        nodes.push(ln(c, x, c.cy - c.R, x, c.cy - c.R * 0.35 + dy, 1));
        nodes.push(mk('circle', { cx: x, cy: c.cy + dy, r: c.R * 0.24, fill: c.fill, stroke: c.line, 'stroke-width': 1.2 }));
        nodes.push(bulbDot(c, x, c.cy + dy, c.R * 0.09));
      }
      return nodes;
    },
  };

  /* ---- floor_lamp ---- a pole from the floor to a shade, drawn tall rather
   * than round: at a glance this is the one fixture that isn't overhead. */
  MARKERS.floor_lamp = {
    torchiere: (c) => [
      ln(c, c.cx, c.cy + c.R * 0.92, c.cx, c.cy - c.R * 0.35, 1.4),
      mk('ellipse', { cx: c.cx, cy: c.cy + c.R * 0.92, rx: c.R * 0.42, ry: c.R * 0.12, fill: 'none', stroke: c.line, 'stroke-width': 1.2 }),
      mk('path', { d: `M ${c.cx - c.R * 0.5} ${c.cy - c.R * 0.35} L ${c.cx - c.R * 0.28} ${c.cy - c.R * 0.88} L ${c.cx + c.R * 0.28} ${c.cy - c.R * 0.88} L ${c.cx + c.R * 0.5} ${c.cy - c.R * 0.35} Z`, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }),
      bulbDot(c, c.cx, c.cy - c.R * 0.6, c.R * 0.13),
    ],
    /* A curved arm reaching up and over — the swept overhead shade is the
     * whole visual difference from a torchiere's straight pole. */
    arc: (c) => {
      const headX = c.cx + c.R * 0.55, headY = c.cy - c.R * 0.85;
      return [
        mk('ellipse', { cx: c.cx - c.R * 0.35, cy: c.cy + c.R * 0.92, rx: c.R * 0.4, ry: c.R * 0.11, fill: 'none', stroke: c.line, 'stroke-width': 1.2 }),
        mk('path', { d: `M ${c.cx - c.R * 0.35} ${c.cy + c.R * 0.9} Q ${c.cx - c.R * 0.35} ${c.cy - c.R * 0.7} ${headX} ${headY}`, fill: 'none', stroke: c.line, 'stroke-width': 1.4 }),
        mk('circle', { cx: headX, cy: headY, r: c.R * 0.24, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }),
        bulbDot(c, headX, headY, c.R * 0.1),
      ];
    },
  };

  /* ---- spot ---- the recessed downlight, and the most common fitting in most
   * houses by a wide margin.
   *
   * It shared the generic disc-and-bulb-glyph with seven other fixture types
   * until now, which meant a ceiling full of downlights read as a ceiling full
   * of light bulbs — and on a plan a downlight is not a bulb, it is a trim ring
   * seen from below. The five lamp families above were split out for exactly
   * this reason; this is the sixth and the one that mattered most.
   *
   * Every variant is drawn in terms of `R`, never fixed px, so a resized marker
   * keeps its proportions instead of stranding a glyph in a big circle. */
  MARKERS.spot = {
    /* Trim ring, inner reflector ring, lamp. The standard ceiling symbol. */
    recessed: (c) => [
      body(c),
      mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.56, fill: 'none', stroke: c.glyph, 'stroke-width': 0.9, opacity: 0.75 }),
      bulbDot(c, c.cx, c.cy, c.R * 0.3),
    ],
    /* Adjustable: the lamp sits off-centre toward where it is aimed, and the
     * whole thing turns with `facing`, so a wall-washer aimed at the art reads
     * as aimed rather than as another identical dot. */
    gimbal: (c) => face(c, [
      body(c),
      mk('circle', { cx: c.cx, cy: c.cy - c.R * 0.2, r: c.R * 0.46, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.4 : 1 }),
      bulbDot(c, c.cx, c.cy - c.R * 0.2, c.R * 0.24),
    ]),
    /* Surface mounted: no recess, so the plate reads as sitting proud — a
     * collar OUTSIDE the body rather than a reflector inside it. */
    surface: (c) => [
      mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.62, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }),
      mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.95, fill: 'none', stroke: c.line, 'stroke-width': 1, opacity: 0.6 }),
      bulbDot(c, c.cx, c.cy, c.R * 0.28),
    ],
    /* Narrow-beam COB: a deep can, so the aperture is small against a wide
     * trim and the lamp is a tight point. */
    cob: (c) => [
      body(c),
      mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.7, fill: 'none', stroke: c.glyph, 'stroke-width': 0.8, opacity: 0.5 }),
      mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.4, fill: 'none', stroke: c.glyph, 'stroke-width': 0.8, opacity: 0.7 }),
      bulbDot(c, c.cx, c.cy, c.R * 0.17),
    ],
  };

  /* ---- bollard ---- a short outdoor post light, drawn squat and grounded
   * rather than round-and-floating like every ceiling fixture above. */
  MARKERS.bollard = {
    cylinder: (c) => [
      boxBody(c, c.R * 0.7, c.R * 1.75, c.R * 0.14),
      mk('rect', { x: c.cx - c.R * 0.32, y: c.cy - c.R * 0.08, width: c.R * 0.64, height: c.R * 0.4, rx: c.R * 0.06, fill: c.on ? c.accent : c.glyph, opacity: c.on ? 0.4 + 0.45 * num(c.bright, 1) : 0.4 }),
    ],
    /* A domed cap head on a slim post — the mini street-lamp silhouette. */
    dome_top: (c) => [
      mk('line', { x1: c.cx, y1: c.cy + c.R * 0.85, x2: c.cx, y2: c.cy - c.R * 0.15, stroke: c.line, 'stroke-width': c.R * 0.22 }),
      mk('path', { d: `M ${c.cx - c.R * 0.4} ${c.cy - c.R * 0.15} A ${c.R * 0.4} ${c.R * 0.32} 0 0 1 ${c.cx + c.R * 0.4} ${c.cy - c.R * 0.15} Z`, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }),
      bulbDot(c, c.cx, c.cy - c.R * 0.28, c.R * 0.13),
    ],
  };

  /* ---- garden_spike ---- ground-mounted, so the spike itself is the detail
   * that separates it from anything mounted on a wall or ceiling. */
  MARKERS.garden_spike = {
    spot: (c) => face(c, [
      mk('path', { d: `M ${c.cx} ${c.cy + c.R * 0.95} L ${c.cx - c.R * 0.16} ${c.cy + c.R * 0.35} L ${c.cx + c.R * 0.16} ${c.cy + c.R * 0.35} Z`, fill: c.line }),
      mk('circle', { cx: c.cx, cy: c.cy + c.R * 0.05, r: c.R * 0.42, fill: c.fill, stroke: c.line, 'stroke-width': c.on ? 1.6 : 1.2 }),
      mk('path', { d: `M ${c.cx - c.R * 0.28} ${c.cy - c.R * 0.35} L ${c.cx - c.R * 0.52} ${c.cy - c.R * 0.95} L ${c.cx + c.R * 0.52} ${c.cy - c.R * 0.95} L ${c.cx + c.R * 0.28} ${c.cy - c.R * 0.35} Z`, fill: c.on ? c.accent : c.glyph, opacity: c.on ? 0.2 + 0.3 * num(c.bright, 1) : 0.3 }),
      bulbDot(c, c.cx, c.cy - c.R * 0.02, c.R * 0.14),
    ]),
    /* Flush with the ground, uplighting only — no visible housing above
     * grade at all, which is the entire point of one of these. */
    well: (c) => [
      mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.55, fill: 'none', stroke: c.line, 'stroke-width': 1.6 }),
      mk('circle', { cx: c.cx, cy: c.cy, r: c.R * 0.32, fill: c.on ? c.accent : c.glyph, opacity: c.on ? 0.35 + 0.55 * num(c.bright, 1) : 0.45 }),
    ],
  };

  /* Which variant a family falls back to when a type or item names none. The
   * first key would do, but object order is a fragile thing to hang a
   * drawing on. */
  const MARKER_DEFAULT = {
    fan: 'blades3', camera: 'turret', screen: 'flat', speaker: 'box', cool: 'split',
    heat: 'radiant', water: 'drop', motion: 'dome', contact: 'reed', lock: 'deadbolt',
    alarm: 'bell', plug: 'socket', power: 'symbol', network: 'router', cover: 'curtain',
    laundry: 'frontload', robot: 'round', thermostat: 'dial', energy: 'bolt',
    valve: 'gate', solar: 'panel', sense: 'disc', switch: 'rocker',
    chandelier: 'classic', pendant: 'dome', floor_lamp: 'torchiere',
    bollard: 'cylinder', garden_spike: 'spot', spot: 'recessed',
  };

  /* The variants a family offers, for the editor's picker. */
  function variantsOf(family) {
    return MARKERS[family] ? Object.keys(MARKERS[family]) : [];
  }

  /* Draw one. Falls back family → sense → disc rather than throwing, because a
   * library entry naming a family that has been renamed should degrade to a
   * plain marker, not to a blank plan. */
  function marker(family, variant, c) {
    const fam = MARKERS[family] || MARKERS.sense;
    const fn = fam[variant] || fam[MARKER_DEFAULT[family]] || fam[Object.keys(fam)[0]];
    return fn ? fn(c) : MARKERS.sense.disc(c);
  }

  /* ------------------------------------------------------------------ icons */

  /* Each returns nodes drawn inside a box centred on (0,0) roughly 16px across.
   * `col` is applied to BOTH fill and stroke by the caller — see the module
   * header on why that matters. */
  const ICONS = {
    power: () => [
      { tag: 'path', attrs: { d: 'M -4.2 -2.6 A 5.4 5.4 0 1 0 4.2 -2.6', fill: 'none', 'stroke-width': 1.7, 'stroke-linecap': 'round' } },
      { tag: 'line', attrs: { x1: 0, y1: -6.2, x2: 0, y2: -0.6, 'stroke-width': 1.7, 'stroke-linecap': 'round' } },
    ],
    bulb: () => [
      { tag: 'path', attrs: { d: 'M 0 -6 A 4.4 4.4 0 0 1 2.6 1.6 L -2.6 1.6 A 4.4 4.4 0 0 1 0 -6 Z', fill: 'none', 'stroke-width': 1.4 } },
      { tag: 'line', attrs: { x1: -2, y1: 3.4, x2: 2, y2: 3.4, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
      { tag: 'line', attrs: { x1: -1.3, y1: 5.2, x2: 1.3, y2: 5.2, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
    ],
    snowflake: () => {
      const n = [];
      for (let i = 0; i < 3; i++) {
        const a = (i * 60) * Math.PI / 180;
        const dx = Math.cos(a) * 5.6, dy = Math.sin(a) * 5.6;
        n.push({ tag: 'line', attrs: { x1: -dx, y1: -dy, x2: dx, y2: dy, 'stroke-width': 1.3, 'stroke-linecap': 'round' } });
      }
      return n;
    },
    flame: () => [
      { tag: 'path', attrs: { d: 'M 0 5.4 C -3.6 3.4 -3.2 -0.6 -0.7 -2.2 C -1.1 -4 0 -5.4 1.4 -6 C 0.7 -3.8 2.2 -3.2 2.8 -1.4 C 3.6 1 2.2 4 0 5.4 Z', fill: 'none', 'stroke-width': 1.3, 'stroke-linejoin': 'round' } },
    ],
    screen: () => [
      { tag: 'rect', attrs: { x: -6, y: -4.6, width: 12, height: 8.4, rx: 1.2, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'line', attrs: { x1: -3, y1: 6.2, x2: 3, y2: 6.2, 'stroke-width': 1.4, 'stroke-linecap': 'round' } },
    ],
    speaker: () => [
      { tag: 'path', attrs: { d: 'M -4.4 -2.2 L -1.6 -2.2 L 1.6 -5.4 L 1.6 5.4 L -1.6 2.2 L -4.4 2.2 Z', fill: 'none', 'stroke-width': 1.3, 'stroke-linejoin': 'round' } },
      { tag: 'path', attrs: { d: 'M 3.6 -2.6 A 3.6 3.6 0 0 1 3.6 2.6', fill: 'none', 'stroke-width': 1.2 } },
    ],
    gamepad: () => [
      { tag: 'rect', attrs: { x: -6.4, y: -3.4, width: 12.8, height: 6.8, rx: 3.4, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'line', attrs: { x1: -3.8, y1: 0, x2: -1.4, y2: 0, 'stroke-width': 1.2 } },
      { tag: 'line', attrs: { x1: -2.6, y1: -1.2, x2: -2.6, y2: 1.2, 'stroke-width': 1.2 } },
      { tag: 'circle', attrs: { cx: 3, cy: 0, r: 1.1, 'stroke-width': 0 } },
    ],
    motion: () => [
      { tag: 'circle', attrs: { cx: 0, cy: 0, r: 1.9, 'stroke-width': 0 } },
      { tag: 'path', attrs: { d: 'M -3.6 -3.6 A 5.1 5.1 0 0 1 3.6 -3.6', fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'path', attrs: { d: 'M -5.6 -5.6 A 7.9 7.9 0 0 1 5.6 -5.6', fill: 'none', 'stroke-width': 1.1, opacity: 0.7 } },
    ],
    contact: () => [
      { tag: 'rect', attrs: { x: -5.6, y: -4.2, width: 5, height: 8.4, rx: 1, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'rect', attrs: { x: 0.6, y: -4.2, width: 5, height: 8.4, rx: 1, fill: 'none', 'stroke-width': 1.3 } },
    ],
    camera: () => [
      { tag: 'path', attrs: { d: 'M -5.6 -3 L 1.2 -3 L 1.2 3 L -5.6 3 Z', fill: 'none', 'stroke-width': 1.3, 'stroke-linejoin': 'round' } },
      { tag: 'path', attrs: { d: 'M 1.2 -1 L 5.6 -3.4 L 5.6 3.4 L 1.2 1 Z', fill: 'none', 'stroke-width': 1.3, 'stroke-linejoin': 'round' } },
    ],
    droplet: () => [
      { tag: 'path', attrs: { d: 'M 0 -5.8 C 3.2 -1.8 4.4 0.4 4.4 2.2 A 4.4 4.4 0 0 1 -4.4 2.2 C -4.4 0.4 -3.2 -1.8 0 -5.8 Z', fill: 'none', 'stroke-width': 1.3, 'stroke-linejoin': 'round' } },
    ],
    solar: () => [
      { tag: 'path', attrs: { d: 'M -6 4 L -3.6 -4 L 3.6 -4 L 6 4 Z', fill: 'none', 'stroke-width': 1.3, 'stroke-linejoin': 'round' } },
      { tag: 'line', attrs: { x1: -4.8, y1: 0, x2: 4.8, y2: 0, 'stroke-width': 1 } },
      { tag: 'line', attrs: { x1: 0, y1: -4, x2: 0, y2: 4, 'stroke-width': 1 } },
    ],
    washer: () => [
      { tag: 'rect', attrs: { x: -5.4, y: -5.4, width: 10.8, height: 10.8, rx: 1.6, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'circle', attrs: { cx: 0, cy: 0.8, r: 3.2, fill: 'none', 'stroke-width': 1.2 } },
    ],
    lock: () => [
      { tag: 'rect', attrs: { x: -4.4, y: -1, width: 8.8, height: 6.4, rx: 1.4, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'path', attrs: { d: 'M -2.4 -1 L -2.4 -3.4 A 2.4 2.4 0 0 1 2.4 -3.4 L 2.4 -1', fill: 'none', 'stroke-width': 1.3 } },
    ],
    valve: () => [
      { tag: 'circle', attrs: { cx: 0, cy: 0, r: 4, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'line', attrs: { x1: -6, y1: 0, x2: 6, y2: 0, 'stroke-width': 1.4 } },
    ],
    thermostat: () => [
      { tag: 'circle', attrs: { cx: 0, cy: 0, r: 5.2, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'line', attrs: { x1: 0, y1: 0, x2: 0, y2: -3.4, 'stroke-width': 1.5, 'stroke-linecap': 'round' } },
    ],
    curtain: () => [
      { tag: 'line', attrs: { x1: -6, y1: -4.6, x2: 6, y2: -4.6, 'stroke-width': 1.4 } },
      { tag: 'path', attrs: { d: 'M -4 -4.6 C -4 0 -5.2 3 -4.4 5.4', fill: 'none', 'stroke-width': 1.2 } },
      { tag: 'path', attrs: { d: 'M 4 -4.6 C 4 0 5.2 3 4.4 5.4', fill: 'none', 'stroke-width': 1.2 } },
    ],
    energy: () => [
      { tag: 'path', attrs: { d: 'M 1.4 -6 L -3.6 0.6 L 0 0.6 L -1.4 6 L 3.6 -0.6 L 0 -0.6 Z', fill: 'none', 'stroke-width': 1.3, 'stroke-linejoin': 'round' } },
    ],
    router: () => [
      { tag: 'rect', attrs: { x: -6, y: 0.6, width: 12, height: 4.4, rx: 1.4, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'line', attrs: { x1: -2.6, y1: 0.6, x2: -4.4, y2: -4.4, 'stroke-width': 1.2 } },
      { tag: 'line', attrs: { x1: 2.6, y1: 0.6, x2: 4.4, y2: -4.4, 'stroke-width': 1.2 } },
    ],
    bell: () => [
      { tag: 'path', attrs: { d: 'M -4 2.6 C -4 -1 -3.4 -4.6 0 -4.6 C 3.4 -4.6 4 -1 4 2.6 Z', fill: 'none', 'stroke-width': 1.3, 'stroke-linejoin': 'round' } },
      { tag: 'line', attrs: { x1: -5.2, y1: 2.6, x2: 5.2, y2: 2.6, 'stroke-width': 1.3 } },
      { tag: 'circle', attrs: { cx: 0, cy: 4.8, r: 1.1, 'stroke-width': 0 } },
    ],
    vacuum: () => [
      { tag: 'circle', attrs: { cx: 0, cy: 0, r: 5.4, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'line', attrs: { x1: -5.4, y1: -2, x2: 5.4, y2: -2, 'stroke-width': 1.2 } },
    ],
    plug: () => [
      { tag: 'path', attrs: { d: 'M -3 -5.4 L -3 -1.6 A 3 3 0 0 0 3 -1.6 L 3 -5.4', fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'line', attrs: { x1: 0, y1: 1.4, x2: 0, y2: 5.4, 'stroke-width': 1.4, 'stroke-linecap': 'round' } },
    ],
    fanBlades: () => [
      { tag: 'circle', attrs: { cx: 0, cy: 0, r: 1.6, 'stroke-width': 0 } },
    ],
    dot: () => [{ tag: 'circle', attrs: { cx: 0, cy: 0, r: 2.4, 'stroke-width': 0 } }],

    /* The logic layer — automations, scenes, helpers. Nothing here is a thing
     * you can point at in a room, so each one has to read as its VERB: a rule
     * that runs, a mood you choose, a value you set. */
    robot: () => [
      { tag: 'rect', attrs: { x: -4.4, y: -3.2, width: 8.8, height: 7, rx: 2, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'line', attrs: { x1: 0, y1: -5.8, x2: 0, y2: -3.2, 'stroke-width': 1.2 } },
      { tag: 'circle', attrs: { cx: -1.7, cy: -0.6, r: 0.95, 'stroke-width': 0 } },
      { tag: 'circle', attrs: { cx: 1.7, cy: -0.6, r: 0.95, 'stroke-width': 0 } },
      { tag: 'line', attrs: { x1: -1.8, y1: 2, x2: 1.8, y2: 2, 'stroke-width': 1.2, 'stroke-linecap': 'round' } },
    ],
    sparkle: () => [
      { tag: 'path', attrs: { d: 'M 0 -6 L 1.5 -1.6 L 5.9 0 L 1.5 1.6 L 0 6 L -1.5 1.6 L -5.9 0 L -1.5 -1.6 Z', 'stroke-width': 1, 'stroke-linejoin': 'round' } },
    ],
    play: () => [
      { tag: 'path', attrs: { d: 'M -2.6 -4.6 L 4.6 0 L -2.6 4.6 Z', 'stroke-width': 1.1, 'stroke-linejoin': 'round' } },
    ],
    toggle: () => [
      { tag: 'rect', attrs: { x: -5.6, y: -3, width: 11.2, height: 6, rx: 3, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'circle', attrs: { cx: 2.5, cy: 0, r: 1.8, 'stroke-width': 0 } },
    ],
    press: () => [
      { tag: 'circle', attrs: { cx: 0, cy: 0, r: 5.2, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'circle', attrs: { cx: 0, cy: 0, r: 2.2, 'stroke-width': 0 } },
    ],
    /* Three tracks with their handles at different stops — a set of values, not
     * one. A single slider reads as a dimmer, which is a different thing. */
    slider: () => {
      const n = [];
      const at = [-1.6, 2.2, -2.8];
      for (let i = 0; i < 3; i++) {
        const y = -3.4 + i * 3.4;
        n.push({ tag: 'line', attrs: { x1: -5.4, y1: y, x2: 5.4, y2: y, 'stroke-width': 1.1, 'stroke-linecap': 'round' } });
        n.push({ tag: 'circle', attrs: { cx: at[i], cy: y, r: 1.5, 'stroke-width': 0 } });
      }
      return n;
    },
    list: () => {
      const n = [];
      for (let i = 0; i < 3; i++) {
        const y = -3.4 + i * 3.4;
        n.push({ tag: 'circle', attrs: { cx: -4.2, cy: y, r: 1, 'stroke-width': 0 } });
        n.push({ tag: 'line', attrs: { x1: -1.8, y1: y, x2: 5.2, y2: y, 'stroke-width': 1.2, 'stroke-linecap': 'round' } });
      }
      return n;
    },
    timer: () => [
      { tag: 'circle', attrs: { cx: 0, cy: 0.8, r: 5, fill: 'none', 'stroke-width': 1.3 } },
      { tag: 'line', attrs: { x1: 0, y1: 0.8, x2: 0, y2: -2.4, 'stroke-width': 1.3, 'stroke-linecap': 'round' } },
      { tag: 'line', attrs: { x1: 0, y1: 0.8, x2: 2.6, y2: 0.8, 'stroke-width': 1.2, 'stroke-linecap': 'round' } },
      { tag: 'line', attrs: { x1: -2, y1: -5.6, x2: 2, y2: -5.6, 'stroke-width': 1.3, 'stroke-linecap': 'round' } },
    ],
    counter: () => [
      { tag: 'line', attrs: { x1: -1.9, y1: -5, x2: -3.1, y2: 5, 'stroke-width': 1.2, 'stroke-linecap': 'round' } },
      { tag: 'line', attrs: { x1: 3.1, y1: -5, x2: 1.9, y2: 5, 'stroke-width': 1.2, 'stroke-linecap': 'round' } },
      { tag: 'line', attrs: { x1: -5, y1: -1.9, x2: 5, y2: -1.9, 'stroke-width': 1.2, 'stroke-linecap': 'round' } },
      { tag: 'line', attrs: { x1: -5, y1: 1.9, x2: 5, y2: 1.9, 'stroke-width': 1.2, 'stroke-linecap': 'round' } },
    ],
  };

  function icon(name, cx, cy, col, scale) {
    const maker = ICONS[name] || ICONS.dot;
    const s = num(scale, 1);
    return maker().map((n) => ({
      tag: n.tag,
      attrs: Object.assign({}, n.attrs, {
        // Both fill and stroke: a drawn icon recoloured on only one of them
        // half-changes and reads as a rendering bug.
        fill: n.attrs.fill === 'none' ? 'none' : col,
        stroke: col,
        transform: `translate(${cx} ${cy})${s !== 1 ? ` scale(${s})` : ''}`,
      }),
    }));
  }

  function furniture(name, c) {
    const fn = FURNITURE[name] || FURNITURE.rect;
    return fn(c);
  }

  /* Furniture has no family/variant registry the way MARKERS does — one
   * library shape is one drawing function that branches on `c.p.variant`
   * itself (see `plant`/`tree` above). This is just the list of names each
   * one recognises, so the editor's picker can offer them without a second
   * copy of the list living in the UI layer. */
  const FURNITURE_VARIANTS = {
    chair: ['dining', 'office', 'stool'],
    car: ['sedan', 'suv', 'pickup'],
    pool: ['rectangular', 'oval', 'kidney'],
    grill: ['cart', 'kamado'],
    bike: ['city', 'road', 'cargo'],
    scooter: ['classic', 'maxi', 'vintage'],
    motorcycle: ['standard', 'sport', 'cruiser'],
    plant: ['potted', 'bush', 'succulent', 'fern', 'flowering', 'monstera'],
    tree: ['deciduous', 'pine', 'palm', 'flowering'],
    stairs: ['straight', 'l_shaped', 'u_switchback', 'winder', 'spiral'],
    lift: ['traction', 'vacuum', 'platform', 'dumbwaiter'],
    screen: ['flat', 'curved', 'crt', 'projector'],
    tv_unit: ['console', 'cabinet', 'open_shelf', 'floating'],
    water: ['rect', 'cylindrical', 'sump'],
    bathtub: ['alcove', 'corner', 'freestanding', 'jacuzzi', 'shower_bath'],
    wc: ['close_coupled', 'wall_hung', 'back_to_wall', 'squat'],
    basin: ['counter_top', 'under_counter', 'pedestal', 'wall_hung'],
    shower: ['square', 'quadrant', 'walk_in', 'wet_room'],
  };
  function furnitureVariantsOf(shape) {
    return FURNITURE_VARIANTS[shape] || [];
  }

  /* The footprint a look actually has, in feet, where it differs enough from
   * the type's own default that keeping the old one draws a lie: a CRT is not
   * five inches deep, a projection screen is not four and a half feet wide, and
   * an L-shaped flight does not fit a 3.5 x 10 stairwell — that box is the
   * shape of a straight run and nothing else.
   *
   * The editor applies one only when the item is still at its type's default
   * size, so choosing a look never silently undoes a size somebody set. */
  const FURNITURE_VARIANT_SIZES = {
    screen: { flat: [4.5, 0.4], curved: [5, 0.8], crt: [3.2, 2], projector: [8, 0.6] },
    stairs: {
      straight: [3.5, 10], l_shaped: [7.5, 7.5], u_switchback: [8, 10],
      winder: [7, 7], spiral: [6, 6],
    },
    lift: { traction: [3.5, 4.5], vacuum: [4, 4], platform: [4, 5], dumbwaiter: [2, 2] },
    water: { rect: [4.25, 8.5], cylindrical: [5, 5], sump: [8, 6] },
    /* Sanitaryware is sold in a handful of stock sizes and a plan that draws
     * them all at one size is wrong about the thing that matters most in a
     * bathroom, which is whether it FITS. A corner tub is square, a
     * freestanding one needs its clearance, and a squat pan is a fraction of a
     * close-coupled WC's footprint. */
    bathtub: {
      alcove: [5.5, 2.6], corner: [4.5, 4.5], freestanding: [5.6, 2.9],
      jacuzzi: [6, 3.3], shower_bath: [5.5, 2.8],
    },
    wc: {
      close_coupled: [1.4, 2.5], wall_hung: [1.3, 1.9],
      back_to_wall: [1.4, 2.2], squat: [1.9, 2.6],
    },
    basin: {
      counter_top: [2.5, 1.7], under_counter: [2.5, 1.7],
      pedestal: [1.9, 1.6], wall_hung: [1.8, 1.4],
    },
    shower: {
      square: [3, 3], quadrant: [3, 3], walk_in: [4.5, 3], wet_room: [4, 4],
    },
  };
  function furnitureVariantSize(shape, variant) {
    const m = FURNITURE_VARIANT_SIZES[shape];
    return (m && m[variant]) || null;
  }

  return {
    FURNITURE, ICONS, MARKERS, MARKER_DEFAULT, FURNITURE_VARIANTS,
    FURNITURE_VARIANT_SIZES, SWITCH_MAX_GANGS,
    furniture, icon, marker, variantsOf, furnitureVariantsOf, furnitureVariantSize,
    names: {
      furniture: Object.keys(FURNITURE),
      icons: Object.keys(ICONS),
      families: Object.keys(MARKERS),
    },
  };
}));
