/* The drawing surface.
 *
 * Paint is one-way: scene = PlanScene.build(...), then every primitive becomes
 * an SVG element. Interaction never mutates the DOM directly — it mutates the
 * project and repaints. That keeps "what is on screen" a pure function of the
 * project, which is why undo can be a snapshot restore and nothing has to
 * remember how to un-draw anything.
 *
 * Zoom scales the ELEMENT (width/height) while the viewBox stays in scene
 * units, so every coordinate in this file is scene-space and hit-testing never
 * has to unwind a transform.
 */
window.Canvas = (function () {
  'use strict';

  /* The drag-and-drop MIME type a library button's dragstart sets — see
   * panels.js's renderLibrary(). Must match exactly; it is not read from a
   * shared constant because these are two <script> globals, not modules. */
  const FPS_DND_TYPE = 'application/x-fps-type';

  const NS = 'http://www.w3.org/2000/svg';
  const S = Store.S;
  let svg, wrap, scene = null, onStatus = () => {}, onInspect = () => {};

  /* Every pointer currently down on the canvas, in client coordinates. One is
   * a drag; TWO is a pinch, and there is no other way to say "zoom" on a
   * screen with no wheel, no Ctrl key and no status bar within reach of the
   * thumb already holding the tablet. `touch-action: none` on the canvas hands
   * us every touch, so if this file does not implement a gesture the device
   * simply does not have it. */
  const pointers = new Map();
  let gesture = null;            // { dist, mid, zoom } while two fingers are down
  /* Where the current press went down, recorded before anything else looks at
   * it. Kept OUTSIDE the drag record on purpose: the tap threshold and the
   * double-tap both need it even when no drag was started at all, and a drag
   * that fails half-way through being built — `setPointerCapture` throws if the
   * pointer has already gone — would otherwise take the origin with it. */
  let press = { x: 0, y: 0, t: 0, target: null };
  let spaceHeld = false;         // hold Space to pan, the way every editor does
  let lastTap = null;            // for the touch double-tap that opens the inspector

  /* Which kind of pointer was last used, NOT which kind the device has. A
   * Surface has both: a mouse plugged into a tablet should get the small
   * precise handles it can hit, and the same machine ten seconds later under a
   * finger should get the fat ones. A media query answered once at load cannot
   * say that; the events can. */
  let pointerKind = 'mouse';
  const touching = () => pointerKind === 'touch';
  /* Screen pixels. A finger covers about 9 mm and lands where it looked, not
   * where it was: the handle has to be bigger and the "did this move or was it
   * a tap" threshold has to be looser, or every tap smears whatever it hit. */
  const HANDLE_PX = () => (touching() ? 15 : 10);
  const KNOB_PX = () => (touching() ? 11 : 6);
  const SLOP_PX = () => (touching() ? 9 : 3);

  function setPointerKind(type) {
    const kind = type === 'touch' ? 'touch' : 'mouse';
    if (kind === pointerKind) return;
    pointerKind = kind;
    if (S.selection || S.multi.length) drawSelection();
  }

  const el = (tag, attrs, text) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null) continue;
      n.setAttribute(k, v);
    }
    if (text !== undefined) n.textContent = text;
    return n;
  };

  function nodeToEl(n) {
    const e = el(n.tag, n.attrs, n.text);
    for (const c of n.children || []) e.appendChild(nodeToEl(c));
    return e;
  }

  /* ---------- coordinates ---------- */

  function toScene(ev) {
    const r = svg.getBoundingClientRect();
    const z = S.view.zoom;
    return { x: (ev.clientX - r.left) / z, y: (ev.clientY - r.top) / z };
  }

  function toFeet(pt) {
    const P = scene.projector;
    return { x: P.invX(pt.x), y: P.invY(pt.y) };
  }

  function feetAt(ev, doSnap) {
    const f = toFeet(toScene(ev));
    return doSnap === false ? f : { x: Store.snap(f.x), y: Store.snap(f.y) };
  }

  /* ---------- painting ---------- */

  function paint() {
    const floor = Store.floor();
    if (!floor) { svg.replaceChildren(); return; }
    const theme = Store.theme();

    scene = PlanScene.build(S.project, floor, S.library, theme, {
      grid: { show: S.view.showGrid, size: S.view.gridSize < 1 ? 1 : S.view.gridSize },
      states: S.view.live ? S.states : {},
      boundaries: S.boundaries,
      flooring: S.flooring,
      when: S.when,
    });

    svg.setAttribute('viewBox', `0 0 ${scene.width} ${scene.height}`);
    svg.setAttribute('width', scene.width * S.view.zoom);
    svg.setAttribute('height', scene.height * S.view.zoom);
    svg.style.background = theme.sheet || '#fff';

    const frag = document.createDocumentFragment();
    const defs = el('defs');
    for (const n of scene.layers.defs) defs.appendChild(nodeToEl(n));
    frag.appendChild(defs);

    for (const key of scene.order) {
      /* Every rendered layer is inert; all hit-testing happens in #fps-hits
       * below, which is the one place that decides what a click means. */
      const g = el('g', { id: 'fps-' + key, 'pointer-events': 'none' });
      for (const n of scene.layers[key] || []) g.appendChild(nodeToEl(n));
      frag.appendChild(g);
    }

    /* Invisible hit targets for items, sized from each type's own tap radius —
     * the same number the finished dashboard card uses, so what is easy to grab
     * here is what will be easy to tap there. */
    const hits = el('g', { id: 'fps-hits' });

    /* Rooms first, so every marker and opening added below sits ON TOP of them.
     * SVG resolves a click to the topmost sibling, so this order is what makes
     * "tap the lamp, not the room it stands in" true — the same back-to-front
     * rule `PlanScene.hitTargets()` documents for the dashboard card.
     *
     * This is also the fix for rooms not being selectable AT ALL. The room hit
     * shape used to be attached in the layer loop above, guarded by
     * `key === 'floors'` — but the renderer's layer is called `flooring`, so
     * that branch never ran and no room ever got a `data-room` attribute. Every
     * layer is `pointer-events: none`, so clicking a room reached nothing and
     * the only way to select one was through code.
     *
     * The shape is the room's own outline, so an L-shape and a curved wall are
     * hit exactly where they are drawn rather than by their bounding box. The
     * transparent STROKE is what makes clicking the wall itself select the
     * room: a wall is not a separate object, it is this polygon's edge. */
    for (const room of floor.rooms || []) {
      const P = scene.projector;
      const pts = PlanScene.roomPoints(room);
      if (!pts.length) continue;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${P.X(p[0])} ${P.Y(p[1])}`).join(' ') + ' Z';
      const e = el('path', {
        d, fill: 'transparent', stroke: 'transparent', 'stroke-width': 12,
        class: 'hit room-hit',
      });
      e.dataset.room = room.id;
      hits.appendChild(e);
    }

    /* Item targets come from `PlanScene.hitTargets()` — the SAME function the
     * dashboard card hit-tests with, so what is easy to grab here is what will
     * be easy to tap there.
     *
     * This used to be a third hand-written copy of that geometry, and it had
     * drifted into two bugs the review found. Every non-furniture marker got a
     * fixed `render.tap` circle, so a signage board six feet wide was clickable
     * only within 17px of its middle; and a perimeter cove got that same circle
     * at a point in the middle of the room, so the strip you can see was never
     * the thing you could click. The shared function knows how big a marker is
     * DRAWN and traces a cove's actual outline.
     *
     * It also sorts biggest-first, so the smallest thing under the pointer ends
     * up last and therefore on top: a small light standing on a big board is
     * reached before the board, rather than whichever happened to be placed
     * later winning. Rooms, openings and the name chips keep their own loops —
     * the editor selects a sub-rect on its own id where the card resolves it to
     * the primary room, and a draggable badge has to beat a marker here and
     * must not there. */
    for (const t of PlanScene.hitTargets(floor, S.library, scene.projector, S.states, null)) {
      if (t.target !== 'item') continue;
      const e = el(t.tag, Object.assign({ class: 'hit item-hit' + (t.outline ? ' hit-outline' : '') }, t.attrs));
      e.dataset.item = t.id;
      hits.appendChild(e);
    }
    /* Openings are objects too — a door with a sensor animates, so it has to be
     * selectable to be bound. Its hit target is the opening's own span. */
    for (const op of floor.openings || []) {
      const room = (floor.rooms || []).find((r) => r.id === op.room);
      if (!room) continue;
      const edge = PlanScene.roomEdges(room).find((e) => e.wall === op.wall);
      if (!edge) continue;
      const P = scene.projector;
      const at = op.at || 0, w = op.w || 2.5;
      const a = edge.horizontal ? [at, edge.fixed] : [edge.fixed, at];
      const b = edge.horizontal ? [at + w, edge.fixed] : [edge.fixed, at + w];
      const e = el('line', {
        x1: P.X(a[0]), y1: P.Y(a[1]), x2: P.X(b[0]), y2: P.Y(b[1]),
        stroke: 'transparent', 'stroke-width': 14, class: 'hit item-hit',
      });
      e.dataset.opening = op.id;
      hits.appendChild(e);
    }
    for (const chip of scene.chips || []) {
      const e = el('rect', { x: chip.x, y: chip.y, width: chip.width, height: chip.height,
        transform: chip.rot, fill: 'transparent', class: 'hit room-label-hit', style: 'cursor:move' });
      e.dataset.roomLabel = chip.roomId;
      hits.appendChild(e);
    }
    frag.appendChild(hits);

    frag.appendChild(el('g', { id: 'fps-overlay', 'pointer-events': 'none' }));
    svg.replaceChildren(frag);

    drawSelection();
  }

  function overlay() { return svg.querySelector('#fps-overlay'); }

  function selectedLabel() {
    return S.selection?.kind === 'room' && S.selection.part === 'label' ? Store.selected() : null;
  }

  function labelBox(room) { return scene?.chips.find(c => c.roomId === room.id); }

  // Use the renderer's placed box, including its automatic collision avoidance.
  // Starting at the room centroid instead makes the first drag jump.
  function labelCentre(room) {
    const b = labelBox(room), P = scene.projector;
    return b ? [P.invX(b.x + b.width / 2), P.invY(b.y + b.height / 2)] : (room.chip_at || PlanScene.roomCentroid(room));
  }

  function keepLabelOnFloor(room, at, scale) {
    const b = labelBox(room), extent = Store.floor().extent || { w: 40, h: 40 };
    const factor = scale / Math.max(.25, Math.min(4, Number(room.chip_scale) || 1));
    const angle = (room.chip_rotate || 0) * Math.PI / 180;
    const w = b ? b.width * factor / scene.projector.ppf : 0;
    const h = b ? b.height * factor / scene.projector.ppf : 0;
    const rx = (Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle))) / 2;
    const ry = (Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle))) / 2;
    const clamp = (value, half, limit) => half * 2 >= limit ? limit / 2 : Math.max(half, Math.min(limit - half, value));
    return [round4(clamp(at[0], rx, extent.w)), round4(clamp(at[1], ry, extent.h))];
  }

  function drawAlignGuides(ov, P) {
    if (!alignGuides || !scene) return;
    if (alignGuides.guideX !== null) {
      ov.appendChild(el('line', { x1: P.X(alignGuides.guideX), y1: 0, x2: P.X(alignGuides.guideX), y2: scene.height, class: 'align-guide' }));
    }
    if (alignGuides.guideY !== null) {
      ov.appendChild(el('line', { x1: 0, y1: P.Y(alignGuides.guideY), x2: scene.width, y2: P.Y(alignGuides.guideY), class: 'align-guide' }));
    }
  }

  /* The floating "12.0 ft x 8.5 ft" readout set by a room/item resize drag —
   * same lifecycle as `alignGuides` above (set in move(), cleared in end()),
   * drawn as a small pill so it reads over the plan at any theme. */
  function drawDimLabel(ov) {
    if (!dimLabel) return;
    const g = el('g', { class: 'dim-label' });
    const w = dimLabel.text.length * 6.2 + 12;
    g.appendChild(el('rect', { x: dimLabel.x - w / 2, y: dimLabel.y - 10, width: w, height: 18, rx: 4 }));
    const t = el('text', { x: dimLabel.x, y: dimLabel.y + 4, 'text-anchor': 'middle' });
    t.textContent = dimLabel.text;
    g.appendChild(t);
    ov.appendChild(g);
  }

  /* Hover distance guides live in their own subgroup so a mousemove can
   * refresh just this — via `updateMeasureHover()` below — without paint()'s
   * full scene rebuild, the same reasoning `ghost()` follows for the poly/
   * aperture tools. `drawSelection()` recreates it empty on every real
   * repaint; the hover handler is the only thing that ever fills it in. */
  function drawMeasureAnchor(ov) {
    ov.appendChild(el('g', { id: 'fps-measure' }));
  }

  /* Four small pill labels, one per side of whichever boundary is in play —
   * the selected room's own box, or the plan's own extent when nothing (or
   * something that isn't a room) is selected — each showing the cursor's
   * distance to that edge. This is a hover aid only: it never touches the
   * project, and it draws nothing while a drag is in progress (the resize/
   * vertex drags already show `dimLabel` instead). */
  function updateMeasureHover(raw) {
    const g = svg.querySelector('#fps-measure');
    if (!g) return;
    g.replaceChildren();
    const cfg = guidesCfg();
    if (!cfg.enabled || !scene) return;
    const P = scene.projector;
    const sel = Store.selected();
    let left, top, right, bottom;
    if (sel && S.selection && S.selection.kind === 'room') {
      const [bx, by, bw, bh] = PlanScene.roomBBox(sel);
      left = bx; top = by; right = bx + bw; bottom = by + bh;
    } else {
      const extent = Store.floor().extent || { w: 40, h: 40 };
      left = 0; top = 0; right = extent.w; bottom = extent.h;
    }
    if (raw.x < left || raw.x > right || raw.y < top || raw.y > bottom) return;
    const pill = (x, y, text) => {
      const w = text.length * 6.2 + 10;
      const node = el('g', { class: 'dim-label measure-hover' });
      node.appendChild(el('rect', { x: x - w / 2, y: y - 9, width: w, height: 16, rx: 3 }));
      const t = el('text', { x, y: y + 3.5, 'text-anchor': 'middle' });
      t.textContent = text;
      node.appendChild(t);
      g.appendChild(node);
    };
    pill(P.X(raw.x), P.Y(top) + 10, fmtDist(raw.y - top, cfg.units));
    pill(P.X(right) - 22, P.Y(raw.y), fmtDist(right - raw.x, cfg.units));
    pill(P.X(raw.x), P.Y(bottom) - 10, fmtDist(bottom - raw.y, cfg.units));
    pill(P.X(left) + 22, P.Y(raw.y), fmtDist(raw.x - left, cfg.units));
  }

  /* A plain outline per member, deliberately with none of the single-
   * selection's handles: resize/rotate/reshape are all "one thing at a
   * time" operations by nature (what would resizing three different device
   * types by the same drag even mean?), so a multi-selection only ever
   * offers move/duplicate/delete/nudge — every one of which already reads
   * `S.multi` directly and does not need a handle to grab. */
  function drawMultiOutline(ov, P) {
    const floor = Store.floor();
    for (const m of S.multi) {
      if (m.kind === 'room') {
        const room = (floor.rooms || []).find((r) => r.id === m.id);
        if (!room) continue;
        const pts = PlanScene.roomPoints(room);
        const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${P.X(p[0])} ${P.Y(p[1])}`).join(' ') + ' Z';
        ov.appendChild(el('path', { d, class: 'sel-outline multi' }));
      } else {
        const item = (floor.items || []).find((i) => i.id === m.id);
        if (!item) continue;
        const t = PlanScene.resolveType(S.library, item) || {};
        if ((item.kind || t.kind) === 'furniture') {
          const w = (item.props && item.props.w) || 3, h = (item.props && item.props.h) || 3;
          ov.appendChild(el('rect', { x: P.X(item.at[0]) - 2, y: P.Y(item.at[1]) - 2, width: P.S(w) + 4, height: P.S(h) + 4, class: 'sel-outline multi' }));
        } else {
          ov.appendChild(el('circle', { cx: P.X(item.at[0]), cy: P.Y(item.at[1]), r: ((t.render && t.render.tap) || 17) + 3, class: 'sel-outline multi' }));
        }
      }
    }
  }

  function drawSelection() {
    const ov = overlay();
    if (!ov) return;
    ov.replaceChildren();
    if (!scene) return;
    const P = scene.projector;
    drawMeasureAnchor(ov);

    if (S.multi.length > 1) {
      drawMultiOutline(ov, P);
      drawAlignGuides(ov, P);
      return;
    }

    const sel = Store.selected();
    if (!sel) return;

    if (selectedLabel()) {
      const b = labelBox(sel);
      if (!b) return;
      const g = el('g', { transform: b.rot, 'pointer-events': 'all' });
      g.appendChild(el('rect', { x: b.x, y: b.y, width: b.width, height: b.height, class: 'sel-outline', 'pointer-events': 'none' }));
      for (const [dx, dy] of [[-1,-1], [1,-1], [-1,1], [1,1]]) {
        const handle = el('circle', { cx: b.x + b.width * (dx + 1) / 2, cy: b.y + b.height * (dy + 1) / 2,
          r: 5.5, class: 'handle', style: 'cursor:nwse-resize' });
        handle.dataset.labelResize = sel.id;
        g.appendChild(handle);
      }
      ov.appendChild(g);
      return;
    }

    if (S.selection.kind === 'opening') {
      const floor = Store.floor();
      const room = (floor.rooms || []).find((r) => r.id === sel.room);
      const edge = room && PlanScene.roomEdges(room).find((e) => e.wall === sel.wall);
      if (edge) {
        const at = sel.at || 0, w = sel.w || 2.5;
        const a = edge.horizontal ? [at, edge.fixed] : [edge.fixed, at];
        const b = edge.horizontal ? [at + w, edge.fixed] : [edge.fixed, at + w];
        ov.appendChild(el('line', {
          x1: P.X(a[0]), y1: P.Y(a[1]), x2: P.X(b[0]), y2: P.Y(b[1]),
          stroke: 'var(--accent)', 'stroke-width': 8, opacity: 0.5, 'stroke-linecap': 'round',
        }));
      }
      return;
    }
    if (S.selection.kind === 'room') {
      const pts = PlanScene.roomPoints(sel);
      const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${P.X(p[0])} ${P.Y(p[1])}`).join(' ') + ' Z';
      ov.appendChild(el('path', { d, class: 'sel-outline' }));
      // Vertex handles: a rect room exposes its four corners, a polygon every
      // point. Dragging either edits the room in place.
      const g = el('g', { 'pointer-events': 'all' });
      pts.forEach((p, i) => {
        const h = el('circle', { cx: P.X(p[0]), cy: P.Y(p[1]), r: 5.5, class: 'handle' });
        h.dataset.vertex = i;
        g.appendChild(h);
      });
      ov.appendChild(g);
    } else {
      const t = PlanScene.resolveType(S.library, sel) || {};
      if ((sel.kind || t.kind) === 'furniture') {
        const b = furnitureBox(sel, t);
        ov.appendChild(el('rect', { x: P.X(sel.at[0]) - 2, y: P.Y(sel.at[1]) - 2, width: P.S(b.w) + 4, height: P.S(b.h) + 4,
          transform: `rotate(${b.rot} ${P.X(b.cx)} ${P.Y(b.cy)})`, class: 'sel-outline' }));
      } else {
        ov.appendChild(el('circle', { cx: P.X(sel.at[0]), cy: P.Y(sel.at[1]), r: ((t.render && t.render.tap) || 17) + 3, class: 'sel-outline' }));
      }
      drawRotateHandle(ov, sel, t, P);
      drawResizeHandles(ov, sel, t, P);
    }
    drawAlignGuides(ov, P);
    drawDimLabel(ov);
  }

  /* ---------- resize ----------
   *
   * Same argument as the rotation handle: "how big is that ceiling fan" is a
   * thing you judge against the room it is in, not a number you can type. The
   * handles sit ON the edge they move, at the four compass points of the drawn
   * marker, so the gesture is the shape changing under your fingers.
   *
   * What the drag actually changes is the type's business, not this file's:
   * `render.resize` names the property and its unit. A fan resizes its SWEEP in
   * feet and stays honest against the plan's scale; a smoke detector resizes
   * only how big it is drawn, because at true scale it would be a dot nobody
   * can hit. `PlanScene.markerRadius` is the single answer to "how big is this
   * right now", shared with the renderer — a handle that sits anywhere other
   * than the edge it drags is worse than no handle at all. */
  function resizeSpec(type) {
    if (type?.kind === 'furniture') return { box: true };
    const rz = type && type.render && type.render.resize;
    return rz && rz.prop ? rz : null;
  }

  function furnitureBox(item, type) {
    const p = Object.assign({}, type.defaults, item.props);
    const w = p.w ?? 3, h = p.h ?? 3;
    return { w, h, cx: item.at[0] + w / 2, cy: item.at[1] + h / 2, rot: p.rot || 0 };
  }

  function turned(x, y, deg) {
    const a = deg * Math.PI / 180;
    return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  }

  /* Resize in the object's own axes. The opposite corner/edge remains fixed
     even when the stored, unrotated top-left has to move to preserve it. */
  function resizedBox(b, dx, dy, x, y, proportional) {
    const [lx, ly] = turned(x - b.cx, y - b.cy, -b.rot);
    let w = dx ? Math.max(.25, dx * lx + b.w / 2) : b.w;
    let h = dy ? Math.max(.25, dy * ly + b.h / 2) : b.h;
    if (proportional && dx && dy) {
      const scale = Math.max(w / b.w, h / b.h);
      w = b.w * scale; h = b.h * scale;
    }
    const [mx, my] = turned(dx * (w - b.w) / 2, dy * (h - b.h) / 2, b.rot);
    return { at: [b.cx + mx - w / 2, b.cy + my - h / 2], w, h };
  }

  function frontAngle(item, type) {
    const p = Object.assign({}, type.defaults, item.props);
    return type.render?.front ?? Shapes.furnitureFront(type.render?.shape, p.variant);
  }

  function drawResizeHandles(ov, item, type, P) {
    const rz = resizeSpec(type);
    if (!rz) return;
    if (rz.box) {
      const b = furnitureBox(item, type);
      const g = el('g', { 'pointer-events': 'all', class: 'size-handle' });
      const size = HANDLE_PX() / (S.view.zoom || 1);
      for (const [dx, dy] of [[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]]) {
        const [x, y] = turned(dx * b.w / 2, dy * b.h / 2, b.rot);
        const angle = ((Math.atan2(dy, dx) * 180 / Math.PI + b.rot) % 180 + 180) % 180;
        const cursor = ['ew', 'nwse', 'ns', 'nesw'][Math.round(angle / 45) % 4];
        const handle = el('rect', { x: P.X(b.cx + x) - size / 2, y: P.Y(b.cy + y) - size / 2,
          width: size, height: size, rx: 1, class: 'handle', style: `cursor:${cursor}-resize` });
        handle.dataset.resize = item.id;
        handle.dataset.dx = dx; handle.dataset.dy = dy;
        handle.appendChild(el('title', {}, 'Drag to resize; Shift keeps proportions'));
        g.appendChild(handle);
      }
      ov.appendChild(g);
      return;
    }
    const R = PlanScene.markerRadius(item, type, P);
    const cx = P.X(item.at[0]), cy = P.Y(item.at[1]);
    const g = el('g', { 'pointer-events': 'all', class: 'size-handle' });
    g.appendChild(el('circle', { cx, cy, r: R, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1, opacity: 0.5, 'pointer-events': 'none' }));
    /* Four, not one: whichever edge is nearest your finger is the one you
     * grab, and on a phone that matters more than it looks. */
    const line = type.render?.shape === 'line';
    const directions = line ? [[-1, 0], [1, 0]] : [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const [dx, dy] of directions) {
      const [ox, oy] = turned(dx * R, dy * R, line ? (item.props?.rot ?? type.defaults?.rot ?? 0) : 0);
      const size = HANDLE_PX() / (S.view.zoom || 1);
      const h = el('rect', {
        x: cx + ox - size / 2, y: cy + oy - size / 2, width: size, height: size, rx: 1.5,
        class: 'handle', style: `cursor:${dx ? 'ew-resize' : 'ns-resize'}`,
      });
      h.dataset.resize = item.id;
      g.appendChild(h);
    }
    ov.appendChild(g);
  }

  /* px radius -> the value the property is stored in, clamped to the type's
   * own declared range. The inverse of markerRadius, and it has to stay that
   * way: they are the two halves of one round trip. */
  function radiusToProp(R, rz, P) {
    // A ft-resized marker is drawn at HALF its footprint (a radius), so the
    // round trip back to the property has to double it again.
    const raw = rz.unit === 'ft' ? (R * 2) / (P.ppf || 22) : R;
    const lo = typeof rz.min === 'number' ? rz.min : 0.5;
    const hi = typeof rz.max === 'number' ? rz.max : 200;
    return Math.max(lo, Math.min(hi, Math.round(raw * 4) / 4));
  }

  /* Keyboard resize, for the same reason rotation has one: a 7px square is not
   * a target on a touch screen. */
  function nudgeSize(mul) {
    const label = selectedLabel();
    if (label) {
      const scale = Math.max(.25, Math.min(4, (label.chip_scale || 1) * mul));
      const at = keepLabelOnFloor(label, labelCentre(label), scale);
      Store.mutate(() => { label.chip_scale = scale; label.chip_at = at; }, 'resize room label');
      return;
    }
    if (!scene) return;
    const P = scene.projector;
    if (S.multi.length > 1) {
      const floor = Store.floor();
      const targets = S.multi.filter((m) => m.kind === 'item').map((m) => floor.items.find((i) => i.id === m.id))
        .filter(Boolean).map((item) => ({ item, type: PlanScene.resolveType(S.library, item) || {} }))
        .map((x) => ({ ...x, rz: resizeSpec(x.type) })).filter((x) => x.rz);
      if (!targets.length) { toast('Nothing in the selection has a size to set.', true); return; }
      Store.mutate(() => {
        for (const { item, type, rz } of targets) {
          if (rz.box) {
            const b = furnitureBox(item, type);
            item.props = Object.assign({}, item.props, { w: Math.max(.25, b.w * mul), h: Math.max(.25, b.h * mul) });
            item.at = [b.cx - item.props.w / 2, b.cy - item.props.h / 2];
            continue;
          }
          const now = radiusToProp(PlanScene.markerRadius(item, PlanScene.resolveType(S.library, item) || {}, P), rz, P);
          item.props = item.props || {};
          item.props[rz.prop] = radiusToProp(rz.unit === 'ft' ? (now * mul * (P.ppf || 22)) / 2 : now * mul, rz, P);
        }
      }, 'resize selection');
      return;
    }
    if (!S.selection || S.selection.kind !== 'item') return;
    const item = Store.selected();
    if (!item) return;
    const type = PlanScene.resolveType(S.library, item) || {};
    const rz = resizeSpec(type);
    if (!rz) { toast(`${type.label || item.type} has no size to set.`, true); return; }
    if (rz.box) {
      const b = furnitureBox(item, type);
      Store.mutate(() => {
        item.props = Object.assign({}, item.props, { w: Math.max(.25, b.w * mul), h: Math.max(.25, b.h * mul) });
        item.at = [b.cx - item.props.w / 2, b.cy - item.props.h / 2];
      }, 'resize furniture');
      return;
    }
    const now = radiusToProp(PlanScene.markerRadius(item, type, P), rz, P);
    Store.mutate(() => {
      item.props = item.props || {};
      item.props[rz.prop] = radiusToProp(
        rz.unit === 'ft' ? (now * mul * (P.ppf || 22)) / 2 : now * mul, rz, P,
      );
    }, 'resize');
  }

  /* ---------- rotation ----------
   *
   * A number field is the wrong instrument for "point the camera at the gate":
   * you cannot read a bearing off a drawing, so you end up typing 45, looking,
   * typing 60, looking. The handle turns it into the gesture it always was.
   *
   * Angles are SCREEN degrees — 0 points up, positive turns clockwise — the
   * same frame `WALL_NORMAL` and the sun's `screenUpBearing` use. Compass
   * bearings live in exactly one place and this is not it. */
  function rotatable(type) {
    return !!(type && (type.props || []).some((p) => p.key === 'rot'));
  }

  /* Furniture is placed by its top-left corner and turns about its middle;
   * a marker is a point and turns about itself. */
  function rotationCentre(item, type, P) {
    const kind = item.kind || type.kind;
    if (kind === 'furniture') {
      const d = type.defaults || {}, p = item.props || {};
      const w = p.w ?? d.w ?? 3, h = p.h ?? d.h ?? 3;
      return [P.X(item.at[0]) + P.S(w) / 2, P.Y(item.at[1]) + P.S(h) / 2, Math.max(P.S(w), P.S(h)) / 2 + 18];
    }
    return [P.X(item.at[0]), P.Y(item.at[1]), Math.max((type.render && type.render.tap) || 17, PlanScene.markerRadius(item, type, P)) + 16];
  }

  function drawRotateHandle(ov, item, type, P) {
    if (!rotatable(type)) return;
    const [cx, cy, radius] = rotationCentre(item, type, P);
    const deg = (Number((item.props && item.props.rot) ?? (type.defaults || {}).rot ?? 0) || 0) + frontAngle(item, type);
    const hx = cx + Math.sin(deg * Math.PI / 180) * radius;
    const hy = cy - Math.cos(deg * Math.PI / 180) * radius;

    const g = el('g', { 'pointer-events': 'all', class: 'rot-handle' });
    g.appendChild(el('circle', { cx, cy, r: radius, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1, 'stroke-dasharray': '2 4', opacity: 0.45, 'pointer-events': 'none' }));
    g.appendChild(el('line', { x1: cx, y1: cy, x2: hx, y2: hy, stroke: 'var(--accent)', 'stroke-width': 1.2, opacity: 0.6, 'pointer-events': 'none' }));
    /* Constant on SCREEN, like the square resize handles beside it: a radius in
     * scene units alone drew a 6px knob at Fit and a 36px one at 600%. */
    const knob = el('circle', { cx: hx, cy: hy, r: KNOB_PX() / (S.view.zoom || 1), class: 'handle' });
    knob.dataset.rotate = item.id;
    g.appendChild(knob);
    ov.appendChild(g);
  }

  const norm360 = (d) => ((Math.round(d) % 360) + 360) % 360;


  /* Keyboard rotation, so a marker can be turned without hunting for a 6px
   * knob on a phone. Same undo granularity as the drag: one step, one entry. */
  function nudgeRotation(delta) {
    const label = selectedLabel();
    if (label) {
      Store.mutate(() => { label.chip_rotate = norm360((label.chip_rotate || 0) + delta); }, 'rotate room label');
      return;
    }
    if (S.multi.length > 1) {
      const floor = Store.floor();
      const targets = S.multi.filter((m) => m.kind === 'item').map((m) => floor.items.find((i) => i.id === m.id))
        .filter((item) => item && rotatable(PlanScene.resolveType(S.library, item) || {}));
      if (!targets.length) { toast('Nothing in the selection has a facing to set.', true); return; }
      Store.mutate(() => {
        for (const item of targets) {
          item.props = item.props || {};
          item.props.rot = norm360((Number(item.props.rot) || 0) + delta);
        }
      }, 'rotate selection');
      return;
    }
    if (!S.selection || S.selection.kind !== 'item') return;
    const item = Store.selected();
    if (!item) return;
    const type = PlanScene.resolveType(S.library, item) || {};
    if (!rotatable(type)) { toast(`${type.label || item.type} has no facing to set.`, true); return; }
    Store.mutate(() => {
      item.props = item.props || {};
      item.props.rot = norm360((Number(item.props.rot) || 0) + delta);
    }, 'rotate');
  }

  /* Keyboard nudge for POSITION, the plain-arrow-keys counterpart to `[`/`]`
   * for rotation and `-`/`+` for size — same reasoning: a 7px handle is hard
   * to grab exactly, on a touch screen there is no hover to find it with, and
   * "move it 3 inches to the left" is a keyboard sentence, not a mouse one.
   * Works for a room too, unlike rotation/resize, because dragging a whole
   * room a few inches is just as fiddly as dragging one marker. */
  function nudgePosition(dx, dy) {
    const label = selectedLabel();
    if (label) {
      const at = labelCentre(label);
      const next = keepLabelOnFloor(label, [at[0] + dx, at[1] + dy], label.chip_scale || 1);
      Store.mutate(() => { label.chip_at = next; }, 'move room label');
      return;
    }
    const floor = Store.floor();
    if (S.multi.length > 1) {
      Store.mutate(() => {
        for (const m of S.multi) {
          if (m.kind === 'item') {
            const item = floor.items.find((i) => i.id === m.id);
            if (item) item.at = [round4(item.at[0] + dx), round4(item.at[1] + dy)];
          } else {
            const room = floor.rooms.find((r) => r.id === m.id);
            if (!room) continue;
            if (room.shape === 'poly' && room.points) room.points = room.points.map((p) => [round4(p[0] + dx), round4(p[1] + dy)]);
            else if (room.rect) room.rect = [round4(room.rect[0] + dx), round4(room.rect[1] + dy), room.rect[2], room.rect[3]];
          }
        }
      }, 'move selection');
      return;
    }
    if (!S.selection) return;
    if (S.selection.kind === 'item') {
      const item = Store.selected();
      if (!item) return;
      Store.mutate(() => { item.at = [round4(item.at[0] + dx), round4(item.at[1] + dy)]; }, 'move');
    } else if (S.selection.kind === 'room') {
      const room = Store.selected();
      if (!room) return;
      Store.mutate(() => {
        if (room.shape === 'poly' && room.points) room.points = room.points.map((p) => [round4(p[0] + dx), round4(p[1] + dy)]);
        else if (room.rect) room.rect = [round4(room.rect[0] + dx), round4(room.rect[1] + dy), room.rect[2], room.rect[3]];
      }, 'move room');
    }
  }

  /* Ctrl/Cmd+D, the shortcut every one of these tools uses for "one more of
   * this, right here" — offset slightly so the copy is visibly a copy and
   * not just a click that did nothing, then selected so it can be dragged
   * into place immediately, the same "ready without another click" promise
   * placeType()/onSelectedHandleOrBody() already make for a fresh placement. */
  function duplicateSelected() {
    if (selectedLabel()) { toast('Each room has one name badge.'); return; }
    const OFFSET = 1;
    if (S.multi.length > 1) {
      const floor = Store.floor();
      const copies = [];
      Store.mutate(() => {
        for (const m of S.multi) {
          if (m.kind === 'item') {
            const item = floor.items.find((i) => i.id === m.id);
            if (!item) continue;
            const copy = Store.clone(item);
            copy.id = Store.newItemId(copy.kind);
            copy.at = [round4(item.at[0] + OFFSET), round4(item.at[1] + OFFSET)];
            floor.items.push(copy);
            copies.push({ kind: 'item', id: copy.id });
          } else {
            const room = floor.rooms.find((r) => r.id === m.id);
            if (!room) continue;
            const copy = Store.clone(room);
            copy.id = Store.newRoomId((room.name || 'Room') + ' copy');
            if (copy.shape === 'poly' && copy.points) copy.points = copy.points.map((p) => [round4(p[0] + OFFSET), round4(p[1] + OFFSET)]);
            else if (copy.rect) copy.rect = [round4(copy.rect[0] + OFFSET), round4(copy.rect[1] + OFFSET), copy.rect[2], copy.rect[3]];
            floor.rooms.push(copy);
            copies.push({ kind: 'room', id: copy.id });
          }
        }
      }, 'duplicate selection');
      Store.setMulti(copies);
      return;
    }
    if (!S.selection) return;
    const floor = Store.floor();
    if (S.selection.kind === 'item') {
      const item = Store.selected();
      if (!item) return;
      const copy = Store.clone(item);
      copy.id = Store.newItemId(copy.kind);
      copy.at = [round4(item.at[0] + OFFSET), round4(item.at[1] + OFFSET)];
      Store.mutate(() => { floor.items.push(copy); }, 'duplicate');
      Store.select('item', copy.id);
    } else if (S.selection.kind === 'room') {
      const room = Store.selected();
      if (!room) return;
      const copy = Store.clone(room);
      copy.id = Store.newRoomId((room.name || 'Room') + ' copy');
      if (copy.shape === 'poly' && copy.points) copy.points = copy.points.map((p) => [round4(p[0] + OFFSET), round4(p[1] + OFFSET)]);
      else if (copy.rect) copy.rect = [round4(copy.rect[0] + OFFSET), round4(copy.rect[1] + OFFSET), copy.rect[2], copy.rect[3]];
      Store.mutate(() => { floor.rooms.push(copy); }, 'duplicate');
      Store.select('room', copy.id);
    } else {
      toast('Nothing to duplicate — openings follow their wall, not a copy.', true);
    }
  }
  function ghost(node) {
    const ov = overlay();
    if (!ov) return;
    ov.replaceChildren();
    if (node) ov.appendChild(node);
  }

  /* ---------- nearest wall edge (for the opening tool) ---------- */

  function roomEdges(room) {
    const pts = PlanScene.roomPoints(room);
    const box = PlanScene.roomBBox(room);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const horizontal = Math.abs(a[1] - b[1]) < 1e-6;
      let wall;
      if (horizontal) wall = Math.abs(a[1] - box[1]) < 1e-6 ? 'n' : 's';
      else wall = Math.abs(a[0] - box[0]) < 1e-6 ? 'w' : 'e';
      out.push({ a, b, horizontal, wall });
    }
    return out;
  }

  function nearestEdge(ft, maxFt) {
    const floor = Store.floor();
    let best = null;
    for (const room of floor.rooms || []) {
      for (const e of roomEdges(room)) {
        const vx = e.b[0] - e.a[0], vy = e.b[1] - e.a[1];
        const L = vx * vx + vy * vy;
        let t = L ? ((ft.x - e.a[0]) * vx + (ft.y - e.a[1]) * vy) / L : 0;
        t = Math.max(0, Math.min(1, t));
        const px = e.a[0] + t * vx, py = e.a[1] + t * vy;
        const d = Math.hypot(ft.x - px, ft.y - py);
        if (d < (maxFt || 1.2) && (!best || d < best.d)) best = { room, edge: e, d, at: [px, py], t };
      }
    }
    return best;
  }

  /* ---------- interaction ---------- */

  let drag = null;
  let polyPts = null;
  /* Set by an in-progress item/group drag, read by drawSelection() so the
   * guide lines live in the same overlay group the selection outline does —
   * paint() rebuilds that group from scratch every call, so there is nowhere
   * else for a mid-drag guide to persist between one move() and the next. */
  let alignGuides = null;

  /* Set the same way `alignGuides` is (drawn from `drawSelection()`, cleared
   * in `end()`): a floating "12.0 ft x 8.5 ft" readout that follows a room
   * or item resize, in scene pixels so it sits at the cursor regardless of
   * zoom. */
  let dimLabel = null;

  /* Distance/dimension guides are a saved, project-level preference (the
   * user's "dashboard-level" setting) rather than session state like
   * `S.view.showGrid` — they should look the same to everyone who opens this
   * project, not reset per browser tab. Feet stay the one stored unit
   * everywhere (see concept-units.md); `units` only changes how this
   * editing aid FORMATS a number, never what is saved. */
  function guidesCfg() {
    return Object.assign({ enabled: true, units: 'ft' }, (S.project && S.project.guides) || {});
  }
  function fmtDist(ft, units) {
    const v = units === 'm' ? ft * 0.3048 : ft;
    return `${v.toFixed(v < 10 ? 2 : 1)}${units === 'm' ? ' m' : ' ft'}`;
  }

  /* Every other room and item on the floor, as a set of x/y coordinates
   * (feet) something can align TO: an item is just its own point; a room
   * contributes both edges and its centre. Deliberately not the room the
   * dragged item happens to sit in specifically — "line up with the wall of
   * the room next door" is exactly as common a thing to want as the current
   * room's own wall. */
  function alignCandidates(excludeItemIds, excludeRoomIds) {
    const floor = Store.floor();
    const xs = [], ys = [];
    for (const item of floor.items || []) {
      if (excludeItemIds.has(item.id)) continue;
      xs.push(item.at[0]); ys.push(item.at[1]);
    }
    for (const room of floor.rooms || []) {
      if (excludeRoomIds.has(room.id)) continue;
      const [bx, by, bw, bh] = PlanScene.roomBBox(room);
      xs.push(bx, bx + bw / 2, bx + bw);
      ys.push(by, by + bh / 2, by + bh);
    }
    return { xs, ys };
  }

  /* Snaps (nx, ny) — the CENTRE of whatever is being dragged — onto the
   * nearest candidate within a few screen pixels, independently per axis, and
   * says which value it snapped to so the caller can draw a guide there. A
   * pixel threshold rather than a feet one because "close enough to line up"
   * is a property of how it LOOKS, which changes with zoom; a fixed feet
   * tolerance would feel loose zoomed in and pick the wrong candidate zoomed
   * out. */
  const ALIGN_PX = 6;
  function snapAlign(nx, ny, cand, P) {
    let bestX = null, bestY = null;
    for (const cx of cand.xs) {
      const d = Math.abs(P.S(cx - nx));
      if (d <= ALIGN_PX && (!bestX || d < bestX.d)) bestX = { d, v: cx };
    }
    for (const cy of cand.ys) {
      const d = Math.abs(P.S(cy - ny));
      if (d <= ALIGN_PX && (!bestY || d < bestY.d)) bestY = { d, v: cy };
    }
    return {
      x: bestX ? bestX.v : nx, y: bestY ? bestY.v : ny,
      guideX: bestX ? bestX.v : null, guideY: bestY ? bestY.v : null,
    };
  }

  /* Nothing of the plan's own is under this point — sheet, grid, the margin
   * outside the floor. Everything the hit layer draws carries a data attribute
   * naming what it is, so "none of them" is the whole test. */
  function isBareFloor(target) {
    const d = (target && target.dataset) || {};
    return !(d.item || d.room || d.opening || d.roomLabel || d.labelResize
      || d.rotate || d.resize || d.vertex !== undefined);
  }

  function onSelectedHandleOrBody(target) {
    const sel = S.selection;
    if (!sel || !target.dataset) return false;
    const d = target.dataset;
    if (sel.kind === 'room') return d.vertex !== undefined || d.room === sel.id || d.roomLabel === sel.id || d.labelResize === sel.id;
    return d.rotate === sel.id || d.resize === sel.id || d.item === sel.id;
  }

  /* The gesture layer sits in front of the tool logic: it decides whether this
   * press is one of the things a DEVICE does — pinch, two-finger pan, drag the
   * paper — before anything asks which tool is active. Below it, `beginInner`
   * is the original mouse logic, unchanged in what it means. */
  function begin(ev) {
    /* `isPrimary` means "the first pointer of its kind currently down", so a
     * primary press while the map still holds something is proof that the
     * something is stale — a pointerup delivered somewhere this element never
     * saw, which is what happens when a repaint detaches the node mid-drag and
     * pointer capture was refused. Left uncleared, the next press counts as a
     * second finger and the canvas answers a tap with a pinch. */
    if (ev.isPrimary && pointers.size) { pointers.clear(); gesture = null; drag = null; }
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, type: ev.pointerType });
    setPointerKind(ev.pointerType);

    if (pointers.size === 2) { startPinch(); return; }
    if (pointers.size > 2) return;

    /* `timeStamp` is when the press HAPPENED, not when this handler got to
     * run. Selecting something rebuilds the inspector, and on a full house
     * that is most of a second of main thread — measured with a clock read
     * here, a real double tap 150 ms apart looked like two taps a second
     * apart, and never opened anything. */
    press = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp || Date.now(), target: ev.target };
    beginInner(ev);
  }

  function startPan(ev, tap) {
    drag = { mode: 'pan', sx: ev.clientX, sy: ev.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop, tap };
    svg.classList.add('panning');
    /* A pointer that has already gone (a stylus that cancelled, a finger the
     * OS took for a system gesture) makes this throw, and an exception here
     * would abandon the drag half-built. Capture is an optimisation; the pan
     * works without it as long as the pointer stays over the canvas. */
    try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* uncaptured, still tracked */ }
  }

  /* A second finger arrives. Whatever the first one had begun is finished
   * where it stands — committed if it had actually moved something, dropped if
   * it had not — because carrying a half-finished room drag through a pinch is
   * how a plan ends up with a wall somewhere nobody put it. */
  function startPinch() {
    if (drag) {
      if (drag.mode !== 'pan' && drag.moved) end({ pointerId: -1, clientX: press.x, clientY: press.y });
      else { drag = null; ghost(null); }
    }
    const [a, b] = [...pointers.values()];
    gesture = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      zoom: S.view.zoom,
    };
    for (const id of pointers.keys()) { try { svg.setPointerCapture(id); } catch (e) { /* already gone */ } }
    svg.classList.add('panning');
  }

  /* What a tap did, once it is known to have been a tap. On a touch screen a
   * drag on empty floor pans instead of selecting, so the selection this press
   * MIGHT have meant is decided at pointer-up rather than pointer-down — which
   * is also why it takes the target recorded then, not whatever is under the
   * finger after the plan has slid past it. */
  function tapSelect(target) {
    const d = (target && target.dataset) || {};
    if (d.roomLabel || d.labelResize) { Store.select('room', d.roomLabel || d.labelResize, 'label'); return; }
    if (d.opening) { Store.select('opening', d.opening); return; }
    if (d.item || d.room) {
      const kind = d.item ? 'item' : 'room';
      if (S.view.multiSelect) Store.toggleMulti(kind, d.item || d.room);
      else Store.select(kind, d.item || d.room);
      return;
    }
    if (!S.view.multiSelect) Store.select(null);
  }

  /* Two taps in the same place open the properties of what was tapped. It
   * matters only where the inspector is a drawer — a narrow screen — and there
   * it replaces a trip to the top bar with the gesture every touch UI already
   * uses for "tell me more about this". */
  function tapAgain() {
    /* Press to press, on the event's own clock — see `press` above. */
    const again = lastTap && press.t - lastTap.t < 400
      && Math.hypot(press.x - lastTap.x, press.y - lastTap.y) < 28;
    lastTap = { t: press.t, x: press.x, y: press.y };
    if (!again) return;
    const d = (press.target && press.target.dataset) || {};
    if (d.item || d.room || d.opening || d.roomLabel || d.labelResize) onInspect();
  }

  function beginInner(ev) {
    if (ev.button === 1 || S.tool === 'pan' || spaceHeld || (ev.button === 0 && ev.altKey)) {
      startPan(ev);
      return;
    }
    if (ev.button !== 0) return;

    /* Touch, Select tool, and the press did not land on what is already
     * selected: the finger moves the PLAN, and a press that turns out not to
     * have moved selects whatever was under it after all.
     *
     * A mouse can hover, so it can see what it is about to grab; a finger
     * cannot, and a plan drawn edge to edge is nothing but grabbable things.
     * Making "drag anything you touch" the default on a tablet means every
     * attempt to look at the other end of the house moves a room a few inches
     * instead — silently, because the finger is on top of the evidence. Tap to
     * pick it up first, then drag it. Turning Multi on restores the box-select
     * drag, which is the one other thing an empty-floor drag could mean. */
    if (ev.pointerType === 'touch' && S.tool === 'select' && !onSelectedHandleOrBody(ev.target)
      && !(S.view.multiSelect && isBareFloor(ev.target))) {
      startPan(ev, ev.target);
      return;
    }

    const ft = feetAt(ev);
    const raw = feetAt(ev, false);
    const target = ev.target;

    /* Placing stays armed on purpose (see placeArmed) so ten of the same
     * fixture don't need ten trips to the palette — but that used to mean the
     * ONE thing you just placed was untouchable until you left Place and
     * clicked Select: its resize/rotate handles were drawn (drawSelection()
     * doesn't care what tool is active) but unreachable, because this check
     * fired before the code that reads them ever ran. Grabbing a handle, or
     * the body, of the CURRENTLY SELECTED item/room now falls through to that
     * code instead of stamping a new copy on top of it; clicking anywhere
     * else while armed still places, unchanged. */
    if (S.tool === 'place' && S.armed && !onSelectedHandleOrBody(target)) { placeArmed(ft); return; }

    if (S.tool === 'rect') {
      drag = { mode: 'rect', from: ft };
      svg.setPointerCapture(ev.pointerId);
      return;
    }

    if (S.tool === 'poly') {
      if (!polyPts) polyPts = [];
      polyPts.push([ft.x, ft.y]);
      drawPolyGhost(ft);
      return;
    }

    if (S.tool === 'aperture') {
      const hit = nearestEdge(raw, 1.5);
      if (hit) placeAperture(hit);
      else toast('Click closer to a wall — an opening has to sit on one.', true);
      return;
    }

    /* select tool */
    if (target.dataset?.roomLabel || target.dataset?.labelResize) {
      const id = target.dataset.roomLabel || target.dataset.labelResize;
      const room = Store.floor().rooms.find(r => r.id === id);
      if (!room) return;
      const centre = labelCentre(room), pt = toScene(ev), P = scene.projector;
      drag = { mode: target.dataset.labelResize ? 'label-resize' : 'label', id,
        before: Store.clone(room), grabFt: raw, origin: centre,
        radius: Math.max(1, Math.hypot(pt.x - P.X(centre[0]), pt.y - P.Y(centre[1]))) };
      Store.select('room', id, 'label');
      svg.setPointerCapture(ev.pointerId);
      return;
    }
    if (target.dataset && target.dataset.vertex !== undefined) {
      const room = Store.selected();
      drag = { mode: 'vertex', index: +target.dataset.vertex, room: room.id, before: Store.clone(room) };
      svg.setPointerCapture(ev.pointerId);
      return;
    }
    if (target.dataset && target.dataset.rotate !== undefined) {
      const item = (Store.floor().items || []).find((i) => i.id === target.dataset.rotate);
      if (item) {
        item.props = item.props || {};
        drag = { mode: 'rotate', id: item.id, before: item.props.rot };
        svg.setPointerCapture(ev.pointerId);
      }
      return;
    }
    if (target.dataset && target.dataset.resize !== undefined) {
      const item = (Store.floor().items || []).find((i) => i.id === target.dataset.resize);
      const type = item ? (PlanScene.resolveType(S.library, item) || {}) : null;
      const rz = resizeSpec(type);
      if (item && rz) {
        item.props = item.props || {};
        drag = rz.box
          ? { mode: 'resize-box', id: item.id, before: Store.clone(item), box: furnitureBox(item, type), dx: Number(target.dataset.dx), dy: Number(target.dataset.dy) }
          : { mode: 'resize', id: item.id, prop: rz.prop, before: item.props[rz.prop] };
        svg.setPointerCapture(ev.pointerId);
      }
      return;
    }
    if (target.dataset && target.dataset.opening) {
      Store.select('opening', target.dataset.opening);
      return;
    }
    if (target.dataset && target.dataset.item) {
      const item = (Store.floor().items || []).find((i) => i.id === target.dataset.item);
      /* Shift toggles membership and stops there — no drag starts on the same
       * click, the same split every other editor in this genre makes between
       * "change what's selected" and "move what's selected". A plain click on
       * a member of the CURRENT multi-selection keeps the whole group picked
       * (dragging moves all of it); anywhere else, a plain click behaves
       * exactly as it always did — replace the selection with just this. */
      if (ev.shiftKey || S.view.multiSelect) { Store.toggleMulti('item', item.id); return; }
      if (S.multi.length > 1 && Store.isMulti('item', item.id)) {
        beginGroupDrag(raw, ev);
        return;
      }
      Store.select('item', item.id);
      drag = { mode: 'item', id: item.id, grabFt: raw, origin: item.at.slice() };
      svg.setPointerCapture(ev.pointerId);
      return;
    }
    if (target.dataset && target.dataset.room) {
      const room = (Store.floor().rooms || []).find((r) => r.id === target.dataset.room);
      if (ev.shiftKey || S.view.multiSelect) { Store.toggleMulti('room', room.id); return; }
      if (S.multi.length > 1 && Store.isMulti('room', room.id)) {
        beginGroupDrag(raw, ev);
        return;
      }
      Store.select('room', room.id);
      drag = { mode: 'room', id: room.id, grabFt: raw, before: Store.clone(room) };
      svg.setPointerCapture(ev.pointerId);
      return;
    }
    /* Empty canvas, Select tool: a drag from here is a marquee, a plain click
     * is the deselect-everything it always was — `end()` tells them apart by
     * whether the marquee ever grew past a few pixels. */
    drag = { mode: 'marquee', from: raw, shift: ev.shiftKey || S.view.multiSelect };
    svg.setPointerCapture(ev.pointerId);
  }

  /* One drag origin snapshot per member, the multi-item generalisation of the
   * single-item/room drag's own `origin`/`before` field — everything moves by
   * the SAME delta from its OWN start, not from the pointer's start, which is
   * what keeps a group's shape intact while dragging it. */
  function beginGroupDrag(raw, ev) {
    const floor = Store.floor();
    const members = S.multi.map(({ kind, id }) => {
      const obj = kind === 'room' ? (floor.rooms || []).find((r) => r.id === id) : (floor.items || []).find((i) => i.id === id);
      return obj ? { kind, id, before: Store.clone(obj) } : null;
    }).filter(Boolean);
    if (!members.length) return;
    drag = { mode: 'group', grabFt: raw, members };
    svg.setPointerCapture(ev.pointerId);
  }

  function move(ev) {
    const held = pointers.get(ev.pointerId);
    if (held) { held.x = ev.clientX; held.y = ev.clientY; }

    /* A pinch pans and zooms at once, because fingers do both at once and
     * separating them makes the plan lurch. The centre of the pinch is the
     * anchor for the zoom AND the handle for the pan: whatever was between
     * the two fingers stays between them. */
    if (gesture) {
      const pts = [...pointers.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      wrap.scrollLeft -= mid.x - gesture.mid.x;
      wrap.scrollTop -= mid.y - gesture.mid.y;
      gesture.mid = mid;
      /* `light`: the scene is not rebuilt per frame. The viewBox is in scene
       * units, so the element's own width and height ARE the zoom — a full
       * PlanScene.build at 60 fps on a tablet buys nothing but a stutter, and
       * the one repaint when the fingers lift corrects the overlay. */
      zoomTo(gesture.zoom * (dist / gesture.dist), mid, true);
      return;
    }

    const raw = feetAt(ev, false);
    const room = Store.floor() ? PlanScene.roomAt(Store.floor(), raw.x, raw.y) : null;
    onStatus({ x: raw.x, y: raw.y, room: room ? room.name : '' });

    if (!drag) {
      if (S.tool === 'poly' && polyPts) drawPolyGhost(feetAt(ev));
      else if (S.tool === 'aperture') {
        const hit = nearestEdge(raw, 1.5);
        if (hit) {
          const P = scene.projector;
          ghost(el('line', {
            x1: P.X(hit.edge.a[0]), y1: P.Y(hit.edge.a[1]),
            x2: P.X(hit.edge.b[0]), y2: P.Y(hit.edge.b[1]), class: 'edge-hi',
          }));
        } else ghost(null);
      } else updateMeasureHover(raw);
      return;
    }

    if (drag.mode === 'pan') {
      wrap.scrollLeft = drag.sl - (ev.clientX - drag.sx);
      wrap.scrollTop = drag.st - (ev.clientY - drag.sy);
      if (Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) > SLOP_PX()) drag.moved = true;
      return;
    }

    /* Nothing has moved until the pointer has travelled far enough to mean it.
     * A mouse click is steady to a pixel or two; a tap is not steady to nine,
     * so without this every tap on a marker nudged it and left an undo entry
     * saying so — and the plan drifted a few thousandths of a foot at a time
     * under someone who thought they were only looking. */
    if (!drag.past) {
      if (Math.hypot(ev.clientX - press.x, ev.clientY - press.y) < SLOP_PX()) return;
      drag.past = true;
    }

    const ft = feetAt(ev);
    const P = scene.projector;

    if (drag.mode === 'label' || drag.mode === 'label-resize') {
      const label = Store.floor().rooms.find(r => r.id === drag.id);
      const oldScale = drag.before.chip_scale || 1;
      const pt = toScene(ev);
      const scale = drag.mode === 'label' ? oldScale : Math.max(.25, Math.min(4, oldScale *
        Math.hypot(pt.x - P.X(drag.origin[0]), pt.y - P.Y(drag.origin[1])) / drag.radius));
      const at = drag.mode === 'label'
        ? [drag.origin[0] + raw.x - drag.grabFt.x, drag.origin[1] + raw.y - drag.grabFt.y] : drag.origin;
      label.chip_at = keepLabelOnFloor(label, at, scale);
      if (drag.mode === 'label-resize') label.chip_scale = scale;
      drag.moved = true;
      paint();
      return;
    }

    if (drag.mode === 'rect') {
      const x = Math.min(drag.from.x, ft.x), y = Math.min(drag.from.y, ft.y);
      const w = Math.abs(ft.x - drag.from.x), h = Math.abs(ft.y - drag.from.y);
      ghost(el('rect', { x: P.X(x), y: P.Y(y), width: P.S(w), height: P.S(h), class: 'ghost' }));
      onStatus({ x: raw.x, y: raw.y, room: `${w.toFixed(2)}' × ${h.toFixed(2)}'` });
      return;
    }

    if (drag.mode === 'item') {
      const dx = ft.x - Store.snap(drag.grabFt.x), dy = ft.y - Store.snap(drag.grabFt.y);
      const item = (Store.floor().items || []).find((i) => i.id === drag.id);
      let nx = drag.origin[0] + dx, ny = drag.origin[1] + dy;
      /* Alt suppresses it for the one time you genuinely want "not quite
       * aligned" — the same modifier Figma and friends use for the same
       * reason, so it costs nothing to learn twice. */
      if (!ev.altKey) {
        const snapped = snapAlign(nx, ny, alignCandidates(new Set([drag.id]), new Set()), P);
        nx = snapped.x; ny = snapped.y;
        alignGuides = (snapped.guideX !== null || snapped.guideY !== null) ? snapped : null;
      } else alignGuides = null;
      item.at = [round4(nx), round4(ny)];
      drag.moved = true;
      paint();
      return;
    }

    if (drag.mode === 'resize-box') {
      const item = Store.floor().items.find(i => i.id === drag.id);
      if (!item) return;
      const next = resizedBox(drag.box, drag.dx, drag.dy, ft.x, ft.y, ev.shiftKey);
      item.at = next.at;
      Object.assign(item.props, { w: next.w, h: next.h });
      drag.moved = true;
      const pt = toScene(ev), guides = guidesCfg();
      dimLabel = guides.enabled ? { x: pt.x + 14, y: pt.y - 14, text: `${fmtDist(next.w, guides.units)} × ${fmtDist(next.h, guides.units)}` } : null;
      paint();
      return;
    }
    if (drag.mode === 'resize') {
      const item = (Store.floor().items || []).find((i) => i.id === drag.id);
      const type = PlanScene.resolveType(S.library, item) || {};
      const rz = resizeSpec(type);
      if (!item || !rz) return;
      const P = scene.projector;
      const pt = toScene(ev);
      /* Distance from the centre to the pointer IS the new radius — whichever
       * of the four handles was grabbed, so the marker follows the finger
       * rather than the handle's own axis. */
      const R = Math.hypot(pt.x - P.X(item.at[0]), pt.y - P.Y(item.at[1]));
      item.props = item.props || {};
      item.props[rz.prop] = radiusToProp(R, rz, P);
      drag.moved = true;
      const guides = guidesCfg();
      dimLabel = guides.enabled
        ? { x: pt.x + 14, y: pt.y - 14, text: rz.unit === 'ft' ? fmtDist(item.props[rz.prop], guides.units) : `${item.props[rz.prop]} px` }
        : null;
      paint();
      onStatus({ x: raw.x, y: raw.y, room: `${item.props[rz.prop]}${rz.unit === 'ft' ? ' ft' : ' px'}` });
      return;
    }

    if (drag.mode === 'rotate') {
      const item = (Store.floor().items || []).find((i) => i.id === drag.id);
      const type = PlanScene.resolveType(S.library, item) || {};
      const [cx, cy] = rotationCentre(item, type, P);
      const pt = toScene(ev);
      // atan2(dx, -dy): screen degrees, 0 up, clockwise positive.
      let deg = norm360(Math.atan2(pt.x - cx, cy - pt.y) * 180 / Math.PI - frontAngle(item, type));
      // Shift snaps to the eight-plus-in-betweens most things actually sit at.
      if (ev.shiftKey) deg = norm360(Math.round(deg / 15) * 15);
      item.props = item.props || {};
      item.props.rot = deg;
      drag.moved = true;
      paint();
      onStatus({ x: raw.x, y: raw.y, room: `${deg}°` });
      return;
    }

    if (drag.mode === 'room') {
      const dx = ft.x - Store.snap(drag.grabFt.x), dy = ft.y - Store.snap(drag.grabFt.y);
      const room = (Store.floor().rooms || []).find((r) => r.id === drag.id);
      const b = drag.before;
      if (b.shape === 'poly' && b.points) room.points = b.points.map((p) => [round4(p[0] + dx), round4(p[1] + dy)]);
      else room.rect = [round4(b.rect[0] + dx), round4(b.rect[1] + dy), b.rect[2], b.rect[3]];
      drag.moved = true;
      paint();
      return;
    }

    if (drag.mode === 'vertex') {
      const room = (Store.floor().rooms || []).find((r) => r.id === drag.room);
      const pts = PlanScene.roomPoints(drag.before).map((p) => p.slice());
      pts[drag.index] = [ft.x, ft.y];
      if (room.shape === 'poly') {
        room.points = pts;
      } else {
        /* Dragging a rect's corner keeps it a rect: the opposite corner is the
         * anchor. Turning it into a polygon on the first nudge would be a
         * nasty surprise — a rect room is what the legacy exporter can carry
         * losslessly, so it stays one unless you explicitly convert it. */
        const opp = pts[(drag.index + 2) % 4];
        const x = Math.min(ft.x, opp[0]), y = Math.min(ft.y, opp[1]);
        room.rect = [round4(x), round4(y), round4(Math.abs(ft.x - opp[0])), round4(Math.abs(ft.y - opp[1]))];
      }
      drag.moved = true;
      const guides = guidesCfg();
      if (guides.enabled) {
        const [, , w, h] = PlanScene.roomBBox(room);
        const pt = toScene(ev);
        dimLabel = { x: pt.x + 14, y: pt.y - 14, text: `${fmtDist(w, guides.units)} × ${fmtDist(h, guides.units)}` };
      } else dimLabel = null;
      paint();
      return;
    }

    if (drag.mode === 'group') {
      const dx = ft.x - Store.snap(drag.grabFt.x), dy = ft.y - Store.snap(drag.grabFt.y);
      const floor = Store.floor();
      /* Alignment for a group snaps the GROUP's own bounding-box centre, not
       * any one member's — dragging five things and having the group jump
       * because the third one you happened to grab lined up with something
       * would be far stranger than one item doing the same thing alone. */
      let sx = Infinity, sy = Infinity, ex = -Infinity, ey = -Infinity;
      const ids = new Set(), roomIds = new Set();
      for (const m of drag.members) {
        if (m.kind === 'item') {
          ids.add(m.id);
          const [x, y] = m.before.at;
          sx = Math.min(sx, x + dx); ex = Math.max(ex, x + dx);
          sy = Math.min(sy, y + dy); ey = Math.max(ey, y + dy);
        } else {
          roomIds.add(m.id);
          const [bx, by, bw, bh] = m.before.shape === 'poly' ? PlanScene.roomBBox({ shape: 'poly', points: m.before.points }) : m.before.rect;
          sx = Math.min(sx, bx + dx); ex = Math.max(ex, bx + bw + dx);
          sy = Math.min(sy, by + dy); ey = Math.max(ey, by + bh + dy);
        }
      }
      const gcx = (sx + ex) / 2, gcy = (sy + ey) / 2;
      let adx = dx, ady = dy;
      if (!ev.altKey) {
        const snapped = snapAlign(gcx, gcy, alignCandidates(ids, roomIds), P);
        adx = dx + (snapped.x - gcx);
        ady = dy + (snapped.y - gcy);
        alignGuides = (snapped.guideX !== null || snapped.guideY !== null) ? snapped : null;
      } else alignGuides = null;
      for (const m of drag.members) {
        if (m.kind === 'item') {
          const item = (floor.items || []).find((i) => i.id === m.id);
          item.at = [round4(m.before.at[0] + adx), round4(m.before.at[1] + ady)];
        } else {
          const room = (floor.rooms || []).find((r) => r.id === m.id);
          if (m.before.shape === 'poly' && m.before.points) room.points = m.before.points.map((p) => [round4(p[0] + adx), round4(p[1] + ady)]);
          else room.rect = [round4(m.before.rect[0] + adx), round4(m.before.rect[1] + ady), m.before.rect[2], m.before.rect[3]];
        }
      }
      drag.moved = true;
      paint();
      return;
    }

    if (drag.mode === 'marquee') {
      const x = Math.min(drag.from.x, ft.x), y = Math.min(drag.from.y, ft.y);
      const w = Math.abs(ft.x - drag.from.x), h = Math.abs(ft.y - drag.from.y);
      drag.rect = [x, y, w, h];
      drag.moved = drag.moved || Math.max(P.S(w), P.S(h)) > 3;
      ghost(el('rect', { x: P.X(x), y: P.Y(y), width: P.S(w), height: P.S(h), class: 'marquee' }));
      return;
    }
  }

  function end(ev) {
    pointers.delete(ev.pointerId);

    /* A pinch ends when it stops being two fingers. The finger still down does
     * NOT become a drag — lifting one of two is a release, not the start of
     * something new — so nothing begins again until the canvas is clear. */
    if (gesture) {
      if (pointers.size < 2) {
        gesture = null;
        svg.classList.remove('panning');
        paint();
        drawSelection();
      }
      return;
    }

    svg.classList.remove('panning');
    if (!drag) return;
    const d = drag; drag = null;
    alignGuides = null;
    dimLabel = null;
    try { svg.releasePointerCapture(ev.pointerId); } catch {}

    if (d.mode === 'pan') {
      /* The touch press that turned out not to be a pan. See tapSelect. */
      if (d.tap && !d.moved) { tapSelect(d.tap); tapAgain(); }
      return;
    }
    if (touching() && !d.past) tapAgain();

    if ((d.mode === 'label' || d.mode === 'label-resize') && d.moved) {
      const room = Store.floor().rooms.find(r => r.id === d.id);
      const after = Store.clone(room);
      for (const key of ['chip_at', 'chip_scale']) {
        if (d.before[key] === undefined) delete room[key]; else room[key] = d.before[key];
      }
      Store.mutate(() => Object.assign(room, after), d.mode === 'label' ? 'move room label' : 'resize room label');
      return;
    }

    if (d.mode === 'rect') {
      const ft = feetAt(ev);
      const x = Math.min(d.from.x, ft.x), y = Math.min(d.from.y, ft.y);
      const w = Math.abs(ft.x - d.from.x), h = Math.abs(ft.y - d.from.y);
      ghost(null);
      if (w < 0.5 || h < 0.5) { toast('Too small — drag a bigger rectangle.', true); return; }
      const name = `Room ${(Store.floor().rooms || []).length + 1}`;
      const id = Store.newRoomId(name);
      Store.mutate((p) => {
        Store.floor().rooms.push({
          id, name, shape: 'rect',
          rect: [round4(x), round4(y), round4(w), round4(h)],
          points: null, floor: 'default', outdoor: false, noLabel: false,
          chip_at: null, chip_rotate: 0, part_of: null,
        });
      }, 'draw room');
      Store.select('room', id);
      Store.setTool('select');
      return;
    }

    /* A move/resize is committed as ONE undo entry at pointer-up. During the
     * drag the project is edited live so the drawing follows the finger; the
     * snapshot taken here is the pre-drag state, restored from `before`. */
    if (d.mode === 'rotate' && d.moved) {
      const item = Store.floor().items.find((i) => i.id === d.id);
      const after = item.props.rot;
      item.props.rot = d.before;
      Store.mutate(() => { item.props.rot = after; }, 'rotate');
      return;
    }

    if (d.mode === 'resize-box' && d.moved) {
      const item = Store.floor().items.find(i => i.id === d.id);
      const after = Store.clone(item);
      Object.assign(item, d.before);
      Store.mutate(() => Object.assign(item, after), 'resize furniture');
      return;
    }
    if (d.mode === 'resize' && d.moved) {
      const item = Store.floor().items.find((i) => i.id === d.id);
      const after = item.props[d.prop];
      item.props[d.prop] = d.before;
      Store.mutate(() => { item.props[d.prop] = after; }, 'resize');
      return;
    }

    if ((d.mode === 'item' || d.mode === 'room' || d.mode === 'vertex') && d.moved) {
      const floor = Store.floor();
      if (d.mode === 'item') {
        const item = floor.items.find((i) => i.id === d.id);
        const after = item.at.slice();
        item.at = d.origin;
        Store.mutate(() => {
          item.at = after;
          // Dropping a marker in a different room re-notes its room, because a
          // stale room label is worse than none: the export writes it verbatim.
          const r = PlanScene.roomAt(floor, after[0], after[1]);
          if (r) item.room = r.id;
        }, 'move marker');
      } else {
        const room = floor.rooms.find((r) => r.id === (d.id || d.room));
        const after = Store.clone(room);
        Object.assign(room, d.before);
        Store.mutate(() => Object.assign(room, after), d.mode === 'vertex' ? 'reshape room' : 'move room');
      }
      return;
    }

    /* Same "revert to before, then one Store.mutate reapplies after" shape as
     * the single item/room case above, generalised to N members so a group
     * move is ONE undo entry, not one per member. */
    if (d.mode === 'group' && d.moved) {
      const floor = Store.floor();
      const afters = d.members.map((m) => {
        const obj = m.kind === 'item' ? floor.items.find((i) => i.id === m.id) : floor.rooms.find((r) => r.id === m.id);
        return { kind: m.kind, id: m.id, after: Store.clone(obj) };
      });
      for (const m of d.members) {
        const obj = m.kind === 'item' ? floor.items.find((i) => i.id === m.id) : floor.rooms.find((r) => r.id === m.id);
        Object.assign(obj, m.before);
      }
      Store.mutate(() => {
        for (const a of afters) {
          const obj = a.kind === 'item' ? floor.items.find((i) => i.id === a.id) : floor.rooms.find((r) => r.id === a.id);
          Object.assign(obj, a.after);
          if (a.kind === 'item') {
            const r = PlanScene.roomAt(floor, obj.at[0], obj.at[1]);
            if (r) obj.room = r.id;
          }
        }
      }, 'move group');
      return;
    }

    if (d.mode === 'marquee') {
      ghost(null);
      if (!d.moved) { Store.select(null); return; }
      const [mx, my, mw, mh] = d.rect;
      const floor = Store.floor();
      const hits = [];
      for (const item of floor.items || []) {
        if (item.at[0] >= mx && item.at[0] <= mx + mw && item.at[1] >= my && item.at[1] <= my + mh) hits.push({ kind: 'item', id: item.id });
      }
      /* A room counts only if the marquee FULLY encloses it — "touches the
       * edge" would make a small box drawn anywhere near a big room's wall
       * select the whole room, which reads as the marquee doing something
       * unrelated to what was dragged over. Items have no size to be
       * ambiguous about, so they only need the point test above. */
      for (const room of floor.rooms || []) {
        const [bx, by, bw, bh] = PlanScene.roomBBox(room);
        if (bx >= mx && by >= my && bx + bw <= mx + mw && by + bh <= my + mh) hits.push({ kind: 'room', id: room.id });
      }
      Store.setMulti(d.shift ? S.multi.concat(hits) : hits);
    }
  }

  function drawPolyGhost(cursor) {
    if (!polyPts || !polyPts.length) return;
    const P = scene.projector;
    const pts = polyPts.concat(cursor ? [[cursor.x, cursor.y]] : []);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${P.X(p[0])} ${P.Y(p[1])}`).join(' ') + (polyPts.length > 1 ? ' Z' : '');
    const g = el('g');
    g.appendChild(el('path', { d, class: 'ghost' }));
    for (const p of polyPts) g.appendChild(el('circle', { cx: P.X(p[0]), cy: P.Y(p[1]), r: 3.5, class: 'handle' }));
    ghost(g);
  }

  function finishPoly() {
    if (!polyPts || polyPts.length < 3) { polyPts = null; ghost(null); return; }
    const name = `Room ${(Store.floor().rooms || []).length + 1}`;
    const id = Store.newRoomId(name);
    const pts = polyPts.map((p) => [round4(p[0]), round4(p[1])]);
    polyPts = null;
    ghost(null);
    Store.mutate(() => {
      Store.floor().rooms.push({
        id, name, shape: 'poly', rect: null, points: pts,
        floor: 'default', outdoor: false, noLabel: false,
        chip_at: null, chip_rotate: 0, part_of: null,
      });
    }, 'draw shape');
    Store.select('room', id);
    Store.setTool('select');
  }

  function cancelPoly() { polyPts = null; ghost(null); }

  /* The one place an item is actually created from a library type — shared by
   * the click-to-place tool below and by dropping a library button straight
   * onto the plan, so the two ways in cannot drift into placing a subtly
   * different object. */
  function placeType(typeKey, ft) {
    const t = S.library.types[typeKey];
    if (!t) return null;
    const floor = Store.floor();
    const kind = t.kind;
    const type = typeKey.includes('.') ? typeKey.split('.').slice(1).join('.') : typeKey;
    const id = Store.newItemId(kind);
    const room = PlanScene.roomAt(floor, ft.x, ft.y);
    /* Defaults can contain arrays (value-label thresholds are the first stock
     * example). A shallow copy would make editing one placed label mutate the
     * library default and every later label in the session. */
    const props = Store.clone(t.defaults || {});
    Store.mutate(() => {
      floor.items.push({
        id, kind, type,
        at: [round4(ft.x), round4(ft.y)],
        room: room ? room.id : null,
        entity: kind === 'furniture' ? undefined : null,
        name: null, props,
      });
    }, 'place ' + type);
    Store.select('item', id);
    return id;
  }

  function placeArmed(ft) {
    placeType(S.armed.typeKey, ft);
    // Stay armed: placing eight spots in a row should not need eight trips to
    // the palette. Escape or the Select tool disarms.
  }

  function placeAperture(hit) {
    const floor = Store.floor();
    const e = hit.edge;
    /* The chosen type's own dimensions, not a fixed 2.5 ft: a double door and a
     * ventilator are not the same size, and starting every opening at the same
     * width means every one of them needs fixing by hand afterwards. */
    const typeKey = S.openingType || 'door';
    const def = ((S.boundaries && S.boundaries.openingTypes) || {})[typeKey] || {};
    const dp = def.props || {};
    const w = dp.w || 2.5;
    const along = e.horizontal ? hit.at[0] : hit.at[1];
    const lo = e.horizontal ? Math.min(e.a[0], e.b[0]) : Math.min(e.a[1], e.b[1]);
    const hi = e.horizontal ? Math.max(e.a[0], e.b[0]) : Math.max(e.a[1], e.b[1]);
    if (hi - lo < w) { toast(`That wall is ${(hi - lo).toFixed(1)}′ — too short for a ${def.label || typeKey}.`, true); return; }
    const at = Math.max(lo, Math.min(hi - w, Store.snap(along - w / 2)));
    ghost(null);
    let id = 'op1';
    const taken = new Set((floor.openings || []).map((o) => o.id));
    for (let i = 1; taken.has('op' + i); i++) id = 'op' + (i + 1);
    Store.mutate(() => {
      floor.openings = floor.openings || [];
      const op = { id, type: typeKey, room: hit.room.id, wall: e.wall, at: round4(at), w };
      for (const k of ['h', 'sill', 'swing', 'hinge', 'leaves', 'leafRatio', 'slideTo', 'depth', 'curtain']) {
        if (dp[k] !== undefined) op[k] = dp[k];
      }
      floor.openings.push(op);
    }, 'place ' + (def.label || 'opening'));
    Store.select('opening', id);
  }

  const round4 = (n) => Math.round(n * 10000) / 10000;

  /* A room's bounds come from its real footprint. A furniture item's `at` IS
   * its top-left corner (plan-scene.js draws it that way), so it has a real
   * left edge distinct from its right one; a device/fixture's `at` is a
   * CENTRE with no footprint at all, so all four edges and both centres
   * collapse to the same point — "align left" and "align right" on a bare
   * device do the same thing, which is the only honest answer for something
   * with no width to have a left or right side OF. */
  function memberBounds(m, floor) {
    if (m.kind === 'item') {
      const item = floor.items.find((i) => i.id === m.id);
      if (!item) return null;
      const t = PlanScene.resolveType(S.library, item) || {};
      if ((item.kind || t.kind) === 'furniture') {
        const w = (item.props && item.props.w) || 3, h = (item.props && item.props.h) || 3;
        return { x0: item.at[0], y0: item.at[1], x1: item.at[0] + w, y1: item.at[1] + h };
      }
      return { x0: item.at[0], y0: item.at[1], x1: item.at[0], y1: item.at[1] };
    }
    const room = floor.rooms.find((r) => r.id === m.id);
    if (!room) return null;
    const [bx, by, bw, bh] = PlanScene.roomBBox(room);
    return { x0: bx, y0: by, x1: bx + bw, y1: by + bh };
  }

  function translateMember(m, floor, dx, dy) {
    if (m.kind === 'item') {
      const item = floor.items.find((i) => i.id === m.id);
      if (item) item.at = [round4(item.at[0] + dx), round4(item.at[1] + dy)];
    } else {
      const room = floor.rooms.find((r) => r.id === m.id);
      if (!room) return;
      if (room.shape === 'poly' && room.points) room.points = room.points.map((p) => [round4(p[0] + dx), round4(p[1] + dy)]);
      else if (room.rect) room.rect = [round4(room.rect[0] + dx), round4(room.rect[1] + dy), room.rect[2], room.rect[3]];
    }
  }

  /* mode: left/centerX/right/top/centerY/bottom. Explicit buttons for exactly
   * what the drag-time guides above do implicitly — "line these up" without
   * having to drag any one of them precisely enough to trip a guide. Each
   * member moves by a plain translation (never a resize), so a fan and a
   * room can align edges without either one changing size to do it. */
  function alignMulti(mode) {
    if (S.multi.length < 2) return;
    const floor = Store.floor();
    const bounds = S.multi.map((m) => ({ m, b: memberBounds(m, floor) })).filter((x) => x.b);
    if (bounds.length < 2) return;
    const axisX = mode === 'left' || mode === 'right' || mode === 'centerX';
    let ref;
    if (mode === 'left') ref = Math.min(...bounds.map((x) => x.b.x0));
    else if (mode === 'right') ref = Math.max(...bounds.map((x) => x.b.x1));
    else if (mode === 'centerX') ref = bounds.reduce((s, x) => s + (x.b.x0 + x.b.x1) / 2, 0) / bounds.length;
    else if (mode === 'top') ref = Math.min(...bounds.map((x) => x.b.y0));
    else if (mode === 'bottom') ref = Math.max(...bounds.map((x) => x.b.y1));
    else if (mode === 'centerY') ref = bounds.reduce((s, x) => s + (x.b.y0 + x.b.y1) / 2, 0) / bounds.length;
    else return;
    Store.mutate(() => {
      for (const { m, b } of bounds) {
        const cur = axisX
          ? (mode === 'left' ? b.x0 : mode === 'right' ? b.x1 : (b.x0 + b.x1) / 2)
          : (mode === 'top' ? b.y0 : mode === 'bottom' ? b.y1 : (b.y0 + b.y1) / 2);
        translateMember(m, floor, axisX ? ref - cur : 0, axisX ? 0 : ref - cur);
      }
    }, 'align');
  }

  function deleteSelected() {
    const label = selectedLabel();
    if (label) { Store.mutate(() => { label.noLabel = true; }, 'hide room label'); Store.select('room', label.id); return; }
    if (S.multi.length > 1) {
      const roomIds = new Set(S.multi.filter((m) => m.kind === 'room').map((m) => m.id));
      const itemIds = new Set(S.multi.filter((m) => m.kind === 'item').map((m) => m.id));
      if (!roomIds.size && !itemIds.size) return;
      const floor = Store.floor();
      Store.mutate(() => {
        floor.rooms = floor.rooms.filter((r) => !roomIds.has(r.id));
        floor.items = (floor.items || []).filter((i) => !itemIds.has(i.id));
        floor.openings = (floor.openings || []).filter((o) => !roomIds.has(o.room));
        floor.boundaries = (floor.boundaries || []).filter((b) => !roomIds.has(b.room));
      }, 'delete selection');
      Store.select(null);
      return;
    }
    const sel = Store.selected();
    if (!sel) return;
    const floor = Store.floor();
    const kind = S.selection.kind;
    Store.mutate(() => {
      if (kind === 'room') {
        floor.rooms = floor.rooms.filter((r) => r.id !== sel.id);
        floor.openings = (floor.openings || []).filter((a) => a.room !== sel.id);
        floor.boundaries = (floor.boundaries || []).filter((b) => b.room !== sel.id);
      } else if (kind === 'opening') {
        floor.openings = (floor.openings || []).filter((o) => o.id !== sel.id);
      } else {
        floor.items = floor.items.filter((i) => i.id !== sel.id);
      }
    }, 'delete');
    Store.select(null);
  }

  /* Zoom, optionally about a point on the screen.
   *
   * Without an anchor the plan is centred in its scroller, so zooming in walks
   * away from whatever you were looking at and you go hunting for it with the
   * scrollbars — the single most irritating thing about the editor at any zoom
   * above Fit. With one, the point under the pointer (or between two fingers)
   * is still under it afterwards, which is what every map and every design
   * tool does and what nobody notices until it is missing.
   *
   * The correction is measured, not calculated: where that fraction of the
   * drawing ACTUALLY landed after the resize, minus where it should be. That
   * survives the plan being centred when it is small, clamped when it is
   * large, and every rounding in between. */
  function zoomTo(z, anchor, light) {
    const next = Math.max(0.2, Math.min(6, z));
    if (!scene) { S.view.zoom = next; return; }
    const box = anchor ? svg.getBoundingClientRect() : null;
    const fx = box && box.width ? (anchor.x - box.left) / box.width : 0;
    const fy = box && box.height ? (anchor.y - box.top) / box.height : 0;

    S.view.zoom = next;
    if (light) {
      svg.setAttribute('width', scene.width * next);
      svg.setAttribute('height', scene.height * next);
    } else paint();

    if (anchor) {
      const after = svg.getBoundingClientRect();
      wrap.scrollLeft += (after.left + fx * after.width) - anchor.x;
      wrap.scrollTop += (after.top + fy * after.height) - anchor.y;
    }
    Store.emit('view');
  }

  /* The status bar's − and + buttons, and the keyboard's. They zoom about the
   * middle of what you are looking at rather than about the middle of the
   * drawing, for the same reason the wheel zooms about the pointer: the thing
   * you were looking at is the thing you want to still be looking at. */
  function zoomStep(mul) {
    const r = wrap.getBoundingClientRect();
    zoomTo(S.view.zoom * mul, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  function fit() {
    if (!scene) return;
    const pad = 44;
    const zx = (wrap.clientWidth - pad) / scene.width;
    const zy = (wrap.clientHeight - pad) / scene.height;
    zoomTo(Math.min(zx, zy));
  }

  function toast(msg, isErr) { if (window.Panels) Panels.toast(msg, isErr); }

  function init(opts) {
    svg = document.getElementById('canvas');
    wrap = document.getElementById('canvasScroll');
    onStatus = opts.onStatus || onStatus;
    onInspect = opts.onInspect || onInspect;

    /* The starting guess, corrected by the first real event. A tablet should
     * not have to be touched once before its handles are the right size. */
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) pointerKind = 'touch';
    } catch (e) { /* an engine without matchMedia keeps the mouse defaults */ }

    svg.addEventListener('pointerdown', begin);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', () => { const g = svg.querySelector('#fps-measure'); if (g) g.replaceChildren(); });
    svg.addEventListener('dblclick', (ev) => { if (S.tool === 'poly') { ev.preventDefault(); finishPoly(); } });
    svg.addEventListener('contextmenu', (ev) => { if (S.tool === 'poly') { ev.preventDefault(); finishPoly(); } });

    /* Hold Space to pan — promised by the Pan tool's own tooltip since the
     * first version of this editor, and bound by nothing until now. It is the
     * gesture a trackpad most wants: two-finger scroll moves the pane, but
     * grabbing the paper is what you reach for when the other hand is already
     * on the keyboard. */
    const typingNow = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    window.addEventListener('keydown', (ev) => {
      if (ev.code !== 'Space' || ev.repeat || typingNow()) return;
      ev.preventDefault();
      spaceHeld = true;
      svg.classList.add('space-pan');
    });
    const dropSpace = () => { spaceHeld = false; svg.classList.remove('space-pan'); };
    window.addEventListener('keyup', (ev) => { if (ev.code === 'Space') dropSpace(); });
    /* Alt-tabbing away with Space down otherwise leaves the canvas convinced
     * it is still held, and every click pans. */
    window.addEventListener('blur', dropSpace);

    /* One wheel, three devices.
     *
     *   mouse       a notch is ±100px and Ctrl means zoom
     *   trackpad    a pinch arrives as ctrlKey with a small delta — the
     *               browser's own convention, not ours — and a two-finger
     *               scroll arrives as a plain wheel, which keeps scrolling
     *               the pane
     *   Mac         Cmd is the modifier people reach for, so honour both
     *
     * Exponential rather than a fixed step per event, so the tiny deltas a
     * trackpad pinch emits accumulate smoothly instead of snapping a notch at
     * a time, and one wheel notch still lands near the 1.12 it always was. */
    wrap.addEventListener('wheel', (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;   // plain wheel keeps scrolling the pane
      ev.preventDefault();
      const px = ev.deltaMode === 1 ? ev.deltaY * 16
        : ev.deltaMode === 2 ? ev.deltaY * wrap.clientHeight : ev.deltaY;
      const factor = Math.min(2, Math.max(0.5, Math.exp(-px * 0.0015)));
      zoomTo(S.view.zoom * factor, { x: ev.clientX, y: ev.clientY });
    }, { passive: false });

    /* Drag a library button straight onto the plan. Native HTML drag and
     * drop, not a pointer-tracked ghost: it's the gesture every user already
     * has for "take this from over there and put it there", and the browser
     * gives the drag image and the drop-allowed cursor for free. `dragover`
     * only sees the MIME type (browsers withhold the payload until `drop`,
     * for cross-site drags), which is exactly enough to say yes and light up
     * the canvas. */
    svg.addEventListener('dragover', (ev) => {
      if (!ev.dataTransfer.types.includes(FPS_DND_TYPE)) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
      wrap.classList.add('drop-target');
    });
    svg.addEventListener('dragleave', () => wrap.classList.remove('drop-target'));
    svg.addEventListener('drop', (ev) => {
      wrap.classList.remove('drop-target');
      const typeKey = ev.dataTransfer.getData(FPS_DND_TYPE);
      if (!typeKey || !Store.floor()) return;
      ev.preventDefault();
      const id = placeType(typeKey, feetAt(ev));
      if (id) Store.setTool('select');
    });

    return { paint, fit, zoomTo, zoomStep, deleteSelected, finishPoly, cancelPoly, drawSelection, placeType };
  }

  /* Exported so the properties panel can draw the SAME nodes the plan draws for
   * its variant previews. A picker that renders its options by any other route
   * is a picker that can lie about what you are choosing. */
  return {
    init, paint, fit, zoomTo, zoomStep, deleteSelected, finishPoly, cancelPoly, drawSelection, roomEdges,
    usingTouch: () => touching(),
    nudgeRotation, nudgeSize, nudgePosition, duplicateSelected, alignMulti, nodeToEl,
    furnitureBox, resizedBox, frontAngle,
  };
}());
