/**
 * The MCP (Model Context Protocol) server — lets an AI draw the plan instead
 * of a human dragging shapes, by exposing the same project document the
 * editor already reads and writes as a small set of tools.
 *
 * ## Transport
 *
 * "Streamable HTTP" (MCP spec 2025-06-18), stateless: every `tools/call` is
 * one JSON-RPC request/response over one POST, answered with a plain JSON
 * body — no server-initiated SSE stream, no session id, because there is no
 * per-connection state to track. The state that matters (the project) lives
 * on disk and is re-read on every call, the same way every HTTP handler in
 * `server.js` already does.
 *
 * ## Why this is not behind Ingress
 *
 * Ingress authenticates by a per-browser-session cookie Home Assistant's own
 * frontend mints after a login — there is no way for a generic MCP client
 * (Claude Code, Claude Desktop, a remote connector) to obtain one; they only
 * know how to send a URL plus static headers. So `/mcp` is served on the
 * app's own published port instead (see `config.yaml`'s `ports`), and
 * `server.js` carries it OUTSIDE the `allowIngressPeer()` gate that
 * everything else in this app requires. It has its own door instead:
 *
 * ## Auth
 *
 * No new secret is generated or stored. A caller presents `Authorization:
 * Bearer <token>` and the token is checked the way Home Assistant itself
 * would check it — by asking Home Assistant's own `GET /api/` whether it is
 * valid, over the same Supervisor/dev connection `ha.js` already has. Anyone
 * who already holds a real Home Assistant credential (a long-lived access
 * token from their profile, or a browser session token) is trusted, and
 * revoking it in Home Assistant revokes MCP access in the same instant —
 * there is nothing else to rotate or lose. In offline dev mode (no Home
 * Assistant configured at all) there is nothing to check against, so any
 * caller is allowed, the same way the entity picker falls back to typing ids.
 *
 * ## What it can change
 *
 * Two mutating tools reach everything: `edit_collection` for the five
 * id-addressed arrays that make up a plan (floors/rooms/items/openings/
 * boundaries), and `edit_settings` for every other field on the project
 * (dashboard, lighting, sun, coverage, chips, theme, name — anything
 * reachable by a dot path).
 *
 * `boundaries` joined that list once a boundary's `transmission` began feeding
 * both light models: an AI could otherwise place every door and lamp in a
 * house and still have no way to say "this balcony edge is glass" or "these
 * two halves of the car park are not divided by a wall", because
 * `edit_settings` refuses paths under `floors` by design.
 * Both run `validate-project.js` before saving and refuse to write on error.
 * `install_dashboard` is the one tool that reaches Home Assistant, and it is
 * only ADVERTISED (present in `tools/list`) when the app option
 * `mcp_allow_dashboard_install` is on — off by default, so an AI can build
 * and preview freely without ever being ABLE to touch a live dashboard until
 * a human opts in.
 */

'use strict';

const store = require('./store');
const ha = require('./ha');
const haWrite = require('./ha-write');
const dashboard = require('./dashboard');
const cardBuild = require('./card-build');
const planScene = require('./plan-scene');
const validator = require('./validate-project');

const fs = require('fs');
const path = require('path');

const PROTOCOL_VERSION = '2025-06-18';

/* The guide ships as a file (SKILL.md, two directories up from here) so a
 * client that CAN see the filesystem loads it the way it loads any other
 * skill, and `get_guide` serves the same bytes to one that cannot. One copy,
 * two ways in — a second inline copy would drift within a release.
 *
 * Read once and cached: it does not change while the app is running, and a
 * missing file must not take the server down, so it degrades to a pointer. */
let SKILL_CACHE = null;
function readSkill() {
  if (SKILL_CACHE !== null) return SKILL_CACHE;
  try {
    SKILL_CACHE = fs.readFileSync(path.join(__dirname, '..', '..', 'SKILL.md'), 'utf8');
  } catch (e) {
    SKILL_CACHE = 'The guide file (SKILL.md) is not readable in this install. '
      + 'Use get_contract for the project schema, list_library for placeable types '
      + 'and their props, and get_registry for themes/flooring/boundaries/controls.';
  }
  return SKILL_CACHE;
}
/* The skill body without its Claude-skill frontmatter. The frontmatter is how a
 * client that reads SKILL.md off disk identifies it; a client receiving the
 * bytes over MCP has already been told the name and description by the resource
 * or prompt listing, so repeating them as YAML is noise it has to parse past. */
function skillBody() {
  return readSkill().replace(/^---\n[\s\S]*?\n---\n+/, '');
}

/* Four ways into the same guide, because agentic coding clients differ in what
 * they will pull on their own:
 *
 *   `instructions` here   every spec-compliant client (Claude Code, Cursor,
 *                         Codex) puts this in the model's context at connect
 *                         time, with no tool call and no user action. It is
 *                         therefore an ORIENTATION, not the whole guide — it
 *                         has to earn its place in every request.
 *   resources/read        clients that let a human attach context (@-mention)
 *   prompts/get           clients that surface MCP prompts as slash commands
 *   get_guide             the tool, for a model that went looking
 *
 * All four serve the same bytes from SKILL.md. A second inline copy of the
 * guidance would drift within one release. */
const INSTRUCTIONS = `Floorplan Studio holds ONE project — the same one a human has open in the editor. Every write saves immediately and their canvas updates live; there is no draft copy and no apply step.

Before editing anything, call get_guide once. It is the working guide: the order to read things in, what each registry answers, and the mistakes that cost the most. get_contract is the project's schema and id conventions.

Four things are worth knowing before the first call, because getting them wrong produces a plan that looks right and is not:
- Everything is in FEET, from each floor's own origin.
- Walls are SCREEN-relative. n/e/s/w mean top/right/bottom/left of the drawing, not compass directions. The compass lives only in sun.screenUpBearing. Convert before writing coordinates.
- An item is kind + type: item.type is the bare name ("spot", not "fixture.spot"), and the two together look up "<kind>.<type>".
- Never invent a type key, a wall treatment, a flooring name or a prop. list_library and get_registry list what exists, and the editing tools refuse anything else rather than guessing.

Ask the human about their building when the answer is not in the project — which way the house faces, what a balcony is fronted in, whether a stair light climbs or simply comes on. These are visible facts about a place they can see, and a confident wrong one is worse than a question.`;

const SKILL_URI = 'floorplanstudio://guide';

const KINDS = ['fixture', 'device', 'furniture', 'logic'];

/* ------------------------------------------------------------------ auth */

const TOKEN_CACHE_MS = 60 * 1000;
const tokenCache = new Map();

/* `fetchImpl` exists only for tests — production always uses the global
 * `fetch`, exactly like `ha.js`'s own `get()`. */
async function checkToken(token, fetchImpl) {
  if (ha.mode() === 'offline') return true;
  if (!token) return false;
  const now = Date.now();
  const cached = tokenCache.get(token);
  if (cached && now - cached.at < TOKEN_CACHE_MS) return cached.ok;
  const f = fetchImpl || fetch;
  let ok = false;
  try {
    const res = await f(`${ha.baseUrl()}/`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
    ok = !!(res && res.ok);
  } catch (e) { ok = false; }
  tokenCache.set(token, { ok, at: now });
  return ok;
}

function bearerFrom(req) {
  const h = req.headers && req.headers.authorization;
  const m = /^Bearer\s+(.+)$/i.exec(h || '');
  return m ? m[1].trim() : null;
}

/* ------------------------------------------------------------------ ids */

/* Mirrors `app/public/js/store.js`'s client-side `uniqueId`/`newRoomId` — a
 * room drawn by hand and one added by `edit_collection` must not be able to
 * collide just because they took different code paths to the same id. */
function uniqueSlug(base, taken) {
  const slug = String(base || 'item').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'item';
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}_${n}`)) n++;
  return `${slug}_${n}`;
}

/* Mirrors `canvas.js`'s `placeArmed` — one letter of the kind, then the first
 * free number, so "add a fixture" from an AI and from the palette land on the
 * same id shape ("f3", not "fixture-3" or a uuid). */
function newItemId(items, kind) {
  const taken = new Set((items || []).map((i) => i.id));
  let n = 1;
  while (taken.has(`${kind[0]}${n}`)) n++;
  return `${kind[0]}${n}`;
}

/* Mirrors `canvas.js`'s `placeAperture`. */
function newOpeningId(openings) {
  const taken = new Set((openings || []).map((o) => o.id));
  let id = 'op1';
  for (let i = 1; taken.has('op' + i); i++) id = 'op' + (i + 1);
  return id;
}

function resolveType(library, kind, type) {
  if (!library || !library.types) return null;
  const direct = library.types[`${kind}.${type}`];
  if (direct) return direct;
  const aliased = library.aliases && library.aliases[type];
  return (aliased && library.types[aliased]) || null;
}

function findFloor(project, floorId) {
  const floor = (project.floors || []).find((f) => f.id === floorId);
  if (!floor) throw new ToolError(`no floor "${floorId}" — call get_project to see what exists`);
  return floor;
}

class ToolError extends Error {}

/* ------------------------------------------------------------ deep paths */

/* `edit_settings` addresses the project by a dot path and REPLACES whatever
 * is there. Not a merge: merging nested objects key-by-key is exactly the
 * kind of implicit behaviour this codebase avoids elsewhere (see "a section
 * filter merges as a unit, not key by key" in PROGRESS.md) — to change one
 * field of a nested object, read it with get_project and send the whole
 * object back with that one field changed. */
function deepSet(root, dotPath, value) {
  const parts = String(dotPath).split('.').filter(Boolean);
  if (!parts.length) throw new ToolError('path must not be empty');
  if (parts[0] === 'floors') throw new ToolError('use edit_collection for floors/rooms/items/openings, not edit_settings');
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (node[key] == null || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  }
  node[parts[parts.length - 1]] = value;
}

function deepGet(root, dotPath) {
  return String(dotPath).split('.').filter(Boolean).reduce((n, k) => (n == null ? undefined : n[k]), root);
}

/* ------------------------------------------------------------ validation */

function validateOrThrow(project, library) {
  const result = validator.validate(project, library);
  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new ToolError(`refused to save — the result would be invalid: ${detail}`);
  }
  return result;
}

async function saveProject(project, library) {
  const result = validateOrThrow(project, library);
  await store.writeProject(project);
  return result;
}

/* ------------------------------------------------------------------ tools */

const TOOLS = [];
function tool(def) { TOOLS.push(def); return def; }

tool({
  name: 'get_guide',
  description: 'The working guide for this server: which call answers which question, the domain concepts to understand before editing (feet, screen-relative walls, transmission, the sun\'s requirements), worked recipes, and the common mistakes. Read this alongside get_contract — the contract says what the data IS, this says how to work with it. Same text as the SKILL.md shipped with the app, so a client with no filesystem access is not at a disadvantage.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run() {
    return { text: readSkill() };
  },
});

tool({
  name: 'get_contract',
  description: 'Read this FIRST, with get_guide. Describes the project document this server edits: the shape of a floor/room/item/opening/boundary, id conventions, which tool reaches which part of the project, and what this server will and will not do to Home Assistant. get_contract is the reference; get_guide is how to work with it.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run() {
    return { text: CONTRACT_TEXT };
  },
});

tool({
  name: 'get_project',
  description: 'Read the current project. Pass floorId to get just one floor (much smaller) instead of the whole house.',
  inputSchema: { type: 'object', properties: { floorId: { type: 'string', description: 'Return only this floor plus the project\'s top-level fields.' } }, additionalProperties: false },
  async run(args) {
    const project = await store.readProject();
    if (args && args.floorId) {
      const floor = findFloor(project, args.floorId);
      const { floors, ...rest } = project;
      return Object.assign({}, rest, { floor });
    }
    return project;
  },
});

tool({
  name: 'get_registry',
  description: 'Read one of the shared registries a project draws from: themes, flooring, boundaries (wall treatments and opening types), or controls (room control-surface designs and shortcut vocabulary). Use list_library for placeable device/fixture/furniture/logic types instead.',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string', enum: ['themes', 'flooring', 'boundaries', 'controls'] } },
    required: ['name'],
    additionalProperties: false,
  },
  async run(args) {
    const readers = { themes: store.readThemes, flooring: store.readFlooring, boundaries: store.readBoundaries, controls: store.readControls };
    const reader = readers[args && args.name];
    if (!reader) throw new ToolError('name must be one of themes/flooring/boundaries/controls');
    return reader();
  },
});

tool({
  name: 'list_library',
  description: 'Browse or search what can be placed on the plan (fixtures, devices, furniture, logic markers) or the 47 named room presets. Always check here before place_item/add_room with an unfamiliar type key — item.type must resolve to an entry here or edit_collection refuses it.',
  inputSchema: {
    type: 'object',
    properties: {
      set: { type: 'string', enum: ['types', 'roomTypes'], description: 'Default "types".' },
      query: { type: 'string', description: 'Case-insensitive substring match on the key or label.' },
      kind: { type: 'string', enum: KINDS, description: 'Only for set=types.' },
      category: { type: 'string', description: 'Only for set=types, e.g. lighting, climate, media, sensing.' },
      domain: { type: 'string', description: 'Only for set=types — a Home Assistant domain this type binds to, e.g. light, fan, cover.' },
      limit: { type: 'number', description: 'Default 50.' },
    },
    additionalProperties: false,
  },
  async run(args) {
    const a = args || {};
    const library = await store.readLibrary();
    const limit = Math.max(1, Math.min(200, a.limit || 50));
    const q = a.query ? String(a.query).toLowerCase() : null;
    if (a.set === 'roomTypes') {
      const entries = Object.entries(library.roomTypes || {})
        .filter(([key, t]) => !q || key.toLowerCase().includes(q) || String(t.label || '').toLowerCase().includes(q))
        .slice(0, limit)
        .map(([key, t]) => ({ key, label: t.label, flooring: t.flooring, keys: t.keys }));
      return { count: entries.length, total: Object.keys(library.roomTypes || {}).length, roomTypes: entries };
    }
    const entries = Object.entries(library.types || {})
      .filter(([key, t]) => (!a.kind || t.kind === a.kind)
        && (!a.category || t.category === a.category)
        && (!a.domain || (t.domains || []).includes(a.domain))
        && (!q || key.toLowerCase().includes(q) || String(t.label || '').toLowerCase().includes(q)))
      .slice(0, limit)
      .map(([key, t]) => ({
        key, label: t.label, kind: t.kind, category: t.category, domains: t.domains || [],
        defaults: t.defaults || {},
        props: (t.props || []).map((p) => ({ key: p.key, label: p.label, type: p.type, min: p.min, max: p.max, options: p.options })),
      }));
    return { count: entries.length, total: Object.keys(library.types || {}).length, types: entries };
  },
});

tool({
  name: 'validate_project',
  description: 'Run the same structural check edit_collection/edit_settings run before saving, against whatever is currently on disk. Call this after a run of edits, or if a change was refused and you want the full error list.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run() {
    const [project, library] = await Promise.all([store.readProject(), store.readLibrary()]);
    return validator.validate(project, library);
  },
});

tool({
  name: 'edit_collection',
  description: 'Add, update, or remove one floor, room, item (fixture/device/furniture/logic marker), opening (door/window), or boundary (what a stretch of a room edge is MADE of — a wall, a glass railing, a stepdown, an open edge). This is how a plan gets built. Saved and validated immediately; the editor UI updates live if it is open.',
  inputSchema: {
    type: 'object',
    properties: {
      collection: { type: 'string', enum: ['floors', 'rooms', 'items', 'openings', 'boundaries'] },
      op: { type: 'string', enum: ['add', 'update', 'remove'] },
      floorId: { type: 'string', description: 'Required for rooms/items/openings/boundaries. Ignored for floors.' },
      id: { type: 'string', description: 'Required for update/remove. Optional for add (auto-generated using this editor\'s own id conventions if omitted).' },
      value: {
        type: 'object',
        description: 'add: the new object\'s fields (unset fields get the same defaults the editor itself would use). update: a shallow patch merged onto the existing object (item.props is merged one level deeper, so a partial props update does not erase other properties).',
      },
    },
    required: ['collection', 'op'],
    additionalProperties: false,
  },
  async run(args) {
    const a = args || {};
    if (!['floors', 'rooms', 'items', 'openings', 'boundaries'].includes(a.collection)) throw new ToolError('collection must be floors/rooms/items/openings/boundaries');
    if (!['add', 'update', 'remove'].includes(a.op)) throw new ToolError('op must be add/update/remove');
    const [project, library, boundaries] = await Promise.all([store.readProject(), store.readLibrary(), store.readBoundaries()]);

    if (a.collection === 'floors') return editFloors(project, library, a);
    if (!a.floorId) throw new ToolError(`floorId is required for collection "${a.collection}"`);
    const floor = findFloor(project, a.floorId);
    if (a.collection === 'rooms') return editRooms(project, library, floor, a);
    if (a.collection === 'items') return editItems(project, library, floor, a);
    if (a.collection === 'boundaries') return editBoundaries(project, library, boundaries, floor, a);
    return editOpenings(project, library, boundaries, floor, a);
  },
});

function editFloors(project, library, a) {
  project.floors = project.floors || [];
  if (a.op === 'add') {
    const v = a.value || {};
    const id = a.id || uniqueSlug(v.name || 'floor', new Set(project.floors.map((f) => f.id)));
    if (project.floors.some((f) => f.id === id)) throw new ToolError(`floor "${id}" already exists`);
    const floor = Object.assign({
      id, name: v.name || id, level_ft: v.level_ft || 0, icon: v.icon || 'mdi:floor-plan',
      extent: v.extent || { w: 40, h: 40 }, grid: v.grid || { size: 0.5, snap: true, reference: null },
      sun: null, popup: null, boundaries: [], rooms: [], openings: [], items: [],
      schemaVersion: (project.floors[0] && project.floors[0].schemaVersion) || 2,
    }, v, { id, rooms: [], openings: [], items: [] });
    project.floors.push(floor);
    return withSave(project, library, { added: id, floor });
  }
  const floor = findFloor(project, a.id);
  if (a.op === 'update') {
    Object.assign(floor, a.value || {}, { id: floor.id });
    return withSave(project, library, { updated: floor.id, floor });
  }
  project.floors = project.floors.filter((f) => f.id !== a.id);
  return withSave(project, library, { removed: a.id });
}

function editRooms(project, library, floor, a) {
  floor.rooms = floor.rooms || [];
  if (a.op === 'add') {
    const v = a.value || {};
    const id = a.id || uniqueSlug(v.name || `Room ${floor.rooms.length + 1}`, new Set(floor.rooms.map((r) => r.id)));
    if (floor.rooms.some((r) => r.id === id)) throw new ToolError(`room "${id}" already exists on floor "${floor.id}"`);
    const room = Object.assign({
      id, name: v.name || id, shape: v.shape || 'rect', rect: v.shape === 'poly' ? null : (v.rect || null),
      points: v.shape === 'poly' ? (v.points || null) : null,
      floor: 'default', outdoor: false, noLabel: false, chip_at: null, chip_rotate: 0, part_of: null,
    }, v, { id });
    floor.rooms.push(room);
    return withSave(project, library, { added: id, room });
  }
  const room = floor.rooms.find((r) => r.id === a.id);
  if (!room) throw new ToolError(`no room "${a.id}" on floor "${floor.id}"`);
  if (a.op === 'update') {
    Object.assign(room, a.value || {}, { id: room.id });
    return withSave(project, library, { updated: room.id, room });
  }
  /* Mirrors canvas.js's deleteSelected: openings and boundary overrides on the
   * room go with it; items keep their (now stale) room label rather than
   * being reassigned or deleted — "item room is data, not a lookup". */
  floor.rooms = floor.rooms.filter((r) => r.id !== a.id);
  const removedOpenings = (floor.openings || []).filter((o) => o.room === a.id).length;
  floor.openings = (floor.openings || []).filter((o) => o.room !== a.id);
  floor.boundaries = (floor.boundaries || []).filter((b) => b.room !== a.id);
  return withSave(project, library, { removed: a.id, cascadedOpenings: removedOpenings });
}

function editItems(project, library, floor, a) {
  floor.items = floor.items || [];
  if (a.op === 'add') {
    const v = a.value || {};
    if (!KINDS.includes(v.kind)) throw new ToolError(`value.kind must be one of ${KINDS.join('/')}`);
    if (!v.type) throw new ToolError('value.type is required (the bare name, e.g. "bulb" for fixture.bulb)');
    const typeDef = resolveType(library, v.kind, v.type);
    if (!typeDef) throw new ToolError(`"${v.kind}.${v.type}" is not in the library — call list_library to find a valid type key`);
    if (!Array.isArray(v.at) || v.at.length !== 2) throw new ToolError('value.at must be [x, y] in feet');
    const id = a.id || newItemId(floor.items, v.kind);
    if (floor.items.some((i) => i.id === id)) throw new ToolError(`item "${id}" already exists on floor "${floor.id}"`);
    const autoRoom = v.room !== undefined ? v.room : ((planScene.roomAt(floor, v.at[0], v.at[1]) || {}).id || null);
    const item = {
      id, kind: v.kind, type: v.type, at: v.at, room: autoRoom,
      entity: v.entity !== undefined ? v.entity : null, name: v.name || null,
      props: JSON.parse(JSON.stringify(Object.assign({}, typeDef.defaults || {}, v.props || {}))),
    };
    floor.items.push(item);
    return withSave(project, library, { added: id, item });
  }
  const item = floor.items.find((i) => i.id === a.id);
  if (!item) throw new ToolError(`no item "${a.id}" on floor "${floor.id}"`);
  if (a.op === 'update') {
    const v = a.value || {};
    const { props, ...rest } = v;
    Object.assign(item, rest, { id: item.id });
    if (props) item.props = Object.assign({}, item.props, props);
    return withSave(project, library, { updated: item.id, item });
  }
  floor.items = floor.items.filter((i) => i.id !== a.id);
  return withSave(project, library, { removed: a.id });
}

function editOpenings(project, library, boundaries, floor, a) {
  floor.openings = floor.openings || [];
  if (a.op === 'add') {
    const v = a.value || {};
    if (!v.room || !floor.rooms.some((r) => r.id === v.room)) throw new ToolError(`value.room must name an existing room on floor "${floor.id}"`);
    if (!['n', 'e', 's', 'w'].includes(v.wall)) throw new ToolError('value.wall must be one of n/e/s/w');
    const id = a.id || newOpeningId(floor.openings);
    if (floor.openings.some((o) => o.id === id)) throw new ToolError(`opening "${id}" already exists on floor "${floor.id}"`);
    const type = v.type || 'door';
    /* Mirrors canvas.js's placeAperture: the chosen type's own dimensions
     * from the boundaries registry, not one fixed width for every kind of
     * opening — a double door and a vent are not the same size. */
    const dp = ((boundaries && boundaries.openingTypes) || {})[type] || {};
    const defaults = dp.props || {};
    /* Extra fields the caller passed (a transmission override, a bound
     * covering entity, ...) ride along verbatim; only the fields the type
     * itself defaults are filled in when missing. */
    const opening = Object.assign({}, v, {
      id, type, room: v.room, wall: v.wall, at: v.at,
      w: v.w !== undefined ? v.w : (defaults.w || 2.5),
    });
    for (const k of ['h', 'sill', 'swing', 'hinge', 'leaves', 'slideTo', 'curtain']) {
      if (opening[k] === undefined && defaults[k] !== undefined) opening[k] = defaults[k];
    }
    floor.openings.push(opening);
    return withSave(project, library, { added: id, opening });
  }
  const opening = floor.openings.find((o) => o.id === a.id);
  if (!opening) throw new ToolError(`no opening "${a.id}" on floor "${floor.id}"`);
  if (a.op === 'update') {
    Object.assign(opening, a.value || {}, { id: opening.id });
    return withSave(project, library, { updated: opening.id, opening });
  }
  floor.openings = floor.openings.filter((o) => o.id !== a.id);
  return withSave(project, library, { removed: a.id });
}

/* Boundaries — what a room's edges are MADE of.
 *
 * A fifth collection rather than a corner of `edit_settings`, because a
 * boundary is an addressable thing on a floor exactly as an opening is, and
 * because `edit_settings` refuses any path under `floors` on purpose. Without
 * this an AI could place every door and lamp in a house and still had no way to
 * say "this balcony edge is a glass railing" or "these two halves of the car
 * park are not divided by a wall" — and since boundary `transmission` now feeds
 * both light models, that is not a cosmetic gap.
 *
 * Ids are auto-generated (`b1`, `b2`, …) the same way openings get `op1`, so a
 * run can be updated or removed later instead of only ever appended. */
function newBoundaryId(list) {
  let n = 1;
  const taken = new Set((list || []).map((b) => b.id).filter(Boolean));
  while (taken.has('b' + n)) n++;
  return 'b' + n;
}

function editBoundaries(project, library, boundaries, floor, a) {
  floor.boundaries = floor.boundaries || [];
  const known = (boundaries && boundaries.types) || {};
  if (a.op === 'add') {
    const v = a.value || {};
    if (!v.room || !floor.rooms.some((r) => r.id === v.room)) throw new ToolError(`value.room must name an existing room on floor "${floor.id}"`);
    if (!['n', 'e', 's', 'w'].includes(v.wall)) throw new ToolError('value.wall must be one of n/e/s/w');
    if (!v.type || !known[v.type]) {
      throw new ToolError(`value.type must be a boundary type — call get_registry({name:"boundaries"}) for the list (got ${JSON.stringify(v.type)})`);
    }
    const id = a.id || newBoundaryId(floor.boundaries);
    if (floor.boundaries.some((b) => b.id === id)) throw new ToolError(`boundary "${id}" already exists on floor "${floor.id}"`);
    /* `from`/`to` are optional: omitted means the whole edge, which is what a
     * caller usually wants and what the renderer already defaults to. */
    floor.boundaries.push(Object.assign({}, v, { id, room: v.room, wall: v.wall, type: v.type }));
    return withSave(project, library, { added: id, boundary: floor.boundaries[floor.boundaries.length - 1] });
  }
  const b = floor.boundaries.find((x) => x.id === a.id);
  if (!b) throw new ToolError(`no boundary "${a.id}" on floor "${floor.id}"`);
  if (a.op === 'update') {
    if (a.value && a.value.type && !known[a.value.type]) throw new ToolError(`unknown boundary type ${JSON.stringify(a.value.type)}`);
    Object.assign(b, a.value || {}, { id: b.id });
    return withSave(project, library, { updated: b.id, boundary: b });
  }
  floor.boundaries = floor.boundaries.filter((x) => x.id !== a.id);
  return withSave(project, library, { removed: a.id });
}

function withSave(project, library, summary) {
  return saveProject(project, library).then((validation) => Object.assign({ ok: true, warnings: validation.warnings }, summary));
}

tool({
  name: 'edit_settings',
  description: 'Set any other field on the project by a dot path — dashboard config, lighting, sun/daylight, project name, a room\'s controls/keys/shortcuts, a floor\'s own overrides, etc. REPLACES whatever is at that path (not a merge); read the current value with get_project first if you only want to change one field of a larger object. Use edit_collection instead for floors/rooms/items/openings.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Dot path from the project root, e.g. "dashboard.house.title" or "lighting.targetFc".' },
      value: { description: 'Any JSON value.' },
    },
    required: ['path', 'value'],
    additionalProperties: false,
  },
  async run(args) {
    const a = args || {};
    const [project, library] = await Promise.all([store.readProject(), store.readLibrary()]);
    deepSet(project, a.path, a.value);
    await saveProject(project, library);
    return { ok: true, path: a.path, value: deepGet(project, a.path) };
  },
});

/* ------------------------------------------------------ Home Assistant */

async function dashboardDocs(project) {
  const [library, themes, boundaries, flooring, controls] = await Promise.all([
    store.readLibrary(), store.readThemes(), store.readBoundaries(), store.readFlooring(), store.readControls(),
  ]);
  return { project, library, themes, boundaries, flooring, controls };
}

tool({
  name: 'preview_dashboard',
  description: 'See what generating the dashboard would produce RIGHT NOW, without writing anything to Home Assistant: view titles, card size, and which bound entities are missing. Safe to call as often as you like.',
  inputSchema: { type: 'object', properties: { urlPath: { type: 'string' }, title: { type: 'string' } }, additionalProperties: true },
  async run(args) {
    const a = args || {};
    const project = await store.readProject();
    const docs = await dashboardDocs(project);
    const config = dashboard.build(docs.project, a);
    const card = cardBuild.build(docs, { version: store.VERSION });
    const wanted = dashboard.boundEntities(docs.project);
    let missing = [];
    if (ha.isConfigured()) {
      try {
        const live = await ha.stateMap(60000);
        missing = wanted.filter((e) => !live[e]);
      } catch (e) { /* best-effort, same as the HTTP preview route */ }
    }
    return {
      views: config.views.map((v) => ({ title: v.title, path: v.path, cards: v.cards[0].cards.length })),
      cardBytes: card.bytes,
      entities: { wanted: wanted.length, missing },
      mode: ha.mode(),
    };
  },
});

/* Advertised only when the app option is on — see `mcp.js`'s module
 * header and `handleRequest`'s `tools/list` filtering. */
tool({
  name: 'install_dashboard',
  gated: true,
  description: 'Generate and WRITE the dashboard to Home Assistant, at the path given (or the project\'s remembered one). This is the one tool that changes anything outside this app\'s own project file — same guarantees as the editor\'s "Generate dashboard" button: refuses the default dashboard, refuses to overwrite a dashboard this tool did not stamp, and backs up whatever was there first.',
  inputSchema: {
    type: 'object',
    properties: {
      urlPath: { type: 'string' }, title: { type: 'string' },
      includeHouse: { type: 'boolean' }, includeFloor: { type: 'boolean' }, embedProject: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  async run(args) {
    if (!ha.isConfigured()) throw new ToolError('Home Assistant is not reachable from the app.');
    const a = args || {};
    const project = await store.readProject();
    const urlPath = dashboard.slug(a.urlPath || (project.dashboard && project.dashboard.urlPath) || a.title || project.name || 'home-plan');
    const docs = await dashboardDocs(project);
    const card = cardBuild.build(docs, { version: store.VERSION, resourceKey: urlPath });
    const config = dashboard.build(docs.project, Object.assign({}, a, { urlPath, cardTypes: card.elementTypes }));

    let session;
    try {
      session = await haWrite.connect();
      const dash = await haWrite.ensureDashboard(session, { urlPath, title: config.title, icon: a.icon || 'mdi:floor-plan' });
      const before = await haWrite.readConfig(session, urlPath);
      haWrite.assertOwnedConfig(urlPath, before, { allowMissing: dash.action === 'created' });
      if (before) await store.backupDashboard(urlPath, before);
      config[haWrite.STAMP_KEY] = haWrite.stamp(project, { version: store.VERSION, urlPath, embedProject: a.embedProject !== false });
      const resource = await haWrite.installResource(session, card.content, urlPath);
      await haWrite.saveConfig(session, urlPath, config, urlPath, { previous: before, allowMissing: dash.action === 'created' });
      return { ok: true, urlPath, title: config.title, views: config.views.length, resource: resource.action, dashboard: dash.action, backedUp: !!before };
    } finally {
      if (session) session.close();
    }
  },
});

const CONTRACT_TEXT = `Floorplan Studio project — MCP contract

You are editing the SAME project the human's editor has open. Every write
here is saved to disk immediately and the editor's canvas updates live if it
is open (no reload needed on the human's side).

TOP-LEVEL PROJECT FIELDS you'll see from get_project: schemaVersion, id,
name, units, ppf (pixels-per-foot, cosmetic), origin, activeTheme, compass
(screen-direction -> bearing, plus compass.show to force the on-plan compass
either way), sun (house daylight config), popup (default room-popup design),
dashboard (title/urlPath/theme/house+floor card config, read/written by
preview_dashboard/install_dashboard and by edit_settings), lighting
(artificial-light model constants), chips (room count-badge rules: show,
counts, hideWhenAtMost, hideRooms, style), coverage ({enabled} — whether a
device draws the wedge of what it REACHES; the markers stay either way),
shortcuts (house-wide custom actions), floors (see below).

LIGHT comes from two places and both are modelled. Lamps: watt x count x
efficacy -> lumens -> foot-candles over the room's floor area, against
lighting.targetFc. Daylight: solar position -> sky strength -> per-room
exposure, against sun.ambient.referenceExposure. A floor also THROWS LIGHT
BACK — every flooring type carries a real 'reflectance' (white marble ~0.65,
mid oak 0.25, black granite 0.05) and lighting.bounce decides how much credit
it gets, so two identical lamps over Statuario and over black granite are not
the same amount of usable light. Set lighting.bounce to 0 to switch floor
bounce off entirely.

SUN is optional, and turning it on has requirements: validate_project ERRORS
unless sun.location has a lat/lon AND the plan has an orientation (either
sun.screenUpBearing, the compass bearing pointing up the screen, or a full
project.compass). Both failures are silent on screen, which is why they are
errors: a model with no location has no solar position, and one with no
orientation draws beams through the wrong walls. sun.ambient.referenceExposure
(default 0.16) is the glazed-to-floor ratio that counts as FULLY daylit —
raise it if rooms look too bright by day, lower it if too dark.

A FLOOR has: id, name, level_ft, icon, extent {w,h} (feet), grid, an
optional per-floor "sun"/"lighting"/"coverage"/"dashboard"/"popup" override,
and FOUR arrays: rooms, openings, items, boundaries.

A ROOM: { id, name, shape: "rect"|"poly", rect: [x,y,w,h] (if rect),
points: [[x,y],...] (if poly, >= 3 points), flooring (a key from the flooring
registry — 65 finishes across Basic/Wood/Stone/India/Outdoor), flooringOptions
(per-room overrides of that generator's own options, e.g. {color:"#e9e0ce"} to
make marble cream rather than grey, or {reflectance:0.6} to say this tile was
laid in gloss rather than matte),
master (an entity id this room's "all on/off" targets), ganged, outdoor (no
roof: lit from above, not through its walls), noLabel, showCount, part_of
(this rect is a piece of another room — no seam is drawn between them and
their light pools together), chip_at / chip_rotate (where the room's badge
sits), daylight ({referenceExposure} to override the house's), boost (AC
turbo/eco switches), dnd (an input_boolean shown as a header toggle),
controls (this room's control-surface design/sections/filters — read
app/defaults/controls.json via get_registry for the vocabulary), keys
(scene/automation name-match keywords for this room), shortcuts (this room's
own custom actions). All coordinates are in FEET from the floor's origin,
same frame the canvas draws.

A BOUNDARY (what a stretch of a room's EDGE is made of):
{ id, room, wall: n/e/s/w, type: a key from the boundaries registry,
optional from/to (feet along that edge; omit for the whole edge) }. This is
how a balcony edge becomes a glass railing, a courtyard edge a stepdown, or
two halves of one car park stop being divided by a wall that is not there.
Balcony barriers are a group of their own ("Railings"): frameless and framed
glass, vertical metal rods, stainless cable, wrought-iron/MS grill, timber,
a stone or concrete balustrade, and a parapet with glass above. They differ in
what they pass as well as in what they draw, so pick the one that is actually
there — ASK if you do not know, because a balcony is a thing someone can see
out of a window and a wrong railing is a visibly wrong plan.
A type's 'transmission' feeds BOTH light models — daylight in, and a lamp's
spill out — and a 'tint' colours what crosses it, so this is not cosmetic.
Edges with no boundary entry default to an exterior or partition wall.

An ITEM (a fixture/device/furniture/logic marker): { id, kind: one of
fixture/device/furniture/logic, type: the BARE name (e.g. "bulb", not
"fixture.bulb" — kind + type together look up "<kind>.<type>" in the
library), at: [x,y] in feet, room: the room id it's tagged with (this is
just a label, not computed from position — an item CAN sit outside its own
room's polygon on purpose, e.g. a solar array overhanging a roof edge),
entity: the bound Home Assistant entity id or null, name: an optional label
override, props: the type's own configurable properties (call list_library
to see a type's defaults and prop schema before placing one).

Three props are UNIVERSAL rather than per-type: 'rot' (facing, in SCREEN
degrees — 0 is up, clockwise, same frame as walls and the sun), 'holdEntity'
(what a long press opens; left unset a camera guesses its own detection
sensor, and failing that hold opens the marker's own entity), and 'hitRect'
([x,y,w,h] in feet) which gives a marker standing for something much larger
than its disc — a solar array, a water tank — a real tap area. Overlapping
tap shapes are ordered largest-first, so a small marker on a big one still
wins the tap.

STAIRS AND LIFTS are furniture types, but they are architecture: place
furniture.stairs or furniture.lift and size it to the flight or the shaft,
not to a piece of kit. A stair takes 'variant' (straight, l_shaped,
u_switchback, winder, spiral), 'steps', 'dir' (up/down, which way the arrow
points), 'axis' (ns/ew, which way the treads run on a straight flight) and,
for a spiral, 'newel' and 'sweep'. It also takes step lighting: 'lighting'
is none/edge/side/both — edge lights the nosing, side puts a pip at each end
of the tread — and 'lightEvery' is the cadence it is installed on (1 = every
step, 2 = every second, 4 = every fourth). 'sequence' says what happens when
the light comes on: 'together' (the default, and what most step lighting does)
or 'progressive', which climbs the flight one step at a time the way a
motion-triggered stair light does. Either way a stair is BINDABLE: give it an
'entity' and the lit parts take that lamp's colour when it is on. Lifts take 'variant' too: traction, vacuum (the circular
pneumatic shaft), platform, dumbwaiter.

Bindable furniture is the general case here — check list_library for
render.bindable on a type before assuming furniture is inert scenery. A
bindable type receives on/off state and the lamp colour the same way a
fixture marker does.

An OPENING (door/window on a wall): { id, type, room: the room it's on,
wall: one of n/e/s/w (screen-relative, not compass — check project.compass),
at: position along that wall in feet, w/h: size in feet, plus type-specific
fields (swing/hinge/leaves for doors, sill/curtain for windows) — call
get_registry({name:"boundaries"}) for every opening type and its defaults.

ID CONVENTIONS (edit_collection fills these in for you if you omit "id" on
add): floors and rooms get a slug from their name ("Formal Living" ->
"formal_living", numbered on collision); items get a kind-letter plus a
number ("f1" for the first fixture, "d1" for the first device); openings get
"op1", "op2", ...

ID CONVENTIONS also cover boundaries: they get "b1", "b2", … like openings
get "op1".

WHICH TOOL FOR WHAT:
  - edit_collection  floors / rooms / items / openings / boundaries
                      (add, update, remove)
  - edit_settings     everything else, by dot path (dashboard.*, lighting.*,
                      sun.*, chips.*, coverage.*, compass.*). It REFUSES any
                      path starting "floors" on purpose — everything under a
                      floor is a collection member, so patch it with
                      edit_collection's "update" instead, including a room's
                      own controls/keys/shortcuts/daylight.
  - validate_project  run the structural check on demand
  - list_library      valid item type keys and the 47 room presets
  - get_registry      themes / flooring / boundaries / controls documents
  - preview_dashboard what Generate would produce, no Home Assistant write
  - install_dashboard the one tool that writes to Home Assistant — only
                      present in this list if a human has turned it on

SAFETY: nothing here can call a Home Assistant SERVICE (turn on a light,
run a script) — this server only ever reads/writes its own project file and,
if enabled, one Lovelace dashboard it stamps as its own.`;

/* ------------------------------------------------------------------ JSON-RPC */

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } }; }

async function dispatch(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'invalid JSON-RPC request');
  const isNotification = msg.id === undefined;

  if (msg.method === 'initialize') {
    return rpcResult(msg.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {}, resources: {}, prompts: {} },
      serverInfo: { name: 'floorplan-studio', version: store.VERSION },
      instructions: INSTRUCTIONS,
    });
  }
  if (msg.method === 'notifications/initialized' || msg.method === 'notifications/cancelled') return null;
  if (msg.method === 'ping') return rpcResult(msg.id, {});

  if (msg.method === 'tools/list') {
    const visible = TOOLS.filter((t) => !t.gated || ctx.allowInstall);
    return rpcResult(msg.id, { tools: visible.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  }

  /* Resources and prompts both carry exactly one thing: the guide. They exist
   * so a human can pull it in whatever way their client offers — an @-mention
   * of a resource, a slash command backed by a prompt — instead of hoping the
   * model thinks to call a tool. */
  if (msg.method === 'resources/list') {
    return rpcResult(msg.id, {
      resources: [{
        uri: SKILL_URI,
        name: 'floorplan-studio-guide',
        title: 'Floorplan Studio — working guide',
        description: 'How to build and edit a floor plan with this server: what to read first, which call answers which question, and the mistakes that cost the most.',
        mimeType: 'text/markdown',
      }],
    });
  }
  if (msg.method === 'resources/templates/list') return rpcResult(msg.id, { resourceTemplates: [] });
  if (msg.method === 'resources/read') {
    const uri = (msg.params || {}).uri;
    if (uri !== SKILL_URI) return rpcError(msg.id, -32602, `no such resource "${uri}"`);
    return rpcResult(msg.id, { contents: [{ uri: SKILL_URI, mimeType: 'text/markdown', text: skillBody() }] });
  }
  if (msg.method === 'prompts/list') {
    return rpcResult(msg.id, {
      prompts: [{
        name: 'floorplan_studio_guide',
        title: 'Floorplan Studio — working guide',
        description: 'Load the working guide before building or editing a floor plan.',
        arguments: [],
      }],
    });
  }
  if (msg.method === 'prompts/get') {
    if ((msg.params || {}).name !== 'floorplan_studio_guide') return rpcError(msg.id, -32602, `no such prompt "${(msg.params || {}).name}"`);
    return rpcResult(msg.id, {
      description: 'The Floorplan Studio working guide.',
      messages: [{ role: 'user', content: { type: 'text', text: skillBody() } }],
    });
  }

  if (msg.method === 'tools/call') {
    if (isNotification) return null;
    const params = msg.params || {};
    const def = TOOLS.find((t) => t.name === params.name);
    if (!def) return rpcResult(msg.id, { content: [{ type: 'text', text: `no such tool "${params.name}"` }], isError: true });
    if (def.gated && !ctx.allowInstall) {
      return rpcResult(msg.id, { content: [{ type: 'text', text: 'install_dashboard is disabled — turn on the "mcp_allow_dashboard_install" app option to enable it.' }], isError: true });
    }
    try {
      const result = await def.run(params.arguments || {});
      const text = typeof result === 'object' && result && 'text' in result && Object.keys(result).length === 1
        ? result.text : JSON.stringify(result);
      return rpcResult(msg.id, { content: [{ type: 'text', text }], isError: false });
    } catch (e) {
      return rpcResult(msg.id, { content: [{ type: 'text', text: e.message }], isError: true });
    }
  }

  if (isNotification) return null;
  return rpcError(msg.id, -32601, `unknown method "${msg.method}"`);
}

/* ------------------------------------------------------------------- HTTP */

function readBody(req, limitBytes = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
  res.end(text);
}

/* `opts.fetchImpl`/`opts.allowInstall` exist for tests; production callers
 * (server.js) pass neither and get the real fetch plus the real option. */
async function handleRequest(req, res, opts) {
  const o = opts || {};
  if (req.method === 'GET' || req.method === 'DELETE') {
    res.writeHead(405, { Allow: 'POST' });
    return res.end();
  }
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }

  const token = bearerFrom(req);
  const authed = await checkToken(token, o.fetchImpl);
  if (!authed) {
    res.writeHead(401, { 'WWW-Authenticate': 'Bearer', 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'a valid Home Assistant Authorization: Bearer token is required' }));
  }

  let msg;
  try { msg = JSON.parse((await readBody(req)) || '{}'); } catch (e) {
    return sendJson(res, 200, rpcError(null, -32700, 'invalid JSON'));
  }
  if (Array.isArray(msg)) return sendJson(res, 200, rpcError(null, -32600, 'batched requests are not supported'));

  const reply = await dispatch(msg, { allowInstall: o.allowInstall === true });
  if (reply === null) { res.writeHead(202); return res.end(); }
  return sendJson(res, 200, reply);
}

module.exports = { handleRequest, checkToken, dispatch, TOOLS };
