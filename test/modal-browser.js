/* Optional browser regression check against an isolated dev server.
 * Requires Playwright supplied by the development environment, not the app.
 * FPS_TEST_URL=http://127.0.0.1:18100 node test/modal-browser.js */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(process.env.FPS_TEST_URL || 'http://127.0.0.1:18100');
    await page.waitForFunction(() => window.Store?.S.project && window.Panels);
    await page.evaluate(() => {
      const opener = document.createElement('button');
      opener.id = 'testOpener';
      opener.textContent = 'Open test dialog';
      opener.style.cssText = 'position:fixed;top:0;left:0;z-index:100';
      document.body.append(opener);
      window.buildTestDialog = () => {
        const body = document.createElement('div');
        body.innerHTML = '<input id="testFirst"><button disabled>Disabled</button><button hidden>Hidden</button><button id="testLast">Last</button>';
        Panels.modal('Focus test', body, { rebuild: window.buildTestDialog });
      };
      opener.onclick = window.buildTestDialog;
    });
    await page.locator('#testOpener').click();
    assert(await page.locator('#modal').evaluate(el => el.matches(':modal')));
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press(key);
        assert(await page.evaluate(() => document.activeElement === document.body || document.querySelector('#modal').contains(document.activeElement)), 'Tab must never reach background controls');
      }
    }
    await page.locator('#testFirst').focus();
    await page.evaluate(() => document.querySelector('#testOpener').focus());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'testFirst', 'background must refuse focus');
    await page.locator('.modal-adv input').focus();
    await page.keyboard.press('Space');
    assert(await page.evaluate(() => document.activeElement.matches('.modal-adv input')), 'Advanced rebuild retains focus');
    await page.evaluate(() => {
      window.duplicateCalls = 0;
      Canvas.duplicateSelected = () => window.duplicateCalls++;
    });
    await page.locator('#testLast').focus();
    await page.keyboard.press('Control+d');
    assert.equal(await page.evaluate(() => window.duplicateCalls), 0, 'modal must block editor shortcuts');
    await page.evaluate(() => Panels.modal('Replacement help', document.createElement('p')));
    assert(await page.evaluate(() => document.querySelector('#modal').contains(document.activeElement)), 'replacement body retains dialog focus');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'testOpener', 'replacement retains original opener');
    assert(await page.locator('#modal').evaluate(el => el.hidden && !el.open));
    for (const method of ['button', 'backdrop']) {
      await page.locator('#testOpener').click();
      if (method === 'button') await page.locator('#modalClose').click();
      else await page.locator('#modal').click({ position: { x: 2, y: 2 } });
      assert.equal(await page.evaluate(() => document.activeElement.id), 'testOpener');
      assert(await page.locator('#modal').evaluate(el => el.hidden && !el.open));
    }
    await page.setViewportSize({ width: 375, height: 700 });
    await page.locator('#testOpener').click();
    assert(await page.locator('.modal-card').evaluate(el => {
      const box = el.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    }), 'dialog fits narrow viewport');
    console.log('Modal browser checks passed: keyboard containment, inert background, rebuild/replacement, shortcuts, all close paths, narrow layout.');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
