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
  /* -------------------------------------------------- what is under a point */

  /* `hitTargets` measures in pixels — a 17px tap radius, a 14px opening line —
   * so those numbers only mean anything against a real scale. 22 px/ft is the
   * editor's own default `ppf`, which is the zoom those constants were chosen
   * at, and 12px is the distance canvas.js lets you grab a wall from. */
  const HIT_PPF = 22;
  const EDGE_TOL_FT = 12 / HIT_PPF;
  const NEAR_FT = 8;

  function segDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  function pointInPolygon(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  /* The room edge nearest a point, as a boundary target: an explicit override
   * when one covers that spot, otherwise the room/wall/edge address of the
   * default wall there — which is why attaching feedback to a plain wall never
   * writes a physical boundary just to have something to point at. Shared with
   * canvas.js so the editor's wall menu and a headless lookup cannot drift. */
  function nearestEdge(floor, at, tolFt) {
    if (!point(at)) return null;
    let nearest = null, distance = tolFt > 0 ? tolFt : EDGE_TOL_FT;
    for (const room of floor.rooms || []) for (const edge of scene().roomEdges(room)) {
      const d = segDistance(at[0], at[1], edge.a[0], edge.a[1], edge.b[0], edge.b[1]);
      if (d < distance) { distance = d; nearest = { kind: 'boundary', room: room.id, wall: edge.wall, edge: edge.src ?? edge.index }; }
    }
    if (!nearest) return null;
    const along = ['n', 's'].includes(nearest.wall) ? at[0] : at[1];
    const match = (floor.boundaries || []).find(b => b.room === nearest.room && b.wall === nearest.wall
      && (b.edge == null || b.edge === nearest.edge)
      && (b.from == null || along >= b.from) && (b.to == null || along <= b.to));
    return match?.id ? { kind: 'boundary', id: match.id } : nearest;
  }
  /* The hit shapes are the small closed set `hitTargets` emits: a circle, a
   * rect that may carry its own rotation, an opening's thick line, a room
   * polygon and a cove's stroked ring. Anything else is not a target. */
  function insideShape(node, px, py) {
    const a = node.attrs || {};
    let x = px, y = py;
    const rot = /rotate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(a.transform || '');
    if (rot) {
      const t = -rot[1] * Math.PI / 180, cx = +rot[2], cy = +rot[3], dx = px - cx, dy = py - cy;
      x = cx + dx * Math.cos(t) - dy * Math.sin(t);
      y = cy + dx * Math.sin(t) + dy * Math.cos(t);
    }
    if (node.tag === 'circle') return Math.hypot(x - +a.cx, y - +a.cy) <= +a.r;
    if (node.tag === 'rect') return x >= +a.x && y >= +a.y && x <= +a.x + +a.width && y <= +a.y + +a.height;
    const pts = [];
    if (node.tag === 'line') pts.push([+a.x1, +a.y1], [+a.x2, +a.y2]);
    else if (node.tag === 'path') for (const m of String(a.d).matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)) pts.push([+m[1], +m[2]]);
    if (pts.length < 2) return false;
    const reach = (+a['stroke-width'] || 0) / 2;
    const last = pts.length - (node.tag === 'line' ? 1 : 0);
    for (let i = 0; i < last; i++) {
      const b = pts[(i + 1) % pts.length];
      if (segDistance(x, y, pts[i][0], pts[i][1], b[0], b[1]) <= reach) return true;
    }
    return node.tag === 'path' && !node.outline && pointInPolygon(pts, x, y);
  }
  /* Every target under a point, topmost first — the chain a note dropped on
   * bare canvas attaches to. `hitTargets` is painted back to front, so reading
   * it backwards is the order the editor's own elementsFromPoint returns, and
   * a floor is always last because a point on a plan is at worst on the floor. */
  function locate(floor, at, library, opts) {
    if (!floor || !point(at)) return [];
    const out = [], seen = new Set();
    try {
      const P = scene().makeProjector({ ppf: HIT_PPF });
      const px = P.X(at[0]), py = P.Y(at[1]);
      const targets = scene().hitTargets(floor, library, P) || [];
      for (let i = targets.length - 1; i >= 0; i--) {
        const node = targets[i];
        const kind = node.target === 'chip' ? 'room' : node.target;
        if (!collection[kind] || !node.id || seen.has(kind + node.id)) continue;
        if (!insideShape(node, px, py)) continue;
        seen.add(kind + node.id);
        out.push({ kind, id: node.id });
      }
    } catch { /* A malformed floor answers "nothing here", never a thrown edit. */ }
    const wall = nearestEdge(floor, at, opts && opts.tolFt);
    if (wall) {
      const room = out.findIndex(t => t.kind === 'room');
      out.splice(room < 0 ? out.length : room, 0, wall);
    }
    out.push({ kind: 'floor' });
    return out;
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
    /* A note dropped at a position with no target attaches to whatever is on
     * top there — the fixture, then the wall, then the room, then the floor.
     * Feedback about a thing should reference the thing; a bare coordinate
     * makes a reader work out what was meant, and it may guess wrong. */
    const target = clone(value.target || (point(value.at) ? locate(floor, value.at, library)[0] : null) || { kind: 'floor' });
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
  /* A short human name for one object, so a chain of ids reads as a sentence. */
  function describe(kind, obj, library) {
    if (kind === 'item') {
      const type = scene().resolveType(library, obj);
      return obj.name || type?.label || `${obj.kind}.${obj.type}`;
    }
    if (kind === 'boundary') return `${obj.type || 'wall'} on ${obj.room} ${obj.wall}`;
    if (kind === 'opening') return obj.type || 'opening';
    return obj.name || obj.id || kind;
  }
  /* Which room a note is really about. A target that names one says so; an item
   * uses its own label first because `item.room` is data and an item is allowed
   * to sit outside its room's outline; anything else is judged by the pin. */
  function ownerRoom(floor, target, obj, at) {
    const byId = id => (floor.rooms || []).find(r => r.id === id) || null;
    if (target.kind === 'room') return obj || byId(target.id);
    if (['opening', 'boundary'].includes(target.kind)) return byId((obj && obj.room) || target.room);
    if (target.kind === 'item' && obj) return byId(obj.room) || (point(obj.at) ? scene().roomAt(floor, obj.at[0], obj.at[1]) : null);
    return point(at) ? scene().roomAt(floor, at[0], at[1]) : null;
  }
  /* The data AROUND a note. "This corner is too dark" is only actionable once
   * you know which room that corner is in and which lamps are already within
   * reach of it, and working that out from coordinates is exactly the step a
   * reader gets wrong. Computed on read: nothing here is stored on the note. */
  function context(floor, note, library, obj) {
    const at = point(note.at) ? note.at : null;
    const room = ownerRoom(floor, note.target, obj, at);
    const near = [];
    if (at) for (const kind of ['item', 'opening']) for (const o of floor[collection[kind]] || []) {
      if (!o || !o.id || (note.target.kind === kind && note.target.id === o.id)) continue;
      const a = anchor(floor, { kind, id: o.id }, library);
      if (!a) continue;
      const d = Math.hypot(a[0] - at[0], a[1] - at[1]);
      if (d <= NEAR_FT) near.push({ kind, id: o.id, label: describe(kind, o, library),
        typeKey: kind === 'item' ? `${o.kind}.${o.type}` : o.type, entity: o.entity || undefined,
        distanceFt: Math.round(d * 10) / 10 });
    }
    near.sort((a, b) => a.distanceFt - b.distanceFt);
    return {
      floor: { id: floor.id, name: floor.name, level_ft: floor.level_ft },
      room: room ? { id: room.id, name: room.name, outdoor: !!room.outdoor, flooring: room.flooring || null } : null,
      under: at ? locate(floor, at, library).slice(0, 6) : [],
      nearby: near.slice(0, 8),
    };
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
        let around = null;
        try { around = context(f, n, library, obj); } catch { around = null; }
        return { ...clone(n), floorId: f.id, floorName: f.name, resolvedTarget, missing: !obj, context: around };
      }));
  }
  // Strip only the defined sidecar locations; never recursively delete arbitrary
  // strings/fields that happen to be named alike in a user's data.
  function withoutNotes(project) {
    const out = clone(project);
    for (const f of out.floors || []) { delete f.annotations; if (f._legacy) delete f._legacy.annotations; }
    return out;
  }
  return { KINDS, NEAR_FT, sameTarget, resolve, anchor, make, validate, reconcile, list, context, locate, nearestEdge, withoutNotes };
}));
