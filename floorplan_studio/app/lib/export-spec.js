/**
 * Export. Turns the builder's project back into artefacts you can use:
 *
 *   spec   — one legacy-shaped `<floor>.json` per floor, the format the existing
 *            hand-written render.js / build_card.js pipeline already consumes.
 *   svg    — a static plate per floor, rendered through the SAME scene builder
 *            the editor draws with.
 *   bundle — both, plus a manifest and any warnings.
 *
 * The legacy round trip is the important one: it means adopting the builder is
 * not a one-way door. Anything the importer stashed in `_legacy` is merged back
 * out here, so a daylight model or light-zone map the editor never showed you
 * still survives the trip.
 */

const PlanScene = require('./plan-scene');

function roomOut(room, warnings, floorId) {
  const out = { id: room.id, name: room.name };

  if (room.shape === 'poly' && Array.isArray(room.points) && room.points.length > 2) {
    const bbox = PlanScene.roomBBox(room);
    out.rect = bbox.map((n) => +n.toFixed(4));
    out.points = room.points.map((p) => p.map((n) => +n.toFixed(4)));
    warnings.push({
      floor: floorId, room: room.id, kind: 'polygon-room',
      message: `"${room.name}" is a hand-drawn polygon. The legacy renderer only understands rects, so its rect is the bounding box and the true outline is kept alongside as "points". Either teach the legacy renderer to read points, or split the room into rects.`,
    });
  } else {
    out.rect = (room.rect || [0, 0, 1, 1]).map((n) => +n.toFixed(4));
  }

  // Emit the finish under its original key. floorLegacy remembers what the
  // imported spec actually said, so a room that was never given one does not
  // gain a key it never had.
  const finish = room.floorLegacy !== undefined ? room.floorLegacy : (room.flooring !== 'plain' ? room.flooring : undefined);
  if (finish) out.floor = finish;
  if (room.outdoor) out.outdoor = true;
  if (room.noLabel) out.noLabel = true;
  if (room.chip_at) out.chip_at = room.chip_at;
  if (room.chip_rotate) out.chip_rotate = room.chip_rotate;
  if (room.part_of) out.part_of = room.part_of;
  /* The old format has a home for exactly two kinds of shortcut: `dnd`, one
   * entity, and `ac_boost`, a list of labelled ones. A room whose shortcuts
   * came in through those fields goes back out through them. Everything else a
   * shortcut can be — a scene, a script with variables, a service call, one
   * that lives on the house — has nowhere to go in that format and is dropped
   * rather than invented: this function writes the old spec, it does not
   * extend it. Nothing is lost from the builder's own document. */
  const cuts = (room.shortcuts || []).filter((s) => s && s.entity);
  const dnd = room.dnd || (cuts.find((s) => s.id === 'dnd') || {}).entity;
  const boost = (room.boost && room.boost.length)
    ? room.boost
    : cuts.filter((s) => s.section === 'boost').map((s) => ({ entity: s.entity, label: s.label || 'Boost' }));
  if (boost.length) out.ac_boost = boost;
  if (dnd) out.dnd = dnd;
  return Object.assign(out, room._legacy || {});
}

/* Explicit assignment wins over geometry — see legacy-import's roomFor. */
function roomOf(item, floor) {
  if (item.room) return item.room;
  const r = PlanScene.roomAt(floor, item.at[0], item.at[1]);
  return r ? r.id : undefined;
}

/* An opening goes back out as an aperture: drop the editor's own id, restore
 * any keys the importer parked in _legacy, and omit anything undefined so a
 * window that never had a sill does not acquire one. */
function openingOut(op) {
  const out = {};
  for (const k of ['type', 'room', 'wall', 'at', 'w', 'h', 'sill', 'swing', 'curtain', 'sensor', 'transmission', 'open']) {
    if (op[k] !== undefined && op[k] !== null) out[k] = op[k];
  }
  return Object.assign(out, op._legacy || {});
}

function itemOut(item, floor, library, warnings, floorId) {
  const type = PlanScene.resolveType(library, item) || {};
  const kind = item.kind || type.kind || 'fixture';
  const props = Object.assign({}, item.props || {});
  const at = (item.at || [0, 0]).map((n) => +n.toFixed(4));

  if (kind === 'furniture') {
    const w = props.w, h = props.h;
    delete props.w; delete props.h;
    return Object.assign({
      room: roomOf(item, floor),
      kind: item.type,
      rect: [at[0], at[1], +(w || 3).toFixed(4), +(h || 3).toFixed(4)],
    }, props);
  }

  if (item.entity === undefined || item.entity === '') {
    warnings.push({
      floor: floorId, item: item.id, kind: 'unbound',
      message: `A ${item.type} marker at [${at}] has no entity bound. It will draw but do nothing.`,
    });
  }

  // A device that was written with an explicit `entity: null` keeps it — that
  // is a deliberate "this thing exists but Home Assistant cannot see it"
  // statement (the PS4 on First Floor), not a missing value to be tidied away.
  const base = { entity: item.entity === undefined ? undefined : (item.entity || null), type: item.type, at };
  if (kind === 'device') {
    const room = roomOf(item, floor);
    if (room) base.room = room;
    if (item.name) base.name = item.name;
  } else if (item.name) {
    base._name = item.name;
  }
  return Object.assign(base, props);
}

function specForFloor(project, floor, library) {
  const warnings = [];
  const fixtures = [], devices = [], furniture = [];

  for (const item of floor.items || []) {
    const type = PlanScene.resolveType(library, item) || {};
    const kind = item.kind || type.kind || 'fixture';
    const out = itemOut(item, floor, library, warnings, floor.id);
    if (kind === 'furniture') furniture.push(out);
    else if (kind === 'device') devices.push(out);
    else fixtures.push(out);
  }

  const spec = Object.assign({
    id: floor.id,
    name: floor.name,
    level_ft: floor.level_ft ?? 0,
    extent: floor.extent,
    rooms: (floor.rooms || []).map((r) => roomOut(r, warnings, floor.id)),
    apertures: (floor.openings || floor.apertures || []).map(openingOut),
    furniture,
    fixtures,
    devices,
    _generated_by: `Floorplan Studio ${project.name || ''}`.trim(),
    _generated_at: new Date().toISOString(),
  }, JSON.parse(JSON.stringify(floor._legacy || {})));

  if (floor.grid && floor.grid.reference) spec.grid = floor.grid.reference;

  /* room_master and ganged_rooms are edited per-room in the builder but live
   * as floor-level maps in the spec. Merge back into whatever container the
   * original used — preserving its _comment keys and its shape — rather than
   * replacing it, so a floor nobody re-ganged exports byte-identically. */
  const masters = {};
  const ganged = [];
  for (const r of floor.rooms || []) {
    if (r.master) masters[r.id] = r.master;
    if (r.ganged) ganged.push(r.id);
  }

  /* Order is preserved from the original, with anything newly added appended.
   * The CONTENT would be equal either way, but re-emitting a file whose lists
   * have been silently reordered makes every diff look like a change. */
  const keepOrder = (originalKeys, now) => {
    const set = new Set(now);
    const out = originalKeys.filter((k) => set.has(k));
    for (const k of now) if (!out.includes(k)) out.push(k);
    return out;
  };

  const rm = spec.room_master;
  if (rm && typeof rm === 'object' && !Array.isArray(rm)) {
    const originalOrder = Object.keys(rm).filter((k) => !k.startsWith('_'));
    for (const k of originalOrder) delete rm[k];
    for (const k of keepOrder(originalOrder, Object.keys(masters))) rm[k] = masters[k];
  } else if (Object.keys(masters).length) {
    spec.room_master = masters;
  }

  const gr = spec.ganged_rooms;
  if (Array.isArray(gr)) spec.ganged_rooms = keepOrder(gr, ganged);
  else if (gr && typeof gr === 'object') gr.rooms = keepOrder(gr.rooms || [], ganged);
  else if (ganged.length) spec.ganged_rooms = ganged;

  return { spec, warnings };
}

function build(project, library, themesDoc, format, floorId) {
  const themeId = project.activeTheme || themesDoc.active || Object.keys(themesDoc.themes)[0];
  const theme = (themesDoc.themes[themeId] || {}).plan || {};
  const floors = (project.floors || []).filter((f) => !floorId || f.id === floorId);
  if (!floors.length) throw new Error(floorId ? `no floor with id "${floorId}"` : 'project has no floors');

  const files = [];
  const warnings = [];

  for (const floor of floors) {
    if (format === 'spec' || format === 'bundle') {
      const { spec, warnings: w } = specForFloor(project, floor, library);
      warnings.push(...w);
      files.push({
        name: `${floor.id}.json`,
        type: 'application/json',
        content: JSON.stringify(spec, null, 2),
      });
    }
    if (format === 'svg' || format === 'bundle') {
      const scene = PlanScene.build(project, floor, library, theme, { grid: { show: false } });
      files.push({
        name: `${floor.id}.svg`,
        type: 'image/svg+xml',
        content: PlanScene.toSvg(scene),
      });
    }
  }

  if (format === 'bundle') {
    files.push({
      name: 'manifest.json',
      type: 'application/json',
      content: JSON.stringify({
        project: project.name,
        theme: themeId,
        generatedAt: new Date().toISOString(),
        floors: floors.map((f) => ({
          id: f.id, name: f.name, level_ft: f.level_ft,
          rooms: (f.rooms || []).length,
          fixtures: (f.items || []).filter((i) => i.kind === 'fixture').length,
          devices: (f.items || []).filter((i) => i.kind === 'device').length,
          furniture: (f.items || []).filter((i) => i.kind === 'furniture').length,
        })),
        boundEntities: [...new Set(
          floors.flatMap((f) => (f.items || []).map((i) => i.entity).filter(Boolean))
        )].sort(),
      }, null, 2),
    });
  }

  return { format, files, warnings, theme: themeId };
}

module.exports = { build, specForFloor };
