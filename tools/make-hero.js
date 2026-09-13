#!/usr/bin/env node
/**
 * make-hero.js — the README's lead animation, filmed from the real dashboard.
 *
 *   node tools/make-hero.js                 film, then encode docs/hero.{mp4,webp}
 *   node tools/make-hero.js --stills 0,240  write those frames as PNGs to docs/frames/
 *   node tools/make-hero.js --encode        re-encode from the last filming
 *
 * Needs Edge or Chrome, and ffmpeg on PATH (or FPS_FFMPEG). Both are build
 * tools for this one picture; nothing the app runs depends on either.
 *
 * ## What is on screen, and why it is not a mockup
 *
 * A desktop window and a phone, side by side, each showing `docs/demo/` — the
 * help site's live demo, which is the card bundle `card-build.js` installs into
 * Home Assistant, built from the invented house in `make-showcase.js` and run
 * against the stand-in Home Assistant in `demo-hass.js`. Both screens share one
 * house, so a scene run on the phone lands on the desktop plan.
 *
 * Every tap in the film is a pointer event delivered to the element a finger
 * would have hit, so it runs the card's own handlers. The captions, the clock,
 * the cursor and the frames around the screens are the only things drawn here.
 *
 * ## Why the clock is virtual
 *
 * Capturing a frame takes far longer than a thirtieth of a second. With real
 * time a fan would jump a quarter turn between frames and a sheet would have
 * finished arriving before it was photographed. So both screens run on
 * `FpsDemo.clock.useVirtualTime`: each frame advances their timers and their
 * CSS animations by exactly one frame, and the house clock by whatever the
 * storyboard says — a whole morning in seven seconds, or one minute in one.
 *
 * ## Why Chrome DevTools Protocol over a WebSocket
 *
 * `rasterize.js` launches a browser per picture, which is fine for eight frames
 * and hopeless for eight hundred. One headless browser, driven over its
 * debugging socket with Node's built-in WebSocket, takes a screenshot in a
 * fraction of a second and keeps the page — and its state — between frames.
 * No dependency: the protocol is JSON messages.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const FRAMES = path.join(DOCS, 'frames');
const MASTER = path.join(FRAMES, 'hero-master.mkv');
const { findBrowser } = require('./rasterize.js');
const aria = require('./make-showcase.js');

const FPS = 30;
const STAGE = { w: 1600, h: 900 };
const SCALE = 1.5;                      // device pixels per CSS pixel while filming

/* ------------------------------------------------------------ storyboard */

/* The house clock at each moment of the film; linear between. */
const CLOCK = [
  [0, '06:05'], [1.0, '06:15'], [8.0, '17:25'], [10.5, '17:56'],
  [19.6, '18:05'], [23.6, '22:38'], [28.6, '22:44'],
];

const itemId = (entity) => aria.floor.items.find((i) => i.entity === entity).id;

/* Taps. `view` is which screen, `card` which card on it (0 house, 1 plan),
 * `css` the element, `text` to pick one of several by its label. */
const TAPS = [
  { at: 10.9, view: 'desktop', card: 1, css: `.fps-hit[data-target="item"][data-id="${itemId('light.demo_dining_pendant')}"]` },
  { at: 11.9, view: 'desktop', card: 1, css: `.fps-hit[data-target="item"][data-id="${itemId('light.demo_terrace')}"]` },
  { at: 13.3, view: 'phone', card: 1, css: '.fps-hit[data-target="chip"][data-id="living"]' },
  { at: 15.0, view: 'phone', card: 1, css: '.fps-tile', text: 'Movie night' },
  { at: 17.1, view: 'phone', card: 1, css: '.fps-btn[data-action="close"]' },
  { at: 18.0, view: 'desktop', card: 1, css: '.fps-zoomctl button[aria-label="Zoom in"]' },
  { at: 18.7, view: 'desktop', card: 1, css: '.fps-zoomctl button[aria-label="Zoom in"]' },
  { at: 20.0, view: 'desktop', card: 1, css: '.fps-zoom-fit' },
  { at: 24.7, view: 'desktop', card: 0, css: '.fps-chip-action', text: 'Goodnight' },
];

const CAPTIONS = [
  [0.0, 3.8, 'Your home, drawn once', 'Floorplan Studio turns the plan into a live Home Assistant dashboard.'],
  [3.8, 7.9, 'Daylight from the real sun', 'Solar position through every window, the weather and the blinds — sunrise to dusk.'],
  [7.9, 10.7, 'Who is home, and what is on', 'People, counts and live readings on the house card: solar, battery, the washer mid-cycle.'],
  [10.7, 13.1, 'Tap a lamp and it switches', 'The plan answers at once, then confirms against Home Assistant.'],
  [13.1, 17.7, 'Every room has its popup', 'Lights, devices, and the scenes and scripts named after the room — found by themselves.'],
  [17.7, 20.3, 'Zoom in like a map', 'Pinch, scroll, or − and +. The whole floor always fits the screen.'],
  [20.3, 24.5, 'Light pools where the lamps hang', 'Wattage, reach and the night — drawn by the same renderer as the editor.'],
  [24.5, 26.4, 'Goodnight', 'One tap on the house card. What a scene does is yours to decide.'],
];
const END = { from: 26.4, title: 'Floorplan Studio', line: 'Draw your home. Bind it to Home Assistant. Get a live dashboard.',
  small: 'An app for Home Assistant · alpha · Apache-2.0 · github.com/bitloomai/floorplan-studio' };
const DURATION = 28.6;

/* ----------------------------------------------------------------- stage */

function stageHtml() {
  const data = { FPS, CLOCK, TAPS, CAPTIONS, END, DURATION, date: aria.DEMO_LIFE.date };
  const logo = fs.readFileSync(path.join(ROOT, 'branding', 'icon.svg'), 'utf8');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${STAGE.w}px;height:${STAGE.h}px;overflow:hidden;background:#0b1220;
  font-family:"Segoe UI",Inter,-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.bg{position:absolute;inset:0;background:
  radial-gradient(1100px 650px at 18% -10%,rgba(56,110,190,.55),transparent 62%),
  radial-gradient(900px 620px at 105% 110%,rgba(120,80,190,.42),transparent 58%),
  linear-gradient(160deg,#0b1220,#131b2d)}
.win{position:absolute;left:40px;top:34px;width:1100px;height:770px;border-radius:14px;overflow:hidden;background:#eef1f5;
  box-shadow:0 30px 90px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.08)}
.chrome{height:30px;display:flex;align-items:center;gap:7px;padding:0 12px;background:#e4e8ee;border-bottom:1px solid #d3d9e1;
  font-size:12px;color:#5b6572}
.chrome i{width:11px;height:11px;border-radius:50%;display:block}
.chrome span{margin-left:10px}
.win iframe{display:block;width:1100px;height:740px;border:0}
.phone{position:absolute;left:1170px;top:34px;width:366px;height:808px;padding:12px;border-radius:54px;background:#07090f;
  box-shadow:0 30px 90px rgba(0,0,0,.55),inset 0 0 0 2px #2b3342}
.screen{position:relative;width:366px;height:808px;border-radius:42px;overflow:hidden;background:#eef1f5}
.screen iframe{position:absolute;left:0;top:0;width:390px;height:861px;border:0;transform:scale(${366 / 390});transform-origin:0 0}
.cap{position:absolute;left:46px;top:822px;width:880px;color:#fff}
.cap h1{margin:0;font-size:27px;line-height:1.15;font-weight:700;letter-spacing:-.012em}
.cap p{margin:4px 0 0;font-size:15.5px;color:#b8c3d7}
.clock{position:absolute;left:930px;top:822px;width:206px;text-align:right;color:#fff}
.clock b{display:block;font:650 30px/1.1 ui-monospace,"Cascadia Mono",Consolas,monospace;letter-spacing:.02em}
.clock small{font-size:13px;color:#b8c3d7}
.cursor{position:absolute;left:0;top:0;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;
  background:rgba(255,255,255,.28);border:2.5px solid #fff;box-shadow:0 3px 14px rgba(0,0,0,.35);opacity:0;z-index:5}
.ripple{position:absolute;left:0;top:0;border-radius:50%;border:3px solid #fff;opacity:0;z-index:5}
.end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
  background:radial-gradient(900px 520px at 50% 40%,#18243b,#0a0f1a);color:#fff;opacity:0;z-index:9;text-align:center}
.end svg{width:112px;height:112px}
.end h2{margin:6px 0 0;font-size:54px;letter-spacing:-.025em}
.end p{margin:0;font-size:22px;color:#c9d3e4}
.end small{margin-top:12px;font-size:15px;color:#8fa0bb}
</style></head><body>
<div class="bg"></div>
<div class="win"><div class="chrome"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
  <span>Home Assistant · ${aria.project.name}</span></div>
  <iframe id="desktop" src="/demo/index.html?capture&t=${CLOCK[0][1]}"></iframe></div>
<div class="phone"><div class="screen"><iframe id="phone" src="/demo/index.html?capture&t=${CLOCK[0][1]}"></iframe></div></div>
<div class="cap"><h1 id="capTitle"></h1><p id="capText"></p></div>
<div class="clock"><b id="clock"></b><small id="date"></small></div>
<div class="cursor" id="cursor"></div><div class="ripple" id="ripple"></div>
<div class="end" id="end">${logo.replace(/<\?xml[^>]*>/, '')}<h2>${END.title}</h2><p>${END.line}</p><small>${END.small}</small></div>
<script>
(function () {
  'use strict';
  var S = ${JSON.stringify(data)};
  var $ = function (id) { return document.getElementById(id); };
  var toMin = function (s) { var p = s.split(':').map(Number); return p[0] * 60 + p[1]; };
  var ymd = S.date.split('-').map(Number);
  var epoch = function (min) { return Date.UTC(ymd[0], ymd[1] - 1, ymd[2]) + min * 60000; };
  var clamp = function (v) { return Math.max(0, Math.min(1, v)); };
  var ease = function (x) { x = clamp(x); return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
  function houseAt(t) {
    for (var i = 1; i < S.CLOCK.length; i++) {
      var a = S.CLOCK[i - 1], b = S.CLOCK[i];
      if (t <= b[0]) return epoch(toMin(a[1]) + (toMin(b[1]) - toMin(a[1])) * (t - a[0]) / (b[0] - a[0]));
    }
    return epoch(toMin(S.CLOCK[S.CLOCK.length - 1][1]));
  }
  function screen(view) { var f = $(view); return { frame: f, win: f.contentWindow }; }
  function target(tap) {
    var s = screen(tap.view); var w = s.win;
    if (!w.demo) return null;
    var card = w.demo.cards[tap.card];
    var scope = card.shadowRoot;
    var list = [];
    var walk = function (root) { root.querySelectorAll(tap.css).forEach(function (el) { list.push(el); }); };
    walk(scope);
    var el = list.find(function (e) { return !tap.text || (e.textContent || '').trim().indexOf(tap.text) >= 0; });
    if (!el) return null;
    var c = w.FpsDemo.centreOf(el);
    var r = s.frame.getBoundingClientRect();
    var k = r.width / s.frame.offsetWidth;
    return { el: el, win: w, x: r.left + c.x * k, y: r.top + c.y * k };
  }
  var last = { x: 1000, y: 700 };
  var done = {};
  window.stage = {
    duration: S.DURATION, fps: S.FPS,
    ready: function () { return !!($('desktop').contentWindow.demo && $('phone').contentWindow.demo); },
    step: function (i) {
      var t = i / S.FPS, dt = 1000 / S.FPS;
      var views = ['desktop', 'phone'].map(screen);
      /* 1. taps due now */
      S.TAPS.forEach(function (tap, n) {
        if (done[n] || t < tap.at) return;
        done[n] = true;
        var hit = target(tap);
        if (hit) { hit.win.FpsDemo.press(hit.el); last = { x: hit.x, y: hit.y }; }
      });
      /* 2. the clocks */
      var fromHouse = views[0].win.FpsDemo.clock.now();
      var toHouse = houseAt(t);
      var lapse = Math.abs(toHouse - fromHouse) > dt * 5;
      views.forEach(function (v) { v.win.FpsDemo.clock.advance(dt, toHouse - v.win.FpsDemo.clock.now()); });
      /* 3. the house, and a repaint of each plan when the sun has moved */
      var house = window.FPS_SHARED_HOUSE;
      house.tick();
      views.forEach(function (v) {
        if (lapse) v.win.demo.cards[1]._sig = null;
        v.win.demo.push();
        v.win.FpsDemo.clock.syncAnimations();
      });
      /* 4. what is drawn round the screens */
      var cap = S.CAPTIONS.find(function (c) { return t >= c[0] && t < c[1]; });
      var cop = cap ? Math.min(clamp((t - cap[0]) / .35), clamp((cap[1] - t) / .35)) : 0;
      if (cap) { $('capTitle').textContent = cap[2]; $('capText').textContent = cap[3]; }
      document.querySelector('.cap').style.opacity = cop;
      var d = new Date(toHouse);
      $('clock').textContent = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
      $('date').textContent = 'the demo house · equinox';
      var next = S.TAPS.find(function (tap) { return t >= tap.at - .8 && t < tap.at + .55; });
      var cur = $('cursor'), rip = $('ripple');
      if (next) {
        var hit = target(next) || last;
        var p = ease((t - (next.at - .8)) / .6);
        var x = last.x + (hit.x - last.x) * p, y = last.y + (hit.y - last.y) * p;
        cur.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + (t >= next.at && t < next.at + .12 ? .82 : 1) + ')';
        cur.style.opacity = Math.min(clamp((t - (next.at - .8)) / .2), clamp((next.at + .55 - t) / .2));
        var r = (t - next.at) / .45;
        if (r >= 0 && r <= 1) {
          var size = 26 + 50 * r;
          rip.style.width = rip.style.height = size + 'px';
          rip.style.transform = 'translate(' + (hit.x - size / 2) + 'px,' + (hit.y - size / 2) + 'px)';
          rip.style.opacity = .85 * (1 - r);
        } else rip.style.opacity = 0;
        if (t >= next.at) last = { x: hit.x, y: hit.y };
      } else { cur.style.opacity = 0; rip.style.opacity = 0; }
      $('end').style.opacity = clamp((t - S.END.from) / .5);
      /* 5. let the night's bitmap and the paint land before the photograph */
      return new Promise(function (resolve) {
        setTimeout(function () { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); }, lapse ? 140 : 90);
      });
    },
  };
}());
</script></body></html>`;
}

/* ------------------------------------------------------------- the server */

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif' };

function serve(stage) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      if (url === '/__hero/stage.html') { res.writeHead(200, { 'content-type': TYPES['.html'] }); return res.end(stage); }
      const file = path.normalize(path.join(DOCS, url));
      if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

/* ------------------------------------------------------------- the browser */

async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fps-hero-'));
  const proc = spawn(findBrowser(), [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--force-color-profile=srgb', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    'about:blank',
  ], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 300 && !fs.existsSync(portFile); i++) await sleep(100);
  const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
  let page = null;
  for (let i = 0; i < 50 && !page; i++) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => []);
    page = list.find((t) => t.type === 'page');
    if (!page) await sleep(100);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    }
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
    return r.result.value;
  };
  const close = async () => {
    try { await send('Browser.close'); } catch (e) { /* already gone */ }
    ws.close();
    await sleep(500);
    try { proc.kill(); } catch (e) { /* gone */ }
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return { send, evaluate, close };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------------- ffmpeg */

function ffmpegPath() {
  if (process.env.FPS_FFMPEG) return process.env.FPS_FFMPEG;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch (e) {
    throw new Error('ffmpeg is not on PATH; install it or set FPS_FFMPEG');
  }
}

function encode() {
  const ff = ffmpegPath();
  const run = (args) => execFileSync(ff, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  const mp4 = path.join(DOCS, 'hero.mp4');
  const webp = path.join(DOCS, 'hero.webp');
  /* The video is for the help site and for sharing: full frame rate, sharp. */
  run(['-i', MASTER, '-vf', 'scale=1600:-2:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  /* The README cannot play a repository video, so it gets an animated image.
   * WebP rather than GIF, measured on this film: a GIF small enough to show
   * inline (860 px, 10 fps, 128 dithered colours) was 4.9 MB and banded the
   * night; the WebP at 1100 px and 15 fps is 2.7 MB in full colour. */
  run(['-i', MASTER, '-vf', 'fps=15,scale=1100:-1:flags=lanczos', '-c:v', 'libwebp_anim', '-lossless', '0',
    '-q:v', '75', '-compression_level', '6', '-loop', '0', webp]);
  /* What the help site's video shows before it plays: the lamp being tapped. */
  const poster = path.join(DOCS, 'hero-poster.webp');
  run(['-ss', '10.95', '-i', MASTER, '-frames:v', '1', '-vf', 'scale=1600:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', '82', poster]);
  for (const f of [mp4, webp, poster]) console.log(`  ${path.relative(ROOT, f)}  ${(fs.statSync(f).size / 1048576).toFixed(2)} MB`);
}

/* ------------------------------------------------------------------- main */

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--encode')) return encode();
  const stillsArg = argv.includes('--stills') ? argv[argv.indexOf('--stills') + 1] : null;
  const stills = stillsArg ? stillsArg.split(',').map(Number) : null;
  const total = Math.round(DURATION * FPS);

  fs.mkdirSync(FRAMES, { recursive: true });
  const server = await serve(stageHtml());
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch();
  let ff = null;
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: STAGE.w, height: STAGE.h, deviceScaleFactor: SCALE, mobile: false });
    /* The house clock is UTC (the sun is computed at longitude 0), and the
     * house card prints the date in the browser's own zone: filmed in UTC, the
     * date does not roll over at half past six in the evening. */
    await browser.send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });
    await browser.send('Page.enable');
    await browser.send('Page.navigate', { url: `${base}/__hero/stage.html` });
    for (let i = 0; i < 200; i++) {
      if (await browser.evaluate('!!(window.stage && window.stage.ready())').catch(() => false)) break;
      await sleep(100);
    }
    if (!stills) {
      ff = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS),
        '-c:v', 'png', '-i', '-', '-c:v', 'libx264rgb', '-preset', 'ultrafast', '-crf', '0', MASTER], { stdio: ['pipe', 'inherit', 'inherit'] });
    }
    const last = stills ? Math.max(...stills) : total - 1;
    const started = Date.now();
    for (let i = 0; i <= last; i++) {
      await browser.evaluate(`window.stage.step(${i})`);
      if (stills && !stills.includes(i)) continue;
      const shot = await browser.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const png = Buffer.from(shot.data, 'base64');
      if (stills) {
        const file = path.join(FRAMES, `hero-${String(i).padStart(4, '0')}.png`);
        fs.writeFileSync(file, png);
        console.log(`  ${path.relative(ROOT, file)}`);
      } else if (!ff.stdin.write(png)) {
        await new Promise((r) => ff.stdin.once('drain', r));
      }
      if (!stills && i % 60 === 0) console.log(`  frame ${i}/${total}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (ff) {
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    console.log(`filmed ${total} frames -> ${path.relative(ROOT, MASTER)}`);
    encode();
  }
}

module.exports = { CLOCK, TAPS, CAPTIONS, DURATION, FPS };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
