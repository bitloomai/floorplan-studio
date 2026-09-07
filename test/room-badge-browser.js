/* Optional Playwright check. Run against an isolated offline dev server:
 * FPS_TEST_URL=http://127.0.0.1:18102 node test/room-badge-browser.js */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    await page.goto(process.env.FPS_TEST_URL || 'http://127.0.0.1:18102');
    await page.waitForFunction(() => window.Store?.S.project && window.Canvas);
    // This test scene never becomes a saved project, even if pointed at a
    // server whose data directory was not disposable.
    await page.route('**/api/project', route => route.request().method() === 'GET' ? route.continue() : route.fulfill({ json: { ok: true } }));
    await page.evaluate(() => {
      const p = Store.S.project, floor = Store.floor();
      p.chips = { show: true, counts: true, style: 'pill' };
      p.sun = { enabled: false }; p.lighting = { enabled: false };
      floor.extent = { w: 30, h: 20 }; floor.items = []; floor.openings = []; floor.boundaries = [];
      floor.rooms = [{ id: 'badge-room', name: 'Studio', shape: 'rect', rect: [2, 2, 10, 8], showCount: true }];
      Store.setTool('select'); Store.select(null); Canvas.paint(); Canvas.fit();
    });
    const room = () => page.evaluate(() => Store.floor().rooms[0]);
    const chip = page.locator('[data-room-label="badge-room"]');
    const original = await chip.boundingBox();
    const scale = await page.evaluate(() => Store.S.view.zoom * Store.S.project.ppf);
    await page.mouse.move(original.x + original.width / 2, original.y + original.height / 2);
    await page.mouse.down();
    await page.mouse.move(original.x + original.width / 2 + 11 * scale, original.y + original.height / 2, { steps: 8 });
    await page.mouse.up();
    assert((await room()).chip_at[0] > 12, 'badge moves outside room');
    assert.deepEqual((await room()).rect, [2, 2, 10, 8], 'room geometry stays put');
    const moved = await room();
    await page.evaluate(() => Store.undo());
    assert.equal((await room()).chip_at, undefined);
    await page.evaluate(() => Store.redo());
    assert.deepEqual((await room()).chip_at, moved.chip_at);
    await chip.click();
    const before = await chip.boundingBox();
    const handle = await page.locator('[data-label-resize="badge-room"]').last().boundingBox();
    const cx = before.x + before.width / 2, cy = before.y + before.height / 2;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(cx + (handle.x + handle.width / 2 - cx) * .55, cy + (handle.y + handle.height / 2 - cy) * .55, { steps: 5 });
    await page.mouse.up();
    assert((await room()).chip_scale < .7);
    const fonts = await page.locator('#fps-labels text').evaluateAll(els => els.map(el => +el.getAttribute('font-size')));
    assert(fonts.length === 2 && fonts.every(size => size < 8), 'name and count shrink');
    if (process.env.FPS_TEST_SCREENSHOT) await page.screenshot({ path: process.env.FPS_TEST_SCREENSHOT });
    await page.evaluate(() => Store.undo());
    assert.equal((await room()).chip_scale, undefined);
    await page.evaluate(() => Store.redo());
    const x = (await room()).chip_at[0];
    await chip.click();
    await page.keyboard.press('ArrowRight');
    assert((await room()).chip_at[0] > x);
    await page.keyboard.press('Delete');
    assert.equal((await room()).noLabel, true);
    assert.equal(await page.locator('[data-room-label]').count(), 0);
    assert.deepEqual((await room()).rect, [2, 2, 10, 8]);
    await page.evaluate(() => Store.undo());
    assert.equal(await chip.count(), 1);
    console.log('Room badge browser checks passed: drag outside room, resize/text fit, undo/redo, keyboard move and hide.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
