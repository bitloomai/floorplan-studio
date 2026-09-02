/* Chrome: floor tabs, the library palette, the property inspector and the
 * modals (entity picker, library editor, theme editor, import, export).
 *
 * Everything here reads Store and calls Store.mutate — no panel owns state of
 * its own, so a change made in one place cannot leave another showing something
 * stale. Panels re-render wholesale on every store event; at this size that is
 * cheaper than diffing and impossible to get subtly wrong. */
window.Panels = (function () {
  'use strict';

  const S = Store.S;
  const $ = (id) => document.getElementById(id);
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) {
      e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return e;
  };

  /* ---------- toast ---------- */

  let toastTimer;
  function toast(msg, isErr) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 5200 : 2600);
  }

  /* ---------- modal ---------- */

  function modal(title, bodyEl) {
    $('modalTitle').textContent = title;
    $('modalBody').replaceChildren(bodyEl);
    $('modal').hidden = false;
  }
  function closeModal() { $('modal').hidden = true; }

  /* One list, not a shortcut hidden in each tooltip's own corner — a person
   * who already knows to reach for one probably knows there are more, and
   * "?" is the one key every other editor in this genre answers the same
   * way. Grouped by what you're doing, not alphabetised, because "how do I
   * turn a fan" is the question, not "what does bracket do". */
  const SHORTCUTS = [
    ['Tools', [
      ['V', 'Select / move'], ['R', 'Draw a rectangular room'], ['P', 'Draw a room outline'],
      ['A', 'Place a door, window or opening'], ['H', 'Pan'],
    ]],
    ['Placing', [
      ['Click a library item, then click the plan', 'Place one — stays armed for more'],
      ['Drag a library item onto the plan', 'Place it there directly'],
      ['Esc', 'Stop placing / deselect / close a dialog'],
    ]],
    ['The selected item or room', [
      ['Arrow keys', 'Move a few inches — hold Shift for a foot'],
      ['[ / ]', 'Rotate — hold Shift for 45° steps'],
      ['− / +', 'Resize'],
      ['Delete / Backspace', 'Remove'],
      ['Ctrl/Cmd+D', 'Duplicate'],
    ]],
    ['Editing', [
      ['Ctrl/Cmd+Z', 'Undo'], ['Ctrl/Cmd+Shift+Z', 'Redo'], ['Ctrl/Cmd+S', 'Save'],
      ['Enter', 'Finish the room outline you’re drawing'],
    ]],
    ['View', [
      ['Ctrl/Cmd + scroll', 'Zoom'], ['Space / middle-drag / Alt-drag', 'Pan'], ['?', 'This list'],
    ]],
  ];
  function shortcutsDialog() {
    const body = h('div', {},
      ...SHORTCUTS.map(([group, rows]) => h('div', {},
        h('div', { class: 'subhead' }, group),
        h('table', { class: 'grid' }, ...rows.map(([key, what]) => h('tr', {},
          h('td', { class: 'mono', style: 'white-space:nowrap;padding-right:14px' }, key),
          h('td', {}, what),
        ))),
      )));
    modal('Keyboard shortcuts', body);
  }

  /* ---------- theme -> css variables ---------- */

  function applyUiTheme() {
    const ui = Store.uiTheme();
    for (const [k, v] of Object.entries(ui)) document.documentElement.style.setProperty('--' + k, v);
  }

  /* ---------- floor tabs ---------- */

  /* A dropdown rather than the row of pill buttons this used to be: a house
   * with more floors than the topbar is wide made that row scroll sideways
   * with no visible sign there was anything past the edge — a native select
   * never runs out of room and needs no scroll affordance to say so. The "+"
   * stays a separate, permanent button (bound once, in main.js) rather than
   * an option inside the list, since picking "Add a floor" out of a list of
   * floors to switch to is a different kind of choice than the others in it. */
  function renderFloors() {
    const sel = $('floorSelect');
    sel.replaceChildren();
    for (const f of S.project.floors || []) {
      sel.appendChild(h('option', {
        value: f.id, selected: f.id === S.activeFloorId,
        title: `${f.name} · level ${f.level_ft}′ · ${(f.rooms || []).length} rooms`,
      }, f.name));
    }
  }

  function addFloor() {
    const levels = (S.project.floors || []).map((f) => f.level_ft || 0);
    const next = levels.length ? Math.max(...levels) + 10 : 0;
    const name = `Floor ${(S.project.floors || []).length + 1}`;
    const id = Store.uniqueId(name, new Set((S.project.floors || []).map((f) => f.id)));
    Store.mutate(() => {
      S.project.floors.push({
        id, name, level_ft: next, icon: 'mdi:floor-plan',
        extent: { w: 40, h: 40 }, grid: { size: 0.5, snap: true, reference: null },
        rooms: [], openings: [], boundaries: [], items: [],
        sun: null, popup: null, _legacy: undefined,
      });
    }, 'add floor');
    S.activeFloorId = id;
    Store.emit('floor');
  }

  /* ---------- library palette ---------- */

  /* This used to be its own little world — a circle for every device, a
   * rounded rectangle for every piece of furniture, no matter what the type
   * actually was. `shapes.js` already draws a real fan, a real bullet camera,
   * a real bed with pillows — for the "Look" grid below and for the plan
   * itself — so a palette button showing something else was this file
   * quietly maintaining a second, worse renderer nobody asked it to. This
   * calls the same `Shapes.furniture`/`Shapes.marker`/`Shapes.icon` those use,
   * with the type's OWN defaults standing in for a real item's live state
   * (no entity, not on, nothing spinning) — so a fan in the library looks
   * like the fan you are about to place, not a guess at one. */
  const numOr = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  function typeIcon(typeKey, t) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    const VB = 40, cx = 20, cy = 20, R = 12;
    svg.setAttribute('viewBox', `0 0 ${VB} ${VB}`);
    svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
    const theme = Store.theme();
    const r = t.render || {};
    const defs = t.defaults || {};
    const stroke = PlanScene.colour((t.states && t.states.on && t.states.on.stroke) || '@offRim', theme, '#888');
    const fill = PlanScene.colour((t.states && t.states.on && t.states.on.fill) || '@offFill', theme, '#eee');
    const glyphColour = PlanScene.colour((t.states && t.states.on && t.states.on.glyph) || '@glyphOff', theme, '#9aa4b6');
    const nodes = [];

    if (t.kind === 'furniture') {
      // A real footprint, scaled to fill this small box regardless of how big
      // the thing actually is — a nightstand and a pool table both read
      // clearly here, at whatever pixels-per-foot each one needs on its own.
      const w = numOr(defs.w, 3), h = numOr(defs.h, 3);
      const pad = 4;
      const scale = (VB - pad * 2) / Math.max(w, h, 0.1);
      const W = w * scale, H = h * scale;
      const X = (VB - W) / 2, Y = (VB - H) / 2;
      const c = {
        x: 0, y: 0, w, h, p: defs, t: theme,
        P: { X: (wx) => X + wx * scale, Y: (wy) => Y + wy * scale, S: (len) => len * scale },
        X, Y, W, H,
        fill: PlanScene.colour(r.fill || '@furnFill', theme, theme.furnFill),
        line: PlanScene.colour(r.line || '@furnLine', theme, theme.furnLine),
      };
      nodes.push(...(Shapes.furniture(r.shape || 'rect', c) || []));
    } else if (r.family && Shapes.MARKERS[r.family]) {
      nodes.push(...Shapes.marker(r.family, defs.variant, {
        cx, cy, R,
        fill, line: stroke, glyph: glyphColour, accent: stroke,
        facing: 0, on: false, pct: 60, spin: false, p: defs,
      }));
    } else if (r.shape === 'label') {
      nodes.push({ tag: 'rect', attrs: { x: 4, y: 11, width: 32, height: 18, rx: 4, fill: 'none', stroke, 'stroke-width': 1.4 } });
      nodes.push({ tag: 'text', text: '23°', attrs: { x: cx, y: cy + 4, 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle', fill: glyphColour } });
    } else if (r.shape === 'line') {
      nodes.push({ tag: 'line', attrs: { x1: cx - R, y1: cy, x2: cx + R, y2: cy, stroke, 'stroke-width': numOr(r.thickness, 4), 'stroke-linecap': 'round' } });
    } else if (r.shape === 'channelBox') {
      const w = R * 2.2, h = R * 1.1;
      nodes.push({ tag: 'rect', attrs: { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: numOr(r.radius, 3), fill, stroke, 'stroke-width': 1.2 } });
      for (let i = 0; i < 4; i++) nodes.push({ tag: 'circle', attrs: { cx: cx - w / 2 + (w / 4) * (i + 0.5), cy, r: 1.6, fill: stroke } });
    } else if (r.shape === 'perimeter') {
      nodes.push({ tag: 'rect', attrs: { x: cx - R, y: cy - R, width: R * 2, height: R * 2, rx: 3, fill: 'none', stroke, 'stroke-width': 1.5 } });
      nodes.push({ tag: 'circle', attrs: { cx, cy, r: 4, fill, stroke, 'stroke-width': 1.2 } });
    } else if (r.shape === 'camera') {
      nodes.push({ tag: 'circle', attrs: { cx, cy, r: R * 0.7, fill, stroke, 'stroke-width': 1.4 } });
      nodes.push(...Shapes.icon('camera', cx, cy, glyphColour, 0.72 * (R / 8.5)));
    } else {
      nodes.push({ tag: 'circle', attrs: { cx, cy, r: R * 0.7, fill, stroke, 'stroke-width': 1.4 } });
      if (r.icon) nodes.push(...Shapes.icon(r.icon, cx, cy, glyphColour, numOr(r.iconScale, 0.8) * (R / 8.5)));
      else if (r.glyph) nodes.push({ tag: 'text', text: r.glyph, attrs: { x: cx, y: cy + 4, 'font-size': 12, 'text-anchor': 'middle', fill: glyphColour } });
    }
    for (const n of nodes) svg.appendChild(Canvas.nodeToEl(n));
    return svg;
  }

  function renderLibrary() {
    const box = $('libraryList');
    const q = ($('libSearch').value || '').trim().toLowerCase();
    box.replaceChildren();
    const cats = S.library.categories || [];
    for (const cat of cats) {
      const entries = Object.entries(S.library.types)
        .filter(([, t]) => t.category === cat.id)
        .filter(([k, t]) => !q || k.toLowerCase().includes(q) || (t.label || '').toLowerCase().includes(q))
        .sort((a, b) => (a[1].label || a[0]).localeCompare(b[1].label || b[0]));
      if (!entries.length) continue;
      const items = h('div', { class: 'lib-items' });
      for (const [key, t] of entries) {
        const btn = h('button', {
          class: 'lib-item', title: `${t.label} — ${t.kind}\nClick the plan to place one, or drag this onto it.`,
          draggable: 'true',
          'aria-pressed': String(!!(S.armed && S.armed.typeKey === key)),
          onclick: () => { Store.arm(S.armed && S.armed.typeKey === key ? null : key); },
          /* Native HTML drag and drop — canvas.js's own dragover/drop handle
           * the far end. `effectAllowed`/`dropEffect` both say "copy" so the
           * cursor reads as "place a new one", not "move this button". */
          ondragstart: (ev) => {
            ev.dataTransfer.setData('application/x-fps-type', key);
            ev.dataTransfer.effectAllowed = 'copy';
          },
        }, h('span', { class: 'lbl' }, t.label || key));
        btn.prepend(typeIcon(key, t));
        items.appendChild(btn);
      }
      box.appendChild(h('div', { class: 'lib-cat' }, h('h3', {}, cat.label), items));
    }
    $('placeHint').textContent = S.armed
      ? `Placing ${S.library.types[S.armed.typeKey].label}. Click the plan; Esc to stop.`
      : 'Pick a type and click the plan, or drag it straight onto the plan.';
  }

  /* ---------- inspector ---------- */

  function field(label, control) { return h('div', { class: 'field' }, h('label', {}, label), control); }

  function numInput(value, onchange, step) {
    return h('input', {
      type: 'number', value: value ?? '', step: step || 0.25,
      onchange: (e) => onchange(e.target.value === '' ? null : Number(e.target.value)),
    });
  }

  function renderInspector() {
    const box = $('inspector');
    box.replaceChildren();
    const floor = Store.floor();
    if (!floor) {
      box.appendChild(h('p', { class: 'empty' }, 'No floors yet. Use + in the floor bar to add one.'));
      return;
    }
    if (S.multi.length > 1) return renderMultiPanel(box);
    const sel = Store.selected();
    if (!sel) return renderFloorPanel(box, floor);
    if (S.selection.kind === 'room') return renderRoomPanel(box, floor, sel);
    if (S.selection.kind === 'opening') return PanelsExtra.renderOpeningPanel(box, floor, sel);
    return renderItemPanel(box, floor, sel);
  }

  /* No per-item form — "resize this fan and this bed by the same drag" means
   * nothing, so the properties a single selection edits in detail simply
   * aren't offered here. What a GROUP of things can usefully do together is
   * move, align, duplicate and delete, and every one of those already reads
   * `S.multi` directly (canvas.js), so this panel is just buttons for them. */
  function renderMultiPanel(box) {
    const rooms = S.multi.filter((m) => m.kind === 'room').length;
    const items = S.multi.length - rooms;
    const parts = [];
    if (items) parts.push(`${items} item${items === 1 ? '' : 's'}`);
    if (rooms) parts.push(`${rooms} room${rooms === 1 ? '' : 's'}`);
    box.appendChild(h('h2', {}, `${S.multi.length} selected`));
    box.appendChild(h('p', { class: 'hint' }, `${parts.join(', ')}. Drag any one to move the group; arrow keys nudge them together.`));

    box.appendChild(h('div', { class: 'subhead' }, 'Align'));
    const alignBtn = (label, mode, title) => h('button', { class: 'btn tiny', title, onclick: () => Canvas.alignMulti(mode) }, label);
    box.appendChild(h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px' },
      alignBtn('⇤', 'left', 'Align left edges'), alignBtn('↔', 'centerX', 'Centre horizontally'), alignBtn('⇥', 'right', 'Align right edges')));
    box.appendChild(h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
      alignBtn('⇞', 'top', 'Align top edges'), alignBtn('↕', 'centerY', 'Centre vertically'), alignBtn('⇟', 'bottom', 'Align bottom edges')));

    box.appendChild(h('div', { class: 'subhead' }, ' '));
    box.appendChild(h('div', { style: 'display:flex;gap:8px' },
      h('button', { class: 'btn', title: 'Ctrl/Cmd+D', onclick: () => Canvas.duplicateSelected() }, 'Duplicate'),
      h('button', { class: 'btn danger', title: 'Delete / Backspace', onclick: () => Canvas.deleteSelected() }, 'Delete')));
  }

  function renderFloorPanel(box, floor) {
    box.appendChild(h('h2', {}, 'Floor'));
    box.appendChild(field('Name', h('input', {
      type: 'text', value: floor.name,
      onchange: (e) => Store.mutate(() => { floor.name = e.target.value; }, 'rename floor'),
    })));
    box.appendChild(field('Dashboard icon (MDI)', h('input', {
      type: 'text',
      value: floor.icon && floor.icon !== 'mdi:floor-plan' ? floor.icon : '',
      placeholder: 'automatic from name and level',
      spellcheck: 'false',
      class: 'mono',
      onchange: (e) => Store.mutate(() => {
        floor.icon = e.target.value.trim() || 'mdi:floor-plan';
      }, 'floor icon'),
    }), 'Used when Dashboard → Floor tabs is set to Icons. Example: mdi:home-floor-1.'));
    box.appendChild(h('div', { class: 'field row' },
      h('div', {}, h('label', {}, 'Level (ft)'), numInput(floor.level_ft, (v) => Store.mutate(() => { floor.level_ft = v ?? 0; }, 'level'), 0.5)),
      h('div', {}, h('label', {}, 'Rooms'), h('input', { type: 'text', value: (floor.rooms || []).length, disabled: true })),
    ));
    box.appendChild(h('div', { class: 'field row' },
      h('div', {}, h('label', {}, 'Extent W (ft)'), numInput(floor.extent.w, (v) => Store.mutate(() => { floor.extent.w = v || 1; }, 'extent'))),
      h('div', {}, h('label', {}, 'Extent H (ft)'), numInput(floor.extent.h, (v) => Store.mutate(() => { floor.extent.h = v || 1; }, 'extent'))),
    ));

    if (floor._legacy && Object.keys(floor._legacy).length) {
      box.appendChild(h('div', { class: 'subhead' }, 'Carried through untouched'));
      box.appendChild(h('p', { class: 'hint' },
        `${Object.keys(floor._legacy).length} keys from the imported spec (${Object.keys(floor._legacy).slice(0, 4).join(', ')}${Object.keys(floor._legacy).length > 4 ? '…' : ''}) are preserved and re-emitted on export, even though this editor does not show them.`));
    }

    PanelsExtra.shortcutsEditor(box, floor, 'floor');

    box.appendChild(h('div', { class: 'subhead' }, `Openings (${(floor.openings || []).length})`));
    if (!(floor.openings || []).length) box.appendChild(h('p', { class: 'hint' }, 'Use the Opening tool and click a wall.'));
    for (const op of floor.openings || []) {
      const def = ((S.boundaries && S.boundaries.openingTypes) || {})[op.type] || {};
      box.appendChild(h('button', {
        class: 'btn tiny', style: 'display:block;width:100%;text-align:left;margin-bottom:4px',
        onclick: () => Store.select('opening', op.id),
      }, `${def.label || op.type} — ${op.room} ${PanelsExtra.wallLabel(op.wall)}${op.sensor ? ' · sensored' : ''}`));
    }

    box.appendChild(h('div', { class: 'subhead' }, 'Floor actions'));
    box.appendChild(h('button', {
      class: 'btn danger', onclick: () => {
        if (!confirm(`Delete "${floor.name}" and everything on it?`)) return;
        Store.mutate(() => { S.project.floors = S.project.floors.filter((f) => f.id !== floor.id); }, 'delete floor');
        S.activeFloorId = (S.project.floors[0] || {}).id || null;
        Store.emit('floor');
      },
    }, 'Delete this floor'));
  }

  /* What KIND of room this is — kitchen, motor room, pool deck.
   *
   * A starting point, not a constraint: choosing one sets the flooring and the
   * outdoor flag and then gets out of the way, so a lawn does not have to be
   * given grass by hand and a motor room does not arrive carpeted. The list is
   * `library.json`'s `roomTypes`, so a house that invents "puja store" or
   * "cattle shed" gets it in the dropdown with no code change. */
  function roomTypeField(box, room) {
    const types = Object.entries((S.library && S.library.roomTypes) || {});
    if (!types.length) return;
    const groups = [...new Set(types.map(([, t]) => t.group || 'Other'))];
    box.appendChild(field('Room type', h('select', {
      onchange: (e) => Store.mutate(() => {
        const id = e.target.value;
        room.roomType = id || null;
        const t = id && S.library.roomTypes[id];
        if (!t) return;
        /* Applied once, on choosing. Re-applying on every render would fight
         * anyone who then changed the flooring on purpose. */
        if (t.flooring) room.flooring = t.flooring;
        room.outdoor = !!t.outdoor;
      }, 'room type'),
    }, h('option', { value: '', selected: !room.roomType }, '(unset)'),
       ...groups.map((g) => h('optgroup', { label: g },
         ...types.filter(([, t]) => (t.group || 'Other') === g)
           .sort((a, b) => (a[1].label || '').localeCompare(b[1].label || ''))
           .map(([k, t]) => h('option', { value: k, selected: room.roomType === k }, t.label || k)))))));
    if (room.roomType) {
      const t = S.library.roomTypes[room.roomType] || {};
      box.appendChild(h('p', { class: 'hint' },
        `Set the flooring to ${t.flooring} and marked it ${t.outdoor ? 'outdoors' : 'indoors'}. Both are yours to change from here on.`));
    }
  }

  function renderRoomPanel(box, floor, room) {
    box.appendChild(h('h2', {}, 'Room'));
    box.appendChild(field('Name', h('input', {
      type: 'text', value: room.name,
      onchange: (e) => Store.mutate(() => { room.name = e.target.value; }, 'rename room'),
    })));
    box.appendChild(field('id', h('input', { type: 'text', value: room.id, disabled: true })));
    roomTypeField(box, room);

    if (room.shape === 'rect') {
      const r = room.rect;
      box.appendChild(h('div', { class: 'field row' },
        h('div', {}, h('label', {}, 'x'), numInput(r[0], (v) => Store.mutate(() => { room.rect[0] = v ?? 0; }, 'room x'))),
        h('div', {}, h('label', {}, 'y'), numInput(r[1], (v) => Store.mutate(() => { room.rect[1] = v ?? 0; }, 'room y'))),
      ));
      box.appendChild(h('div', { class: 'field row' },
        h('div', {}, h('label', {}, 'width'), numInput(r[2], (v) => Store.mutate(() => { room.rect[2] = v || 0.5; }, 'room w'))),
        h('div', {}, h('label', {}, 'height'), numInput(r[3], (v) => Store.mutate(() => { room.rect[3] = v || 0.5; }, 'room h'))),
      ));
    } else {
      box.appendChild(h('p', { class: 'hint' }, `Hand-drawn outline, ${room.points.length} points. Drag the handles on the plan to reshape.`));
      box.appendChild(h('button', {
        class: 'btn', onclick: () => Store.mutate(() => {
          const b = PlanScene.roomBBox(room);
          room.shape = 'rect'; room.rect = b.map((n) => Math.round(n * 10000) / 10000); room.points = null;
        }, 'to rect'),
      }, 'Convert to rectangle'));
    }

    PanelsExtra.flooringField(box, room);

    box.appendChild(h('div', { class: 'field' },
      h('label', { class: 'inline' }, h('input', {
        type: 'checkbox', checked: !!room.outdoor,
        onchange: (e) => Store.mutate(() => { room.outdoor = e.target.checked; }, 'outdoor'),
      }), ' Outdoor'),
    ));
    box.appendChild(h('div', { class: 'field' },
      h('label', { class: 'inline' }, h('input', {
        type: 'checkbox', checked: !!room.noLabel,
        onchange: (e) => Store.mutate(() => { room.noLabel = e.target.checked; }, 'noLabel'),
      }), ' Hide name on the plan'),
    ));

    /* Where the name sits.
     *
     * Left alone, the label finds its own clear spot — the room's centre when
     * nothing is there, and the nearest clear place when something is, which is
     * usually the ceiling fan sitting exactly where the centre is. `chip_at`
     * overrides that outright: a position set by hand is a decision, so nothing
     * second-guesses it afterwards. Nudging simply writes the first one. */
    if (!room.noLabel) {
      const centre = PlanScene.roomCentroid(room);
      const nudge = (dx, dy) => Store.mutate(() => {
        const from = room.chip_at || centre;
        room.chip_at = [Math.round((from[0] + dx) * 10) / 10, Math.round((from[1] + dy) * 10) / 10];
      }, 'move room label');
      box.appendChild(h('div', { class: 'field' },
        h('label', {}, 'Name position'),
        h('div', { style: 'display:flex;gap:4px;align-items:center;flex-wrap:wrap' },
          h('button', { class: 'btn tiny', title: 'Up 1 ft', onclick: () => nudge(0, -1) }, '↑'),
          h('button', { class: 'btn tiny', title: 'Down 1 ft', onclick: () => nudge(0, 1) }, '↓'),
          h('button', { class: 'btn tiny', title: 'Left 1 ft', onclick: () => nudge(-1, 0) }, '←'),
          h('button', { class: 'btn tiny', title: 'Right 1 ft', onclick: () => nudge(1, 0) }, '→'),
          room.chip_at
            ? h('button', {
              class: 'btn tiny',
              title: 'Go back to placing it automatically',
              onclick: () => Store.mutate(() => { room.chip_at = null; }, 'auto room label'),
            }, 'Auto')
            : null,
          h('span', { class: 'hint', style: 'margin:0 0 0 4px' },
            room.chip_at ? `set to ${room.chip_at[0]}, ${room.chip_at[1]} ft` : 'placed automatically'),
        ),
      ));
      box.appendChild(field('Rotate the name (°)', numInput(room.chip_rotate || 0,
        (v) => Store.mutate(() => { room.chip_rotate = ((Math.round(v || 0) % 360) + 360) % 360; }, 'rotate room label'), 15)));
    }

    PanelsExtra.roomExtras(box, floor, room);

    const inRoom = (floor.items || []).filter((i) => PlanScene.pointInRoom(room, i.at[0], i.at[1]));
    /* Daylight, per room. "Enough glass" is a judgement about a room, not about
     * a house: a stairwell and a living room with identical glazed-to-floor
     * ratios are not equally well lit in practice. Blank inherits the house. */
    box.appendChild(h('div', { class: 'subhead' }, 'Daylight'));
    const dl = room.daylight || {};
    box.appendChild(field('Fully-daylit glazing ratio (blank = use the house)', h('input', {
      type: 'number', step: 0.01, min: 0.01, max: 1, value: dl.referenceExposure ?? '',
      placeholder: String((S.project.sun && S.project.sun.ambient && S.project.sun.ambient.referenceExposure) ?? 0.16),
      onchange: (e) => Store.mutate(() => {
        const v = e.target.value === '' ? null : Number(e.target.value);
        if (v === null) { if (room.daylight) delete room.daylight.referenceExposure; } else {
          room.daylight = Object.assign({}, room.daylight, { referenceExposure: v });
        }
      }, 'room daylight'),
    })));
    if (room.outdoor) {
      box.appendChild(h('p', { class: 'hint' },
        'This room is marked outdoor, so it is lit from above and the ratio is not consulted — it takes the open-sky share instead.'));
    }

    box.appendChild(h('div', { class: 'subhead' }, `Markers inside (${inRoom.length})`));
    for (const it of inRoom) {
      box.appendChild(h('button', {
        class: 'btn tiny', style: 'display:block;width:100%;text-align:left;margin-bottom:4px',
        onclick: () => Store.select('item', it.id),
      }, `${it.type} — ${it.entity || it.name || 'unbound'}`));
    }

    box.appendChild(h('div', { class: 'subhead' }, ' '));
    box.appendChild(h('button', { class: 'btn danger', onclick: () => Canvas.deleteSelected() }, 'Delete room'));
  }

  function renderItemPanel(box, floor, item) {
    const t = PlanScene.resolveType(S.library, item) || {};
    box.appendChild(h('h2', {}, t.label || item.type));
    box.appendChild(h('p', { class: 'hint' }, h('span', { class: 'badge' }, item.kind), ' ', item.id));

    box.appendChild(h('div', { class: 'field row' },
      h('div', {}, h('label', {}, 'x (ft)'), numInput(item.at[0], (v) => Store.mutate(() => { item.at[0] = v ?? 0; }, 'x'), 0.0625)),
      h('div', {}, h('label', {}, 'y (ft)'), numInput(item.at[1], (v) => Store.mutate(() => { item.at[1] = v ?? 0; }, 'y'), 0.0625)),
    ));

    /* Most furniture is inert, but a type may declare `render.bindable` — a
     * flight of stairs with lit risers is a real thing with a switch on it.
     * Only those get an entity picker; a sofa does not need one. */
    if (item.kind !== 'furniture' || (t.render || {}).bindable) {
      box.appendChild(h('div', { class: 'subhead' }, 'Home Assistant'));
      const cur = item.entity || '(not bound)';
      box.appendChild(h('div', { class: 'field' },
        h('label', {}, 'Entity'),
        h('div', { class: 'entity-pick' },
          h('span', { class: 'cur mono', title: cur }, cur),
          h('button', { class: 'btn tiny', onclick: () => pickEntity(t, (id) => Store.mutate(() => { item.entity = id; }, 'bind')) }, 'Pick…'),
          item.entity && h('button', { class: 'btn tiny', title: 'Clear', onclick: () => Store.mutate(() => { item.entity = null; }, 'unbind') }, '✕'),
        ),
      ));
      if (item.entity && S.states[item.entity]) {
        box.appendChild(h('p', { class: 'hint' }, `currently: ${S.states[item.entity].state}`));
      }

      /* What a LONG PRESS opens. Holding a camera should show you who it saw,
       * not the camera again, and that is a different entity. Left blank the
       * type may still guess one — a camera looks for its own detection sensor
       * — and if neither is available, hold falls back to the marker's own
       * entity, which is what it has always done. */
      const holdCur = (item.props || {}).holdEntity;
      box.appendChild(h('div', { class: 'field' },
        h('label', {}, 'Long press opens'),
        h('div', { class: 'entity-pick' },
          h('span', { class: 'cur mono', title: holdCur || '' }, holdCur || '(this entity, or a guess)'),
          h('button', { class: 'btn tiny', onclick: () => pickEntity(null, (id) => Store.mutate(() => {
            item.props = Object.assign({}, item.props, { holdEntity: id });
          }, 'hold target')) }, 'Pick…'),
          holdCur && h('button', { class: 'btn tiny', title: 'Clear', onclick: () => Store.mutate(() => {
            if (item.props) delete item.props.holdEntity;
          }, 'clear hold') }, '✕'),
        ),
      ));

      box.appendChild(field('Label on the plan', h('input', {
        type: 'text', value: item.name || '', placeholder: 'defaults to the entity name',
        onchange: (e) => Store.mutate(() => { item.name = e.target.value || null; }, 'label'),
      })));
      box.appendChild(field('Room', h('input', {
        type: 'text', value: item.room || '', placeholder: 'auto from position',
        onchange: (e) => Store.mutate(() => { item.room = e.target.value || null; }, 'room'),
      })));
    }

    /* type-declared properties, grouped
     *
     * A flat list of nine numbers is a form nobody reads. The grouping below is
     * by what the property DOES, not by type: size, which way it points, what
     * it reaches, how much light it makes. `rot` and the coverage pair are
     * lifted out of the list because they have better controls than a number
     * box — see below. */
    const props = (t.props || []).filter((p) => p.type !== 'channels');
    const SIZE = new Set(['w', 'h']);
    /* `cone` belongs here rather than in the generic list: it gates whether
     * `fov` and `range` are shown at all, so the three have to be drawn by one
     * function or the checkbox appears twice and the wrong copy is the one
     * people find. */
    const AIM = new Set(['rot', 'fov', 'range', 'cone']);
    const LAMP = new Set(['watt', 'count', 'efficacy', 'beam', 'kelvin']);

    /* ---- Look ----
     *
     * The variant is chosen by looking at the thing, not by reading its name
     * out of a dropdown: "bullet" and "turret" mean nothing until you see them,
     * and the whole point of a marker variant is how it reads on the plan.
     *
     * Each swatch is drawn by the SAME Shapes.marker/Shapes.furniture the
     * renderer calls, so the picker cannot drift from what lands on the plan.
     * Colours come through as `currentColor`, which lets the selected state
     * recolour the drawing by setting one CSS property on the button.
     *
     * Markers pick their look by FAMILY (`t.render.family`); furniture has no
     * such registry — one shape name is one drawing function that branches on
     * `c.p.variant` itself, so its variant names come from
     * `Shapes.furnitureVariantsOf(shape)` instead. Either way, once a grid
     * exists to set `variant`, the generic property list below must not also
     * offer it as a second, redundant text field. */
    const family = ((t.render || {}).family) || null;
    const furnitureShape = item.kind === 'furniture' ? ((t.render || {}).shape || null) : null;
    const markerVariants = family && window.Shapes ? Shapes.variantsOf(family) : [];
    const furnitureVariants = furnitureShape && window.Shapes ? Shapes.furnitureVariantsOf(furnitureShape) : [];
    const hasVariantGrid = markerVariants.length > 1 || furnitureVariants.length > 1;
    const rest = props.filter((p) => !SIZE.has(p.key) && !AIM.has(p.key) && !(hasVariantGrid && p.key === 'variant')
      && !(item.kind === 'fixture' && LAMP.has(p.key)));

    if (markerVariants.length > 1) {
      box.appendChild(h('div', { class: 'subhead' }, 'Look'));
      const grid = h('div', { class: 'variant-grid' });
      const current = item.props.variant || (t.defaults || {}).variant || Shapes.MARKER_DEFAULT[family];
      for (const v of markerVariants) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 40 40');
        svg.setAttribute('width', '36');
        svg.setAttribute('height', '36');
        const nodes = Shapes.marker(family, v, {
          cx: 20, cy: 20, R: 12,
          fill: 'none', line: 'currentColor', glyph: 'currentColor', accent: 'currentColor',
          facing: 0, on: false, pct: 60, spin: false, p: {},
        });
        for (const n of nodes) svg.appendChild(Canvas.nodeToEl(n));
        const btn = h('button', {
          class: 'variant' + (v === current ? ' on' : ''),
          title: v,
          onclick: () => Store.mutate(() => { item.props.variant = v; }, 'look'),
        });
        btn.appendChild(svg);
        btn.appendChild(h('span', {}, v));
        grid.appendChild(btn);
      }
      box.appendChild(grid);
    } else if (furnitureVariants.length > 1) {
      box.appendChild(h('div', { class: 'subhead' }, 'Look'));
      const grid = h('div', { class: 'variant-grid' });
      const current = item.props.variant || (t.defaults || {}).variant || furnitureVariants[0];
      for (const v of furnitureVariants) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 40 40');
        svg.setAttribute('width', '36');
        svg.setAttribute('height', '36');
        /* Preserve the real footprint's aspect ratio in the picker. Forcing a
         * 2x6 bicycle or scooter into a 32x32 square is exactly how a sound
         * top-down drawing turns back into a comical blob before placement. */
        const fw = numOr((t.defaults || {}).w, 3), fh = numOr((t.defaults || {}).h, 3);
        const fs = 32 / Math.max(fw, fh, 0.1);
        const fW = fw * fs, fH = fh * fs, fX = (40 - fW) / 2, fY = (40 - fH) / 2;
        const nodes = Shapes.furniture(furnitureShape, {
          x: 0, y: 0, w: fw, h: fh, X: fX, Y: fY, W: fW, H: fH,
          P: { X: (x) => fX + x * fs, Y: (y) => fY + y * fs, S: (len) => len * fs },
          fill: 'currentColor', line: 'currentColor', p: Object.assign({}, t.defaults || {}, { variant: v }),
        });
        for (const n of nodes) svg.appendChild(Canvas.nodeToEl(n));
        const btn = h('button', {
          class: 'variant' + (v === current ? ' on' : ''),
          title: v,
          onclick: () => Store.mutate(() => { item.props.variant = v; }, 'look'),
        });
        btn.appendChild(svg);
        btn.appendChild(h('span', {}, v));
        grid.appendChild(btn);
      }
      box.appendChild(grid);
    }

    if (item.kind === 'furniture' || props.some((p) => SIZE.has(p.key))) {
      box.appendChild(h('div', { class: 'subhead' }, 'Size'));
      box.appendChild(h('div', { class: 'field row' },
        h('div', {}, h('label', {}, 'width (ft)'), numInput(item.props.w ?? (t.defaults || {}).w, (v) => Store.mutate(() => { item.props.w = v; }, 'w'))),
        h('div', {}, h('label', {}, item.kind === 'furniture' ? 'depth (ft)' : 'height (ft)'), numInput(item.props.h ?? (t.defaults || {}).h, (v) => Store.mutate(() => { item.props.h = v; }, 'h'))),
      ));
    }

    /* Tap area. A marker's tap circle is already about twice its visible disc,
     * which is right for a lamp and hopeless for a marker that stands for
     * something ten feet across — a solar array, a water tank. Setting a
     * rectangle here makes the whole object tappable; smaller targets sitting
     * on top of it still win, because tap shapes are ordered largest-first. */
    if (item.kind !== 'furniture') {
      const hr = (item.props || {}).hitRect;
      box.appendChild(h('div', { class: 'subhead' }, 'Tap area'));
      box.appendChild(h('label', { class: 'inline' },
        h('input', {
          type: 'checkbox', checked: Array.isArray(hr),
          onchange: (e) => Store.mutate(() => {
            if (e.target.checked) {
              const w = numOr(item.props.w, 4), hgt = numOr(item.props.h, 4);
              item.props = Object.assign({}, item.props, { hitRect: [item.at[0] - w / 2, item.at[1] - hgt / 2, w, hgt] });
            } else if (item.props) delete item.props.hitRect;
          }, 'tap area'),
        }), ' Bigger than the marker'));
      if (Array.isArray(hr)) {
        const set = (i, v) => Store.mutate(() => { const r = item.props.hitRect.slice(); r[i] = v ?? 0; item.props.hitRect = r; }, 'tap area');
        box.appendChild(h('div', { class: 'field row' },
          h('div', {}, h('label', {}, 'x (ft)'), numInput(hr[0], (v) => set(0, v), 0.0625)),
          h('div', {}, h('label', {}, 'y (ft)'), numInput(hr[1], (v) => set(1, v), 0.0625)),
        ));
        box.appendChild(h('div', { class: 'field row' },
          h('div', {}, h('label', {}, 'width (ft)'), numInput(hr[2], (v) => set(2, v), 0.0625)),
          h('div', {}, h('label', {}, 'height (ft)'), numInput(hr[3], (v) => set(3, v), 0.0625)),
        ));
      }
    }

    if (props.some((p) => AIM.has(p.key))) PanelsExtra.aimFields(box, item, t, props);
    if (item.kind === 'fixture' && props.some((p) => LAMP.has(p.key))) PanelsExtra.lampFields(box, floor, item, t, props);

    if (rest.length) box.appendChild(h('div', { class: 'subhead' }, 'Properties'));
    for (const p of rest) {
      if (p.type === 'number') {
        box.appendChild(field(p.label, numInput(item.props[p.key] ?? (t.defaults || {})[p.key], (v) => Store.mutate(() => { item.props[p.key] = v; }, p.key), p.step)));
      } else if (p.type === 'entity') {
        const cur = item.props[p.key] || '(none)';
        box.appendChild(h('div', { class: 'field' }, h('label', {}, p.label),
          h('div', { class: 'entity-pick' },
            h('span', { class: 'cur mono', title: cur }, cur),
            h('button', { class: 'btn tiny', onclick: () => pickEntity({ domains: p.domains }, (id) => Store.mutate(() => { item.props[p.key] = id; }, p.key)) }, 'Pick…'))));
      } else if (p.type === 'color') {
        const current = String(item.props[p.key] ?? (t.defaults || {})[p.key] ?? '#000000');
        const text = h('input', {
          type: 'text', value: current, placeholder: '#rrggbb, transparent, or @themeToken',
          onchange: (e) => Store.mutate(() => { item.props[p.key] = e.target.value.trim() || 'transparent'; }, p.key),
        });
        const picker = h('input', {
          type: 'color', value: /^#[0-9a-f]{6}$/i.test(current) ? current : '#000000',
          title: 'Pick a plain color',
          oninput: (e) => {
            text.value = e.target.value;
            Store.mutate(() => { item.props[p.key] = e.target.value; }, p.key);
          },
        });
        box.appendChild(field(p.label, h('div', { class: 'entity-pick' }, picker, text)));
      } else if (p.type === 'thresholds') {
        const fallback = Array.isArray((t.defaults || {})[p.key]) ? (t.defaults || {})[p.key] : [];
        const rules = Array.isArray(item.props[p.key]) ? item.props[p.key] : fallback;
        const ensureRules = () => {
          if (!Array.isArray(item.props[p.key])) item.props[p.key] = JSON.parse(JSON.stringify(fallback));
          return item.props[p.key];
        };
        const rows = h('div', { class: 'field' }, h('label', {}, p.label));
        rules.forEach((rule, index) => {
          const color = String((rule && rule.color) || '#000000');
          const valueInput = h('input', {
            type: 'number', value: rule && rule.at !== undefined ? rule.at : 0,
            placeholder: 'value', style: 'width:76px',
            onchange: (e) => Store.mutate(() => { ensureRules()[index].at = Number(e.target.value); }, 'threshold value'),
          });
          const colorText = h('input', {
            type: 'text', value: color, placeholder: '#rrggbb',
            onchange: (e) => Store.mutate(() => { ensureRules()[index].color = e.target.value.trim(); }, 'threshold color'),
          });
          const colorPicker = h('input', {
            type: 'color', value: /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000',
            oninput: (e) => {
              colorText.value = e.target.value;
              Store.mutate(() => { ensureRules()[index].color = e.target.value; }, 'threshold color');
            },
          });
          rows.appendChild(h('div', { class: 'entity-pick', style: 'margin-bottom:6px' },
            h('span', { class: 'hint', style: 'min-width:18px' }, '≥'), valueInput, colorPicker, colorText,
            h('button', {
              class: 'btn tiny danger', title: 'Remove threshold',
              onclick: () => Store.mutate(() => { ensureRules().splice(index, 1); }, 'remove threshold'),
            }, '✕')));
        });
        rows.appendChild(h('button', {
          class: 'btn tiny',
          onclick: () => Store.mutate(() => { ensureRules().push({ at: 0, color: '#22c55e' }); }, 'add threshold'),
        }, '+ threshold'));
        if (p.hint) rows.appendChild(h('p', { class: 'hint' }, p.hint));
        box.appendChild(rows);
      } else if (p.type === 'json') {
        /* Service data for a script that takes variables. Kept as text until it
         * parses: rejecting the edit outright would lose what was typed, and
         * storing a half-finished object would send it. */
        const cur = item.props[p.key];
        const input = h('input', {
          type: 'text', value: cur ? JSON.stringify(cur) : '', placeholder: '{"speed": 3}',
          onchange: (e) => {
            const raw = e.target.value.trim();
            if (!raw) return Store.mutate(() => { delete item.props[p.key]; }, p.key);
            try {
              const v = JSON.parse(raw);
              input.classList.remove('bad');
              Store.mutate(() => { item.props[p.key] = v; }, p.key);
            } catch (err) {
              input.classList.add('bad');
              toast('Not valid JSON — ' + err.message, true);
            }
          },
        });
        box.appendChild(field(p.label, input));
        if (p.hint) box.appendChild(h('p', { class: 'hint' }, p.hint));
      } else if (p.type === 'select') {
        /* Was falling through to the free-text box below, which let a typo
         * into a field whose whole job is to hold one of a known set. */
        const cur = item.props[p.key] ?? (t.defaults || {})[p.key] ?? '';
        box.appendChild(field(p.label, h('select', {
          onchange: (e) => Store.mutate(() => { item.props[p.key] = e.target.value; }, p.key),
        }, ...(p.options || []).map((o) => {
          const val = typeof o === 'string' ? o : o.value;
          const lab = typeof o === 'string' ? o : (o.label || o.value);
          return h('option', { value: val, selected: String(cur) === String(val) }, lab);
        }))));
      } else {
        box.appendChild(field(p.label, h('input', {
          type: 'text', value: item.props[p.key] ?? '',
          onchange: (e) => Store.mutate(() => { item.props[p.key] = e.target.value; }, p.key),
        })));
      }
      if (p.hint && p.type !== 'json' && p.type !== 'thresholds') {
        box.appendChild(h('p', { class: 'hint' }, p.hint));
      }
    }

    /* multi-channel devices: the extension board's outlets, a wall switch's
     * gangs. Same machinery, one entity per channel — but the words come from
     * the type, because "+ outlet" under a light switch is wrong and "Outlets"
     * as a heading for gangs is worse. The channels prop carries `label` for
     * the heading and an optional `noun` for the singular. */
    if (t.channels) {
      const chanProp = (t.props || []).find((p) => p.type === 'channels') || {};
      const heading = chanProp.label || 'Outlets';
      const noun = chanProp.noun || heading.replace(/s$/, '').toLowerCase();
      const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
      box.appendChild(h('div', { class: 'subhead' }, heading));
      const chans = item.props.channels || (item.props.channels = []);
      chans.forEach((c, i) => {
        box.appendChild(h('div', { class: 'chanrow' },
          h('input', { type: 'text', value: c.label || '', placeholder: 'label', onchange: (e) => Store.mutate(() => { c.label = e.target.value; }, 'channel label') }),
          h('button', { class: 'btn tiny mono', title: c.entity || 'pick entity', onclick: () => pickEntity(t, (id) => Store.mutate(() => { c.entity = id; }, 'channel entity')) }, c.entity ? c.entity.split('.')[1].slice(0, 14) : 'pick…'),
          h('button', { class: 'btn tiny danger', onclick: () => Store.mutate(() => { chans.splice(i, 1); }, 'remove channel') }, '✕'),
        ));
      });
      box.appendChild(h('button', {
        class: 'btn tiny',
        onclick: () => Store.mutate(() => {
          chans.push({ entity: null, label: `${Noun} ${chans.length + 1}` });
          /* Binding a gang the plate does not draw is a trap. Adding one grows
           * `gangs` to match, up to the cap the renderer draws to. */
          if (item.props.gangs !== undefined) {
            const cap = (t.props || []).find((p) => p.key === 'gangs');
            item.props.gangs = Math.min(chans.length, (cap && cap.max) || chans.length);
          }
        }, 'add channel'),
      }, `+ ${noun}`));
    }

    box.appendChild(h('div', { class: 'subhead' }, ' '));
    box.appendChild(h('button', { class: 'btn danger', onclick: () => Canvas.deleteSelected() }, 'Delete marker'));
  }

  /* ---------- entity picker ---------- */

  function pickEntity(type, done) {
    const domains = (type && type.domains) || null;
    const list = S.entities.filter((e) => !domains || domains.includes(e.domain));
    const search = h('input', { type: 'search', placeholder: `Search ${list.length} entities…`, style: 'width:100%;margin-bottom:8px' });
    const rows = h('div', { class: 'entity-list' });

    function draw() {
      const q = search.value.trim().toLowerCase();
      const shown = list.filter((e) => !q || e.entity_id.includes(q) || (e.name || '').toLowerCase().includes(q)).slice(0, 300);
      rows.replaceChildren();
      if (!shown.length) {
        rows.appendChild(h('p', { class: 'empty' }, S.entities.length
          ? 'Nothing matches.'
          : 'No entities available — Home Assistant is not reachable from the app. Bind by typing an entity id instead.'));
      }
      for (const e of shown) {
        rows.appendChild(h('div', {
          class: 'entity-row', onclick: () => { done(e.entity_id); closeModal(); },
        }, h('div', { style: 'flex:1;min-width:0' },
          h('div', { class: 'en' }, e.name),
          h('div', { class: 'eid' }, e.entity_id)),
        h('span', { class: 'badge' }, e.state)));
      }
    }
    search.addEventListener('input', draw);
    draw();

    const manual = h('input', { type: 'text', placeholder: 'or type an entity id…', style: 'width:100%;margin-top:8px' });
    manual.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && manual.value.trim()) { done(manual.value.trim()); closeModal(); }
    });

    modal(domains ? `Pick a ${domains.join(' / ')} entity` : 'Pick an entity',
      h('div', {}, search, rows, manual));
    setTimeout(() => search.focus(), 30);
  }

  /* ---------- library editor ---------- */

  function editLibrary() {
    const body = h('div', {});
    body.appendChild(h('p', { class: 'hint' },
      'How each type draws. Colours are theme tokens (@name) so they follow whichever theme is active; a literal like #ff8800 also works. Changes apply to every marker of that type, on every floor.'));
    const table = h('table', { class: 'grid' });
    table.appendChild(h('tr', {}, h('th', {}, 'Type'), h('th', {}, 'Kind'), h('th', {}, 'Shape'), h('th', {}, 'Size'), h('th', {}, 'Tap'), h('th', {}, 'On colour')));
    for (const [key, t] of Object.entries(S.library.types).sort()) {
      const r = t.render || (t.render = {});
      table.appendChild(h('tr', {},
        h('td', {}, t.label || key),
        h('td', {}, h('span', { class: 'badge' }, t.kind)),
        h('td', {}, h('select', { onchange: (e) => { r.shape = e.target.value; libChanged(); } },
          ...['disc', 'line', 'fan', 'channelBox', 'camera', 'perimeter', 'rect', 'bed', 'stairs', 'water', 'solar', 'glazing', 'hatch', 'plant']
            .map((s) => h('option', { value: s, selected: r.shape === s }, s)))),
        h('td', {}, h('input', { type: 'number', step: 0.5, value: r.size ?? r.thickness ?? '', style: 'width:64px', onchange: (e) => { const v = Number(e.target.value); if (r.size !== undefined || r.shape === 'disc') r.size = v; else r.thickness = v; libChanged(); } })),
        h('td', {}, h('input', { type: 'number', step: 1, value: r.tap ?? '', style: 'width:58px', onchange: (e) => { r.tap = Number(e.target.value); libChanged(); } })),
        h('td', {}, h('input', { type: 'text', value: (t.states && t.states.on && (t.states.on.fill || t.states.on.stroke)) || '', style: 'width:104px', onchange: (e) => { t.states = t.states || {}; t.states.on = t.states.on || {}; if (t.states.on.fill) t.states.on.fill = e.target.value; else t.states.on.stroke = e.target.value; libChanged(); } })),
      ));
    }
    body.appendChild(table);
    modal('Device library', body);
  }

  let libTimer;
  function libChanged() {
    Canvas.paint(); renderLibrary();
    clearTimeout(libTimer);
    libTimer = setTimeout(() => API.saveLibrary(S.library).then(() => toast('Library saved')).catch((e) => toast(e.message, true)), 600);
  }

  /* ---------- theme editor ---------- */

  function editTheme() {
    const id = S.project.activeTheme;
    const t = S.themes.themes[id];
    const body = h('div', {});
    body.appendChild(h('p', { class: 'hint' }, `Editing "${t.name}". The plan repaints as you change a colour.`));
    const grid = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:14px' });
    for (const group of ['ui', 'plan']) {
      const col = h('div', {}, h('h3', { style: 'font-size:12px;color:var(--inkSoft)' }, group === 'ui' ? 'Editor chrome' : 'Plan'));
      for (const [k, v] of Object.entries(t[group])) {
        if (typeof v !== 'string' || !v.startsWith('#')) continue;
        col.appendChild(h('div', { class: 'swatchrow' },
          h('label', { title: k }, k),
          h('input', {
            type: 'color', value: v,
            oninput: (e) => { t[group][k] = e.target.value; applyUiTheme(); Canvas.paint(); themeChanged(); },
          })));
      }
      grid.appendChild(col);
    }
    body.appendChild(grid);
    modal('Theme', body);
  }

  let themeTimer;
  function themeChanged() {
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => API.saveThemes(S.themes).catch((e) => toast(e.message, true)), 700);
  }

  /* ---------- import / export ---------- */

  /* Kept in step with the same three ceilings in server.js. These are a
   * courtesy — they let the page say "that is too big" without a round trip —
   * and never the enforcement, which is the server's and stays the server's. */
  const IMPORT_MAX_MB = 10;
  const IMPORT_MAX_BYTES = IMPORT_MAX_MB * 1024 * 1024;
  const IMPORT_MAX_FILES = 64;

  /* A one-floor spec is a few hundred bytes, and rounding that to "0 KB"
   * reads as an empty file — the very thing the checks above reject. */
  const sizeLabel = (bytes) => (bytes < 1024 ? `${bytes} bytes`
    : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`);

  function importDialog() {
    let chosen = [];
    const out = h('div', {});
    const samples = h('div', {});
    const fromHa = h('div', {});
    const picked = h('div', { class: 'hint' }, 'No files chosen yet.');
    const input = h('input', {
      type: 'file', multiple: true, accept: '.json,application/json',
      style: 'width:100%',
    });

    /* What THIS app has deployed to the Home Assistant it can see, found by
     * reading each dashboard's own ownership stamp back rather than anything
     * kept on disk here — so a design deployed by a different install of this
     * app, or a rebuilt one, is still found. Only dashboards deployed with
     * "keep the editable project in Home Assistant" turned on can actually be
     * opened; the rest are listed so it is clear they exist, with the reason
     * they cannot be pulled back. */
    API.dashboardDiscover().then((r) => {
      if (!r.dashboards || !r.dashboards.length) return;
      fromHa.replaceChildren(
        h('div', { class: 'subhead' }, 'From Home Assistant'),
        h('p', { class: 'hint' }, 'Deployed by this app. Loading one REPLACES the current project.'),
        ...r.dashboards.map((d) => d.editable
          ? h('button', {
            class: 'btn', style: 'display:block;width:100%;text-align:left;margin-bottom:6px',
            onclick: async () => {
              if (!confirm(`Replace the current project with "${d.title}" (/${d.urlPath})?`)) return;
              try {
                const { project } = await API.dashboardReopen(d.urlPath);
                Store.mutate(() => { Object.assign(S.project, project); }, 'reopen from Home Assistant');
                S.activeFloorId = (project.floors[0] || {}).id || null;
                closeModal(); Store.emit('floor'); applyUiTheme();
                toast(`Loaded "/${d.urlPath}" from Home Assistant`);
              } catch (e) { toast(e.message, true); }
            },
          }, `${d.title} — /${d.urlPath}, ${d.views} tabs`)
          : h('div', { class: 'hint', style: 'margin-bottom:6px' },
            `${d.title} — /${d.urlPath}: deployed without its design kept, so it can only be re-deployed over, not opened.`)),
        h('div', { class: 'subhead' }, ' '),
      );
    }).catch(() => {});

    /* Sample projects ship with the app and are already in this schema, so
     * they load straight in. This is the path to use for development — it needs
     * nothing outside the app. */
    API.fixtures().then((r) => {
      if (!r.projects.length) return;
      samples.replaceChildren(
        h('div', { class: 'subhead' }, 'Sample projects'),
        h('p', { class: 'hint' }, 'Ship with the app, already in this builder’s schema. Loading one REPLACES the current project.'),
        ...r.projects.map((p) => h('button', {
          class: 'btn', style: 'display:block;width:100%;text-align:left;margin-bottom:6px',
          onclick: async () => {
            if (!confirm(`Replace the current project with "${p.name}"?`)) return;
            const proj = await API.loadFixture(p.file);
            Store.mutate(() => { Object.assign(S.project, proj); }, 'load sample');
            S.activeFloorId = (proj.floors[0] || {}).id || null;
            closeModal(); Store.emit('floor'); applyUiTheme();
            toast(`Loaded ${p.name} — ${p.floors} floors, ${p.rooms} rooms`);
          },
        }, `${p.name} — ${p.floors} floors, ${p.rooms} rooms`)),
      );
    }).catch(() => {});

    /* ---- import from files the person has in front of them ----
     *
     * This used to be a path typed into a box, which read a directory on the
     * APP's filesystem. Under Home Assistant that is inside the container, so
     * the plans someone actually wants to import — sitting on the laptop they
     * are looking at the editor from — could not be reached at all. The browser
     * reads the bytes now and posts them. */
    const skippedList = (skipped) => ((skipped && skipped.length)
      ? [h('div', { class: 'subhead' }, 'Not imported'),
        ...skipped.map((s) => h('p', { class: 'hint', style: 'margin:2px 4px' }, `${s.file} — ${s.reason}`))]
      : []);

    const errorList = (errors) => ((errors && errors.length)
      ? [h('div', { class: 'subhead' }, 'Problems in the plan'),
        ...errors.map((x) => h('p', { class: 'warn', style: 'margin:2px 4px' },
          (x.path ? x.path + ' — ' : '') + x.message))]
      : []);

    function showProblem(e) {
      const b = (e && e.body) || {};
      out.replaceChildren(h('p', { class: 'warn' }, e.message), ...errorList(b.errors), ...skippedList(b.skipped));
    }

    function showResult(res) {
      const table = h('table', { class: 'grid' },
        h('tr', {}, h('th', {}, 'Floor'), h('th', {}, 'Level'), h('th', {}, 'Rooms'), h('th', {}, 'Openings'), h('th', {}, 'Markers')));
      for (const s of res.stats) {
        table.appendChild(h('tr', {}, h('td', {}, s.name), h('td', {}, s.level_ft + "'"),
          h('td', {}, s.rooms), h('td', {}, s.openings), h('td', {}, s.fixtures + s.devices + s.furniture)));
      }
      const renamed = (res.renamed || []).length
        ? [h('p', { class: 'hint' }, 'Renamed so every floor id stays unique: '
          + res.renamed.map((r) => `${r.from} → ${r.to}`).join(', '))]
        : [];
      const warned = (res.warnings || []).length
        ? [h('div', { class: 'subhead' }, 'Worth checking'),
          ...res.warnings.map((w) => h('p', { class: 'hint', style: 'margin:2px 4px' },
            (w.path ? w.path + ' — ' : '') + w.message))]
        : [];
      out.replaceChildren(table, ...renamed, ...warned, ...skippedList(res.skipped),
        h('button', {
          class: 'btn primary', style: 'margin-top:10px',
          onclick: () => {
            if (!confirm(`Replace every floor in the current project with these ${res.floors.length}?`)) return;
            Store.mutate(() => { S.project.floors = res.floors; }, 'import');
            S.activeFloorId = res.floors[0] && res.floors[0].id;
            closeModal(); Store.emit('floor');
            toast(`Imported ${res.floors.length} floor${res.floors.length === 1 ? '' : 's'}`);
          },
        }, `Replace all floors with these ${res.floors.length}`));
    }

    const go = h('button', { class: 'btn primary', style: 'margin-top:8px', disabled: true }, 'Import files');

    /* Both routes in — the picker and a drop — land here, so no check can
     * apply to one and quietly not the other. */
    function setFiles(list) {
      const all = Array.from(list || []);
      const json = all.filter((f) => /\.json$/i.test(f.name));
      const problems = [];
      const ignored = all.length - json.length;
      if (ignored) problems.push(`${ignored} file${ignored === 1 ? '' : 's'} ignored — a plan has to be .json.`);
      if (json.length > IMPORT_MAX_FILES) problems.push(`${json.length} files chosen; ${IMPORT_MAX_FILES} is the most that can go in at once.`);
      const total = json.reduce((n, f) => n + f.size, 0);
      if (total > IMPORT_MAX_BYTES) problems.push(`Those come to ${(total / 1048576).toFixed(1)} MB — the limit is ${IMPORT_MAX_MB} MB.`);
      const empty = json.filter((f) => !f.size).length;
      if (empty) problems.push(`${empty} of them ${empty === 1 ? 'is' : 'are'} empty.`);

      /* All or nothing: importing the subset that happens to fit would replace
       * every floor in the project with a partial answer. */
      chosen = problems.length ? [] : json;
      out.replaceChildren();
      picked.className = problems.length ? 'warn' : 'hint';
      picked.replaceChildren(...(problems.length
        ? problems.map((t) => h('div', {}, t))
        : [h('div', {}, json.length
          ? `${json.length} file${json.length === 1 ? '' : 's'}, ${sizeLabel(total)} — ${json.map((f) => f.name).join(', ')}`
          : 'No files chosen yet.')]));
      go.disabled = !chosen.length;
    }

    input.addEventListener('change', () => setFiles(input.files));

    const drop = h('div', {
      class: 'hint',
      style: 'border:1px dashed var(--panelBorder);border-radius:6px;padding:14px;text-align:center;margin:8px 0 0',
      ondragover: (e) => { e.preventDefault(); drop.style.borderColor = 'var(--accent)'; },
      ondragleave: () => { drop.style.borderColor = ''; },
      ondrop: (e) => {
        e.preventDefault();
        drop.style.borderColor = '';
        setFiles(e.dataTransfer && e.dataTransfer.files);
      },
    }, '…or drop them here');

    go.addEventListener('click', async () => {
      if (!chosen.length) return;
      go.disabled = true;
      out.replaceChildren(h('p', { class: 'hint' }, 'Reading…'));
      try {
        /* Read in the browser. A file can vanish or become unreadable between
         * being chosen and being read, and that is a failed import with a
         * reason, not a silently short one. */
        const files = await Promise.all(chosen.map(async (f) => ({ name: f.name, text: await f.text() })));
        showResult(await API.importUpload(files));
      } catch (e) {
        showProblem(e);
      } finally {
        go.disabled = !chosen.length;
      }
    });

    const body = h('div', {}, fromHa, samples,
      h('div', { class: 'subhead' }, 'Import an exported plan'),
      h('p', { class: 'hint' }, `Upload a plan exported from this editor, or hand-written floor specs in the older format, and they are converted on the way in. Up to ${IMPORT_MAX_MB} MB. Anything this editor does not model is preserved verbatim and re-emitted on export, so the import is not lossy. Importing REPLACES every floor in the current project.`),
      h('div', { class: 'field' }, h('label', {}, 'Plan files (.json)'), input),
      drop, picked, go, out);
    modal('Import existing floor plans', body);
  }

  async function exportDialog() {
    const body = h('div', {}, h('p', { class: 'hint' }, 'Generating…'));
    modal('Export', body);
    try {
      const res = await API.exportBundle(S.project, 'bundle');
      body.replaceChildren();
      body.appendChild(h('p', { class: 'hint' },
        'Legacy-shaped spec JSON (what the existing render/build pipeline consumes) plus a rendered SVG per floor. Nothing is written to Home Assistant — these are downloads.'));
      for (const f of res.files) {
        const blob = new Blob([f.content], { type: f.type });
        const url = URL.createObjectURL(blob);
        body.appendChild(h('div', { style: 'margin-bottom:6px' },
          h('a', { href: url, download: f.name, class: 'btn tiny' }, '↓ ' + f.name),
          h('span', { class: 'hint', style: 'margin-left:8px' }, `${(f.content.length / 1024).toFixed(1)} KB`)));
      }
      if (res.warnings.length) {
        body.appendChild(h('div', { class: 'subhead' }, `Warnings (${res.warnings.length})`));
        for (const w of res.warnings.slice(0, 25)) body.appendChild(h('p', { class: 'warn' }, w.message));
      }
    } catch (e) {
      body.replaceChildren(h('p', { class: 'warn' }, e.message));
    }
  }

  function flashAperture(i) { renderInspector(); const e = $('ap' + i); if (e) e.scrollIntoView({ block: 'nearest' }); }

  function renderThemePicker() {
    const sel = $('themePick');
    sel.replaceChildren();
    for (const [id, t] of Object.entries(S.themes.themes)) {
      sel.appendChild(h('option', { value: id, selected: S.project.activeTheme === id }, t.name));
    }
    sel.appendChild(h('option', { value: '__edit' }, 'Edit colours…'));
  }

  function renderAll() {
    applyUiTheme();
    renderFloors();
    renderLibrary();
    renderInspector();
    renderThemePicker();
  }

  return {
    renderAll, renderFloors, renderLibrary, renderInspector, renderThemePicker, addFloor,
    toast, modal, closeModal, applyUiTheme, shortcutsDialog,
    editLibrary, editTheme, importDialog, exportDialog, flashAperture, pickEntity,
    // shared with panels-extra.js so both build controls the same way
    h, field, numInput,
  };
}());
