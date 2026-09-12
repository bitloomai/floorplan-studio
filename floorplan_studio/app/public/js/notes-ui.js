/* Review notes and the canvas context menu. All note text stays plain text. */
window.NotesUI = (() => {
  'use strict';
  const S = Store.S, h = (...args) => Panels.h(...args);
  let surface = null, editing = false, restoreFocus = null, run = () => {}, clipboard = null;
  const collection = { room: 'rooms', item: 'items', opening: 'openings', annotation: 'annotations' };
  const same = (a, b) => Annotations.sameTarget(a, b);
  const label = target => {
    if (target.kind === 'annotation') return 'Note';
    const obj = Annotations.resolve(Store.floor(), target);
    return obj?.name || (target.kind === 'boundary' ? 'Wall ' + (obj?.wall || target.wall || '') : obj?.type || target.kind);
  };
  function close() {
    if (!surface) return false;
    surface.remove(); surface = null; editing = false;
    if (restoreFocus?.isConnected) restoreFocus.focus();
    else document.getElementById('btnNotes')?.focus();
    return true;
  }
  function openSurface(role, x, y) {
    close(); restoreFocus = document.activeElement;
    const dialog = h('dialog', { class: 'notes-surface', 'aria-label': role === 'menu' ? 'Canvas actions' : 'Review note' });
    if (role === 'menu') dialog.setAttribute('role', 'menu');
    document.body.appendChild(dialog); surface = dialog;
    dialog.showModal();
    if (innerWidth > 600 && Number.isFinite(x)) {
      dialog.style.margin = '0'; dialog.style.left = Math.max(8, Math.min(x, innerWidth - 350)) + 'px';
      dialog.style.top = Math.max(8, Math.min(y, innerHeight - 380)) + 'px';
    }
    dialog.addEventListener('cancel', ev => { ev.preventDefault(); close(); });
    dialog.addEventListener('click', ev => { if (ev.target === dialog) { const r = dialog.getBoundingClientRect(); if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) close(); } });
    dialog.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      if (role === 'menu' && ['ArrowDown','ArrowUp','Home','End'].includes(ev.key)) {
        ev.preventDefault(); const buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        buttons[ev.key === 'Home' ? 0 : ev.key === 'End' ? buttons.length-1 : (index + (ev.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    });
    return dialog;
  }
  function remove(id) {
    const f = Store.floor();
    if (!(f?.annotations || []).some(n => n.id === id)) return;
    close(); Store.mutate(() => { f.annotations = f.annotations.filter(n => n.id !== id); }, 'delete note');
    if (S.selection?.kind === 'annotation' && S.selection.id === id) Store.select(null);
  }
  function fitSurface() {
    if (!surface || !surface.style.top) return;
    const r = surface.getBoundingClientRect();
    surface.style.top = Math.max(8, Math.min(r.top, innerHeight-r.height-8)) + 'px';
    surface.style.left = Math.max(8, Math.min(r.left, innerWidth-r.width-8)) + 'px';
  }
  function edit(id, context = {}) {
    const floor = Store.floor(); if (!floor) return;
    const existing = (floor.annotations || []).find(n => n.id === id);
    if (id && !existing) return;
    const target = existing?.target || context.target || { kind: 'floor' };
    /* Pin where the person pointed. The target says WHAT the note is about and
     * the pin says WHERE they were looking, and those are not the same thing:
     * "this corner is damp" is about the room but belongs in the corner. Only a
     * note raised from the inspector, which has no position, falls back to the
     * target's own centre. */
    const clicked = Array.isArray(context.at) && context.at.length === 2 && context.at.every(Number.isFinite);
    const at = existing?.at || (clicked ? context.at : null) || Annotations.anchor(floor, target, S.library) || [0,0];
    const pin = [...document.querySelectorAll('[data-annotation]')].find(e => e.dataset.annotation === id)?.getBoundingClientRect();
    const dialog = openSurface('dialog', pin?.right || context.x, pin?.top || context.y); editing = true;
    const title = h('h2', {}, existing ? 'Edit note' : 'Add note');
    const input = h('textarea', { 'aria-label': 'Note text', rows: 4, maxlength: 10000, placeholder: 'What should change here?' });
    input.value = existing?.text || '';
    const status = h('select', { 'aria-label': 'Note status' }, h('option', { value: 'open' }, 'Open'), h('option', { value: 'done' }, 'Done'));
    status.value = existing?.status || 'open';
    const save = h('button', { class: 'btn primary', onclick: () => {
      if (!input.value.trim()) { input.focus(); return; }
      const currentFloor = (S.project.floors || []).find(f => f.id === floor.id);
      if (!currentFloor) { close(); Panels.toast('This floor was removed.'); return; }
      let savedId;
      Store.mutate(() => {
        currentFloor.annotations ||= [];
        const note = existing && currentFloor.annotations.find(n => n.id === existing.id);
        if (note) { note.text = input.value.trim(); note.status = status.value; savedId = note.id; }
        else if (!existing) { const note = Annotations.make(currentFloor, { text: input.value.trim(), target, at, status: status.value }, S.library); currentFloor.annotations.push(note); savedId = note.id; }
      }, existing ? 'edit note' : 'add note');
      close(); if (savedId) Store.select('annotation', savedId);
    } }, 'Save');
    const size = () => { input.style.height = 'auto'; input.style.height = Math.min(260, Math.max(100, input.scrollHeight)) + 'px'; save.disabled = !input.value.trim(); };
    input.addEventListener('input', size);
    dialog.append(title, h('p', { class: 'hint' }, 'For: ' + label(target)), input, status,
      h('div', { class: 'notes-actions' }, save, ...(existing ? [h('button', { class: 'btn danger', onclick: () => remove(existing.id) }, 'Delete')] : []), h('button', { class: 'btn', onclick: close }, 'Cancel')));
    size(); fitSurface(); input.focus();
  }
  function done(id) { const note = Store.floor()?.annotations?.find(n => n.id === id); if (note) Store.mutate(() => { note.status = note.status === 'done' ? 'open' : 'done'; }, 'change note status'); }
  function list(target) {
    const dialog = openSurface('dialog');
    dialog.setAttribute('aria-label', 'Floor notes');
    const filter = h('select', { 'aria-label': 'Filter notes' }, ...['open','done','all'].map(v => h('option', { value: v }, v === 'all' ? 'All notes' : v === 'open' ? 'Open notes' : 'Done notes')));
    const rows = h('div', { class: 'notes-list' });
    function render() {
      rows.replaceChildren();
      const notes = (Store.floor().annotations || []).filter(n => (!target || same(n.target, target)) && (filter.value === 'all' || n.status === filter.value));
      for (const note of notes) rows.append(h('button', { class: 'btn note-row', onclick: () => { close(); Store.select('annotation', note.id); Canvas.locate(note.at); edit(note.id); } }, `${note.status === 'done' ? '✓ ' : ''}${note.text}`, h('small', {}, label(note.target))));
      if (!notes.length) rows.append(h('p', { class: 'hint' }, 'No notes here.'));
    }
    filter.addEventListener('change', render);
    dialog.append(h('h2', {}, 'Floor notes'), filter, rows, h('div', { class: 'notes-actions' }, h('button', { class: 'btn', onclick: () => edit(null, { target: target || { kind: 'floor' } }) }, 'Add note'), h('button', { class: 'btn', onclick: close }, 'Close')));
    render(); filter.focus();
  }
  function notesRow(box, target) {
    const count = (Store.floor().annotations || []).filter(n => same(n.target, target)).length;
    box.append(h('div', { class: 'notes-actions' }, h('button', { class: 'btn tiny', onclick: () => list(target) }, `Notes (${count})`), h('button', { class: 'btn tiny', onclick: () => edit(null, { target }) }, 'Add note')));
  }
  function renderInspector(box, note) {
    box.append(h('h2', {}, 'Review note'), h('p', { class: 'note-copy' }, note.text), h('p', { class: 'hint' }, `${note.status} · ${label(note.target)}. Drag the pin or use arrow keys to move it.`),
      h('button', { class: 'btn', onclick: () => edit(note.id) }, 'Edit note'), h('button', { class: 'btn', onclick: () => done(note.id) }, note.status === 'done' ? 'Reopen' : 'Mark done'));
  }
  function select(target) { if (target.kind === 'boundary') { const b = Annotations.resolve(Store.floor(), target); Store.select('room', b?.room || target.room); } else if (collection[target.kind]) Store.select(target.kind, target.id); else Store.select(null); }
  function reorder(direction) {
    const key = collection[S.selection?.kind], f = Store.floor(); if (!key) return;
    const index = (f[key] || []).findIndex(v => v.id === S.selection.id), next = index + direction;
    if (index < 0 || next < 0 || next >= f[key].length) return;
    Store.mutate(() => { const [v] = f[key].splice(index, 1); f[key].splice(next, 0, v); }, 'change stacking order');
  }
  function copy() { if (S.selection?.kind === 'item' && Store.selected()) clipboard = Store.clone(Store.selected()); }
  function paste(context) {
    if (!clipboard) return;
    const f = Store.floor(), item = Store.clone(clipboard); item.id = Store.newItemId(item.kind); item.at = context.at.slice();
    if (!(f.rooms || []).some(r => r.id === item.room)) delete item.room;
    Store.mutate(() => { (f.items ||= []).push(item); }, 'paste item'); Store.select('item', item.id);
  }
  function openingPosition(value) { if (S.selection?.kind === 'opening') Store.mutate(() => { Store.selected().position = value; }, 'opening preview'); }
  function wall(target, material) {
    const f = Store.floor(), obj = Annotations.resolve(f, target); if (!obj) return;
    const room = f.rooms.find(r => r.id === obj.room);
    const existing = target.id ? obj : null;
    const edge = PlanScene.roomEdges(room).find(e => e.wall === obj.wall && (obj.edge == null || (e.src ?? e.index) === obj.edge));
    const type = existing?.type || S.boundaries.defaults[PlanScene.edgeIsExterior(f, edge) ? 'exterior' : 'interior'];
    if (S.boundaries.types[type]?.encloses === false) { Panels.toast('This edge has no horizontal wall top.'); return; }
    const props = { ...existing?.props };
    const dialog = openSurface('dialog');
    dialog.append(h('h2', {}, material ? 'Wall top material' : 'Wall top width'));
    if (material) {
      const holder = h('div'); dialog.append(holder);
      const renderFinish = () => {
        holder.replaceChildren();
        PanelsExtra.flooringField(holder, null, { label: 'Wall top finish', nullable: true,
          get: () => ({ key: props.topFinish, options: props.topFinishOptions }),
          set: (key, options) => { props.topFinish = key; props.topFinishOptions = options; renderFinish(); } });
      };
      renderFinish();
    }
    else dialog.append(h('input', { type: 'number', min: 0, max: 10, step: .05, 'aria-label': 'Wall top width (ft)', value: props.thicknessFt ?? '', placeholder: String(S.boundaries.types[type]?.thicknessFt || .3), oninput: e => { if (e.target.value === '') delete props.thicknessFt; else props.thicknessFt = Number(e.target.value); } }));
    dialog.append(h('div', { class: 'notes-actions' }, h('button', { class: 'btn primary', onclick: () => {
      if (props.thicknessFt != null && (!Number.isFinite(props.thicknessFt) || props.thicknessFt < 0 || props.thicknessFt > 10)) return;
      Store.mutate(() => {
        if (existing) existing.props = props;
        else {
          f.boundaries ||= []; let i = 1; while (f.boundaries.some(b => b.id === 'b' + i)) i++;
          f.boundaries.push({ id: 'b' + i, room: obj.room, wall: obj.wall, ...(obj.edge == null ? {} : { edge: obj.edge }), type, props });
        }
      }, 'wall top'); close();
    } }, 'Save'), h('button', { class: 'btn', onclick: close }, 'Cancel')));
  }
  function menu(context) {
    const target = context.candidates[0] || { kind: 'point', at: context.at };
    select(target);
    const dialog = openSurface('menu', context.x, context.y);
    function entry(id, text, payload = context, disabled = false) {
      dialog.append(h('button', { role: 'menuitem', disabled, onclick: () => { close(); run(id, payload); } }, text));
    }
    entry('note-add', 'Add note here…', { ...context, target: target.kind === 'annotation' ? Store.selected().target : target });
    if (target.kind === 'annotation') {
      entry('note-edit', 'Edit note', target); entry('note-done', 'Mark done / reopen', target); entry('note-delete', 'Delete note', target);
    } else if (target.kind !== 'point') {
      entry('properties', 'Properties');
      if (['item','room'].includes(target.kind)) { entry('duplicate', 'Duplicate'); entry('delete', 'Delete (keep notes)'); entry('layer-forward', 'Bring forward'); entry('layer-backward', 'Send backward'); }
      if (['room','item','opening'].includes(target.kind) && (Store.floor().annotations || []).length) entry('delete-with-notes', 'Delete with attached notes');
      if (target.kind === 'item') {
        entry('copy-item', 'Copy');
        const item = Store.selected(), type = PlanScene.resolveType(S.library, item);
        if (Object.prototype.hasOwnProperty.call({ ...type?.defaults, ...item?.props }, 'rot')) { entry('turn-left', 'Turn 90° left'); entry('turn-right', 'Turn 90° right'); }
      }
      if (target.kind === 'opening') {
        entry('delete', 'Delete (keep notes)');
        const op = Store.selected(), def = S.boundaries.openingTypes[op.type] || {};
        const movable = /swing|slide|pocket|fold|telescopic|scissor|roll|sectional|tilt/.test(def.render?.style || '') || def.openTransmission !== undefined;
        if (movable && !op.sensor && !op.cover) { entry('opening-shut', 'Drawn as: shut'); entry('opening-part', 'Drawn as: part open'); entry('opening-open', 'Drawn as: open'); }
      }
      if (target.kind === 'boundary') { entry('wall-width', 'Wall top width…', target); entry('wall-material', 'Wall top material…', target); }
      /* The notes on the thing you pointed at, inline. Not for the floor: every
       * floor note matches it, and a menu with twenty of them in is a list
       * pretending to be a menu — that is what Notes (N) is. */
      if (target.kind === 'floor') entry('notes', 'Floor notes…');
      else for (const note of Store.floor().annotations || []) if (same(note.target, target)) {
        entry('note-edit', 'Edit note: ' + note.text.slice(0,45), note); entry('note-done', note.status === 'done' ? 'Reopen note' : 'Mark note done', note); entry('note-delete', 'Delete note', note);
      }
    }
    /* The floor is always the last candidate so a note on bare canvas has
     * something to attach to, but selecting it means deselecting — not a thing
     * to offer under "what is behind this". */
    const behind = context.candidates.filter(c => c.kind !== 'floor');
    if (behind.length > 1) {
      dialog.append(h('div', { class: 'hint' }, 'Select behind'));
      for (const candidate of behind) entry('select-behind', label(candidate) + (candidate.id ? ' · ' + candidate.id : ''), candidate);
    }
    entry('paste-item', 'Paste', context, !clipboard); entry('zoom-fit', 'Zoom to fit');
    fitSurface(); dialog.querySelector('button')?.focus();
  }
  return { init: dispatcher => { run = dispatcher; }, close, edit, remove, done, list, menu, notesRow, renderInspector, select, reorder, copy, paste, openingPosition, wall, isEditing: () => editing, active: () => !!surface };
})();
