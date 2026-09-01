#!/usr/bin/env node
/**
 * Floorplan Studio — app server.
 *
 * Deliberately dependency-free: Node's own http/fs/path only. The production
 * image runs on the Node.js 24 distroless runtime, with no package manager,
 * shell, third-party module, or lockfile to maintain.
 *
 * Runs in two modes:
 *   app  — SUPERVISOR_TOKEN present, talks to http://supervisor/core/api
 *   dev     — HA_URL / HA_TOKEN from the environment or a .env file
 *
 * Its access to Home Assistant's STATE is read-only: `lib/ha.js` has one
 * request function and it physically cannot issue anything but GET, so nothing
 * in this process can turn a light on or run a script. The one thing it can
 * write is a Lovelace dashboard, and only through `lib/ha-write.js`, only over
 * WebSocket, only to the dashboard the user named — see the guarantees
 * documented there. Keeping the writable surface in one small file is the
 * point: a reviewer has to read exactly one module to know everything this
 * app can change.
 *
 * "This process" is doing real work in that sentence. `lib/card-runtime.js`
 * DOES call `hass.callService`, and is never loaded here — it is source text
 * that `lib/card-build.js` bakes into the generated dashboard resource, which
 * runs in the viewer's browser under the viewer's own Home Assistant session.
 * The app's token never reaches it. A tap on the finished dashboard acts as
 * the person looking at it; a tap in the card PREVIEW served from here is
 * logged and not sent.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const store = require('./lib/store');
const ha = require('./lib/ha');
const haWrite = require('./lib/ha-write');
const legacyImport = require('./lib/legacy-import');
const exporter = require('./lib/export-spec');
const cardBuild = require('./lib/card-build');
const dashboard = require('./lib/dashboard');
const mcp = require('./lib/mcp');

/* FPS_PORT is this app's own knob; PORT is what a generic host hands a
 * process it launched. Honouring both means the dev server can be started by
 * something that picks the port for it without needing to know our name. */
const PORT = Number(process.env.FPS_PORT || process.env.PORT || 8099);
const PUBLIC_DIR = path.join(__dirname, 'public');

/* ---------- options ---------- */

function loadOptions() {
  const defaults = {
    log_level: 'info', entity_refresh_seconds: 60,
    mcp_enabled: true, mcp_allow_dashboard_install: false,
    ssl_cert: '', ssl_key: '', mcp_ssl_port: 8443,
  };
  const file = process.env.FPS_OPTIONS_FILE;
  if (!file || !fs.existsSync(file)) return defaults;
  try {
    return Object.assign(defaults, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) {
    console.warn('[floorplan-studio] could not read options file:', e.message);
    return defaults;
  }
}
const OPTIONS = loadOptions();

const LEVELS = { trace: 0, debug: 1, info: 2, notice: 3, warning: 4, error: 5, fatal: 6 };
const log = (level, ...args) => {
  if ((LEVELS[level] ?? 2) >= (LEVELS[OPTIONS.log_level] ?? 2)) {
    console.log(`[floorplan-studio] ${level}:`, ...args);
  }
};

/* ---------- tiny http helpers ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function sendText(res, code, text, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function readBody(req, limitBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(new Error('body is not valid JSON: ' + e.message)); }
    });
    req.on('error', reject);
  });
}

/* Serve a file from public/, refusing anything that escapes it. */
function serveStatic(res, urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  const target = path.resolve(PUBLIC_DIR, rel === '' ? 'index.html' : rel);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    return sendText(res, 403, 'forbidden');
  }
  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) return sendText(res, 404, 'not found');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      // The editor is a live tool; a stale cached bundle is worse than a refetch.
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(target).pipe(res);
  });
}

/* ---------- routes ---------- */

/* Home Assistant ingress serves the app under /api/hassio_ingress/<token>/,
 * so every URL the page requests must be RELATIVE. This strips whatever prefix
 * ingress prepended and leaves the app's own path, which is what we route on. */
function appPath(req) {
  const url = new URL(req.url, 'http://localhost');
  let p = url.pathname;
  const ingress = req.headers['x-ingress-path'];
  if (ingress && p.startsWith(ingress)) p = p.slice(ingress.length) || '/';
  return { pathname: p || '/', query: url.searchParams };
}

/* In production this port exists only for Supervisor ingress. Home Assistant's
 * ingress proxy is 172.30.32.2; rejecting every other peer prevents another
 * container on the internal network from bypassing ingress authentication.
 * Development has no SUPERVISOR_TOKEN and remains reachable from localhost. */
function ingressPeer(req) {
  return String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

function allowIngressPeer(req) {
  return !process.env.SUPERVISOR_TOKEN || ingressPeer(req) === '172.30.32.2';
}

async function handleApi(req, res, pathname, query) {
  const method = req.method.toUpperCase();

  if (pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      version: store.VERSION,
      node: process.versions.node,
      mode: ha.mode(),
    });
  }

  if (pathname === '/api/bootstrap' && method === 'GET') {
    const [project, library, themes, flooring, boundaries, controls] = await Promise.all([
      store.readProject(), store.readLibrary(), store.readThemes(),
      store.readFlooring(), store.readBoundaries(), store.readControls(),
    ]);
    return sendJson(res, 200, {
      project, library, themes, flooring, boundaries, controls,
      options: OPTIONS,
      mode: ha.mode(),
      haConfigured: ha.isConfigured(),
      version: store.VERSION,
    });
  }

  if (pathname === '/api/project') {
    if (method === 'GET') return sendJson(res, 200, await store.readProject());
    if (method === 'PUT') {
      const body = await readBody(req);
      const saved = await store.writeProject(body);
      log('debug', 'project saved,', (saved.floors || []).length, 'floors');
      return sendJson(res, 200, { ok: true, savedAt: saved.savedAt, floors: (saved.floors || []).length });
    }
  }

  /* Tells the open editor that the project on disk changed — from an MCP tool
   * call, most likely, since the editor's own edits already know about
   * themselves. One event carries only `savedAt`; the client re-fetches the
   * project itself rather than this pushing the (much larger) document on
   * every change. Plain Server-Sent Events: one long-lived GET, no library,
   * and it works through Ingress exactly like any other relative fetch here. */
  if (pathname === '/api/project/stream' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    const unsubscribe = store.onProjectChange((project) => {
      res.write(`event: project\ndata: ${JSON.stringify({ savedAt: project.savedAt })}\n\n`);
    });
    const heartbeat = setInterval(() => { try { res.write(':\n\n'); } catch (e) { /* client gone */ } }, 25000);
    req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
    return;
  }

  if (pathname === '/api/library') {
    if (method === 'GET') return sendJson(res, 200, await store.readLibrary());
    if (method === 'PUT') {
      await store.writeLibrary(await readBody(req));
      return sendJson(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/themes') {
    if (method === 'GET') return sendJson(res, 200, await store.readThemes());
    if (method === 'PUT') {
      await store.writeThemes(await readBody(req));
      return sendJson(res, 200, { ok: true });
    }
  }

  /* The registries, each one document, each GET/PUT. */
  for (const [name, read, write] of [
    ['flooring', store.readFlooring, store.writeFlooring],
    ['boundaries', store.readBoundaries, store.writeBoundaries],
    ['controls', store.readControls, store.writeControls],
  ]) {
    if (pathname === '/api/' + name) {
      if (method === 'GET') return sendJson(res, 200, await read());
      if (method === 'PUT') { await write(await readBody(req)); return sendJson(res, 200, { ok: true }); }
    }
  }

  /* Solar position, so the editor's time scrubber does not need an astronomy
   * library of its own and cannot disagree with the renderer. */
  if (pathname === '/api/sun' && method === 'GET') {
    const sun = require('./lib/sun');
    const lat = parseFloat(query.get('lat')), lon = parseFloat(query.get('lon'));
    if (!isFinite(lat) || !isFinite(lon)) return sendJson(res, 400, { error: 'lat and lon required' });
    const when = query.get('at') ? new Date(query.get('at')) : new Date();
    return sendJson(res, 200, { position: sun.position(lat, lon, when), day: sun.dayEvents(lat, lon, when) });
  }

  /* Entity list for the binding picker. Redacted to id/name/domain/state plus a
   * couple of display hints — NEVER raw attributes, which on person.* carry GPS
   * coordinates. Cached so opening the picker does not hammer HA. */
  if (pathname === '/api/entities' && method === 'GET') {
    try {
      const list = await ha.entities(OPTIONS.entity_refresh_seconds * 1000, query.get('refresh') === '1');
      return sendJson(res, 200, { entities: list, mode: ha.mode(), count: list.length });
    } catch (e) {
      log('warning', 'entity fetch failed:', e.message);
      return sendJson(res, 200, { entities: [], mode: ha.mode(), count: 0, error: e.message });
    }
  }

  /* Live states for the preview, same redaction. */
  if (pathname === '/api/states' && method === 'GET') {
    try {
      const map = await ha.stateMap(OPTIONS.entity_refresh_seconds * 1000);
      return sendJson(res, 200, { states: map });
    } catch (e) {
      return sendJson(res, 200, { states: {}, error: e.message });
    }
  }

  /* Sample projects in THIS builder's own schema. Unlike the legacy importer
   * below, these need no conversion — they are what the editor already saves.
   * They live in this app's fixtures/ directory, so development never needs
   * a neighbouring project to be present. */
  if (pathname === '/api/fixtures' && method === 'GET') {
    const dir = process.env.FPS_FIXTURES_DIR || path.join(__dirname, '..', 'fixtures');
    if (!fs.existsSync(dir)) return sendJson(res, 200, { dir, projects: [] });
    const projects = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.project.json'))
      .map((f) => {
        try {
          const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          return { file: f, name: p.name, floors: (p.floors || []).length,
            rooms: (p.floors || []).reduce((n, x) => n + (x.rooms || []).length, 0) };
        } catch (e) { return { file: f, error: e.message }; }
      });
    return sendJson(res, 200, { dir, projects });
  }

  if (pathname === '/api/fixtures/load' && method === 'POST') {
    const body = (await readBody(req)) || {};
    const dir = process.env.FPS_FIXTURES_DIR || path.join(__dirname, '..', 'fixtures');
    // Refuse anything that escapes the fixtures directory.
    const target = path.resolve(dir, String(body.file || ''));
    if (!target.startsWith(path.resolve(dir)) || !target.endsWith('.project.json')) {
      return sendJson(res, 400, { error: 'not a fixture project' });
    }
    if (!fs.existsSync(target)) return sendJson(res, 404, { error: 'no such fixture' });
    return sendJson(res, 200, JSON.parse(fs.readFileSync(target, 'utf8')));
  }

  /* Bring an existing hand-written floor-plan spec set into the builder. */
  if (pathname === '/api/import/legacy' && method === 'POST') {
    const body = (await readBody(req)) || {};
    try {
      const result = legacyImport.fromDirectory(body.dir, body.files);
      return sendJson(res, 200, result);
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname === '/api/export' && method === 'POST') {
    const body = (await readBody(req)) || {};
    const project = body.project || (await store.readProject());
    const library = await store.readLibrary();
    const themes = await store.readThemes();
    try {
      const out = exporter.build(project, library, themes, body.format || 'bundle', body.floorId);
      return sendJson(res, 200, out);
    } catch (e) {
      return sendJson(res, 400, { error: e.message, stack: OPTIONS.log_level === 'debug' ? e.stack : undefined });
    }
  }

  /* ---- the dashboard ----
   *
   * Five endpoints, in the order you would use them: see what is already out
   * there, pull one back if you want to edit it, then look at the card, look
   * at the config a generate would install, and install it. Splitting them
   * means the destructive one is the only one that needs a confirmation, and
   * the rest can be poked at freely. */

  /* Everything this app has ever deployed to THIS Home Assistant, by
   * reading each dashboard's own ownership stamp back — nothing is kept on
   * disk about what went where, because the stamp travelling with the
   * dashboard is what lets a second app install, or a rebuilt one, still
   * recognise its own work. Never throws: an unreachable or unconfigured
   * Home Assistant is "nothing found", not a failed page load. */
  if (pathname === '/api/dashboard/discover' && method === 'GET') {
    if (!ha.isConfigured()) return sendJson(res, 200, { dashboards: [], mode: ha.mode() });
    let session;
    try {
      session = await haWrite.connect();
      const found = await haWrite.discover(session, { resourceMarker: haWrite.resourceFamilyMarker() });
      return sendJson(res, 200, Object.assign({ mode: ha.mode() }, found));
    } catch (e) {
      log('warning', 'dashboard discovery failed:', e.message);
      return sendJson(res, 200, { dashboards: [], mode: ha.mode(), error: e.message });
    } finally {
      if (session) session.close();
    }
  }

  /* Pull a previously-deployed design back into the editor. Read-only against
   * Home Assistant — this loads the project embedded in the dashboard's own
   * stamp and hands it to the browser, which does the actual "replace the
   * current project" step, the same as loading a sample or a legacy import. */
  if (pathname === '/api/dashboard/reopen' && method === 'POST') {
    const body = (await readBody(req)) || {};
    const urlPath = String(body.urlPath || '');
    if (!ha.isConfigured()) {
      return sendJson(res, 400, { error: 'Home Assistant is not reachable from the app.' });
    }
    let session;
    try {
      session = await haWrite.connect();
      const project = await haWrite.loadProject(session, urlPath);
      return sendJson(res, 200, { project });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    } finally {
      if (session) session.close();
    }
  }

  async function dashboardDocs(body) {
    const [project, library, themes, boundaries, flooring, controls] = await Promise.all([
      body && body.project ? Promise.resolve(body.project) : store.readProject(),
      store.readLibrary(), store.readThemes(), store.readBoundaries(),
      store.readFlooring(), store.readControls(),
    ]);
    return { project, library, themes, boundaries, flooring, controls };
  }

  /* The generated card module, served as-is. This is what the preview page
   * loads, and it is byte-identical to what gets installed — the preview
   * showing something the dashboard will not is the bug this avoids. */
  if (pathname === '/api/card.js' && method === 'GET') {
    const docs = await dashboardDocs(null);
    const card = cardBuild.build(docs, { version: store.VERSION });
    res.writeHead(200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    return res.end(card.content);
  }

  /* What WOULD be installed, without installing it. */
  if (pathname === '/api/dashboard/preview' && method === 'POST') {
    const body = (await readBody(req)) || {};
    const docs = await dashboardDocs(body);
    try {
      const config = dashboard.build(docs.project, body);
      const card = cardBuild.build(docs, { version: store.VERSION });
      const wanted = dashboard.boundEntities(docs.project);
      let missing = [];
      if (ha.isConfigured()) {
        try {
          const live = await ha.stateMap(OPTIONS.entity_refresh_seconds * 1000);
          missing = wanted.filter((e) => !live[e]);
        } catch (e) { log('warning', 'entity check skipped:', e.message); }
      }
      return sendJson(res, 200, {
        config,
        views: config.views.map((v) => ({ title: v.title, path: v.path, icon: v.icon, cards: v.cards[0].cards.length })),
        card: { name: card.name, bytes: card.bytes, floors: card.floors },
        entities: { wanted: wanted.length, missing },
        mode: ha.mode(),
      });
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (pathname === '/api/dashboard/install' && method === 'POST') {
    const body = (await readBody(req)) || {};
    if (!ha.isConfigured()) {
      return sendJson(res, 400, { error: 'Home Assistant is not reachable from the app, so there is nothing to install to.' });
    }
    const urlPath = dashboard.slug(body.urlPath || body.title || 'home-plan');
    let session;
    try {
      const docs = await dashboardDocs(body);
      const card = cardBuild.build(docs, { version: store.VERSION, resourceKey: urlPath });
      const config = dashboard.build(docs.project, Object.assign({}, body, {
        urlPath,
        cardTypes: card.elementTypes,
      }));

      session = await haWrite.connect();
      const dash = await haWrite.ensureDashboard(session, {
        urlPath, title: config.title, icon: body.icon || 'mdi:floor-plan',
      });
      /* Keep a copy of whatever was there before, in the app's own backups
       * folder, BEFORE overwriting it. A dashboard is somebody's home screen. */
      const before = await haWrite.readConfig(session, urlPath);
      haWrite.assertOwnedConfig(urlPath, before, { allowMissing: dash.action === 'created' });
      if (before) await store.backupDashboard(urlPath, before);

      config[haWrite.STAMP_KEY] = haWrite.stamp(docs.project, {
        version: store.VERSION,
        urlPath,
        embedProject: body.embedProject !== false,
      });
      const resource = await haWrite.installResource(session, card.content, urlPath);
      await haWrite.saveConfig(session, urlPath, config, urlPath, {
        previous: before,
        allowMissing: dash.action === 'created',
      });
      log('info', `dashboard "${urlPath}": ${config.views.length} views, card ${(card.bytes / 1024).toFixed(0)} KiB, resource ${resource.action}`);
      return sendJson(res, 200, {
        ok: true,
        urlPath,
        title: config.title,
        views: config.views.map((v) => v.title),
        resource,
        dashboard: dash.action,
        untouched: (dash.others || []).map((d) => d.url_path).filter(Boolean),
        cardBytes: card.bytes,
        backedUp: !!before,
        editable: !!config[haWrite.STAMP_KEY].project,
      });
    } catch (e) {
      log('error', 'dashboard install failed:', e.message);
      return sendJson(res, 400, { error: e.message });
    } finally {
      if (session) session.close();
    }
  }

  return sendJson(res, 404, { error: 'no such endpoint: ' + pathname });
}

/* The one path that is NOT behind Ingress — see app/lib/mcp.js's module
 * header for why. It has its own door (a Home Assistant token, checked
 * against Home Assistant itself) instead of the ingress-peer-IP guard.
 * `mcp_enabled` (app option, default on) is the full off switch — turn
 * it off and this path stops existing, same as if mcp.js were never
 * required. `mcp_allow_dashboard_install` is a separate, narrower gate:
 * MCP stays on for reading/editing the plan, only the one Home-Assistant-
 * writing tool is hidden.
 *
 * Shared between the main server (plain HTTP, alongside the Ingress-served
 * editor) and the optional TLS listener below, which serves NOTHING else —
 * deliberately: if that port is ever forwarded past the LAN, the only thing
 * reachable through it is this same MCP surface, not the editor or the rest
 * of the API. */
async function mcpRequestHandler(req, res) {
  if (OPTIONS.mcp_enabled === false) return sendJson(res, 404, { error: 'MCP is disabled — turn on the "mcp_enabled" app option to use it.' });
  try {
    return await mcp.handleRequest(req, res, { allowInstall: OPTIONS.mcp_allow_dashboard_install === true });
  } catch (e) {
    log('error', 'mcp request failed:', e.message);
    if (!res.headersSent) return sendJson(res, 500, { error: e.message });
    return res.end();
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname, query } = appPath(req);

  if (pathname === '/mcp') return mcpRequestHandler(req, res);

  if (!allowIngressPeer(req)) return sendJson(res, 403, { error: 'ingress proxy required' });
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname, query);
    /* The scene builder is shared with the server, so the browser is served the
     * very same file rather than a copy under public/. One implementation, no
     * chance of the editor and the exporter drifting apart. */
    const SHARED = ['plan-scene.js', 'flooring.js', 'shapes.js', 'sun.js', 'controls.js', 'lighting.js'];
    const sharedName = pathname.startsWith('/js/') ? pathname.slice(4) : null;
    if (sharedName && SHARED.includes(sharedName)) {
      return fs.createReadStream(path.join(__dirname, 'lib', sharedName))
        .on('open', () => res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' }))
        .on('error', () => sendText(res, 500, 'could not read ' + sharedName))
        .pipe(res);
    }
    return serveStatic(res, pathname === '/' ? '/index.html' : pathname);
  } catch (e) {
    log('error', req.method, pathname, '->', e.message);
    if (!res.headersSent) sendJson(res, 500, { error: e.message });
    else res.end();
  }
});

/* Optional, additive TLS for MCP only — the main server above is untouched
 * either way, so Ingress (which speaks plain HTTP to this app, like every
 * app) is never at risk from this option. Home Assistant's own shared
 * certificate lives in the `ssl` folder every app that asks for it gets
 * mounted at `/ssl` (`config.yaml`'s `map`); `ssl_cert`/`ssl_key` name files
 * there, or may be absolute paths. `FPS_SSL_DIR` overrides `/ssl` for
 * development and tests, where that folder doesn't exist. */
function loadTlsCredentials() {
  if (!OPTIONS.ssl_cert || !OPTIONS.ssl_key) return null;
  const sslDir = process.env.FPS_SSL_DIR || '/ssl';
  const resolve = (name) => (path.isAbsolute(name) ? name : path.join(sslDir, name));
  try {
    return { cert: fs.readFileSync(resolve(OPTIONS.ssl_cert)), key: fs.readFileSync(resolve(OPTIONS.ssl_key)) };
  } catch (e) {
    log('error', `could not read TLS cert/key (${e.message}) — MCP stays HTTP-only on :${PORT}`);
    return null;
  }
}

store.init().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    log('info', `listening on :${PORT}`);
    log('info', `data dir  ${store.dataDir()}`);
    log('info', `HA mode   ${ha.mode()}${ha.isConfigured() ? '' : ' (no credentials — entity picker will be empty)'}`);
    log('info', "Home Assistant access is read-only by construction (this process; the generated dashboard card calls services as its viewer).");
    log('info', OPTIONS.mcp_enabled === false
      ? 'MCP       disabled (mcp_enabled: false)'
      : `MCP       http://<this-host>:${PORT}/mcp — install_dashboard ${OPTIONS.mcp_allow_dashboard_install === true ? 'enabled' : 'disabled'}`);
  });

  if (OPTIONS.mcp_enabled !== false) {
    const tls = loadTlsCredentials();
    if (tls) {
      const sslPort = Number(OPTIONS.mcp_ssl_port) || 8443;
      https.createServer(tls, (req, res) => mcpRequestHandler(req, res)).listen(sslPort, '0.0.0.0', () => {
        log('info', `MCP (TLS) https://<this-host>:${sslPort}/mcp — nothing else is served on this port`);
      });
    }
  }
}).catch((e) => {
  console.error('[floorplan-studio] failed to start:', e);
  process.exit(1);
});
