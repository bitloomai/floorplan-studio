/**
 * Home Assistant WRITE access — the only module in this app that has any.
 *
 * `ha.js` is read-only by construction: one request function, `method: 'GET'`
 * hardcoded, no service-call helper, so no edit to a caller can accidentally
 * turn something on. That property is worth keeping, so writing lives here
 * instead of being added to it, and this file is deliberately small enough to
 * read in one sitting before trusting it.
 *
 * ## What it can do
 *
 *   - list, create and update Lovelace RESOURCES (the card module)
 *   - list and create DASHBOARDS
 *   - read and save one dashboard's CONFIG
 *   - discover which dashboards this tool deployed, and pull one back out
 *
 * ## What it cannot do
 *
 *   - call a service. There is no `callService` here and nothing builds a
 *     `call_service` message, so this cannot turn a light on, unlock a door or
 *     run a script no matter what is passed to it.
 *   - touch the default dashboard. Every config write goes through
 *     `assertOwnPath()`, which refuses the default and constrains a save to the
 *     caller-selected path. Provenance-based ownership of an existing custom
 *     dashboard is a separate release blocker; this assertion alone does not
 *     establish it.
 *   - overwrite silently. `saveDashboard()` reads the existing config first and
 *     hands it back as `backup`; the caller writes it to disk before saving.
 *
 * ## Connection
 *
 * Supervisor gives an app a token and a proxy at `ws://supervisor/core/`,
 * which is how this authenticates when installed. In development it uses the
 * same HA_URL/HA_TOKEN pair as `ha.js`. The Node.js 24 runtime has a stable
 * global `WebSocket`, so there is no dependency to add.
 */

'use strict';

const ha = require('./ha');
const provenance = require('./provenance');

const AUTH_TIMEOUT_MS = 15000;
const CALL_TIMEOUT_MS = 30000;

function wsUrl() {
  const mode = ha.mode();
  if (mode === 'supervisor') return 'ws://supervisor/core/websocket';
  if (mode === 'dev') return ha.baseUrl().replace(/^http/, 'ws').replace(/\/api$/, '') + '/api/websocket';
  throw new Error('Home Assistant is not configured — no SUPERVISOR_TOKEN and no HA_URL/HA_TOKEN.');
}

/* The default dashboard has no url_path at all, and "" / null / "lovelace" all
 * reach it. Naming every spelling is clumsy but the alternative is a truthiness
 * check that a future refactor quietly inverts. */
function assertOwnPath(urlPath, owned) {
  const p = provenance.assertPath(urlPath);
  if (p !== owned) {
    throw new Error(`refusing to write to "${p}": this app only writes to "${owned}"`);
  }
  return p;
}

class Session {
  constructor(ws) { this.ws = ws; this.nextId = 1; this.pending = new Map(); }

  send(msg) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Home Assistant did not answer "${msg.type}" within ${CALL_TIMEOUT_MS / 1000}s`));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(Object.assign({ id }, msg)));
    });
  }

  settle(msg) {
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.success === false) {
      const e = (msg.error || {});
      p.reject(new Error(`${e.code || 'error'}: ${e.message || 'Home Assistant refused the request'}`));
    } else p.resolve(msg.result);
  }

  close() { try { this.ws.close(); } catch { /* already gone */ } }
}

/* `opts` is only ever passed by tests. A real caller gets the Supervisor/dev
 * URL and token from `ha.js` and the runtime's own global `WebSocket`, exactly
 * as before — this exists so the connect/auth/send path can be exercised
 * against a fake Home Assistant instead of being untestable until a real
 * instance is available. */
function connect(opts) {
  const o = opts || {};
  const url = o.url || wsUrl();
  const token = o.token || ha.token();
  if (!token) throw new Error('no Home Assistant token available');
  return new Promise((resolve, reject) => {
    const Impl = o.WebSocket || (typeof WebSocket === 'function' ? WebSocket : null);
    if (!Impl) {
      return reject(new Error('this Node build has no global WebSocket (needs Node 18 or newer)'));
    }
    const ws = new Impl(url);
    const session = new Session(ws);
    const timer = setTimeout(() => { session.close(); reject(new Error(`could not authenticate with ${url} in time`)); }, AUTH_TIMEOUT_MS);

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'auth_required') return ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      if (msg.type === 'auth_ok') { clearTimeout(timer); return resolve(session); }
      if (msg.type === 'auth_invalid') {
        clearTimeout(timer); session.close();
        return reject(new Error('Home Assistant rejected the token'));
      }
      if (msg.type === 'result') session.settle(msg);
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error(`could not reach ${url}`));
    });
    ws.addEventListener('close', () => {
      for (const [, p] of session.pending) { clearTimeout(p.timer); p.reject(new Error('connection closed')); }
      session.pending.clear();
    });
  });
}

/* ------------------------------------------------------------- resources */

/* The card module goes in as a base64 `data:` URL rather than a file, because
 * an app has no filesystem access to the Home Assistant config directory —
 * REST and WebSocket only. A data URL sidesteps that entirely and works in
 * storage mode with no HACS and nothing fetched from the internet.
 *
 * The `?v=` suffix is what makes a REGENERATE take effect: browsers cache a
 * resource by URL, and without a changing query the dashboard would keep
 * running last week's card. */
/* A banner at offset 0, so the marker below is aligned by construction —
 * see the long note on resourceMarker(). */
const BANNER = '/*! fps-floorplan-card */\n';

function bannerFor(resourceKey) {
  return resourceKey ? `/*! fps-floorplan-card:${provenance.assertPath(resourceKey)} */\n` : BANNER;
}

function resourceBody(content, resourceKey) {
  const banner = bannerFor(resourceKey);
  return content.startsWith(banner) ? content : banner + content;
}

function resourceUrl(content, resourceKey) {
  const b64 = Buffer.from(resourceBody(content, resourceKey), 'utf8').toString('base64');
  return `data:text/javascript;base64,${b64}`;
}

function resourceFamilyMarker() {
  const prefix = '/*! fps-floorplan-card';
  return Buffer.from(prefix, 'utf8').toString('base64').slice(0, Math.floor(Buffer.byteLength(prefix, 'utf8') / 3) * 4);
}

function isOurResource(r, marker, includeLegacy = true) {
  if (!r || typeof r.url !== 'string') return false;
  return r.url.includes(marker || resourceFamilyMarker()) || (includeLegacy && r.url.includes(legacyMarker()));
}

async function installResource(session, content, resourceKey) {
  const list = await session.send({ type: 'lovelace/resources' });
  const marker = resourceMarker(resourceKey);
  const url = resourceUrl(content, resourceKey);
  const mine = (list || []).filter((r) => isOurResource(r, marker, !resourceKey));
  if (mine.length) {
    await session.send({ type: 'lovelace/resources/update', resource_id: mine[0].id, res_type: 'module', url });
    /* A regenerate that leaves the old copies behind means the browser loads
     * two definitions of the same custom element and the second throws. */
    for (const extra of mine.slice(1)) await session.send({ type: 'lovelace/resources/delete', resource_id: extra.id });
    return { action: 'updated', id: mine[0].id, removed: mine.length - 1 };
  }
  const created = await session.send({ type: 'lovelace/resources/create', res_type: 'module', url });
  return { action: 'created', id: created && created.id, removed: 0 };
}

/* Identify OUR resource among however many the instance already has.
 *
 * Matching on the base64 of a string that only this generator writes is
 * clumsier than an id would be, but an app has nowhere durable to keep an
 * id, and matching on "any module resource" would let a regenerate clobber
 * somebody else's card.
 *
 * It has to be ALIGNED, though, and until 2026-08-29 it was not. Base64 encodes
 * in 3-byte groups, so the encoding of a substring appears inside the encoding
 * of the whole only when the substring starts at an offset divisible by three.
 * Matching `b64('fps-floorplan-card')` therefore worked only by luck — the card
 * happens to contain that string at all three alignments, so one of them landed
 * on 0. Any edit that shifted every occurrence off it would have silently
 * stopped matching, and a regenerate that cannot find its own resource creates
 * a SECOND one: two definitions of the same custom element, and the second
 * throws. Found by the browser client's tests, which used content short enough
 * to have only one occurrence.
 *
 * The banner is prepended at offset 0, which makes the first 32 characters of
 * the encoding a constant. Alignment is no longer a matter of luck. */
function resourceMarker(resourceKey) {
  const banner = bannerFor(resourceKey);
  return Buffer.from(banner, 'utf8').toString('base64').slice(0, Math.floor(Buffer.byteLength(banner, 'utf8') / 3) * 4);
}

/* Resources written before the banner existed. Kept so an upgrade adopts its
 * own resource rather than deploying a duplicate alongside it. */
function legacyMarker() {
  return Buffer.from('fps-floorplan-card', 'utf8').toString('base64').replace(/=+$/, '');
}

/* ------------------------------------------------------------ dashboards */

async function ensureDashboard(session, { urlPath, title, icon }) {
  const list = await session.send({ type: 'lovelace/dashboards/list' });
  const found = (list || []).find((d) => d.url_path === urlPath);
  if (found) return { action: 'existing', dashboard: found, others: (list || []).filter((d) => d.url_path !== urlPath) };
  const created = await session.send({
    type: 'lovelace/dashboards/create',
    url_path: urlPath,
    title,
    icon: icon || 'mdi:floor-plan',
    mode: 'storage',
    require_admin: false,
    show_in_sidebar: true,
  });
  return { action: 'created', dashboard: created, others: list || [] };
}

async function readConfig(session, urlPath) {
  try {
    return await session.send({ type: 'lovelace/config', url_path: urlPath });
  } catch (e) {
    /* A dashboard created a moment ago has no config yet, and that is not an
     * error — it is the normal first-run path. */
    if (/config_not_found|not found/i.test(e.message)) return null;
    throw e;
  }
}

async function saveConfig(session, urlPath, config, owned, ownership = {}) {
  assertOwnPath(urlPath, owned);
  const before = Object.prototype.hasOwnProperty.call(ownership, 'previous')
    ? ownership.previous : await readConfig(session, urlPath);
  provenance.assertOwnedConfig(urlPath, before, { allowMissing: ownership.allowMissing === true });
  await session.send({ type: 'lovelace/config/save', url_path: urlPath, config });
  /* Read it straight back. A save that reported success but stored something
   * else is the failure mode worth catching here rather than on a phone. */
  const back = await session.send({ type: 'lovelace/config', url_path: urlPath });
  const got = (back && back.views && back.views.length) || 0;
  const want = (config.views || []).length;
  if (got !== want) throw new Error(`read-back showed ${got} views, expected ${want}`);
  return back;
}

async function discover(session, { resourceMarker: marker } = {}) {
  const [dashboards, resources] = await Promise.all([
    session.send({ type: 'lovelace/dashboards/list' }).catch(() => []),
    session.send({ type: 'lovelace/resources' }).catch(() => []),
  ]);
  const ours = (resources || []).filter((resource) => isOurResource(resource, marker));
  const found = [];
  for (const dashboard of dashboards || []) {
    if (!dashboard.url_path) continue;
    let config = null;
    try {
      config = await session.send({ type: 'lovelace/config', url_path: dashboard.url_path });
    } catch {
      config = null;
    }
    const ownership = provenance.readStamp(config);
    if (!ownership) continue;
    found.push({
      urlPath: dashboard.url_path,
      title: dashboard.title || dashboard.url_path,
      icon: dashboard.icon || null,
      version: ownership.version,
      savedAt: ownership.saved_at,
      editable: !!ownership.project,
      projectBytes: ownership.project_bytes || 0,
      views: (config && config.views && config.views.length) || 0,
    });
  }
  return { dashboards: found, resourceInstalled: ours.length > 0, resourceCount: ours.length };
}

async function loadProject(session, urlPath) {
  const config = await session.send({ type: 'lovelace/config', url_path: urlPath });
  const ownership = provenance.readStamp(config);
  if (!ownership) throw new Error(`"${urlPath}" was not deployed by this editor.`);
  if (!ownership.project) {
    throw new Error(`"${urlPath}" was deployed without its design attached, so there is nothing to edit. `
      + 'Re-deploy with "keep the design in Home Assistant" turned on to be able to open it again later.');
  }
  return ownership.project;
}

module.exports = {
  connect, installResource, resourceMarker, ensureDashboard, readConfig, saveConfig,
  discover, loadProject,
  assertOwnPath, resourceUrl, wsUrl,
  legacyMarker, isOurResource, resourceBody, bannerFor, resourceFamilyMarker, BANNER,
  STAMP_KEY: provenance.STAMP_KEY,
  stamp: provenance.stamp,
  readStamp: provenance.readStamp,
  assertOwnedConfig: provenance.assertOwnedConfig,
};
