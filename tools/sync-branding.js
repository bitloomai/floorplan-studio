#!/usr/bin/env node
'use strict';
// Package canonical branding for the editor; relative URLs also work in Ingress.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const assets = [
  ['branding/icon.svg', 'floorplan_studio/app/public/icon.svg'],
  ['floorplan_studio/icon.png', 'floorplan_studio/app/public/icon.png'],
];
for (const [source, output] of assets) {
  const bytes = fs.readFileSync(path.join(root, source));
  const target = path.join(root, output);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || !bytes.equals(fs.readFileSync(target))) {
      throw new Error(output + ' has drifted; run node tools/sync-branding.js');
    }
  } else fs.writeFileSync(target, bytes);
}
console.log('Editor branding matches its source assets.');
