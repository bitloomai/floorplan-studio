'use strict';
module.exports = function (ok) {
  const identity = require('../floorplan_studio/app/lib/room-identity');
  const vm = require('node:vm'), fs = require('node:fs');
  const make = () => {
    const room = { id: 'room_1', name: 'Room 1', _autoId: true };
    const floor = { id: 'f', rooms: [room, { id: 'study', part_of: room.id }],
      items: [{ room: room.id, entity: 'light.room_1' }], openings: [{ room: room.id }], boundaries: [{ room: room.id }] };
    return { room, floor, project: { id: 'test', floors: [floor, { id: 'other', items: [{ room: room.id }] }] } };
  };
  const a = make();
  const result = identity.rename(a.project, a.floor, a.room, 'Study');
  ok('automatic room rename resolves collision', result.id === 'study_2');
  for (const [collection, key] of identity.REFERENCES) {
    ok('room rename rewrites ' + collection, a.floor[collection].some(v => v[key] === result.id));
  }
  ok('room rename leaves other floors alone', a.project.floors[1].items[0].room === 'room_1');
  ok('room rename leaves entity ids alone', a.floor.items[0].entity === 'light.room_1');
  ok('room ids retain Unicode', identity.uniqueId('客厅', new Set(['客厅'])) === '客厅_2');
  for (const mode of ['existing', 'deployed', 'manual']) {
    const x = make();
    if (mode === 'existing') delete x.room._autoId;
    if (mode === 'deployed') x.project.dashboard = { installedAt: '2026-01-01' };
    if (mode === 'manual') identity.rename(x.project, x.floor, x.room, x.room.name, { id: 'manual' });
    const id = x.room.id;
    identity.rename(x.project, x.floor, x.room, 'Kitchen');
    ok(mode + ' room id stays stable on name change', x.room.id === id && x.room.name === 'Kitchen');
    identity.rename(x.project, x.floor, x.room, 'Kitchen', { matchName: true });
    ok(mode + ' room allows explicit match', x.room.id === 'kitchen' && !x.room._autoId);
  }
  const context = { window: { localStorage: { getItem() {} } }, RoomIdentity: identity };
  vm.runInNewContext(fs.readFileSync(require.resolve('../floorplan_studio/app/public/js/store.js'), 'utf8'), context);
  const Store = context.window.Store, x = make();
  Store.S.project = x.project; Store.S.activeFloorId = x.floor.id;
  Store.select('room', x.room.id);
  const before = JSON.stringify(x.project);
  Store.renameRoom(x.room, 'Reading');
  ok('rename is one undo entry and retains selection', Store.S.undoStack.length === 1 && Store.S.selection.id === 'reading');
  Store.undo();
  ok('undo restores name id and all references', JSON.stringify(Store.S.project) === before);
  Store.redo();
  ok('redo restores rewritten references', Store.floor().items[0].room === 'reading');
  Store.mutate(() => { Store.S.project.dashboard = { installedAt: '2026-01-01' }; });
  Store.undo();
  ok('deployment protection survives undo', Store.S.project.dashboard.installedAt === '2026-01-01');
  Store.renameRoom(Store.floor().rooms[0], 'Final');
  ok('undo cannot reenable automatic rename', Store.floor().rooms[0].id === 'reading');
  const { trimProject } = require('../floorplan_studio/app/lib/card-build');
  ok('card payload excludes auto-id bookkeeping', !JSON.stringify(trimProject(x.project)).includes('_autoId'));
  const { execFileSync } = require('node:child_process');
  const os = require('node:os'), path = require('node:path');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fps-room-identity-'));
  const script = `
    const assert = require('node:assert/strict');
    const store = require('./floorplan_studio/app/lib/store');
    (async () => {
      await store.init();
      const project = { id: 'test-identity', floors: [] };
      await store.writeProject(project);
      await Promise.all([store.markProjectDeployed(project, '2026-01-01'), store.markProjectDeployed({id:'second'}, '2026-02-01')]);
      assert.equal((await store.readProject()).dashboard.installedAt, '2026-01-01');
      await store.writeProject({id:'test-identity', floors:[]});
      assert.equal((await store.readProject()).dashboard.installedAt, '2026-01-01');
      await store.writeProject({id:'second', floors:[]});
      assert.equal((await store.readProject()).dashboard.installedAt, '2026-02-01');
      await store.writeProject({id:'unpublished', floors:[]});
      assert.equal((await store.readProject()).dashboard, undefined);
    })().catch(e => { console.error(e); process.exitCode = 1; });`;
  try {
    execFileSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), env: { ...process.env, FPS_DATA_DIR: dataDir }, stdio: 'pipe' });
    ok('deployment history survives stale writes, isolates projects and serializes concurrent records', true);
  } catch (e) { ok('deployment history remains durable', false, String(e.stderr || e)); }
  finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
};
