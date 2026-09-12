'use strict';
/* Reading and writing a big plan WITHOUT the whole-document round trip.
 *
 * The failure these guard against is not a crash: it is an agent answering
 * "change that lamp's colour" by downloading a five-floor house, editing one
 * field and uploading it back — slow, and it silently discards whatever the
 * human changed in the meantime. So the checks are about addressability: the
 * index is small, a filter returns only what matched, a batch is one save, and
 * a rejected batch writes nothing at all.
 *
 * Run in a child process against a real data directory, like the other MCP
 * tests, because "one save" and "nothing was written" are claims about disk. */
module.exports = function (ok) {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const { execFileSync } = require('node:child_process');

  const project = {
    id: 'surgical-test', ppf: 22, name: 'Surgical',
    floors: [
      {
        id: 'g', name: 'Ground', level_ft: 0, extent: { w: 40, h: 30 },
        rooms: [
          { id: 'kitchen', name: 'Kitchen', shape: 'rect', rect: [0, 0, 12, 10], flooring: 'tile' },
          { id: 'hall', name: 'Hall', shape: 'rect', rect: [12, 0, 10, 10], flooring: 'wood' },
        ],
        items: [
          { id: 'f1', kind: 'fixture', type: 'spot', at: [3, 3], room: 'kitchen', entity: 'light.demo_k1', props: { watt: 5 } },
          { id: 'f2', kind: 'fixture', type: 'spot', at: [8, 3], room: 'kitchen', entity: 'light.demo_k2', props: { watt: 5 } },
          { id: 'f3', kind: 'fixture', type: 'spot', at: [16, 5], room: 'hall', entity: null, props: { watt: 5 } },
          { id: 'd1', kind: 'device', type: 'camera', at: [11, 9], room: 'kitchen', entity: 'camera.demo_k', props: {} },
        ],
        openings: [{ id: 'op1', room: 'kitchen', wall: 'n', at: 3, w: 3, type: 'window' }],
        boundaries: [],
      },
      {
        id: 'first', name: 'First', level_ft: 10, extent: { w: 40, h: 30 },
        rooms: [{ id: 'bed', name: 'Bedroom', shape: 'rect', rect: [0, 0, 12, 12], flooring: 'wood' }],
        items: [{ id: 'f4', kind: 'fixture', type: 'spot', at: [4, 4], room: 'bed', entity: 'light.demo_b1', props: { watt: 5 } }],
        openings: [], boundaries: [],
      },
    ],
  };

  const script = `
    const assert = require('node:assert/strict');
    const store = require('./floorplan_studio/app/lib/store');
    const tools = require('./floorplan_studio/app/lib/mcp').TOOLS;
    const call = (name, args) => tools.find((x) => x.name === name).run(args);
    const results = [];
    const t = async (name, fn) => {
      try { await fn(); results.push([name, true, null]); }
      catch (e) { results.push([name, false, String(e.message || e).split('\\n')[0]]); }
    };
    (async () => {
      await store.init();
      await store.writeProject(${JSON.stringify(project)});
      const whole = JSON.stringify(await store.readProject());

      const outline = await call('get_project', { outline: true });
      await t('the outline names every floor without carrying its geometry', () => {
        assert.equal(outline.floors.length, 2);
        assert.equal(outline.floors[0].counts.items, 4);
        assert.deepEqual(outline.floors[0].rooms.map((r) => r.id), ['kitchen', 'hall']);
        assert.ok(!JSON.stringify(outline).includes('props'));
      });
      await t('and censuses the item types, so you can decide what to fetch', () => {
        assert.deepEqual(outline.floors[0].itemTypes[0], { key: 'fixture.spot', count: 3 });
      });
      await t('the outline carries no per-object geometry or properties at all', () => {
        const text = JSON.stringify(outline);
        assert.ok(!['"props":', '"at":', '"rect":', '"points":', '"entity":'].some((k) => text.includes(k)), text.slice(0, 120));
      });
      await t('an outline of one floor is still the index, not the floor', async () => {
        const one = await call('get_project', { outline: true, floorId: 'first' });
        assert.equal(one.floors.length, 1);
        await assert.rejects(() => call('get_project', { outline: true, floorId: 'nope' }));
      });

      await t('find_objects reaches across floors and carries the floorId an edit needs', async () => {
        const spots = await call('find_objects', { collection: 'items', type: 'fixture.spot' });
        assert.deepEqual(spots.objects.map((o) => o.floorId + '/' + o.id), ['g/f1', 'g/f2', 'g/f3', 'first/f4']);
      });
      await t('a bare type name means the same as a qualified one', async () => {
        const bare = await call('find_objects', { collection: 'items', type: 'spot' });
        assert.equal(bare.count, 4);
      });
      await t('filters compose, and summary returns an index row rather than the object', async () => {
        const kitchen = await call('find_objects', { collection: 'items', room: 'kitchen', floorId: 'g', summary: true });
        assert.equal(kitchen.count, 3);
        assert.ok(!('props' in kitchen.objects[0]));
        assert.equal(kitchen.objects[0].typeKey, 'fixture.spot');
      });
      await t('entity "none" finds what is still unbound', async () => {
        const unbound = await call('find_objects', { collection: 'items', entity: 'none' });
        assert.deepEqual(unbound.objects.map((o) => o.id), ['f3']);
      });
      await t('near measures from the same anchor a review note pins to', async () => {
        const near = await call('find_objects', { collection: 'items', floorId: 'g', near: [3, 3], withinFt: 6 });
        assert.deepEqual(near.objects.map((o) => o.id), ['f1', 'f2']);
        assert.equal(near.objects[0].distanceFt, 0);
        assert.equal(near.objects[1].distanceFt, 5);
      });
      await t('fields projects dot paths and always keeps the address', async () => {
        const projected = await call('find_objects', { collection: 'items', floorId: 'g', ids: ['f1', 'd1'], fields: ['entity', 'props.watt'] });
        assert.deepEqual(projected.objects[0], { floorId: 'g', id: 'f1', entity: 'light.demo_k1', 'props.watt': 5 });
      });
      await t('a truncated answer says so rather than looking complete', async () => {
        const capped = await call('find_objects', { collection: 'items', limit: 2 });
        assert.equal(capped.count, 2);
        assert.equal(capped.total, 5);
        assert.equal(capped.truncated, true);
      });

      /* Discoverability. The guide tells an agent to check whether a type is
       * bindable and whether it takes a surface finish; until it was asked to,
       * list_library answered neither, and a free-text prop arrived with no
       * statement of what the value had to be. */
      await t('list_library says what a type can do, not only how it is configured', async () => {
        const stairs = (await call('list_library', { query: 'stairs' })).types.find((x) => x.key === 'furniture.stairs');
        assert.equal(stairs.render.bindable, true);
        assert.equal(stairs.render.surface, 'treads');
      });
      await t('and which prop resizes it, on which axis', async () => {
        const tv = (await call('list_library', { query: 'tv' })).types.find((x) => x.key === 'device.tv');
        assert.equal(tv.render.resize.prop, 'size');
        assert.equal(tv.render.resize2.prop, 'd');
        assert.equal(tv.render.cone, true);
      });
      await t('a free-text prop carries the hint that says what the value must be', async () => {
        const stairs = (await call('list_library', { query: 'stairs' })).types.find((x) => x.key === 'furniture.stairs');
        const finish = stairs.props.find((x) => x.key === 'treadFinish');
        assert.equal(finish.type, 'text');
        assert.match(finish.hint, /[Ff]looring key/);
      });
      await t('but drawing internals stay out of it, so nothing copies them onto an item', async () => {
        const tv = (await call('list_library', { query: 'tv' })).types.find((x) => x.key === 'device.tv');
        for (const k of ['icon', 'iconScale', 'fill', 'line', 'glow', 'size', 'tap']) {
          assert.ok(!(k in tv.render), k + ' should not be advertised as a capability');
        }
      });

      await t('one update can address several ids, merging props on each', async () => {
        await call('edit_collection', { collection: 'items', op: 'update', floorId: 'g', ids: ['f1', 'f2'], value: { props: { watt: 9 } } });
        const after = await store.readProject();
        assert.equal(after.floors[0].items[0].props.watt, 9);
        assert.equal(after.floors[0].items[1].props.watt, 9);
        assert.equal(after.floors[0].items[2].props.watt, 5);
      });
      await t('but ids is refused for add, where each object needs its own id', async () => {
        await assert.rejects(() => call('edit_collection', { collection: 'items', op: 'add', floorId: 'g', ids: ['a', 'b'], value: { kind: 'fixture', type: 'spot', at: [1, 1] } }));
      });

      let saves = 0;
      store.onProjectChange(() => { saves++; });
      await t('a batch of three edits is one save and one editor refresh', async () => {
        await call('edit_batch', { edits: [
          { collection: 'items', op: 'update', floorId: 'g', id: 'f3', value: { entity: 'light.demo_h1' } },
          { collection: 'items', op: 'add', floorId: 'first', value: { kind: 'fixture', type: 'spot', at: [8, 8] } },
          { collection: 'rooms', op: 'update', floorId: 'first', id: 'bed', value: { flooring: 'tile' } },
        ] });
        assert.equal(saves, 1);
        const batched = await store.readProject();
        assert.equal(batched.floors[0].items[2].entity, 'light.demo_h1');
        assert.equal(batched.floors[1].items.length, 2);
        assert.equal(batched.floors[1].rooms[0].flooring, 'tile');
      });

      await t('a batch with one bad entry writes nothing at all, and names the entry', async () => {
        const before = JSON.stringify(await store.readProject());
        await assert.rejects(
          () => call('edit_batch', { edits: [
            { collection: 'items', op: 'update', floorId: 'g', id: 'f1', value: { entity: 'light.demo_changed' } },
            { collection: 'items', op: 'update', floorId: 'g', id: 'nope', value: { entity: 'x' } },
          ] }),
          (e) => e.message.includes('edits[1]') && e.message.includes('nothing was written'));
        assert.equal(JSON.stringify(await store.readProject()), before);
      });

      /* The claim these tools make is that an id-addressed edit leaves the rest
       * of the house alone. Reading the document and then queueing a write of
       * the whole thing cannot honour it: anything saved in between is replaced
       * by the copy this call read before it, with no error and no trace. So
       * the read has to happen inside the write's own queue slot, and that is
       * only provable by making something land in the window. */
      await t('a save landing mid-edit is not overwritten by the agent write', async () => {
        let release;
        const held = new Promise((r) => { release = r; });
        /* Holds the project's slot, then renames the house from inside it —
         * exactly where an editor autosave or a second assistant arrives. */
        const human = store.editProject(async (doc) => { await held; doc.name = 'Renamed while the agent worked'; });
        const agent = call('edit_collection', { collection: 'items', op: 'update', floorId: 'g', id: 'f1', value: { props: { watt: 11 } } });
        await new Promise((r) => setTimeout(r, 50));
        release();
        await Promise.all([human, agent]);
        const after = await store.readProject();
        assert.equal(after.name, 'Renamed while the agent worked');
        assert.equal(after.floors[0].items[0].props.watt, 11);
      });

      await t('two agents editing different markers at once keep both changes', async () => {
        await Promise.all([
          call('edit_collection', { collection: 'items', op: 'update', floorId: 'g', id: 'f1', value: { entity: 'light.agent_one' } }),
          call('edit_collection', { collection: 'items', op: 'update', floorId: 'g', id: 'f2', value: { entity: 'light.agent_two' } }),
        ]);
        const after = await store.readProject();
        assert.equal(after.floors[0].items[0].entity, 'light.agent_one');
        assert.equal(after.floors[0].items[1].entity, 'light.agent_two');
      });

      await t('a settings write and a plan edit at the same moment do not erase each other', async () => {
        await Promise.all([
          call('edit_settings', { path: 'dashboard.house.title', value: 'Transacted' }),
          call('edit_collection', { collection: 'rooms', op: 'update', floorId: 'g', id: 'hall', value: { flooring: 'stone' } }),
        ]);
        const after = await store.readProject();
        assert.equal(after.dashboard.house.title, 'Transacted');
        assert.equal(after.floors[0].rooms[1].flooring, 'stone');
      });

      await t('a rejected edit leaves a concurrent save in place', async () => {
        let release;
        const held = new Promise((r) => { release = r; });
        const human = store.editProject(async (doc) => { await held; doc.name = 'Survived a refusal'; });
        /* assert.rejects immediately, not after the wait below: this call is
         * MEANT to fail, and a rejected promise sitting for 50ms with nothing
         * attached to it is an unhandled rejection that takes the whole run
         * down instead of failing one check. */
        const agent = assert.rejects(() => call('edit_collection', { collection: 'items', op: 'update', floorId: 'g', id: 'no_such_item', value: { entity: 'x' } }));
        await new Promise((r) => setTimeout(r, 50));
        release();
        await Promise.all([human, agent]);
        assert.equal((await store.readProject()).name, 'Survived a refusal');
      });

      /* The size claim is only meaningful against a plan of real size, so it is
       * made against the committed test house — five floors of actual geometry
       * — rather than the handful of rooms the rest of this file uses. */
      await t('and on a house-sized plan the index stays a small fraction of it', async () => {
        const house = require('./test/house/test-house.project.json');
        await store.writeProject(house);
        const big = JSON.stringify(await call('get_project', { outline: true }));
        const all = JSON.stringify(await store.readProject());
        assert.ok(big.length < all.length / 4, big.length + ' vs ' + all.length);
      });

      console.log('RESULTS' + JSON.stringify(results));
    })().catch((e) => { console.error(e); process.exitCode = 1; });
  `;

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fps-surgical-'));
  try {
    const stdout = execFileSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, FPS_DATA_DIR: dataDir },
      encoding: 'utf8',
    });
    const line = stdout.split('\n').find((l) => l.startsWith('RESULTS'));
    for (const [name, passed, detail] of JSON.parse(line.slice(7))) ok(name, passed, detail);
  } catch (e) {
    ok('the surgical read/write tools run at all', false, String(e.stderr || e).split('\n').slice(0, 4).join(' | '));
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
};
