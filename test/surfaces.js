'use strict';
module.exports = function (ok) {
  const scene = require('../floorplan_studio/app/lib/plan-scene');
  const shapes = require('../floorplan_studio/app/lib/shapes');
  const flooring = require('../floorplan_studio/app/defaults/flooring.json');
  const boundaries = require('../floorplan_studio/app/defaults/boundaries.json');
  const library = require('../floorplan_studio/app/defaults/library.json');
  const themes = require('../floorplan_studio/app/defaults/themes.json');
  const theme = themes.themes[themes.active].plan;
  const clone = v => JSON.parse(JSON.stringify(v));
  const room = { id: 'r', name: 'Room', shape: 'rect', rect: [2, 2, 12, 12] };
  const item = { id: 'stair', kind: 'furniture', type: 'stairs', at: [4, 4], props: { w: 6, h: 8, steps: 10, continues: 'none' } };
  const floor = { id: 'f', extent: { w: 24, h: 20 }, rooms: [room], items: [item], openings: [], boundaries: [] };
  const project = { id: 'surface-test', ppf: 20, floors: [floor] };
  const draw = (props = {}, extra = {}, lib = library, fl = flooring) => {
    const f = { ...floor, ...extra, items: extra.items || [{ ...item, props: { ...item.props, ...props } }] };
    return scene.build({ ...project, floors: [f] }, f, lib, theme, { boundaries, flooring: fl });
  };
  const walk = nodes => nodes.flatMap(n => [n, ...walk(n.children || [])]);
  const defs = result => result.layers.defs.filter(n => n.tag === 'pattern');
  const clips = result => result.layers.defs.filter(n => String(n.attrs?.id).startsWith('fpsTread-'));
  const original = draw().layers;
  const digest = require('node:crypto').createHash('sha256')
    .update(JSON.stringify([original.furniture, original.boundaries, original.flooring, original.flooringField])).digest('hex');
  // Recorded from the pre-surfaces renderer, not from the implementation under test.
  ok('no opt-in preserves pre-surfaces stair, wall and room bytes', digest === '538f18963f9df2e6e92348cdb1484bcdf6680ceacda60cdc553c2546262923ba');
  const bare = JSON.stringify(original.furniture);
  ok('empty tread finish preserves the scheme drawing', JSON.stringify(draw({ treadFinish: null }).layers.furniture) === bare);
  const granite = draw({ treadFinish: 'granite_black' });
  ok('granite changes the stair surface', JSON.stringify(granite.layers.furniture) !== bare && clips(granite).length === 1);
  ok('material is above the scheme frame and below the risers', granite.layers.furniture[0].tag === 'rect'
    && granite.layers.furniture[1].tag === 'g' && granite.layers.furniture.slice(2).some(n => n.tag === 'line'));
  const two = draw({}, { items: [item, { ...item, id: 'second', at: [14, 4] }].map(i => ({ ...i, props: { ...i.props, treadFinish: 'granite_black' } })) });
  ok('two granite stairs share their pattern definitions', defs(two).length === defs(granite).length);
  const tiledItems = [item, { ...item, id: 'second', at: [14, 4] }].map(i => ({ ...i, props: { ...i.props, treadFinish: 'tile' } }));
  const tiles = draw({}, { items: tiledItems });
  ok('repeating tile definitions are shared by two stairs', defs(tiles).length > 0 && defs(tiles).length === defs(draw({ treadFinish: 'tile' })).length);
  const tileOverride = clone(tiledItems); tileOverride[1].props.treadFinishOptions = { color: '#abcdef' };
  ok('different tile overrides have distinct pattern ids', defs(draw({}, { items: tileOverride })).length > defs(tiles).length);
  ok('all scene definition ids are unique', new Set(two.layers.defs.filter(n => n.attrs?.id).map(n => n.attrs.id)).size === two.layers.defs.filter(n => n.attrs?.id).length);
  ok('per-stair overrides change the material', JSON.stringify(draw({ treadFinish: 'granite_black', treadFinishOptions: { color: '#abcdef' } }).layers) !== JSON.stringify(granite.layers));
  ok('rotated finish shares the linework rotation', draw({ treadFinish: 'granite_black', rot: 37 }).layers.furniture.every(n => n.attrs?.transform?.startsWith('rotate(37 ')));
  const cut = draw({ treadFinish: 'granite_black', continues: 'cut', cutAt: .6 });
  ok('cut stairs split visible and ghosted materials', clips(cut).length === 2 && cut.layers.furniture.some(n => n.attrs?.opacity === .18));
  ok('both directions stay solid on an intermediate floor', clips(draw({ treadFinish: 'granite_black', continues: 'both' })).length === 1);
  const P = scene.makeProjector({ ppf: 20 });
  function geometry(p) {
    const surfacePaths = [];
    const c = { X: 0, Y: 0, W: 120, H: 160, P, p: { steps: 10, ...p }, fill: '#ccc', line: '#444', t: theme, surfacePaths };
    const nodes = shapes.furniture('stairs', c);
    return { paths: surfacePaths, nodes };
  }
  for (const variant of shapes.furnitureVariantsOf('stairs')) {
    for (const axis of ['ns', 'ew']) {
      const g = geometry({ variant, axis, well: 1 });
      ok(`${variant}/${axis} supplies finite horizontal surfaces`, g.paths.length > 0 && !JSON.stringify(g.paths).match(/NaN|Infinity/));
    }
  }
  const u = geometry({ variant: 'u_switchback', axis: 'ns', well: 1 });
  ok('switchback surfaces leave the open well unpainted', u.paths.slice(1).every(v => !v.d.includes('h 120 ')));
  ok('spiral material follows annular sectors, not the bounding box', geometry({ variant: 'spiral' }).paths.every(v => v.d.includes(' A ')));
  // A built-in field has transformed nodes; clipping must remain on its wrapper.
  const field = draw({ treadFinish: 'grass' });
  ok('generated field is clipped on a group', walk(field.layers.furniture).some(n => n.tag === 'g' && n.attrs['clip-path'] && n.children?.length));
  const wall = (props, wall = 'n', id = 'b') => ({ id, room: 'r', wall, type: 'wall_exterior', props });
  const wide = draw({}, { boundaries: [wall({ thicknessFt: 1.5, topFinish: 'granite_black' })] });
  const wallClip = wide.layers.defs.find(n => String(n.attrs?.id).startsWith('fpsWallSurface-'));
  const xy = wallClip.children[0].attrs.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const ys = xy.filter((_,i) => i % 2);
  ok('wall top width is physical feet', Math.max(...ys) - Math.min(...ys) === 30);
  const perimeterRoom = { ...room, rect: [0, 0, 12, 12] };
  const perimeterBoundaries = [
    wall({ thicknessFt: 2, topFinish: 'granite_black' }, 'n', 'bn'),
    wall({ thicknessFt: 2, topFinish: 'granite_black' }, 'e', 'be'),
    wall({ thicknessFt: 2, topFinish: 'granite_black' }, 's', 'bs'),
    wall({ thicknessFt: 2, topFinish: 'granite_black' }, 'w', 'bw'),
  ];
  const perimeter = draw({}, { extent: { w: 12, h: 12 }, rooms: [perimeterRoom], boundaries: perimeterBoundaries });
  const perimeterBands = perimeter.layers.boundaries.filter(n => n.roomId === 'r' && n.attrs?.stroke === 'none');
  const bandsStayInside = bands => bands.every(n => {
    const v = n.attrs.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    return v.every(x => x >= -1e-6 && x <= 240 + 1e-6);
  });
  ok('wide exterior wall tops fill inward and stay inside the room boundary', perimeterBands.length === 4 && bandsStayInside(perimeterBands));
  const reversedRoom = { ...room, shape: 'poly', points: [[0, 0], [0, 12], [12, 12], [12, 0]] };
  const reversed = draw({}, { extent: { w: 12, h: 12 }, rooms: [reversedRoom], boundaries: perimeterBoundaries });
  const reversedBands = reversed.layers.boundaries.filter(n => n.roomId === 'r' && n.attrs?.stroke === 'none');
  ok('reversing a room outline cannot reverse which way its walls fill', reversedBands.length === 4 && bandsStayInside(reversedBands));
  const rooms = [{ ...room, id: 'a', rect: [0, 0, 6, 12] }, { ...room, id: 'b', rect: [6, 0, 6, 12] }];
  const centredShared = draw({}, { extent: { w: 12, h: 12 }, rooms, boundaries: [
    { id: 'shared', room: 'a', wall: 'e', type: 'wall_exterior', props: { thicknessFt: 1, topFinish: 'granite_black' } },
  ] });
  const sharedBand = centredShared.layers.boundaries.find(n => n.roomId === 'a' && n.wall === 'e' && n.attrs?.stroke === 'none');
  const sharedXs = sharedBand.attrs.d.match(/-?\d+(?:\.\d+)?/g).map(Number).filter((_, i) => !(i % 2));
  ok('a wall shared by two indoor rooms keeps its centre line', Math.min(...sharedXs) === 110 && Math.max(...sharedXs) === 130);
  ok('wall finish is drawn in one clipped field', wide.layers.boundaries.filter(n => n.tag === 'g').length === 1);
  const adjoining = draw({}, { boundaries: [wall({ topFinish: 'granite_black' }), wall({ topFinish: 'granite_black' }, 'e', 'b2')] });
  ok('adjoining walls share a material field', adjoining.layers.boundaries.filter(n => n.tag === 'g').length === 1);
  const sameOptions = draw({}, { boundaries: [wall({ topFinish: 'granite_black' }),
    wall({ topFinish: 'granite_black', topFinishOptions: { color: flooring.types.granite_black.options.color } }, 'e', 'b2')] });
  ok('explicit material defaults share the same wall paint pass', sameOptions.layers.boundaries.filter(n => n.tag === 'g').length === 1);
  ok('walls share pattern definitions', defs(adjoining).length === defs(wide).length);
  const shared = draw({}, { rooms: [room, { ...room, id: 'other', rect: [14, 2, 10, 12] }], boundaries: [
    wall({ topFinish: 'granite_black' }, 'e'), { ...wall({ topFinish: 'granite_black' }, 'w', 'b2'), room: 'other' },
  ] });
  ok('shared wall material is painted once across two rooms', shared.layers.boundaries.filter(n => n.tag === 'g').length === 1);
  const partial = draw({}, { boundaries: [{ ...wall({ topFinish: 'granite_black' }), from: 5, to: 8 }] });
  const pd = partial.layers.defs.find(n => String(n.attrs?.id).startsWith('fpsWallSurface-')).children[0].attrs.d;
  const xs = pd.match(/-?\d+(?:\.\d+)?/g).map(Number).filter((_,i) => !(i%2));
  ok('partial material stops at its run endpoints', Math.max(...xs)-Math.min(...xs) === 60);
  const open = draw({}, { boundaries: [{ ...wall({ topFinish: 'granite_black' }), type: 'open_edge' }] });
  ok('an open edge has no horizontal wall top', !open.layers.defs.some(n => String(n.attrs?.id).startsWith('fpsWallSurface-')));
  const opts = { topFinish: 'granite_black', topFinishOptions: { color: '#abcdef' } };
  const varied = draw({ treadFinish: 'granite_black' }, { boundaries: [wall(opts)] });
  ok('material overrides never collide with original definitions', new Set(varied.layers.defs.filter(n => n.attrs?.id).map(n => n.attrs.id)).size === varied.layers.defs.filter(n => n.attrs?.id).length);
  const saved = clone(library);
  delete saved.types['furniture.stairs'].render.surface;
  saved.types['furniture.stairs'].props = saved.types['furniture.stairs'].props.filter(p => !p.key.startsWith('treadFinish'));
  saved.types['furniture.stairs'].defaults.w = 7;
  // Persist/reload the old registry just like an existing installation.
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fps-surfaces-'));
  try {
    const file = path.join(dir, 'library.json'); fs.writeFileSync(file, JSON.stringify(saved));
    const upgraded = require('../floorplan_studio/app/lib/store').upgradeDoc('library', JSON.parse(fs.readFileSync(file)));
    const t = upgraded.types['furniture.stairs'];
    ok('saved library gains the surface opt-in and both props', t.render.surface === 'treads' && t.props.filter(p => p.key.startsWith('treadFinish')).length === 2);
    ok('surface upgrade preserves user defaults', t.defaults.w === 7);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const curvedRoom = { id: 'r', shape: 'poly', points: [[2, 2], [14, 2], [14, 14, 10], [2, 14]] };
  const curve = draw({}, { rooms: [curvedRoom], boundaries: [wall({ topFinish: 'granite_black' }, 'e')] });
  ok('curved wall material follows every flattened segment', curve.layers.defs.find(n => String(n.attrs?.id).startsWith('fpsWallSurface-')).children.length > 3);
  const withDoor = draw({}, { boundaries: [wall({ topFinish: 'granite_black' })],
    openings: [{ id: 'o', room: 'r', wall: 'n', at: 6, w: 3, type: 'door' }] });
  ok('wall material leaves an opening between two runs', withDoor.layers.defs.find(n => String(n.attrs?.id).startsWith('fpsWallSurface-')).children.length === 2);
  const customLibrary = clone(library);
  customLibrary.types['furniture.stairs'].defaults.treadFinish = 'granite_black';
  ok('type default material is used', clips(draw({}, {}, customLibrary)).length === 1);
  ok('explicit null suppresses a type material default', clips(draw({ treadFinish: null }, {}, customLibrary)).length === 0);
  const card = require('../floorplan_studio/app/lib/card-build');
  const payload = card.trimProject({ ...project, floors: [{ ...floor, boundaries: [wall(opts)], items: [{ ...item, props: { ...item.props, treadFinish: 'granite_black' } }] }] });
  ok('card retains tread and wall surface properties', payload.floors[0].items[0].props.treadFinish === 'granite_black' && payload.floors[0].boundaries[0].props.topFinishOptions.color === '#abcdef');
  ok('card retains stair surface opt-in', card.trimLibrary(library).types['furniture.stairs'].render.surface === 'treads');
  const exportProject = { ...project, floors: [{ ...floor, boundaries: [wall(opts)], items: [{ ...item, props: { ...item.props, treadFinish: 'granite_black' } }] }] };
  const exporter = require('../floorplan_studio/app/lib/export-spec');
  const svg = exporter.build(exportProject, library, themes, 'svg', 'f', { boundaries, flooring }).files[0].content;
  ok('SVG exporter includes stair and wall material clips', svg.includes('fpsTread-stair') && svg.includes('fpsWallSurface-'));
  ok('SVG exporter uses the selected stone rather than fallback plain', svg.includes('#1c1c1e') && svg.includes('#abcdef'));
  ok('card retains all selectable floor finishes', Object.keys(card.trimFlooring(flooring).types).length === Object.keys(flooring.types).length);
};
