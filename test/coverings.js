'use strict';
module.exports = function (ok) {
  const scene = require('../floorplan_studio/app/lib/plan-scene');
  const boundaries = require('../floorplan_studio/app/defaults/boundaries.json');
  const lib = require('../floorplan_studio/app/defaults/library.json');
  const themes = require('../floorplan_studio/app/defaults/themes.json');
  const theme = themes.themes[themes.active].plan;
  const room = { id: 'r', name: 'Room', shape: 'rect', rect: [0, 0, 10, 10] };
  const type = Object.keys(boundaries.openingTypes).find(k => boundaries.openingTypes[k].render.style === 'glazed');
  const base = { id: 'o', room: 'r', wall: 'n', at: 2, w: 4, type };
  const floor = { id: 'f', extent: { w: 10, h: 10 }, rooms: [room], items: [], openings: [base] };
  const P = scene.makeProjector({ ppf: 20 });
  const draw = (covering, states = {}, op = base) => scene.build({ ppf: 20, floors: [floor] },
    { ...floor, openings: [{ ...op, covering }] }, lib, theme, { boundaries, states }).layers.openings;
  const bare = JSON.stringify(draw(null));
  for (const [key, spec] of Object.entries(boundaries.coverings)) {
    const shut = JSON.stringify(draw({ type: key, position: 0 }));
    const open = JSON.stringify(draw({ type: key, position: 100 }));
    ok('covering plan state: ' + key, ['none', 'mesh'].includes(spec.render) ? shut === open : shut !== open);
    if (spec.render === 'none') ok('no overlay for ' + key, shut === bare);
  }
  ok('unknown covering keeps bare geometry', JSON.stringify(draw({ type: 'missing' })) === bare);
  ok('bound covering uses live position', JSON.stringify(draw({ type: 'drape', entity: 'cover.test', position: 100 },
    { 'cover.test': { state: 'closed', attributes: { current_position: 25 } } })) === JSON.stringify(draw({ type: 'drape', position: 25 })));
  ok('unavailable covering uses manual fallback', JSON.stringify(draw({ type: 'drape', entity: 'cover.test', position: 25 },
    { 'cover.test': { state: 'unavailable' } })) === JSON.stringify(draw({ type: 'drape', position: 25 })));
  const awning = Object.keys(boundaries.coverings).find(k => boundaries.coverings[k].render === 'awning');
  for (const wall of ['n', 's', 'e', 'w']) {
    const make = position => scene.build({ ppf: 20, origin: [0, 0], floors: [floor] },
      { ...floor, openings: [{ ...base, wall, covering: { type: awning, position } }] }, lib, theme, { boundaries });
    const a = make(0), b = make(100);
    ok('awning reserves full travel on ' + wall, a.width === b.width && a.height === b.height);
    ok('awning fits canvas on ' + wall, (wall === 'n' || wall === 's') ? a.height > 200 : a.width > 200);
  }
};
