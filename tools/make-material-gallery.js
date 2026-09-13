#!/usr/bin/env node
'use strict';
/* Every swatch uses the production generator at the same physical scale.
 * A curated sheet introduces the range; the full gallery omits nothing. */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'floorplan_studio/app');
const flooring = require(path.join(APP, 'defaults/flooring.json'));
const theme = require(path.join(APP, 'defaults/themes.json')).themes.frosted.plan;
const Fl = require(path.join(APP, 'lib/flooring'));
const Shapes = require(path.join(APP, 'lib/shapes'));
const { nodeToSvg } = require(path.join(APP, 'lib/plan-scene'));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function swatch(key) {
  const scale = 24, width = 8 * scale, height = 6 * scale;
  const P = { X: x => x * scale, Y: y => y * scale, S: x => x * scale };
  const r = Fl.build(flooring, key, P, { theme, bounds: { x0: 0, y0: 0, x1: 8, y1: 6 } });
  if (r.error) throw Error(r.error);
  const clip = 'swatch-' + key;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(flooring.types[key].label)}"><defs>${r.defs.map(nodeToSvg).join('')}<clipPath id="${clip}"><rect width="${width}" height="${height}"/></clipPath></defs><g clip-path="url(#${clip})"><rect width="${width}" height="${height}" fill="${esc(r.fill)}"/>${r.nodes.map(nodeToSvg).join('')}</g></svg>`;
}

const groups = [...new Set(Object.values(flooring.types).map(t => t.group))];
const figures = groups.map(group => `<section><h2>${esc(group)}</h2><div class="grid">${Object.entries(flooring.types).filter(([, t]) => t.group === group).map(([key, t]) => `<figure>${swatch(key)}<figcaption><strong>${esc(t.label)}</strong><code>${key}</code><small>${esc(t.generator)} · approximate reflectance ${Math.round(t.reflectance * 100)}%</small></figcaption></figure>`).join('')}</div></section>`).join('');
const schemeGroups = [...new Set(Object.values(Shapes.SCHEMES).map(s => s.group))];
const palettes = schemeGroups.map(group => `<section><h3>${esc(group)}</h3><div class="grid">${Object.entries(Shapes.SCHEMES).filter(([, s]) => s.group === group).map(([key, s]) => `<figure><div class="palette" aria-label="Body, trim, detail, live">${['fill', 'line', 'glyph', 'accent'].map(k => `<span style="background:${s[k]}" title="${k}: ${s[k]}"></span>`).join('')}</div><figcaption><strong>${esc(s.label)}</strong><code>${key}</code><small>Body / trim / detail / live</small></figcaption></figure>`).join('')}</div></section>`).join('');
const body = '<div class="wrap page material-gallery" id="material-gallery"><h1>Material gallery</h1><p class="lede">' + Object.keys(flooring.types).length + ' floor finishes and ' + Object.keys(Shapes.SCHEMES).length + ' item colour schemes, drawn by the framework itself.</p><p>Every floor swatch covers 8 × 6 feet at the same scale. These are stylised plan materials; reflectance values are adjustable model estimates.</p><nav class="page-toc glass"><a href="#floor-materials">Floor finishes</a><a href="#schemes">Furniture &amp; device colours</a></nav><div id="floor-materials">' + figures + '</div><section id="schemes"><h2>Furniture, fixture &amp; device colours</h2><p>Apply a material palette independently of shape. Duplicate a stock scheme to make a project-owned version.</p>' + palettes + '</section></div>';

const selected = ['oak_honey', 'parquet_walnut_chevron', 'parquet_oak_basket', 'marble_calacatta', 'marble_nero', 'terrazzo_blush', 'hex_sage', 'cement_indigo', 'sisal_natural', 'porcelain_greige', 'paver_clay_red', 'deck_weathered'];
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="690" viewBox="0 0 960 690" font-family="system-ui,sans-serif"><rect width="960" height="690" rx="18" fill="#f5f2ea"/><text x="32" y="40" font-size="13" letter-spacing="2" fill="#46645a">FLOORPLAN STUDIO / MATERIAL STUDIES</text><text x="32" y="80" font-size="30" fill="#253c3a">Materials with their own character.</text><text x="32" y="108" font-size="14" fill="#66736b">${Object.keys(flooring.types).length} finishes · shared renderer · every swatch shows 8 × 6 feet</text>${selected.map((key, i) => {
  const x = 32 + i % 4 * 228, y = 136 + Math.floor(i / 4) * 180;
  return `<g transform="translate(${x} ${y})">${swatch(key).replace('<svg ', '<svg width="212" height="144" ')}<text y="166" font-size="12" fill="#253c3a">${esc(flooring.types[key].label)}</text></g>`;
}).join('')}</svg>`;
module.exports = { body };
if (require.main === module) {
let drift = false;
for (const [name, contents] of [['flooring-materials.svg', sheet]]) {
  const file = path.join(ROOT, 'docs', name);
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== contents) { console.error(name + ' needs regeneration'); drift = true; }
  } else fs.writeFileSync(file, contents);
}
if (drift) process.exitCode = 1;
else console.log(`Material gallery: ${Object.keys(flooring.types).length} finishes, ${Object.keys(Shapes.SCHEMES).length} schemes.`);

}
