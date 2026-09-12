/**
 * external-auth.js — the one door for callers who are NOT inside Ingress.
 *
 * Two surfaces reach this app from outside the Home Assistant frontend: `/mcp`
 * (an AI client) and `/app-api` (a phone or other headless client). They are
 * different callers that happen to share a listener, so they share this module
 * rather than each growing their own idea of who is allowed in.
 *
 * ## What a caller presents, and what it proves
 *
 * A Home Assistant access token, and nothing else. There is no secret this app
 * generates, stores, rotates or can leak — the token is the user's own, checked
 * against Home Assistant itself, and revoking it there revokes access here in
 * the same instant.
 *
 * Two questions get asked, and they are genuinely different:
 *
 *   `tokenStatus` — is this a valid token? One cheap GET against Home
 *                   Assistant's own API. Enough to READ.
 *   `principal`   — WHO is this? Home Assistant's `auth/current_user` over its
 *                   WebSocket, as the caller, returning id/name/is_admin.
 *                   Required to WRITE.
 *
 * The second is asked over the caller's OWN token deliberately. Resolving the
 * user with this app's supervisor credential would tell us who they claim to
 * be rather than who Home Assistant says they are, and would let the add-on's
 * privileges stand in for the caller's — the exact thing the contract forbids.
 *
 * ## Where they are asked
 *
 * Of Core itself — `ha.coreUrl()`, `http://homeassistant:8123` in an installed
 * app — and NOT of the `http://supervisor/core` proxy `ha.js` reads through.
 * That proxy admits app tokens only, so it refused every user's token however
 * valid: on a real install MCP answered 401 to everyone, while every check in
 * the suite passed against an injected fetch that never went near Supervisor.
 *
 * Asking Core directly adds a third answer — Home Assistant could not be asked
 * — and it is a 503, never a 401. Telling somebody their good token is bad
 * sends them off to make a new one, which cannot help.
 *
 * ## What is cached, and what is never cached
 *
 * A SHA-256 fingerprint of the token, never the token. The cache maps that
 * fingerprint to a result for a short TTL. Nothing here logs a token, returns
 * one, or writes one to disk, and a write revalidates even when a read for the
 * same caller was served from cache a moment earlier.
 */

'use strict';

const crypto = require('crypto');
const ha = require('./ha');
const haWrite = require('./ha-write');

/* Short enough that revoking a token in Home Assistant takes effect in about a
 * minute, long enough that a client polling a floor bundle is not re-validating
 * on every request. */
const TOKEN_TTL_MS = 60 * 1000;
const PRINCIPAL_TTL_MS = 60 * 1000;

/* A token is a credential, so it is never a map key. The fingerprint is one
 * way: it identifies a repeat caller without the cache being worth stealing. */
function fingerprint(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

const tokenCache = new Map();
const principalCache = new Map();

function cached(map, key, ttl) {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit;
  if (hit) map.delete(key);
  return null;
}

/* Bounded, so a stream of distinct bad tokens cannot grow the process. Oldest
 * first — insertion order is good enough for a cache this small. */
function remember(map, key, value) {
  map.set(key, Object.assign({ at: Date.now() }, value));
  if (map.size > 512) map.delete(map.keys().next().value);
}

function bearerFrom(req) {
  const h = req && req.headers && req.headers.authorization;
  const m = /^Bearer\s+(.+)$/i.exec(h || '');
  return m ? m[1].trim() : null;
}

const UNREACHABLE_LOG_MS = 60 * 1000;
let lastUnreachableLog = 0;

function unavailableMessage() {
  return `Could not reach Home Assistant at ${ha.coreUrl()} to check that credential. The app log says why.`;
}

/* Logged here because this is the only place that knows, and at most once a
 * minute so a client retrying in a loop cannot bury everything else. The line
 * names the address and the reason, and nothing about the caller. */
function logUnreachable(detail) {
  const now = Date.now();
  if (now - lastUnreachableLog < UNREACHABLE_LOG_MS) return;
  lastUnreachableLog = now;
  let hint = '';
  if (/\b403\b/.test(detail)) hint = ' Home Assistant answers 403 to an address it has banned after failed logins (ip_bans.yaml).';
  else if (ha.mode() === 'supervisor') hint = ' Core serving HTTPS itself, or on a port other than 8123, is not supported for this check yet.';
  console.log(`[floorplan-studio] warning: could not reach Home Assistant at ${ha.coreUrl()} to check an external caller (${detail}); /mcp and the headless endpoints answer 503 until it can.${hint}`);
}

/* Is this token valid? Asked of Home Assistant, never decided here.
 *
 * 'valid', 'invalid' or 'unreachable'. Only Home Assistant's own 401 means
 * invalid; a 403 from its ban list, or a 404 or 5xx from something that is not
 * Core, says nothing about the token. 'unreachable' is never cached, so the
 * first request after Core comes back is answered properly.
 *
 * Offline development has no Home Assistant to ask, so there is nothing to
 * check against and nothing local worth protecting — the same allowance
 * `mcp.js` has always made, kept identical here so the two surfaces cannot
 * disagree about what "offline" means. */
async function tokenStatus(token, fetchImpl) {
  if (ha.mode() === 'offline') return 'valid';
  if (!token) return 'invalid';
  const key = fingerprint(token);
  const hit = cached(tokenCache, key, TOKEN_TTL_MS);
  if (hit) return hit.ok ? 'valid' : 'invalid';
  const f = fetchImpl || fetch;
  let res;
  try {
    res = await f(`${ha.coreUrl()}/api/`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
  } catch (e) {
    logUnreachable((e && e.cause && e.cause.code) || (e && e.name === 'TimeoutError' ? 'timed out' : String((e && e.message) || e)));
    return 'unreachable';
  }
  if (res && res.ok) { remember(tokenCache, key, { ok: true }); return 'valid'; }
  if (res && res.status === 401) { remember(tokenCache, key, { ok: false }); return 'invalid'; }
  logUnreachable(`HTTP ${res ? res.status : 'no response'}`);
  return 'unreachable';
}

/* Core's own WebSocket, for the reason `tokenStatus` asks Core's own REST API:
 * Supervisor's WebSocket proxy answers anything but an app token with
 * `auth_invalid`. Even if it did not, it authenticates upstream as Supervisor,
 * so `auth/current_user` would name Supervisor rather than the caller. */
function coreWebSocketUrl() {
  return ha.coreUrl().replace(/^http/, 'ws') + '/api/websocket';
}

/* WHO is this token? `auth/current_user` over Home Assistant's WebSocket, as
 * the caller. Returns null when the token cannot be resolved rather than
 * throwing, so a caller that is merely unauthenticated is not an exception.
 *
 * Offline development returns an admin, because offline mode has already
 * decided there is no Home Assistant to be a user of; a developer running the
 * app with no credentials is not a privilege boundary worth inventing. */
async function principal(token, opts) {
  const o = opts || {};
  if (ha.mode() === 'offline') {
    return { id: 'offline', name: 'Offline development', is_admin: true, is_owner: false, offline: true };
  }
  if (!token) return null;
  const key = fingerprint(token);
  const hit = cached(principalCache, key, PRINCIPAL_TTL_MS);
  if (hit) return hit.user;

  let session = null;
  try {
    session = await haWrite.connect({ token, url: o.url || coreWebSocketUrl(), WebSocket: o.WebSocket });
    const me = await session.send({ type: 'auth/current_user' });
    const user = me && me.id ? {
      id: String(me.id),
      name: String(me.name || ''),
      is_admin: me.is_admin === true,
      is_owner: me.is_owner === true,
    } : null;
    remember(principalCache, key, { user });
    return user;
  } catch (e) {
    /* A token Home Assistant will not authenticate is not an error condition
     * for us — it is an unauthenticated caller, which every route already
     * knows how to answer. */
    return null;
  } finally {
    if (session) session.close();
  }
}

/* One call for a route to make: valid token AND, when `requireAdmin`, an
 * account Home Assistant says is an admin.
 *
 * Returns a plain outcome rather than throwing, because "who are you" has more
 * than two answers and a route needs to tell them apart: no token at all, a
 * token Home Assistant rejects, and a real user without the rights for this
 * particular request are three different replies. */
async function authorize(req, opts) {
  const o = opts || {};
  const token = bearerFrom(req);
  if (!token) return { ok: false, status: 401, code: 'auth_required', message: 'Present a Home Assistant access token as a Bearer credential.' };
  const state = await tokenStatus(token, o.fetchImpl);
  if (state === 'unreachable') return { ok: false, status: 503, code: 'auth_unavailable', message: unavailableMessage() };
  if (state !== 'valid') return { ok: false, status: 401, code: 'auth_invalid', message: 'Home Assistant did not recognise that token.' };
  if (!o.requireAdmin) {
    /* A read does not need to know WHO, only that Home Assistant vouches for
     * the token — one HTTP round trip instead of a WebSocket handshake. */
    return { ok: true, token, user: null };
  }
  const user = await principal(token, o);
  if (!user) return { ok: false, status: 401, code: 'auth_invalid', message: 'That token could not be resolved to a Home Assistant user.' };
  if (!user.is_admin) {
    return { ok: false, status: 403, code: 'admin_required', message: 'This operation is limited to Home Assistant administrators.' };
  }
  return { ok: true, token, user };
}

/* Failed authentication is rate limited per source address. Not a defence
 * against a determined attacker — the token check itself is that — but it
 * stops a broken or hostile client turning this app into a machine that asks
 * Home Assistant to validate a thousand guesses a second. */
const failures = new Map();
const FAIL_WINDOW_MS = 60 * 1000;
const FAIL_LIMIT = 20;

function noteFailure(addr) {
  const now = Date.now();
  const rec = failures.get(addr);
  if (!rec || now - rec.at > FAIL_WINDOW_MS) { failures.set(addr, { n: 1, at: now }); return; }
  rec.n += 1;
  if (failures.size > 1024) failures.delete(failures.keys().next().value);
}

function tooManyFailures(addr) {
  const rec = failures.get(addr);
  if (!rec) return false;
  if (Date.now() - rec.at > FAIL_WINDOW_MS) { failures.delete(addr); return false; }
  return rec.n >= FAIL_LIMIT;
}

/* Tests only: the caches are process-lifetime and would otherwise carry a
 * previous case's answer into the next one. */
function _reset() {
  tokenCache.clear();
  principalCache.clear();
  failures.clear();
  lastUnreachableLog = 0;
}

module.exports = {
  bearerFrom, tokenStatus, unavailableMessage, principal, authorize, fingerprint,
  noteFailure, tooManyFailures, _reset,
  TOKEN_TTL_MS, FAIL_LIMIT,
};
