/* Three-way merge of a project, for an editor whose save was refused because
 * the project was written elsewhere after the editor loaded it — an MCP tool
 * call, a second tab. Shared by the editor and the suite.
 *
 * Without it the editor saved its whole, stale document over the newer one:
 * on 2026-09-13 an assistant turned the viewing deck's solar array three times
 * and an open editor put it back each time, silently.
 *
 * `base` is the copy the editor last had from the server, `mine` what it holds
 * now, `theirs` what the server holds now. A value only one side changed is
 * taken from that side. Where both changed the same value to different things,
 * the editor's own edit wins — the person is looking at it — and the path is
 * reported. Lists whose members all carry a string `id` (floors, rooms, items,
 * openings, annotations) merge member by member, so an assistant rotating one
 * item and a person moving another both survive; any other list is one value.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProjectMerge = factory();
}(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const keyed = (list) => Array.isArray(list) && list.every((v) => isObj(v) && typeof v.id === 'string');

  function merge3(base, mine, theirs, path, conflicts) {
    if (same(mine, theirs)) return copy(mine);
    if (same(mine, base)) return copy(theirs);
    if (same(theirs, base)) return copy(mine);
    if (isObj(mine) && isObj(theirs)) {
      const b = isObj(base) ? base : {};
      const out = {};
      for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
        const v = merge3(b[k], mine[k], theirs[k], `${path}.${k}`, conflicts);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    if (keyed(mine) && keyed(theirs) && (base === undefined || keyed(base))) {
      return mergeById(base || [], mine, theirs, path, conflicts);
    }
    conflicts.push(path);
    return copy(mine);
  }

  function mergeById(base, mine, theirs, path, conflicts) {
    const index = (list) => new Map(list.map((v) => [v.id, v]));
    const B = index(base), M = index(mine), T = index(theirs);
    /* Order is meaning here — an item's place in the list is its layer. Keep
     * the editor's order unless the other side reordered too. */
    const ids = (list) => list.map((v) => v.id).join('\n');
    const first = ids(theirs) === ids(base) ? mine : theirs;
    const second = first === mine ? theirs : mine;
    const out = [];
    const seen = new Set();
    for (const { id } of first.concat(second)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const b = B.get(id), m = M.get(id), t = T.get(id);
      const at = `${path}[${id}]`;
      if (m && t) { out.push(merge3(b, m, t, at, conflicts)); continue; }
      if (!b) { out.push(copy(m || t)); continue; }        // added on one side
      const kept = m || t;                                  // deleted on the other
      if (same(kept, b)) continue;                          // untouched where kept: the deletion stands
      conflicts.push(at);                                   // changed on one side, deleted on the other: keep the change
      out.push(copy(kept));
    }
    return out;
  }

  /* `{ project, conflicts }`. With no base to compare against there is nothing
   * to merge from, and the editor's document is returned as it is. */
  function merge(base, mine, theirs) {
    const conflicts = [];
    if (!base || !theirs) return { project: copy(mine), conflicts: ['project'] };
    return { project: merge3(base, mine, theirs, 'project', conflicts), conflicts };
  }

  return { merge };
}));
