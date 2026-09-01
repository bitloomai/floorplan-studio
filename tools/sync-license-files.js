#!/usr/bin/env node
/**
 * Keep the app build-context copies of the repository notices in sync.
 *
 *   node tools/sync-license-files.js          copy root -> floorplan_studio/
 *   node tools/sync-license-files.js --check  verify only
 *
 * The root files are canonical because GitHub discovers LICENSE there. The
 * copies are committed because Home Assistant and a direct `docker build .`
 * use floorplan_studio/ as the complete build context; Docker cannot COPY a
 * parent path. This script makes that packaging constraint one-source to edit
 * even though the final repository necessarily contains both distributions.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'floorplan_studio');
const FILES = ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'];
const check = process.argv.includes('--check');

let differences = 0;
for (const name of FILES) {
  const source = path.join(ROOT, name);
  const target = path.join(APP, name);
  if (!fs.existsSync(source)) {
    console.error(`Missing canonical file: ${source}`);
    process.exitCode = 1;
    continue;
  }

  const wanted = fs.readFileSync(source);
  const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
  if (current && Buffer.compare(wanted, current) === 0) continue;

  differences++;
  if (check) {
    console.error(`Out of sync: floorplan_studio/${name}`);
  } else {
    fs.copyFileSync(source, target);
    console.log(`Synced floorplan_studio/${name}`);
  }
}

if (check && differences) {
  console.error('\nRun `npm run sync:licenses` after editing a root notice.');
  process.exitCode = 1;
} else if (check) {
  console.log('App licence and notice copies match the canonical root files.');
} else if (!differences) {
  console.log('App licence and notice copies are already current.');
}

