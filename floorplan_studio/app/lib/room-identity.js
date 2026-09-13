/* Room identity edits shared by the editor and MCP. References are floor-local.
 * Keep this table explicit: unrelated strings (especially entity ids) are data,
 * not references, even when they happen to contain the old room id. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoomIdentity = factory();
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const REFERENCES = [
    ['items', 'room'], ['openings', 'room'], ['boundaries', 'room'], ['rooms', 'part_of'],
    ['annotations', 'target.id', 'room'], ['annotations', 'target.room', 'boundary'],
  ];
  function uniqueId(base, taken) {
    const slug = String(base || 'room').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'room';
    let id = slug, n = 2;
    while (taken.has(id)) id = `${slug}_${n++}`;
    return id;
  }
  function canAutoRename(project, room) {
    return room._autoId === true && !project.dashboard?.installedAt;
  }
  function rename(project, floor, room, name, options = {}) {
    const oldId = room.id;
    const explicit = options.id !== undefined;
    const next = explicit || options.matchName || canAutoRename(project, room)
      ? uniqueId(explicit ? options.id : name, new Set((floor.rooms || []).filter(r => r !== room).map(r => r.id))) : oldId;
    room.name = name;
    if (explicit || options.matchName) delete room._autoId;
    if (next !== oldId) {
      for (const [collection, key, targetKind] of REFERENCES) {
        for (const value of floor[collection] || []) {
          if (targetKind && value.target?.kind !== targetKind) continue;
          const path = key.split('.');
          const owner = path.length === 2 ? value[path[0]] : value;
          const field = path[path.length - 1];
          if (owner?.[field] === oldId) owner[field] = next;
        }
      }
      room.id = next;
    }
    return { oldId, id: next, changed: next !== oldId };
  }
  return { rename, uniqueId, canAutoRename, REFERENCES };
}));
