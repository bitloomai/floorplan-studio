#!/usr/bin/env node
/* Dev launcher — NOT used inside the app (the distroless image starts
 * app/server.js directly). This only supplies the environment the Supervisor would
 * otherwise provide, so the editor can run on a workstation.
 *
 * SELF-CONTAINED BY DESIGN. Nothing here reaches into a parent directory:
 *
 *   FPS_DATA_DIR      app/data        working state (app: /data)
 *   FPS_FIXTURES_DIR  fixtures        the test house, in this builder's schema
 *   FPS_ENV_FILE      .env HERE       HA_URL / HA_TOKEN, if you want live entities
 *   FPS_LEGACY_DIR    unset           only for importing someone else's old specs
 *
 * To give it read-only Home Assistant access, put a .env NEXT TO THIS FILE:
 *
 *   HA_URL=http://homeassistant.local:8123
 *   HA_TOKEN=<long-lived token>
 *
 * That file is this app's own; it is never read from anywhere else. Without
 * it the editor still runs — the entity picker just falls back to typing ids by
 * hand, which is the intended offline path.
 */
const path = require('path');
const fs = require('fs');

const here = __dirname;
/* The app is a folder in this repository, not the repository — Supervisor
 * reads `repository.yaml` at the root and installs `floorplan_studio/`. So the
 * app's own paths hang off the app folder, while `fixtures/` stays at the
 * root: it is development material and is deliberately not shipped. */
const addon = path.join(here, 'floorplan_studio');

process.env.FPS_DATA_DIR = process.env.FPS_DATA_DIR || path.join(addon, 'app', 'data');
process.env.FPS_FIXTURES_DIR = process.env.FPS_FIXTURES_DIR || path.join(here, 'fixtures');
process.env.FPS_PORT = process.env.FPS_PORT || process.env.PORT || '8099';

const localEnv = path.join(here, '.env');
if (!process.env.FPS_ENV_FILE && fs.existsSync(localEnv)) process.env.FPS_ENV_FILE = localEnv;

if (!process.env.HA_TOKEN && !process.env.FPS_ENV_FILE) {
  console.log('[floorplan-studio] no .env here and no HA_TOKEN set — running offline.');
  console.log('[floorplan-studio] the editor works fully; entity ids are typed rather than picked.');
}

require('./floorplan_studio/app/server.js');
