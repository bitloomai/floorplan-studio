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

/* ------------------------------------------------------------- shapes
 *
 * Three different documents can legitimately arrive at an import, and telling
 * them apart by SHAPE rather than by filename is what stops one being mangled
 * into another:
 *
 *   project — this builder's own export; `floors[]`, already in this schema
 *   floor   — one of this builder's floors; `items[]` / `openings[]` with ids
 *   legacy  — a hand-written spec; `rooms[]` + `extent`, three marker arrays
 *
 * Only the legacy branch converts anything. The other two ARE the schema and
 * are passed through untouched — running them through `importFloor()` would
 * sweep `items`, `openings` and `boundaries` into `_legacy` and silently
 * flatten a plan this editor had written itself, which reads as data loss
 * rather than as the refusal it should be.
 *
 * The order matters: a legacy spec carries `fixtures`/`devices`/`furniture`
 * and `apertures`, never `items`/`openings`, so it cannot be caught by the
 * floor test above it. */
function classify(spec) {
  if (Array.isArray(spec.floors)) return 'project';
  if (Array.isArray(spec.items) || Array.isArray(spec.openings)) return 'floor';
  if (Array.isArray(spec.rooms) && spec.extent) return 'legacy';
  return null;
}

/* An uploaded name is display-only — nothing here opens it — but it still
 * reaches a DOM node and a log line, so it is reduced to a bare basename with
 * no directory components and no control characters. */
function safeName(v) {
  let out = '';
  for (const ch of String(v == null ? '' : v)) {
    const code = ch.charCodeAt(0);
    /* 47 is "/" and 92 is a backslash: either one starts a new basename, so
     * everything gathered so far was a directory and is discarded. */
    if (code === 47 || code === 92) { out = ''; continue; }
    if (code > 31 && code !== 127) out += ch;
  }
  return out.slice(0, 120) || 'file';
}

function statsFor(floors) {
  return floors.map((f) => ({
    id: f.id,
    name: f.name,
    level_ft: f.level_ft ?? 0,
    rooms: (f.rooms || []).length,
    openings: (f.openings || []).length,
    fixtures: (f.items || []).filter((i) => i && i.kind === 'fixture').length,
    devices: (f.items || []).filter((i) => i && i.kind === 'device').length,
    furniture: (f.items || []).filter((i) => i && i.kind === 'furniture').length,
    preservedLegacyKeys: Object.keys(f._legacy || {}),
  }));
}

/* Convert an uploaded set of documents.
 *
 * `files` is `[{ name, text }]` — the BYTES, never a path. The caller has
 * already read them, so nothing in this function touches the filesystem and
 * no directory on the app's own disk is reachable through it.
 *
 * Every file that cannot be used is REPORTED rather than dropped: "four of
 * your five floors imported" is only actionable if the fifth says why it
 * did not. A whole-upload problem throws instead, because there is no
 * partial result worth showing for one. */
function fromFiles(files) {
  if (!Array.isArray(files) || !files.length) throw new Error('no files were uploaded');

  const skipped = [];
  const parsed = [];
  for (const f of files) {
    const name = safeName(f && f.name);
    const text = f && typeof f.text === 'string' ? f.text : null;
    if (text === null) { skipped.push({ file: name, reason: 'no readable text content' }); continue; }
    if (!/\.json$/i.test(name)) { skipped.push({ file: name, reason: 'not a .json file' }); continue; }
    if (!text.trim()) { skipped.push({ file: name, reason: 'the file is empty' }); continue; }
    let spec;
    try {
      spec = JSON.parse(text);
    } catch (e) {
      skipped.push({ file: name, reason: 'unreadable JSON — ' + e.message });
      continue;
    }
    /* `typeof null === 'object'`, and an array passes it too; both would sail
     * into classify() and read as "no recognised shape" with a much vaguer
     * reason than the one the person actually needs. */
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
      skipped.push({ file: name, reason: 'the JSON is not an object' });
      continue;
    }
    const shape = classify(spec);
    if (!shape) {
      skipped.push({ file: name, reason: 'not a floor plan — needs floors[], or items[]/openings[], or rooms[] + extent' });
      continue;
    }
    parsed.push({ name, spec, shape });
  }

  /* An exported project already describes every floor there is, so combining
   * one with anything else has no single sensible answer — is the loose floor
   * an addition, or a newer copy of one already inside? Refuse and say so
   * rather than pick. */
  const projects = parsed.filter((p) => p.shape === 'project');
  if (projects.length > 1) {
    throw new Error('two exported projects were uploaded together — import one at a time.');
  }
  if (projects.length && parsed.length > 1) {
    throw new Error(`"${projects[0].name}" is a whole exported project, so it has to be imported on its own.`);
  }

  let floors = [];
  if (projects.length) {
    const raw = projects[0].spec.floors;
    floors = raw.filter((f) => f && typeof f === 'object' && !Array.isArray(f));
    if (floors.length !== raw.length) {
      skipped.push({ file: projects[0].name, reason: `${raw.length - floors.length} entr${raw.length - floors.length === 1 ? 'y' : 'ies'} in floors[] was not an object` });
    }
  } else {
    for (const p of parsed) {
      if (p.shape === 'floor') {
        floors.push(Object.assign({}, p.spec, { _source: p.name }));
      } else {
        floors.push(importFloor(p.spec, p.name));
      }
    }
  }

  /* Two floors sharing an id makes the floor switcher ambiguous and gives the
   * generated dashboard two tabs claiming the same plan. Renaming the later
   * one is recoverable and is reported; importing the broken pair is not. */
  const seen = new Set();
  const renamed = [];
  for (const f of floors) {
    const wanted = typeof f.id === 'string' && f.id.trim() ? f.id.trim() : 'floor';
    let id = wanted;
    if (seen.has(id)) {
      let n = 2;
      while (seen.has(`${wanted}_${n}`)) n++;
      id = `${wanted}_${n}`;
      renamed.push({ from: wanted, to: id });
    }
    seen.add(id);
    f.id = id;
    if (!f.name) f.name = id;
  }

  floors.sort((a, b) => (a.level_ft ?? 0) - (b.level_ft ?? 0));
  return { floors, stats: statsFor(floors), skipped, renamed };
}

/* Read every *.json in a directory and hand the bytes to `fromFiles`, so the
 * conversion has exactly one implementation no matter where the documents came
 * from. Kept for the opt-in legacy round-trip check and for `FPS_LEGACY_DIR`;
 * the app's own import is an upload and reads no directory at all. */
function fromDirectory(dir, onlyFiles) {
  const target = dir || process.env.FPS_LEGACY_DIR;
  if (!target) throw new Error('no directory given and FPS_LEGACY_DIR is not set');
  if (!fs.existsSync(target)) throw new Error(`no such directory: ${target}`);

  const names = (onlyFiles && onlyFiles.length ? onlyFiles : fs.readdirSync(target))
    .filter((f) => f.toLowerCase().endsWith('.json'));

  const files = [];
  const unreadable = [];
  for (const name of names) {
    try {
      files.push({ name, text: fs.readFileSync(path.join(target, name), 'utf8') });
    } catch (e) {
      unreadable.push({ file: name, reason: 'could not be read — ' + e.message });
    }
  }
  /* An empty directory is a legitimate "nothing here", not the malformed
   * request `fromFiles` throws on. */
  if (!files.length) return { floors: [], stats: [], skipped: unreadable, renamed: [], importedFrom: target };

  const result = fromFiles(files);
  result.skipped.push(...unreadable);
  return Object.assign(result, { importedFrom: target });
}

module.exports = { fromDirectory, fromFiles, importFloor, importRoom };
