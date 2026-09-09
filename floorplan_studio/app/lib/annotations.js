/* Editor-only review notes. Shared lifecycle rules for browser edits and MCP.
 * No dependency from deployed renderers: notes are opt-in editor data. */
(function (root, factory) {
  const api = factory(() => typeof module === 'object' && module.exports ? require('./plan-scene') : root.PlanScene);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Annotations = api;
}(typeof window !== 'undefined' ? window : globalThis, function (scene) {
  'use strict';
  const KINDS = ['floor', 'room', 'item', 'opening', 'boundary', 'point'];
  const clone = v => JSON.parse(JSON.stringify(v));
  const point = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
  const collection = { room: 'rooms', item: 'items', opening: 'openings', boundary: 'boundaries' };
  function sameTarget(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'floor') return true;
    if (a.kind === 'point') return point(a.at) && point(b.at) && a.at.every((v,i) => v === b.at[i]);
    if (a.id || b.id) return a.id === b.id;
    return a.kind === 'boundary' && a.room === b.room && a.wall === b.wall && (a.edge ?? null) === (b.edge ?? null);
  }
  function resolve(floor, target) {
    if (!target) return null;
    if (target.kind === 'floor') return floor;
    if (target.kind === 'point') return point(target.at) ? { at: target.at } : null;
    if (target.id) return (floor[collection[target.kind]] || []).find(v => v.id === target.id) || null;
    // Default walls have no boundary object. Address their room edge without
    // creating an override just to attach feedback to it.
    if (target.kind === 'boundary' && target.room) {
      const room = (floor.rooms || []).find(r => r.id === target.room);
      const edges = room && scene().roomEdges(room);
      if (edges?.some(e => e.wall === target.wall && (target.edge == null || (e.src ?? e.index) === target.edge)))
        return { room: target.room, wall: target.wall, edge: target.edge, implicit: true };
    }
    return null;
  }
  function anchorUnsafe(floor, target, library) {
    const obj = resolve(floor, target);
    if (!obj) return null;
    if (target.kind === 'point') return obj.at.slice();
    if (target.kind === 'floor') return [(floor.extent?.w || 40)/2, (floor.extent?.h || 40)/2];
    if (target.kind === 'room') return scene().roomCentroid(obj);
    if (target.kind === 'item') {
      const t = scene().resolveType(library, obj) || {};
      const p = { ...t.defaults, ...obj.props };
      return obj.kind === 'furniture' ? [obj.at[0] + (p.w || 3)/2, obj.at[1] + (p.h || 3)/2] : obj.at.slice();
    }
    const room = (floor.rooms || []).find(r => r.id === obj.room);
    if (!room) return null;
    const edges = scene().roomEdges(room).filter(e => e.wall === obj.wall && (obj.edge == null || (e.src ?? e.index) === obj.edge));
    if (!edges.length) return null;
    const edge = edges[Math.floor(edges.length / 2)];
    if (target.kind === 'opening') { const e = scene().openingEdgeOf(room, obj); return e ? scene().pointOn(e, (obj.at ?? e.lo) + (obj.w ?? 2.5)/2) : null; }
    if (edges.length === 1 && (obj.from != null || obj.to != null))
      return scene().pointOn(edge, (Math.max(edge.lo, obj.from ?? edge.lo) + Math.min(edge.hi, obj.to ?? edge.hi))/2);
    return [(edge.a[0] + edge.b[0])/2, (edge.a[1] + edge.b[1])/2];
  }
  function anchor(floor, target, library) {
    // Invalid imports must reach validation, never crash a mutation halfway.
    try { const at = anchorUnsafe(floor, target, library); return point(at) ? at : null; } catch { return null; }
  }
  function make(floor, value, library) {
    const taken = new Set((floor.annotations || []).map(n => n.id));
    let id = 'n1'; for (let i = 1; taken.has(id); i++) id = 'n' + (i + 1);
    const target = clone(value.target || { kind: 'floor' });
    return { id: value.id || id, text: value.text, target,
      at: clone(value.at || anchor(floor, target, library) || [0, 0]),
      createdAt: value.createdAt || new Date().toISOString(), status: value.status || 'open' };
  }
  function validate(floor, err, warn, path) {
    if (floor.annotations == null) return;
    if (!Array.isArray(floor.annotations)) { err(path, 'annotations must be an array'); return; }
    const ids = new Set();
    floor.annotations.forEach((n, i) => {
      const at = `${path}[${i}]`;
      if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !n.id.trim()) { err(at, 'annotation needs an id'); return; }
      if (ids.has(n.id)) err(at + '.id', 'duplicate annotation id');
      ids.add(n.id);
      if (typeof n.text !== 'string' || !n.text.trim() || n.text.length > 10000) err(at + '.text', 'note text must contain 1..10000 characters');
      if (!['open', 'done'].includes(n.status)) err(at + '.status', 'status must be open or done');
      if (!point(n.at)) err(at + '.at', 'pin position must be [x, y] in feet');
      if (typeof n.createdAt !== 'string' || !Number.isFinite(Date.parse(n.createdAt))) err(at + '.createdAt', 'createdAt must be a timestamp');
      const t = n.target;
      if (!t || !KINDS.includes(t.kind)) { err(at + '.target', 'unknown annotation target kind'); return; }
      if (t.kind === 'point' && !point(t.at)) err(at + '.target.at', 'point target needs [x, y]');
      if (['room', 'item', 'opening'].includes(t.kind) && (typeof t.id !== 'string' || !t.id)) err(at + '.target.id', 'target needs an id');
      if (t.kind === 'boundary' && !(typeof t.id === 'string' && t.id)
        && !(typeof t.room === 'string' && ['n','e','s','w'].includes(t.wall) && (t.edge == null || Number.isInteger(t.edge))))
        err(at + '.target', 'boundary needs an id or a room/wall/edge address');
      try { if (!resolve(floor, t)) warn(at + '.target', 'target no longer exists; the note remains at its pin'); }
      catch { warn(at + '.target', 'target geometry cannot be resolved'); }
    });
  }
  function reconcile(before, after, library) {
    for (const floor of after.floors || []) {
      const oldFloor = (before?.floors || []).find(f => f.id === floor.id);
      for (const n of Array.isArray(floor.annotations) ? floor.annotations : []) {
        if (!n?.target || !point(n.at)) continue;
        const old = (Array.isArray(oldFloor?.annotations) ? oldFloor.annotations : []).find(v => v?.id === n.id);
        const current = anchor(floor, n.target, library);
        if (!current && (!old || sameTarget(old.target, n.target))) {
          // Only turn a formerly valid target into a point. A stale imported
          // reference stays visible to validation instead of silently disappearing.
          if (oldFloor && anchor(oldFloor, old?.target || n.target, library)) n.target = { kind: 'point', at: n.at.slice() };
        } else if (old && sameTarget(n.target, old.target) && JSON.stringify(n.at) === JSON.stringify(old.at)) {
          const prior = anchor(oldFloor, old.target, library);
          if (prior && !['point', 'floor'].includes(n.target.kind)) n.at = n.at.map((v, i) => v + current[i] - prior[i]);
        }
      }
    }
  }
  function list(project, library, { floorId, status } = {}) {
    return (project.floors || []).filter(f => !floorId || f.id === floorId).flatMap(f => (f.annotations || [])
      .filter(n => !status || n.status === status).map(n => {
        const obj = resolve(f, n.target);
        let resolvedTarget = obj && (n.target.kind === 'floor' ? { id: f.id, name: f.name, extent: f.extent } : clone(obj));
        if (obj && n.target.kind === 'item') {
          const type = scene().resolveType(library, obj);
          resolvedTarget = { ...resolvedTarget, typeKey: `${obj.kind}.${obj.type}`, label: obj.name || type?.label || obj.type };
        }
        return { ...clone(n), floorId: f.id, floorName: f.name, resolvedTarget, missing: !obj };
      }));
  }
  // Strip only the defined sidecar locations; never recursively delete arbitrary
  // strings/fields that happen to be named alike in a user's data.
  function withoutNotes(project) {
    const out = clone(project);
    for (const f of out.floors || []) { delete f.annotations; if (f._legacy) delete f._legacy.annotations; }
    return out;
  }
  return { KINDS, sameTarget, resolve, anchor, make, validate, reconcile, list, withoutNotes };
}));
