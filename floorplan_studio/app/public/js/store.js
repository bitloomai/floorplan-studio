/* Editor state: the project, what is selected, and the undo stack.
 *
 * Every change to the project goes through mutate(), which snapshots first.
 * That is the whole undo implementation — a structural clone per edit rather
 * than a command log. A house plan is tens of kilobytes, so the memory cost is
 * trivial next to the bug surface of hand-written inverse operations. */
window.Store = (function () {
  'use strict';

  const listeners = new Set();
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const S = {
    project: null,
    library: null,
    themes: null,
    flooring: null,
    boundaries: null,
    controls: null,
    meta: {},

    activeFloorId: null,
    selection: null,            // { kind: 'room'|'item', id } — the ONE thing the inspector shows detail for
    multi: [],                  // [{ kind, id }, ...] — the full selection when more than one thing is picked
    tool: 'select',
    armed: null,                // { kind, type, typeKey } while placing from the library

    /* `multiSelect` is Shift held down, latched. A mouse has Shift and a
     * finger does not, so on a touch screen this is the only way to pick a
     * second thing — or to draw a selection box, since a one-finger drag on
     * empty floor moves the plan there. A view flag, not a project one: it is
     * how somebody is working right now, not a fact about the house. */
    view: { zoom: 1, gridSize: 0.5, snap: true, showGrid: true, live: false, multiSelect: false },
    /* null = "now". Set by the time scrubber so daylight can be inspected at
     * any hour without waiting for it. */
    when: null,
    entities: [],
    states: {},

    dirty: false,
    undoStack: [],
    redoStack: [],

    /* Whether the panels show everything they can edit, or only what a plan
     * actually needs. This is a preference belonging to the PERSON, not to the
     * house — two people editing the same project should not have to agree
     * about how much form they want to look at — so it lives in this browser
     * and never in project.json. */
    advanced: false,
  };

  const MAX_UNDO = 60;
  const deployed = new Map();
  function preserveDeployment() {
    const p = S.project;
    if (!p) return;
    if (p.dashboard?.installedAt) deployed.set(p.id, p.dashboard.installedAt);
    if (deployed.has(p.id)) p.dashboard = { ...p.dashboard, installedAt: deployed.get(p.id) };
  }

  const ADV_KEY = 'fps.advanced';
  /* Storage can throw outright, not merely come back empty: an add-on page is
   * an iframe under Ingress, and a browser set to block third-party site data
   * makes the getter itself raise. Reading it must never be what stops the
   * editor loading. */
  try { S.advanced = window.localStorage.getItem(ADV_KEY) === '1'; } catch (e) { /* defaults to off */ }

  function setMultiSelect(on) {
    S.view.multiSelect = !!on;
    emit('view');
  }

  function setAdvanced(on) {
    S.advanced = !!on;
    try { window.localStorage.setItem(ADV_KEY, S.advanced ? '1' : '0'); } catch (e) { /* this session only */ }
    emit('selection');
  }

  function emit(reason) { for (const fn of listeners) fn(reason); }
  function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function floor() {
    if (!S.project) return null;
    return (S.project.floors || []).find((f) => f.id === S.activeFloorId) || (S.project.floors || [])[0] || null;
  }

  function theme() {
    const id = (S.project && S.project.activeTheme) || (S.themes && S.themes.active);
    const t = S.themes && S.themes.themes && S.themes.themes[id];
    return (t && t.plan) || {};
  }

  function uiTheme() {
    const id = (S.project && S.project.activeTheme) || (S.themes && S.themes.active);
    const t = S.themes && S.themes.themes && S.themes.themes[id];
    return (t && t.ui) || {};
  }

  /* The one write path. `label` shows up nowhere yet but makes the stack
   * readable in the console while debugging, which is worth the byte. */
  function mutate(fn, label) {
    preserveDeployment();
    S.undoStack.push({ label, snapshot: clone(S.project) });
    if (S.undoStack.length > MAX_UNDO) S.undoStack.shift();
    S.redoStack.length = 0;
    const result = fn(S.project);
    if (window.Annotations) Annotations.reconcile(S.undoStack[S.undoStack.length - 1].snapshot, S.project, S.library);
    preserveDeployment();
    S.dirty = true;
    emit('project');
    return result;
  }

  /* A project that arrived from somewhere other than this browser tab — an
   * MCP tool call, most likely, or the same project reloaded after this tab's
   * own save. Deliberately NOT `mutate()`: this is not a local edit, so it
   * must not mark the project dirty, schedule an autosave (which would just
   * write the just-fetched copy straight back), or become an undo entry — the
   * undo stack stays a record of what THIS TAB changed, not everything that
   * has ever happened to the project. `main.js` decides whether to call this
   * at all; it skips the replacement outright while there are unsaved local
   * edits, so a human mid-edit is never overwritten out from under them. */
  function replaceProject(project) {
    preserveDeployment();
    S.project = project;
    preserveDeployment();
    if (!floor()) S.activeFloorId = (S.project.floors[0] || {}).id || null;
    S.selection = null;
    emit('remote');
  }

  function undo() {
    preserveDeployment();
    const entry = S.undoStack.pop();
    if (!entry) return false;
    S.redoStack.push({ label: entry.label, snapshot: clone(S.project) });
    S.project = entry.snapshot;
    preserveDeployment();
    if (!floor()) S.activeFloorId = (S.project.floors[0] || {}).id || null;
    S.selection = null;
    S.dirty = true;
    emit('project');
    return true;
  }

  function redo() {
    preserveDeployment();
    const entry = S.redoStack.pop();
    if (!entry) return false;
    S.undoStack.push({ label: entry.label, snapshot: clone(S.project) });
    S.project = entry.snapshot;
    preserveDeployment();
    S.selection = null;
    S.dirty = true;
    emit('project');
    return true;
  }

  /* ---------- ids ---------- */

  /* `\p{L}\p{N}` (Unicode letter/number, not the ASCII-only `a-z0-9`) so a
   * room named entirely in Chinese, Cyrillic or Arabic keeps its own id
   * instead of silently collapsing to "room"/"room_2" — the id is nobody's
   * business but a cross-reference (item.room, opening.room), so there is no
   * reason it has to be ASCII the way the dashboard's own url_path slug
   * (defaultPath() in panels-dashboard.js) deliberately still is. */
  function uniqueId(base, taken) {
    const slug = String(base || 'item').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'item';
    if (!taken.has(slug)) return slug;
    let n = 2;
    while (taken.has(`${slug}_${n}`)) n++;
    return `${slug}_${n}`;
  }

  function newRoomId(name) {
    const f = floor();
    return uniqueId(name || 'room', new Set((f.rooms || []).map((r) => r.id)));
  }

  function newItemId(kind) {
    const f = floor();
    const taken = new Set((f.items || []).map((i) => i.id));
    let n = 1;
    while (taken.has(`${kind[0]}${n}`)) n++;
    return `${kind[0]}${n}`;
  }

  function renameRoom(room, name, options) {
    return mutate(() => {
      const result = RoomIdentity.rename(S.project, floor(), room, name, options);
      for (const selected of [S.selection, ...S.multi]) {
        if (selected?.kind === 'room' && selected.id === result.oldId) selected.id = result.id;
      }
      return result;
    }, 'rename room');
  }

  /* ---------- selection ---------- */

  function select(kind, id, part) {
    S.selection = kind ? { kind, id, ...(part ? { part } : {}) } : null;
    S.multi = kind ? [{ kind, id }] : [];
    emit('selection');
  }

  /* Multi-select covers rooms and items only — an opening is a point on a
   * wall, not a shape with its own position to move as a group, and it
   * already has nothing else it could usefully be grouped with. `S.selection`
   * stays in sync as "the one thing to show detail for": whichever member was
   * just toggled while exactly one remains selected, otherwise null — the
   * inspector reads that to decide between one item's full form and a plain
   * "N selected" summary, without needing to know anything about multi-select
   * itself. */
  function isMulti(kind, id) { return S.multi.some((m) => m.kind === kind && m.id === id); }

  function toggleMulti(kind, id) {
    if (isMulti(kind, id)) S.multi = S.multi.filter((m) => !(m.kind === kind && m.id === id));
    else S.multi = S.multi.concat([{ kind, id }]);
    S.selection = S.multi.length === 1 ? S.multi[0] : null;
    emit('selection');
  }

  function setMulti(list) {
    const seen = new Set();
    S.multi = (list || []).filter((m) => {
      const key = m.kind + ':' + m.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    S.selection = S.multi.length === 1 ? S.multi[0] : null;
    emit('selection');
  }

  function selected() {
    if (!S.selection) return null;
    const f = floor();
    if (!f) return null;
    if (S.selection.kind === 'annotation') return (f.annotations || []).find(n => n.id === S.selection.id) || null;
    if (S.selection.kind === 'room') return (f.rooms || []).find((r) => r.id === S.selection.id) || null;
    if (S.selection.kind === 'opening') return (f.openings || []).find((o) => o.id === S.selection.id) || null;
    return (f.items || []).find((i) => i.id === S.selection.id) || null;
  }

  function setTool(tool) {
    S.tool = tool;
    if (tool !== 'place') S.armed = null;
    emit('tool');
  }

  function arm(typeKey) {
    if (!typeKey) { S.armed = null; S.tool = 'select'; emit('tool'); return; }
    const t = S.library.types[typeKey];
    if (!t) return;
    S.armed = { typeKey, type: typeKey.includes('.') ? typeKey.split('.').slice(1).join('.') : typeKey, kind: t.kind };
    S.tool = 'place';
    emit('tool');
  }

  function snap(v) {
    if (!S.view.snap) return Math.round(v * 10000) / 10000;
    const g = S.view.gridSize || 0.5;
    return Math.round(v / g) * g;
  }

  /* The sun config that actually applies to the visible floor: house defaults
   * with the floor's own overrides on top. One mechanism, two scopes. */
  function sunConfig() {
    const f = floor();
    return SunModel.mergeConfig(S.project && S.project.sun, f && f.sun);
  }

  return {
    S, on, emit, clone, sunConfig,
    floor, theme, uiTheme, setAdvanced, setMultiSelect,
    mutate, undo, redo, replaceProject,
    uniqueId, newRoomId, newItemId, renameRoom,
    select, selected, toggleMulti, setMulti, isMulti, setTool, arm, snap,
    canUndo: () => S.undoStack.length > 0,
    canRedo: () => S.redoStack.length > 0,
  };
}());
