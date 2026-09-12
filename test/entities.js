'use strict';
/* Binding a marker to a real device.
 *
 * The app has always had a redacted entity catalogue — the editor's picker uses
 * it — but nothing on the MCP side ever returned it, so an assistant had to
 * guess entity ids or ask. These check the tool that closes that, and they
 * check the privacy filter at the same time: this is the one answer in the
 * whole server made of somebody's real entity catalogue, so "no coordinates
 * or location-tracking domains leave here" has to be a test, not a comment.
 *
 * A real HTTP server stands in for Home Assistant. It lives inside the child
 * process, not out here, because `ha.js` reads its credentials at require time
 * — so the port has to be known before anything is required, and a synchronous
 * test function cannot wait for a listen() in its own event loop. */
module.exports = function (ok) {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { execFileSync } = require('node:child_process');

  /* Deliberately includes all three excluded location domains. The numbers
   * are nonsense on purpose: a real-looking lat/lon in a committed diff is a
   * thing a reviewer has to stop and check, and this file exists to prove
   * coordinates never leave the app, not to smuggle one in. */
  const STATES = [
    { entity_id: 'light.demo_kitchen', state: 'on', attributes: { friendly_name: 'Kitchen ceiling', brightness: 200 } },
    { entity_id: 'light.demo_hall', state: 'off', attributes: { friendly_name: 'Hall pendant' } },
    { entity_id: 'binary_sensor.demo_front_door', state: 'off', attributes: { friendly_name: 'Front door', device_class: 'door' } },
    { entity_id: 'sensor.demo_kitchen_temp', state: '21.4', attributes: { friendly_name: 'Kitchen temperature', device_class: 'temperature', unit_of_measurement: '°C' } },
    { entity_id: 'switch.demo_broken', state: 'unavailable', attributes: { friendly_name: 'Broken switch' } },
    { entity_id: 'person.demo_resident', state: 'home', attributes: { friendly_name: 'Resident', latitude: 123.4567, longitude: -234.5678, gps_accuracy: 8 } },
    { entity_id: 'device_tracker.demo_phone', state: 'home', attributes: { friendly_name: 'Phone', latitude: 123.4567, longitude: -234.5678 } },
    { entity_id: 'zone.demo_home', state: '0', attributes: { friendly_name: 'Home', latitude: 123.4567, longitude: -234.5678, radius: 100 } },
  ];

  const project = {
    id: 'entities-test', ppf: 22, name: 'Binding',
    floors: [{
      id: 'g', name: 'Ground', level_ft: 0, extent: { w: 30, h: 20 },
      rooms: [{ id: 'kitchen', name: 'Kitchen', shape: 'rect', rect: [0, 0, 12, 10], flooring: 'tile' }],
      items: [{ id: 'f1', kind: 'fixture', type: 'spot', at: [3, 3], room: 'kitchen', entity: 'light.demo_kitchen', props: {} }],
      openings: [], boundaries: [],
    }],
  };

  const script = `
    const assert = require('node:assert/strict');
    const http = require('node:http');
    const results = [];
    const t = async (name, fn) => {
      try { await fn(); results.push([name, true, null]); }
      catch (e) { results.push([name, false, String(e.message || e).split('\\n')[0]]); }
    };
    (async () => {
      const server = http.createServer((req, res) => {
        if (req.url === '/api/states') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(${JSON.stringify(STATES)}));
          return;
        }
        res.writeHead(404).end('{}');
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      process.env.HA_URL = 'http://127.0.0.1:' + server.address().port;
      process.env.HA_TOKEN = 'test-token';

      const store = require('./floorplan_studio/app/lib/store');
      const tools = require('./floorplan_studio/app/lib/mcp').TOOLS;
      const call = (name, args) => tools.find((x) => x.name === name).run(args);
      await store.init();
      await store.writeProject(${JSON.stringify(project)});

      const all = await call('list_entities', {});
      await t('list_entities reads the live catalogue rather than guessing', () => {
        assert.equal(all.mode, 'dev');
        assert.ok(all.entities.some((e) => e.entity_id === 'light.demo_kitchen'));
        assert.equal(all.entities.find((e) => e.entity_id === 'light.demo_kitchen').name, 'Kitchen ceiling');
      });
      /* The one that matters. /api/states carries coordinates for these
       * domains, and a drawing tool has no business repeating them. */
      await t('and never returns a location domain or a coordinate', () => {
        assert.ok(!all.entities.some((e) => ['person', 'device_tracker', 'zone'].includes(e.domain)),
          all.entities.map((e) => e.domain).join(','));
        const text = JSON.stringify(all);
        for (const k of ['latitude', 'longitude', 'gps_accuracy', '123.4567', '234.5678']) {
          assert.ok(!text.includes(k), k + ' reached the answer');
        }
      });
      await t('a domain filter answers "what can this type bind to"', async () => {
        const lights = await call('list_entities', { domain: 'light' });
        assert.deepEqual(lights.entities.map((e) => e.entity_id), ['light.demo_hall', 'light.demo_kitchen']);
      });
      await t('free text searches the id and the friendly name together', async () => {
        const kitchen = await call('list_entities', { q: 'kitchen' });
        assert.equal(kitchen.count, 2);
        const pendant = await call('list_entities', { q: 'pendant' });
        assert.deepEqual(pendant.entities.map((e) => e.entity_id), ['light.demo_hall']);
      });
      await t('device_class and unit come through, so a sensor can be read as well as placed', async () => {
        const temp = await call('list_entities', { deviceClass: 'temperature' });
        assert.equal(temp.entities[0].entity_id, 'sensor.demo_kitchen_temp');
        assert.equal(temp.entities[0].unit, '°C');
      });
      await t('a state filter finds what is broken', async () => {
        const dead = await call('list_entities', { state: 'unavailable' });
        assert.deepEqual(dead.entities.map((e) => e.entity_id), ['switch.demo_broken']);
      });
      await t('large catalogues can be read in bounded pages', async () => {
        const page = await call('list_entities', { limit: 2, offset: 1 });
        assert.equal(page.total, 5);
        assert.equal(page.offset, 1);
        assert.deepEqual(page.entities.map((e) => e.entity_id), ['light.demo_hall', 'light.demo_kitchen']);
        assert.equal(page.truncated, true);
        assert.equal(page.nextOffset, 3);
      });
      await t('malformed limits cannot remove the response cap', async () => {
        const page = await call('list_entities', { limit: 'not-a-number' });
        assert.equal(page.count, 5);
        assert.equal(page.truncated, false);
      });
      /* The binding loop: what is left to place, and what is already placed. */
      await t('bound:no is the list of what has not been placed yet', async () => {
        const free = await call('list_entities', { domain: 'light', bound: 'no' });
        assert.deepEqual(free.entities.map((e) => e.entity_id), ['light.demo_hall']);
      });
      await t('and bound:yes is what the plan already uses', async () => {
        const used = await call('list_entities', { domain: 'light', bound: 'yes' });
        assert.deepEqual(used.entities.map((e) => e.entity_id), ['light.demo_kitchen']);
        assert.equal(used.entities[0].bound, true);
      });
      await t('find_objects then says WHICH marker is on it', async () => {
        const on = await call('find_objects', { collection: 'items', entity: 'light.demo_kitchen', summary: true });
        assert.deepEqual(on.objects.map((o) => o.floorId + '/' + o.id), ['g/f1']);
      });

      server.close();
      console.log('RESULTS' + JSON.stringify(results));
    })().catch((e) => { console.error(e); process.exitCode = 1; });
  `;

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fps-entities-'));
  try {
    const stdout = execFileSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      /* SUPERVISOR_TOKEN would win over HA_URL/HA_TOKEN and point ha.js at a
       * supervisor that is not there. Cleared so the child is in dev mode. */
      env: { ...process.env, FPS_DATA_DIR: dataDir, SUPERVISOR_TOKEN: '' },
      encoding: 'utf8',
    });
    const line = stdout.split('\n').find((l) => l.startsWith('RESULTS'));
    for (const [name, passed, detail] of JSON.parse(line.slice(7))) ok(name, passed, detail);
  } catch (e) {
    ok('the entity catalogue reaches an assistant at all', false, String(e.stderr || e).split('\n').slice(0, 4).join(' | '));
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
};
