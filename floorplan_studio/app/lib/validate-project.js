/**
 * Structural validation for a project document — the same checks whether the
 * change came from a human dragging a room on the canvas (which cannot
 * express most of these mistakes; the shapes are built by code that already
 * gets them right) or from an MCP tool call, which can express any of them,
 * because it is handed raw JSON rather than a mouse.
 *
 * Every `edit_collection`/`edit_settings` MCP call runs this before saving and
 * refuses to write on ERROR (not on warning) — see `mcp.js`. `validate_project`
 * exposes the same pass on demand, against whatever is currently on disk.
 *
 * Errors are things that will misrender or crash a reader (the canvas, the
 * card, the dashboard builder). Warnings are things that are legal per this
 * schema's own design but usually indicate a mistake — kept as warnings and
 * not errors because this codebase deliberately allows them on purpose, e.g.
 * "item room is data, not a lookup" (see ARCHITECTURE.md).
 */

'use strict';

const Shapes = require('./shapes');

const KINDS = new Set(['fixture', 'device', 'furniture', 'logic']);
const WALLS = new Set(['n', 'e', 's', 'w']);
/* The same test the renderer applies, and deliberately the same source of
 * truth: a colour a scheme declares is a colour that reaches an SVG attribute
 * in an exported plate and inside a generated dashboard card. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SHIPPED_SCHEMES = new Set(Object.keys(Shapes.SCHEMES));

function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }
/* >= 2 rather than === 2: the renderer only ever reads p[0]/p[1] (roomPoints()
 * in plan-scene.js), so a stray extra element is cosmetic junk, not a broken
 * point — and real fixture data has at least one of these already. Rejecting
 * it here would mean this checker refuses to save an unrelated change to a
 * project it merely happens to also contain. */
function isPoint(v) { return Array.isArray(v) && v.length >= 2 && isFiniteNum(v[0]) && isFiniteNum(v[1]); }

function resolveType(library, kind, type) {
  if (!library || !library.types) return null;
  const direct = library.types[`${kind}.${type}`];
  if (direct) return direct;
  const aliased = library.aliases && library.aliases[type];
  if (aliased && library.types[aliased]) return library.types[aliased];
  return null;
}

function validate(project, library) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });

  if (!project || typeof project !== 'object') { err('', 'project must be an object'); return { ok: false, errors, warnings }; }
  if (!Array.isArray(project.floors)) { err('floors', 'project.floors must be an array'); return { ok: false, errors, warnings }; }

  /* The sun is optional. Switching it on is not.
   *
   * A daylight model with no location has no solar position to compute, and one
   * with no orientation cannot tell which wall an opening is in — it would draw
   * beams through the wrong windows and read confidently wrong rather than
   * absent. Both are errors rather than warnings for that reason: the failure is
   * silent on screen, and a plan that is quietly lit from the wrong side is
   * worse than one that is not lit at all. A project that leaves `sun.enabled`
   * off needs neither. */
  const sun = project.sun || {};
  if (sun.enabled) {
    const loc = sun.location || {};
    if (!isFiniteNum(loc.lat) || !isFiniteNum(loc.lon)) {
      err('sun.location', 'sun is enabled, so location.lat and location.lon are required — '
        + 'without them there is no solar position to compute');
    } else if (Math.abs(loc.lat) > 90 || Math.abs(loc.lon) > 180) {
      err('sun.location', `lat/lon out of range (${loc.lat}, ${loc.lon})`);
    }
    /* Orientation may be given either way round: the bearing that points up the
     * screen, or the compass letters the editor writes beside each edge. */
    const hasBearing = isFiniteNum(sun.screenUpBearing);
    const c = project.compass || {};
    const hasCompass = ['up', 'right', 'down', 'left'].every((k) => typeof c[k] === 'string' && c[k]);
    if (!hasBearing && !hasCompass) {
      err('sun.screenUpBearing', 'sun is enabled, so the plan\'s orientation is required — '
        + 'set sun.screenUpBearing (the compass bearing that points up the screen) or project.compass');
    }
  }

  /* Colour schemes the document carries. Shipped ones live in the renderer and
   * never appear here; these are somebody's own, they travel in the export, and
   * they are baked into the generated dashboard card — so a malformed one is a
   * colour going into an SVG attribute on a page this app did not draw. The
   * renderer already refuses anything that is not a plain hex triple (see
   * `schemeColour` in shapes.js); this reports it instead of letting it fail
   * silently as a fallback nobody asked for.
   *
   * `id` and `fill` are errors because a scheme without either cannot be
   * referred to or cannot paint. Everything else is a warning: the renderer
   * fills a missing colour in from the ones that are there. */
  const schemeIds = new Set();
  if (project.schemes !== undefined) {
    if (!Array.isArray(project.schemes)) err('schemes', 'project.schemes must be an array of colour schemes');
    else {
      project.schemes.forEach((s, si) => {
        const spath = `schemes[${si}]`;
        if (!s || typeof s !== 'object' || Array.isArray(s)) { err(spath, 'scheme must be an object'); return; }
        if (typeof s.id !== 'string' || !s.id.trim()) err(`${spath}.id`, 'scheme is missing an id');
        else if (schemeIds.has(s.id)) err(`${spath}.id`, `duplicate scheme id "${s.id}"`);
        else schemeIds.add(s.id);
        if (!HEX.test(String(s.fill || ''))) err(`${spath}.fill`, 'fill must be a hex colour like #2b2f34 — a scheme with no body colour paints nothing');
        for (const k of ['line', 'glyph', 'accent']) {
          if (s[k] !== undefined && !HEX.test(String(s[k]))) warn(`${spath}.${k}`, `${k} is not a hex colour, so it falls back rather than painting`);
        }
        if (s.accent !== undefined && s.accent === s.line) {
          warn(`${spath}.accent`, 'accent is the same colour as line, so a marker in this scheme draws ON and OFF alike and falls back to the theme\'s live colour');
        }
      });
    }
  }

  const floorIds = new Set();
  project.floors.forEach((floor, fi) => {
    const fpath = `floors[${fi}]`;
    if (!floor || typeof floor !== 'object' || !floor.id) { err(fpath, 'floor is missing an id'); return; }
    if (floorIds.has(floor.id)) err(fpath, `duplicate floor id "${floor.id}"`);
    floorIds.add(floor.id);
    if (floor.level_ft !== undefined && !isFiniteNum(floor.level_ft)) err(`${fpath}.level_ft`, 'level_ft must be a number');

    const rooms = Array.isArray(floor.rooms) ? floor.rooms : [];
    if (!Array.isArray(floor.rooms)) warn(`${fpath}.rooms`, 'missing — treated as empty');
    const roomIds = new Set();
    rooms.forEach((room, ri) => {
      const rpath = `${fpath}.rooms[${ri}]`;
      if (!room || !room.id) { err(rpath, 'room is missing an id'); return; }
      if (roomIds.has(room.id)) err(rpath, `duplicate room id "${room.id}" on floor "${floor.id}"`);
      roomIds.add(room.id);
      if (room.chip_scale !== undefined && (!isFiniteNum(room.chip_scale) || room.chip_scale < .25 || room.chip_scale > 4))
        err(`${rpath}.chip_scale`, 'badge scale must be a number from 0.25 to 4');
      if (room.chip_at != null && !isPoint(room.chip_at)) err(`${rpath}.chip_at`, 'badge position must be [x, y] in floor feet');
      if (room.shape === 'rect') {
        const r = room.rect;
        if (!Array.isArray(r) || r.length !== 4 || !r.every(isFiniteNum)) err(`${rpath}.rect`, 'rect must be [x, y, w, h]');
        else if (r[2] <= 0 || r[3] <= 0) err(`${rpath}.rect`, 'rect width and height must be greater than 0');
      } else if (room.shape === 'poly') {
        const p = room.points;
        if (!Array.isArray(p) || p.length < 3 || !p.every(isPoint)) err(`${rpath}.points`, 'points must be at least 3 [x, y] pairs');
      } else {
        err(`${rpath}.shape`, `shape must be "rect" or "poly", got ${JSON.stringify(room.shape)}`);
      }
    });

    const openings = Array.isArray(floor.openings) ? floor.openings : [];
    if (!Array.isArray(floor.openings)) warn(`${fpath}.openings`, 'missing — treated as empty');
    const openingIds = new Set();
    openings.forEach((op, oi) => {
      const opath = `${fpath}.openings[${oi}]`;
      if (!op || !op.id) { err(opath, 'opening is missing an id'); return; }
      if (openingIds.has(op.id)) err(opath, `duplicate opening id "${op.id}" on floor "${floor.id}"`);
      openingIds.add(op.id);
      if (!op.room || !roomIds.has(op.room)) err(`${opath}.room`, `references room "${op.room}", which does not exist on floor "${floor.id}"`);
      if (!WALLS.has(op.wall)) err(`${opath}.wall`, `wall must be one of n/e/s/w, got ${JSON.stringify(op.wall)}`);
      if (!isFiniteNum(op.at)) err(`${opath}.at`, 'at must be a number (position along the wall)');
      if (!isFiniteNum(op.w) || op.w <= 0) err(`${opath}.w`, 'w must be a number greater than 0');
      if (op.position !== undefined && (!isFiniteNum(op.position) || op.position < 0 || op.position > 100)) err(`${opath}.position`, 'position must be 0..100 (closed to open)');
      if (op.leafRatio !== undefined && (!isFiniteNum(op.leafRatio) || op.leafRatio < .1 || op.leafRatio > .9)) err(`${opath}.leafRatio`, 'leafRatio must be 0.1..0.9');
      if (op.depth !== undefined && (!isFiniteNum(op.depth) || op.depth <= 0)) err(`${opath}.depth`, 'parking depth must be greater than 0');
      if (op.cover && (typeof op.cover !== 'string' || !/^cover\.[a-z0-9_]+$/.test(op.cover))) err(`${opath}.cover`, 'motor entity must be a cover entity id');
    });

    const items = Array.isArray(floor.items) ? floor.items : [];
    if (!Array.isArray(floor.items)) warn(`${fpath}.items`, 'missing — treated as empty');
    const itemIds = new Set();
    items.forEach((item, ii) => {
      const ipath = `${fpath}.items[${ii}]`;
      if (!item || !item.id) { err(ipath, 'item is missing an id'); return; }
      if (itemIds.has(item.id)) err(ipath, `duplicate item id "${item.id}" on floor "${floor.id}"`);
      itemIds.add(item.id);
      if (!KINDS.has(item.kind)) err(`${ipath}.kind`, `kind must be one of ${[...KINDS].join('/')}, got ${JSON.stringify(item.kind)}`);
      else if (library && !resolveType(library, item.kind, item.type)) {
        err(`${ipath}.type`, `"${item.kind}.${item.type}" is not in the library — call list_library to find a valid type key`);
      }
      if (!isPoint(item.at)) err(`${ipath}.at`, 'at must be an [x, y] pair');
      if (item.room != null && !roomIds.has(item.room)) {
        warn(`${ipath}.room`, `references room "${item.room}", which does not exist on floor "${floor.id}" — the item keeps its own position either way`);
      }
      /* A scheme that is neither shipped nor carried by this document leaves
       * the item drawing in the theme with nothing saying why — the same
       * failure a missing flooring key used to have. A warning rather than an
       * error: the plan still renders, and refusing to save the whole project
       * over one stale colour name would be worse than saying so. */
      if (item.scheme != null) {
        if (typeof item.scheme !== 'string') err(`${ipath}.scheme`, 'scheme must be the id of a colour scheme');
        else if (!schemeIds.has(item.scheme) && !SHIPPED_SCHEMES.has(item.scheme)) {
          warn(`${ipath}.scheme`, `names colour scheme "${item.scheme}", which is neither shipped nor in project.schemes — the item draws in the theme instead`);
        }
      }
    });
  });

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { validate };
