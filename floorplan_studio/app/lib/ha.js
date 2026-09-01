/**
 * Home Assistant client — READ-ONLY BY CONSTRUCTION.
 *
 * There is exactly one request function here and it hardcodes `method: 'GET'`.
 * No service-call helper exists, so no future edit to a caller can accidentally
 * turn something on. If write access is ever wanted it has to be added here
 * deliberately, in a diff that is obvious in review.
 *
 * Two credential sources:
 *   app  SUPERVISOR_TOKEN -> http://supervisor/core/api      (needs homeassistant_api: true)
 *   dev     HA_URL + HA_TOKEN from the environment or FPS_ENV_FILE
 * The token is never logged, never returned to the browser, and never written
 * into any saved document.
 */

const fs = require('fs');

function fromEnvFile() {
  const file = process.env.FPS_ENV_FILE;
  if (!file || !fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const envFile = fromEnvFile();
const SUPERVISOR_TOKEN = process.env.SUPERVISOR_TOKEN || '';
const DEV_URL = (process.env.HA_URL || envFile.HA_URL || '').replace(/\/$/, '');
const DEV_TOKEN = process.env.HA_TOKEN || envFile.HA_TOKEN || '';

const MODE = SUPERVISOR_TOKEN ? 'supervisor' : (DEV_URL && DEV_TOKEN ? 'dev' : 'offline');
const BASE = SUPERVISOR_TOKEN ? 'http://supervisor/core/api' : `${DEV_URL}/api`;
const TOKEN = SUPERVISOR_TOKEN || DEV_TOKEN;

/* The ONLY attributes that ever leave this module.
 *
 * An allowlist, not a denylist, and that is the whole point: /api/states
 * includes person.* and device_tracker.* entries carrying latitude, longitude
 * and gps_accuracy. A denylist would leak the next sensitive attribute someone
 * adds; an allowlist cannot. Everything here is needed to PAINT a marker. */
const SAFE_ATTRS = [
  'friendly_name', 'device_class', 'unit_of_measurement',
  'brightness', 'rgb_color', 'hs_color', 'color_temp_kelvin', 'color_mode',
  'percentage', 'temperature', 'current_temperature', 'hvac_action',
];

/* Domains whose location data has no business in a drawing tool. Dropped
 * wholesale rather than filtered, so they cannot appear even by accident. */
const EXCLUDED_DOMAINS = new Set(['person', 'device_tracker', 'zone']);

function redact(entry) {
  const attrs = {};
  for (const key of SAFE_ATTRS) {
    if (entry.attributes && entry.attributes[key] !== undefined) attrs[key] = entry.attributes[key];
  }
  return {
    entity_id: entry.entity_id,
    domain: entry.entity_id.split('.')[0],
    name: (entry.attributes && entry.attributes.friendly_name) || entry.entity_id.split('.')[1].replace(/_/g, ' '),
    state: entry.state,
    attributes: attrs,
  };
}

function get(pathname) {
  if (MODE === 'offline') return Promise.reject(new Error('no Home Assistant credentials configured'));
  const url = `${BASE}${pathname}`;
  return fetch(url, {
    method: 'GET', // read-only: see the module header
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`GET ${pathname} -> ${res.status}`);
    return res.json();
  });
}

let cache = { at: 0, list: null };

async function entities(ttlMs, force) {
  const now = Date.now();
  if (!force && cache.list && now - cache.at < ttlMs) return cache.list;
  const raw = await get('/states');
  const list = raw
    .filter((e) => !EXCLUDED_DOMAINS.has(e.entity_id.split('.')[0]))
    .map(redact)
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  cache = { at: now, list };
  return list;
}

async function stateMap(ttlMs) {
  const list = await entities(ttlMs, false);
  const map = {};
  for (const e of list) map[e.entity_id] = { state: e.state, attributes: e.attributes };
  return map;
}

module.exports = {
  mode: () => MODE,
  isConfigured: () => MODE !== 'offline',
  entities,
  stateMap,
  SAFE_ATTRS,
  /* Credentials for `ha-write.js`, which needs a WebSocket rather than the
   * `fetch` above and so cannot reuse `request()`. Exposing them does NOT make
   * this module writable: there is still exactly one request function here and
   * it is still `method: 'GET'`. Everything that can write lives in the one
   * file named for it, which is the property worth keeping — a reviewer only
   * has to read `ha-write.js` to know everything this app can change.
   *
   * The token is still never logged, never sent to the browser, and never
   * written into a saved document. */
  baseUrl: () => BASE,
  token: () => TOKEN,
};
