/**
 * Importer for hand-written floor-plan specs (the `<floor>-floor.json` format).
 *
 * This is the migration path: the whole point of the builder is that the house
 * stops living in hand-edited JSON, so it has to be able to swallow what is
 * already there without losing anything.
 *
 * Two rules make that safe:
 *  1. Every key this importer does not model is copied verbatim into
 *     `floor._legacy` / `room._legacy` / `item._legacy`. Nothing is silently
 *     dropped, so a round trip through the builder cannot quietly delete a
 *     daylight model or a light-zone map it did not understand.
 *  2. The three separate arrays (fixtures / devices / furniture) collapse into
 *     one `items` array tagged with `kind`. The editor then has ONE selection
 *     model, one hit-test and one renderer instead of three near-copies — which
 *     is exactly the duplication that made the hand-written version expensive
 *     to change.
 */

const fs = require('fs');
const path = require('path');

/* Keys the builder models natively, per level. Anything else is _legacy. */
const FLOOR_KNOWN = new Set(['id', 'name', 'level_ft', 'icon', 'extent', 'grid', 'rooms', 'apertures', 'fixtures', 'devices', 'furniture']);
const ROOM_KNOWN = new Set(['id', 'name', 'rect', 'floor', 'outdoor', 'noLabel', 'chip_at', 'chip_rotate', 'part_of', 'ac_boost', 'dnd']);
const AP_KNOWN = new Set(['type', 'room', 'wall', 'at', 'w', 'swing', 'curtain', 'sensor', 'h', 'sill']);
const ITEM_KNOWN = new Set(['entity', 'type', 'at', 'room', 'name', '_name']);


function rest(obj, known) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) if (!known.has(k)) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

/* An aperture becomes a first-class OPENING with an id, so it can be selected,
 * moved and given a door sensor like any other object. Its light transmission
 * is carried explicitly rather than being implied by its type, which is what
 * lets a grill, a curtained window and a glass door all feed one daylight
 * model. */
function importOpening(a, seq) {
  const known = {};
  for (const [k, v] of Object.entries(a)) if (!AP_KNOWN.has(k)) known[k] = v;
  return Object.assign({
    id: 'op' + seq,
    type: a.type || 'opening',
    room: a.room,
    wall: a.wall,
    at: a.at,
    w: a.w,
    h: a.h !== undefined ? a.h : undefined,
    sill: a.sill !== undefined ? a.sill : undefined,
    swing: a.swing !== undefined ? a.swing : undefined,
    curtain: a.curtain !== undefined ? a.curtain : undefined,
    sensor: a.sensor !== undefined ? a.sensor : undefined,
  }, Object.keys(known).length ? { _legacy: known } : {});
}

function importRoom(r) {
  return {
    id: r.id,
    name: r.name || r.id,
    shape: 'rect',
    rect: r.rect,
    points: null,
    // The old spec's `floor` names a finish; the builder calls that flooring
    // and keeps `floor` free for the storey. Same value, clearer name.
    flooring: r.floor || (r.outdoor ? 'grass' : 'plain'),
    floorLegacy: r.floor,
    boost: r.ac_boost || null,
    dnd: r.dnd || null,
    master: null,
    /* No shortcuts on an import: the old format carries none of its own, and
     * the two fields above are read as shortcuts by controls.js rather than
     * copied here — one source for each fact. `keys` unset means the room
     * answers to its own id and name, which is what the old build script
     * defaulted to. */
    shortcuts: [],
    keys: null,
    ganged: false,
    popup: null,
    outdoor: !!r.outdoor,
    noLabel: !!r.noLabel,
    chip_at: r.chip_at || null,
    chip_rotate: r.chip_rotate || 0,
    part_of: r.part_of || null,
    _legacy: rest(r, ROOM_KNOWN),
  };
}

function importItem(raw, kind, seq) {
  const props = rest(raw, ITEM_KNOWN) || {};
  return {
    id: `${kind[0]}${seq}`,
    kind,
    type: raw.type || raw.kind || 'spot',
    at: raw.at || (raw.rect ? [raw.rect[0], raw.rect[1]] : [0, 0]),
    // Explicit room assignment, kept verbatim. Never re-derived on export.
    room: raw.room || null,
    entity: raw.entity === undefined ? undefined : raw.entity,
    name: raw.name || raw._name || null,
    props,
  };
}

/* Furniture is rect-shaped rather than point-shaped, so it keeps its rect in
 * props and takes the rect's origin as its anchor point. */
function importFurniture(raw, seq) {
  const item = importItem(raw, 'furniture', seq);
  item.type = raw.kind || 'rect';
  if (raw.rect) {
    item.at = [raw.rect[0], raw.rect[1]];
    item.props.w = raw.rect[2];
    item.props.h = raw.rect[3];
    delete item.props.rect;
  }
  delete item.props.kind;
  return item;
}

function importFloor(spec, sourceName) {
  let seq = 0;
  const items = [];
  for (const f of spec.fixtures || []) items.push(importItem(f, 'fixture', ++seq));
  for (const d of spec.devices || []) items.push(importItem(d, 'device', ++seq));
  for (const u of spec.furniture || []) items.push(importFurniture(u, ++seq));

  const rooms = (spec.rooms || []).map(importRoom);

  /* room_master and ganged_rooms were floor-level maps keyed by room id. As
   * room fields they travel with the room, which is what makes a room's whole
   * configuration visible in one panel. Both are re-emitted on export. */
  for (const r of rooms) {
    if (spec.room_master && spec.room_master[r.id]) r.master = spec.room_master[r.id];
    // ganged_rooms is a bare array on some floors and { _comment, rooms: [] }
    // on others. Read both; the exporter writes back into whichever shape the
    // original used.
    const gr = spec.ganged_rooms;
    const gangedList = Array.isArray(gr) ? gr : (gr && Array.isArray(gr.rooms) ? gr.rooms : []);
    if (gangedList.includes(r.id)) r.ganged = true;
  }

  let opSeq = 0;
  return {
    id: spec.id || path.basename(sourceName, '.json'),
    name: spec.name || spec.id || sourceName,
    level_ft: spec.level_ft ?? 0,
    icon: spec.icon || 'mdi:floor-plan',
    extent: spec.extent || { w: 40, h: 40 },
    grid: { size: 0.5, snap: true, reference: spec.grid || null },
    sun: null,
    popup: null,
    boundaries: [],
    rooms,
    openings: (spec.apertures || []).map((a) => importOpening(a, ++opSeq)),
    items,
    _legacy: rest(spec, FLOOR_KNOWN),
    _source: sourceName,
  };
}

/* Read every *.json in a directory that looks like a floor spec. A spec is
 * recognised by having BOTH rooms and an extent — that keeps config files
 * (plan_card_styles.json and friends) out of the import without needing a
 * filename convention. */
function fromDirectory(dir, onlyFiles) {
  const target = dir || process.env.FPS_LEGACY_DIR;
  if (!target) throw new Error('no directory given and FPS_LEGACY_DIR is not set');
  if (!fs.existsSync(target)) throw new Error(`no such directory: ${target}`);

  const names = (onlyFiles && onlyFiles.length ? onlyFiles : fs.readdirSync(target))
    .filter((f) => f.toLowerCase().endsWith('.json'));

  const floors = [];
  const skipped = [];
  for (const name of names) {
    const full = path.join(target, name);
    let spec;
    try {
      spec = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      skipped.push({ file: name, reason: 'unreadable JSON: ' + e.message });
      continue;
    }
    if (!Array.isArray(spec.rooms) || !spec.extent) {
      skipped.push({ file: name, reason: 'not a floor spec (needs rooms[] and extent)' });
      continue;
    }
    floors.push(importFloor(spec, name));
  }

  floors.sort((a, b) => (a.level_ft ?? 0) - (b.level_ft ?? 0));

  const stats = floors.map((f) => ({
    id: f.id,
    name: f.name,
    level_ft: f.level_ft,
    rooms: f.rooms.length,
    openings: f.openings.length,
    fixtures: f.items.filter((i) => i.kind === 'fixture').length,
    devices: f.items.filter((i) => i.kind === 'device').length,
    furniture: f.items.filter((i) => i.kind === 'furniture').length,
    preservedLegacyKeys: Object.keys(f._legacy || {}),
  }));

  return { floors, stats, skipped, importedFrom: target };
}

module.exports = { fromDirectory, importFloor, importRoom };
