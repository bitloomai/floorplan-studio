#!/usr/bin/env node
/**
 * rasterize.js — turn an SVG into a PNG using the Edge/Chrome already on this
 * machine, so the repository keeps its zero-dependency rule.
 *
 *   node tools/rasterize.js in.svg out.png [width] [height]
 *
 * There is no SVG rasteriser in Node's standard library and adding one would
 * mean a dependency, which this project does not take. A browser is already
 * installed on every machine that can look at the help site, and headless
 * Chromium's `--screenshot` is a complete, colour-managed renderer — the same
 * engine that will draw the dashboard card for real.
 *
 * The page wrapper matters. Handing the SVG to `--screenshot` directly lets the
 * browser letterbox it against a white page at its own idea of a size; an
 * explicit host page with zero margin and the image at exact pixel dimensions
 * makes the output deterministic, which is the whole point when the frames are
 * about to be diffed into an animation.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

function findBrowser() {
  for (const c of CANDIDATES) if (fs.existsSync(c)) return c;
  if (process.env.FPS_BROWSER && fs.existsSync(process.env.FPS_BROWSER)) return process.env.FPS_BROWSER;
  throw new Error('no Edge or Chrome found; set FPS_BROWSER to a browser executable');
}

function rasterize(svgPath, pngPath, width, height) {
  const browser = findBrowser();
  const svg = fs.readFileSync(svgPath, 'utf8');
  /* Pull the intrinsic size out of the document when none was given. */
  if (!width || !height) {
    const m = /\bviewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
      || /\bwidth="([\d.]+)"[\s\S]{0,40}?height="([\d.]+)"/.exec(svg);
    width = Math.round(Number((m && m[1]) || 1200));
    height = Math.round(Number((m && m[2]) || 900));
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fps-raster-'));
  const host = path.join(work, 'page.html');
  const copy = path.join(work, 'image.svg');
  fs.copyFileSync(svgPath, copy);
  fs.writeFileSync(host, `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}
img{display:block;width:${width}px;height:${height}px}</style>
<img src="image.svg" alt="">`);
  if (fs.existsSync(pngPath)) fs.rmSync(pngPath);
  try {
    /* `--no-first-run` and `--no-default-browser-check` are not politeness:
     * without them Edge on a machine that already has a signed-in profile
     * hands the URL to the RUNNING instance and exits immediately. */
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--no-first-run', '--no-default-browser-check',
      '--force-device-scale-factor=1',
      `--window-size=${width},${height}`,
      `--screenshot=${pngPath}`,
      `--user-data-dir=${path.join(work, 'profile')}`,
      'file:///' + host.replace(/\\/g, '/'),
    ], { stdio: 'pipe', timeout: 180000 });
  } catch (e) {
    /* Deliberately not fatal. Edge exits non-zero, or exits instantly having
     * forked the work to another process, on machines where it is already
     * running — and in both cases the screenshot still lands. The file is the
     * only evidence worth trusting, so it is what we wait for. */
  }

  /* Wait for the PNG rather than for the process.
   *
   * This is the whole reason the first version of this file produced a 26 KB
   * "File not found" page: `execFileSync` returned as soon as the launcher
   * handed off, the `finally` below deleted the host page, and the browser that
   * was still starting up then screenshotted its own error page. Poll until the
   * file exists AND has stopped growing, so a partially flushed PNG is never
   * handed back as a finished frame. */
  const deadline = Date.now() + 90000;
  let size = -1; let stable = 0;
  while (Date.now() < deadline) {
    const now = fs.existsSync(pngPath) ? fs.statSync(pngPath).size : -1;
    if (now > 0 && now === size) {
      if (++stable >= 3) break;
    } else stable = 0;
    size = now;
    /* A short synchronous sleep; this is a build tool, not a server. */
    try { execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},120)'], { stdio: 'ignore' }); }
    catch (e) { /* the sleep failing is not a reason to fail the render */ }
  }
  fs.rmSync(work, { recursive: true, force: true });
  if (!fs.existsSync(pngPath)) throw new Error('the browser produced no screenshot');
  const bytes = fs.statSync(pngPath).size;
  /* An error page compresses to a few tens of KB of flat white. A real plan
   * never does, so this catches the failure that otherwise looks like success. */
  if (bytes < 40000) throw new Error(`the screenshot is only ${bytes} bytes — the browser probably rendered an error page`);
  return { width, height, bytes };
}

module.exports = { rasterize, findBrowser };

if (require.main === module) {
  const [inSvg, outPng, w, h] = process.argv.slice(2);
  if (!inSvg || !outPng) {
    console.error('usage: node tools/rasterize.js in.svg out.png [width] [height]');
    process.exit(2);
  }
  const r = rasterize(path.resolve(inSvg), path.resolve(outPng), Number(w) || 0, Number(h) || 0);
  console.log(`${outPng}  ${r.width}x${r.height}  ${(r.bytes / 1024).toFixed(0)} KB`);
}
