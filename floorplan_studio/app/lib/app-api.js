/**
 * app-api.js — the headless surface: `/app-api/v1` REST and its WebSocket.
 *
 * For a client that is NOT a browser inside Ingress — a native app, mostly.
 * Ingress authenticates by a per-browser-session cookie only Home Assistant's
 * own frontend can mint, so a phone has no way to complete that handshake; it
 * presents a Home Assistant token instead, exactly as `/mcp` does, through the
 * one shared door in `external-auth.js`.
 *
 * Served on the same listeners as `/mcp` and gated by its OWN add-on option,
 * `headless_endpoints_enabled`, default off. Deliberately not tied to
 * `mcp_enabled`: an AI client and a phone are different callers that happen to
 * share a port, and turning one off must never silently turn the other off.
 *
 * ## What this is not
 *
 * Not a Home Assistant proxy. The client holds its own authenticated Home
 * Assistant connection for live state and for calling services, as itself. This
 * API answers one question — what does the plan look like — and never lends the
 * add-on's supervisor credential to a caller. That is what keeps the safety
 * claim in DOCS.md true for a phone as well as for the editor: nothing here can
 * turn a light on, and nothing here can show a caller an entity Home Assistant
 * would not show them.
 *
 * ## Houses
 *
 * The contract addresses a HOUSE (`/houses/{houseId}/...`) because a client may
 * talk to more than one Floorplan Studio and must be able to cache them apart.
 * Storage is still one project, so exactly one house is exposed and its id is
 * stable; the route shape is the contract's from day one so that adding real
 * multi-house storage later is a storage change rather than a protocol break.
 * The cache key a client should use is `(providerInstanceId, houseId)` — the
 * instance id is served by `/session` and is derived, not secret.
 *
 * ## Revisions and caching
 *
 * Everything cacheable carries a `revision` and an `etag`, and honours
 * `If-None-Match` with a 304. The revision changes when the CONFIGURATION
 * changes — project, registries, theme — never when a light turns on, because
 * live state does not come from here at all.
 */

'use strict';

const crypto = require('crypto');
const store = require('./store');
const ha = require('./ha');
const auth = require('./external-auth');
const validateProject = require('./validate-project');
const cardBuild = require('./card-build');
const Controls = require('./controls');

const API_VERSION = 'v1';
const PREFIX = '/app-api/v1';

/* Smaller than the import endpoint's ceiling on purpose: nothing this API
 * accepts is a file, and a body larger than this is a mistake or an attack. */
const MAX_BODY_BYTES = 512 * 1024;

/* ------------------------------------------------------------- identity --
 *
 * A stable, non-secret id for THIS installation, so a client talking to two
 * Floorplan Studios can tell their caches apart. Derived from the data
 * directory rather than random, so it survives a restart, and hashed so it
 * carries no path information off the machine. */
let instanceId = null;
function providerInstanceId() {
  if (!instanceId) {
    instanceId = crypto.createHash('sha256').update('floorplan-studio:' + store.dataDir()).digest('hex').slice(0, 24);
  }
  return instanceId;
}

/* The single house this storage holds. One project today; the id is stable so
 * a client's cache key does not move when multi-house storage arrives. */
const HOUSE_ID = 'default';

function etagOf(value) {
  return '"' + crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32) + '"';
}

/* A configuration revision: it moves when the plan or a registry changes, and
 * not when an entity does. `savedAt` is what `store.writeProject` stamps on
 * every write, so it is exactly the "something changed" signal we want. */
function revisionOf(docs) {
  return etagOf({
    p: docs.project && docs.project.savedAt,
    n: docs.project && docs.project.name,
    f: (docs.project && docs.project.floors || []).length,
    l: docs.library && docs.library.schemaVersion,
    c: docs.controls && docs.controls.schemaVersion,
  }).replace(/"/g, '');
}

/* ------------------------------------------------------------ responses -- */

function send(res, status, body, extra) {
  const text = JSON.stringify(body);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  }, extra || {}));
  res.end(text);
}

/* Every response carries the versions and the request id, so a client bug
 * report says which server answered it. Errors carry a stable machine `code`
 * beside human text — the text is for a person and may change, the code is
 * what a client may branch on. */
function envelope(requestId, extra) {
  return Object.assign({
    apiVersion: API_VERSION,
    serverVersion: store.VERSION,
    requestId,
  }, extra);
}

function fail(res, requestId, status, code, message) {
  send(res, status, envelope(requestId, { error: { code, message } }));
}

function ok(res, requestId, body, etag) {
  const extra = etag ? { ETag: etag, 'Cache-Control': 'no-cache' } : undefined;
  send(res, 200, envelope(requestId, body), extra);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('body is not valid JSON')); }
    });
    req.on('error', reject);
  });
}

/* --------------------------------------------------------------- reading -- */

async function allDocs() {
  const [project, library, themes, flooring, boundaries, controls] = await Promise.all([
    store.readProject(), store.readLibrary(), store.readThemes(),
    store.readFlooring(), store.readBoundaries(), store.readControls(),
  ]);
  return { project, library, themes, flooring, boundaries, controls };
}

/* The registries a renderer needs, trimmed the same way the generated card
 * trims them — one definition of "what a renderer needs", so a native client
 * and the dashboard card cannot disagree about it. */
function rendererRegistries(docs) {
  return {
    library: cardBuild.trimLibrary(docs.library),
    themes: cardBuild.trimThemes(docs.themes),
    flooring: cardBuild.trimFlooring(docs.flooring),
    boundaries: docs.boundaries,
    controls: cardBuild.trimControls(docs.controls),
  };
}

function floorSummary(f) {
  return {
    id: f.id,
    name: f.name || f.id,
    level_ft: f.level_ft ?? 0,
    icon: f.icon || null,
    rooms: (f.rooms || []).length,
    items: (f.items || []).length,
  };
}

function houseSummary(docs, revision) {
  const p = docs.project || {};
  const floors = p.floors || [];
  return {
    id: HOUSE_ID,
    name: p.name || 'Floorplan Studio',
    dashboardUrlPath: (p.dashboard && p.dashboard.urlPath) || null,
    defaultFloorId: (floors[0] || {}).id || null,
    floorCount: floors.length,
    revision,
    etag: etagOf({ h: HOUSE_ID, revision }),
    updatedAt: p.savedAt || null,
    available: true,
  };
}

/* Every entity the client will need a live state for, to drive its own Home
 * Assistant subscriptions. The union of what the floor's markers bind and what
 * its resolved room controls reference — computed here because the merge
 * semantics live here, not in the client. */
function entityIdsFor(floor, docs) {
  const out = new Set();
  for (const it of floor.items || []) {
    if (it.entity) out.add(it.entity);
    if (it.props && it.props.holdEntity) out.add(it.props.holdEntity);
    for (const ch of (it.props && it.props.channels) || []) if (ch && ch.entity) out.add(ch.entity);
  }
  for (const op of floor.openings || []) {
    if (op.sensor) out.add(op.sensor);
    if (op.covering && op.covering.entity) out.add(op.covering.entity);
  }
  for (const r of floor.rooms || []) if (r.master) out.add(r.master);
  return [...out].sort();
}

/* The resolved control surface for every room on the floor, so that tapping a
 * room name opens immediately rather than costing a round trip. `Controls`
 * does the house -> floor -> room merge, which is the same code the generated
 * card resolves through. */
function roomPresentation(floor, docs, project) {
  const rooms = {};
  for (const room of floor.rooms || []) {
    let resolved = null;
    try {
      resolved = Controls.resolve(docs.controls, project, floor, room);
    } catch (e) { resolved = null; }
    if (!resolved) continue;
    rooms[room.id] = {
      id: room.id,
      label: room.name || room.id,
      masterEntityId: room.master || null,
      designName: resolved.designName || null,
      design: resolved.designSpec || null,
      sections: resolved.sections || [],
      shortcuts: resolved.shortcuts || [],
    };
  }
  return rooms;
}

function floorBundle(docs, floor, revision) {
  const project = docs.project;
  return {
    houseId: HOUSE_ID,
    floorId: floor.id,
    revision,
    presentationRevision: revision,
    floor: {
      id: floor.id,
      name: floor.name || floor.id,
      level_ft: floor.level_ft ?? 0,
      extent: floor.extent || null,
      grid: floor.grid || null,
    },
    scene: {
      schemaVersion: 1,
      rooms: floor.rooms || [],
      openings: floor.openings || [],
      boundaries: floor.boundaries || [],
      items: floor.items || [],
    },
    presentation: {
      rooms: roomPresentation(floor, docs, project),
      entityIds: entityIdsFor(floor, docs),
    },
  };
}

/* ---------------------------------------------------------------- routes -- */

async function handleRest(req, res, pathname, query, requestId, opts) {
  const rest = pathname.slice(PREFIX.length) || '/';
  const method = req.method.toUpperCase();
  const addr = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');

  if (auth.tooManyFailures(addr)) {
    return fail(res, requestId, 429, 'too_many_attempts', 'Too many failed authentication attempts. Wait a minute and try again.');
  }

  /* Reads need a valid token; writes need an admin. Resolved per route rather
   * than once, because asking WHO costs a WebSocket handshake and a read does
   * not need the answer. */
  const needsAdmin = method !== 'GET';
  const who = await auth.authorize(req, Object.assign({ requireAdmin: needsAdmin }, opts.authOpts || {}));
  if (!who.ok) {
    if (who.status === 401) auth.noteFailure(addr);
    return fail(res, requestId, who.status, who.code, who.message);
  }

  if (method !== 'GET' && method !== 'POST') {
    return fail(res, requestId, 405, 'method_not_allowed', 'This endpoint accepts GET and POST.');
  }

  const docs = await allDocs();
  const revision = revisionOf(docs);

  /* ---- session ----
   *
   * The one GET that resolves WHO as well as whether: a client calls this to
   * decide whether to offer edit mode at all, so answering "valid token, no
   * idea who" would make it the only endpoint that cannot do its job. Every
   * other read skips the WebSocket handshake because it genuinely does not
   * need the answer. */
  if (rest === '/session' && method === 'GET') {
    const user = who.user || await auth.principal(who.token, opts.authOpts || {});
    return ok(res, requestId, {
      principal: user || null,
      role: user ? (user.is_admin ? 'admin' : 'user') : 'unknown',
      providerInstanceId: providerInstanceId(),
      schemaVersion: docs.project.schemaVersion || 1,
      tls: !!opts.tls,
      haMode: ha.mode(),
      capabilities: {
        read: true,
        subscriptions: true,
        validation: true,
        /* Honest about what is not built yet, so a client hides the UI rather
         * than discovering a 404 at the worst moment. */
        transactions: false,
        registryEditing: false,
        dashboardInstall: false,
        preview: false,
      },
    });
  }

  /* ---- house catalogue ---- */
  if (rest === '/houses' && method === 'GET') {
    return ok(res, requestId, { houses: [houseSummary(docs, revision)] });
  }

  const houseMatch = /^\/houses\/([^/]+)(\/.*)?$/.exec(rest);
  if (houseMatch) {
    const houseId = decodeURIComponent(houseMatch[1]);
    const sub = houseMatch[2] || '';
    if (houseId !== HOUSE_ID) {
      return fail(res, requestId, 404, 'unknown_house', 'No house with that id is served by this installation.');
    }

    const floors = docs.project.floors || [];
    const etag = etagOf({ revision, sub, q: query ? query.toString() : '' });
    if ((req.headers['if-none-match'] || '') === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
      return res.end();
    }

    if (sub === '/bootstrap' && method === 'GET') {
      const wanted = query && query.get('floor');
      const floor = floors.find((f) => f.id === wanted) || floors[0];
      if (!floor) return fail(res, requestId, 404, 'no_floors', 'This house has no floors yet.');
      return ok(res, requestId, {
        house: houseSummary(docs, revision),
        floors: floors.map(floorSummary),
        registries: rendererRegistries(docs),
        activeTheme: docs.project.activeTheme || docs.themes.active || null,
        settings: {
          sun: docs.project.sun || null,
          lighting: docs.project.lighting || null,
          coverage: docs.project.coverage || null,
          chips: docs.project.chips || null,
          doors: docs.project.doors || null,
          compass: docs.project.compass || null,
        },
        bundle: floorBundle(docs, floor, revision),
      }, etag);
    }

    const floorMatch = /^\/floors\/([^/]+)$/.exec(sub);
    if (floorMatch && method === 'GET') {
      const floor = floors.find((f) => f.id === decodeURIComponent(floorMatch[1]));
      if (!floor) return fail(res, requestId, 404, 'unknown_floor', 'No floor with that id is in this house.');
      return ok(res, requestId, floorBundle(docs, floor, revision), etag);
    }

    if (sub === '/project' && method === 'GET') {
      return ok(res, requestId, { houseId, revision, project: docs.project }, etag);
    }

    if (sub === '/registries' && method === 'GET') {
      return ok(res, requestId, { houseId, revision, registries: rendererRegistries(docs) }, etag);
    }

    const regMatch = /^\/registries\/([^/]+)$/.exec(sub);
    if (regMatch && method === 'GET') {
      const name = decodeURIComponent(regMatch[1]);
      const all = rendererRegistries(docs);
      if (!Object.prototype.hasOwnProperty.call(all, name)) {
        return fail(res, requestId, 404, 'unknown_registry', 'No registry by that name. Try library, themes, flooring, boundaries or controls.');
      }
      return ok(res, requestId, { houseId, revision, name, registry: all[name] }, etag);
    }

    /* Validation is a read of someone else's draft: it changes nothing, but it
     * is a POST because the draft travels in the body, and it is admin-only
     * because a draft is edit-shaped work. */
    if (sub === '/validate' && method === 'POST') {
      let body;
      try { body = await readBody(req); }
      catch (e) {
        const big = /too large/.test(e.message);
        return fail(res, requestId, big ? 413 : 400, big ? 'payload_too_large' : 'bad_request', e.message);
      }
      const draft = body && body.project ? body.project : docs.project;
      const result = validateProject.validate(draft, docs.library);
      return ok(res, requestId, {
        houseId, revision, valid: result.ok,
        errors: result.errors.slice(0, 100),
        warnings: result.warnings.slice(0, 100),
      });
    }
  }

  return fail(res, requestId, 404, 'unknown_route', 'No such endpoint: ' + pathname);
}

/* ------------------------------------------------------------ websocket --
 *
 * Written out by hand because this app has no dependencies and Node ships a
 * WebSocket CLIENT but no server. That is about 80 lines of RFC 6455: the
 * handshake key, and a frame codec for text/close/ping/pong. Only what this
 * protocol uses is implemented — no extensions, no compression, no
 * fragmentation on send — and anything else is closed rather than guessed at.
 *
 * The protocol deliberately mirrors Home Assistant's own, because every client
 * that will connect here already speaks it: `auth_required`, `auth`, `auth_ok`.
 * A token never appears in the URL, where it would land in logs and proxies. */

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/* A client that connects already has its token — it is sent on the first
 * message — so this is a generous allowance, not a budget anyone spends.
 * Short enough that an unauthenticated socket cannot sit and hold a file
 * descriptor. */
const AUTH_DEADLINE_MS = 5 * 1000;

function acceptKey(key) {
  return crypto.createHash('sha1').update(String(key || '') + WS_GUID).digest('base64');
}

function frame(payload, opcode) {
  const data = Buffer.from(payload || '', 'utf8');
  const len = data.length;
  let head;
  if (len < 126) {
    head = Buffer.alloc(2);
    head[1] = len;
  } else if (len < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  head[0] = 0x80 | (opcode === undefined ? 0x1 : opcode);
  return Buffer.concat([head, data]);
}

/* Pull whole frames out of the running buffer. Returns what it could decode
 * and leaves the remainder for the next chunk — a client is free to split a
 * frame across TCP segments and usually does. */
function drainFrames(state) {
  const out = [];
  for (;;) {
    const b = state.buf;
    if (b.length < 2) break;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) { if (b.length < 4) break; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) {
      if (b.length < 10) break;
      const big = b.readBigUInt64BE(2);
      if (big > BigInt(MAX_BODY_BYTES)) return { out, fatal: 1009 };
      len = Number(big); off = 10;
    }
    if (len > MAX_BODY_BYTES) return { out, fatal: 1009 };
    /* Every frame from a client MUST be masked (RFC 6455 §5.1). An unmasked
     * one is a broken or hostile peer, not something to interpret. */
    if (!masked) return { out, fatal: 1002 };
    if (b.length < off + 4 + len) break;
    const mask = b.subarray(off, off + 4);
    const data = Buffer.from(b.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
    state.buf = b.subarray(off + 4 + len);
    out.push({ fin, opcode, data });
  }
  return { out, fatal: 0 };
}

/* Every live socket, so a project change can be published to all of them. */
const sockets = new Set();

function publish(event) {
  const text = JSON.stringify(event);
  for (const s of sockets) {
    if (!s.authed) continue;
    if (event.house_id && s.house !== event.house_id) continue;
    try { s.socket.write(frame(text)); } catch (e) { /* closing anyway */ }
  }
}

let unsubscribeStore = null;

/* Subscribes once, lazily, and only while the option is on. The store's own
 * pub/sub already fires for every writer — the editor's autosave, an MCP call,
 * anything — so a phone learns about a change made from a laptop without this
 * module knowing who made it. */
function ensureStoreSubscription() {
  if (unsubscribeStore) return;
  unsubscribeStore = store.onProjectChange((project, origin) => {
    publish({
      type: 'project_changed',
      house_id: HOUSE_ID,
      revision: etagOf({ p: project.savedAt, n: project.name, f: (project.floors || []).length }).replace(/"/g, ''),
      origin: origin || null,
      changed: 'project',
      affectedFloorIds: (project.floors || []).map((f) => f.id),
      presentationChanged: true,
    });
  });
}

function closeSocket(entry, code, reason) {
  try {
    const body = Buffer.alloc(2 + Buffer.byteLength(reason || ''));
    body.writeUInt16BE(code || 1000, 0);
    body.write(reason || '', 2);
    entry.socket.write(Buffer.concat([Buffer.from([0x88, body.length]), body]));
  } catch (e) { /* already gone */ }
  try { entry.socket.end(); } catch (e) { /* already gone */ }
  sockets.delete(entry);
}

function handleUpgrade(req, socket, head, opts) {
  const key = req.headers['sec-websocket-key'];
  const version = req.headers['sec-websocket-version'];
  if (!key || String(version) !== '13') {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    return socket.destroy();
  }
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + acceptKey(key),
    '', '',
  ].join('\r\n'));

  const entry = { socket, buf: head && head.length ? Buffer.from(head) : Buffer.alloc(0), authed: false, house: null, user: null };
  sockets.add(entry);
  ensureStoreSubscription();

  const sendJson = (obj) => { try { socket.write(frame(JSON.stringify(obj))); } catch (e) { /* closing */ } };
  sendJson({ type: 'auth_required', apiVersion: API_VERSION, serverVersion: store.VERSION });

  /* A socket that never authenticates is closed rather than left open. An
   * unauthenticated connection costs a file descriptor and proves nothing. */
  const deadline = setTimeout(() => {
    if (!entry.authed) closeSocket(entry, 4401, 'auth timeout');
  }, AUTH_DEADLINE_MS);

  socket.on('data', async (chunk) => {
    entry.buf = Buffer.concat([entry.buf, chunk]);
    const { out, fatal } = drainFrames(entry);
    if (fatal) return closeSocket(entry, fatal, 'protocol error');
    for (const f of out) {
      if (f.opcode === 0x8) return closeSocket(entry, 1000, 'bye');
      if (f.opcode === 0x9) { try { socket.write(frame(f.data.toString('utf8'), 0xA)); } catch (e) { /* gone */ } continue; }
      if (f.opcode === 0xA) continue;
      if (f.opcode !== 0x1) continue;

      let msg;
      try { msg = JSON.parse(f.data.toString('utf8')); } catch (e) { sendJson({ type: 'error', code: 'bad_json' }); continue; }

      if (msg.type === 'auth') {
        const addr = String(socket.remoteAddress || '').replace(/^::ffff:/, '');
        if (auth.tooManyFailures(addr)) { sendJson({ type: 'auth_invalid', code: 'too_many_attempts' }); closeSocket(entry, 4429, 'rate limited'); continue; }
        const valid = await auth.checkToken(msg.access_token, (opts.authOpts || {}).fetchImpl);
        if (!valid) {
          auth.noteFailure(addr);
          sendJson({ type: 'auth_invalid' });
          closeSocket(entry, 4401, 'auth invalid');
          continue;
        }
        /* WHO is resolved once here, because a socket is long-lived and the
         * answer decides what it may later be told. */
        entry.user = await auth.principal(msg.access_token, opts.authOpts || {});
        entry.authed = true;
        entry.clientId = typeof msg.client_id === 'string' ? msg.client_id.slice(0, 128) : null;
        clearTimeout(deadline);
        sendJson({ type: 'auth_ok', user: entry.user });
        continue;
      }

      if (!entry.authed) { sendJson({ type: 'error', code: 'auth_required' }); continue; }

      if (msg.type === 'subscribe_house') {
        const houseId = String(msg.house_id || HOUSE_ID);
        if (houseId !== HOUSE_ID) { sendJson({ type: 'error', code: 'unknown_house' }); continue; }
        /* One subscription per socket: subscribing again replaces it rather
         * than accumulating, so a client switching houses cannot end up
         * quietly receiving both. */
        entry.house = houseId;
        const docs = await allDocs();
        sendJson({ type: 'house_subscribed', house_id: houseId, revision: revisionOf(docs) });
        continue;
      }

      if (msg.type === 'ping') { sendJson({ type: 'pong' }); continue; }
      sendJson({ type: 'error', code: 'unknown_type' });
    }
  });

  socket.on('error', () => { clearTimeout(deadline); sockets.delete(entry); });
  socket.on('close', () => { clearTimeout(deadline); sockets.delete(entry); });
}

/* ----------------------------------------------------------- entrypoints -- */

function isAppApiPath(pathname) {
  return pathname === PREFIX || pathname.startsWith(PREFIX + '/');
}

async function handleRequest(req, res, pathname, query, opts) {
  const o = opts || {};
  const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  try {
    return await handleRest(req, res, pathname, query, requestId, o);
  } catch (e) {
    if (!res.headersSent) return fail(res, requestId, 500, 'server_error', e.message);
    return res.end();
  }
}

/* Tests only. */
function _sockets() { return sockets; }
function _reset() {
  for (const s of [...sockets]) closeSocket(s, 1001, 'reset');
  sockets.clear();
  if (unsubscribeStore) { unsubscribeStore(); unsubscribeStore = null; }
}

module.exports = {
  PREFIX, API_VERSION, HOUSE_ID, MAX_BODY_BYTES,
  isAppApiPath, handleRequest, handleUpgrade,
  providerInstanceId, revisionOf, floorBundle, entityIdsFor, rendererRegistries,
  publish, _sockets, _reset,
};
