/* UI locations shared by the editor and help. Labels and property placement
 * belong here, not in a second documentation-only map. Parent links compose
 * paths; library types supply their own category, label and properties. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shapes'));
  else root.UINavigation = factory(root.Shapes);
}(typeof self !== 'undefined' ? self : this, function (Shapes) {
  'use strict';
  const locations = {
    topbar: { label: 'Top bar' },
    canvas: { label: 'Plan canvas' },
    'panel:library': { label: 'Device library', instruction: 'Open the library in the left sidebar — or, on a narrow screen where the sidebar is a drawer, with the ☰ button in the top bar.' },
    'panel:floor': { label: 'Floor', instruction: 'Choose a floor in the top bar, then clear the selection with Esc to show its inspector.' },
    'panel:room': { label: 'Room', instruction: 'Choose Select, then click inside a room to open its inspector on the right.' },
    'panel:item': { label: 'Item inspector', instruction: 'Choose Select, then click an item on the plan to open its inspector on the right. On a narrow screen the inspector is a drawer: use the Properties button in the top bar, or double-tap the item.' },
    'panel:opening': { label: 'Opening', instruction: 'Choose Select, then click a door, gate, shutter or window on the plan to open its inspector.' },
    'section:opening.mechanism': { parent: 'panel:opening', label: 'Opening mechanism' },
    'section:opening.state': { parent: 'panel:opening', label: 'State on the plan' },
    'dialog:sun': { parent: 'topbar', label: 'Sun', element: 'btnSun' },
    'dialog:lighting': { parent: 'topbar', label: 'Light', element: 'btnLighting' },
    'dialog:logic': { parent: 'topbar', label: 'Logic', element: 'btnLogic' },
    'dialog:dashboard': { parent: 'topbar', label: 'Dashboard…', element: 'btnDashboard' },
    'dialog:house-card': { parent: 'dialog:dashboard', label: 'Configure the house card…' },
    'dialog:floor-cards': { parent: 'dialog:dashboard', label: 'Configure the floor cards…' },
    'dialog:appearance': { parent: 'dialog:dashboard', label: 'Appearance & behaviour…' },
    'dialog:import': { parent: 'topbar', label: 'Import…', element: 'btnImport' },
    'dialog:export': { parent: 'topbar', label: 'Export…', element: 'btnExport' },
    'field:ui.advanced': { parent: 'topbar', label: 'Advanced', element: 'advancedMode', toggle: true },
    /* `glyph`: the control shows a symbol, so it is LABELLED for a screen
     * reader rather than having its text replaced with the label — rewriting
     * "S" to "Shortcut buttons" would break the button it names. */
    'field:ui.quickbar': { parent: 'topbar', label: 'Shortcut buttons', element: 'btnQuickBar', glyph: true },
    'field:ui.multiSelect': { parent: 'field:ui.quickbar', label: 'Multi' },
    'dialog:shortcuts': { parent: 'topbar', label: 'Keyboard shortcuts', element: 'btnShortcuts', glyph: true },
    'dialog:more': { parent: 'topbar', label: 'More', element: 'btnMore', glyph: true,
      instruction: 'On a narrow screen the top bar folds its Sun, Light, Logic, Dashboard, Import and Export buttons, the theme picker and the view switches into this menu.' },
    'field:project.activeTheme': { parent: 'topbar', label: 'Editor theme', element: 'themePick', input: true },
    'dialog:notes': { parent: 'topbar', label: 'Notes', element: 'btnNotes' },
    /* The grid controls are the one cluster that lives in the STATUS BAR
     * rather than in a panel or a dialog, so it needs saying outright — a
     * reader sent to "the floor inspector" for Snap would not find it. */
    'field:view.grid': { parent: 'canvas', label: 'Grid and snap', element: 'gridSize',
      instruction: 'Snap, Grid and the grid size are in the status bar under the plan.' },
    'section:item.look': { parent: 'panel:item', label: 'Look' },
    'section:item.colour': { parent: 'panel:item', label: 'Colour' },
    'dialog:schemes': { parent: 'section:item.colour', label: 'edit colours…' },
    'section:item.size': { parent: 'panel:item', label: 'Size' },
    'section:item.aim': { parent: 'panel:item', label: 'Aim and coverage' },
    'section:item.lamp': { parent: 'panel:item', label: 'Light output' },
    'section:item.properties': { parent: 'panel:item', label: 'Properties' },
    'section:item.channels': { parent: 'panel:item', label: 'Channels' },
    'section:item.entity': { parent: 'panel:item', label: 'Home Assistant' },
    'section:item.tap': { parent: 'panel:item', label: 'Tap area', advanced: true },
    'section:item.hold': { parent: 'panel:item', label: 'Long press opens', advanced: true },
    'field:item.room': { parent: 'panel:item', label: 'Room', advanced: true },
    'field:item.treadFinish': { parent: 'panel:item', label: 'Tread finish' },
    'field:room.id': { parent: 'panel:room', label: 'id' },
    'section:room.curved': { parent: 'panel:room', label: 'Curved walls', advanced: true },
    'section:room.label': { parent: 'panel:room', label: 'Name position', advanced: true },
    'section:room.daylight': { parent: 'panel:room', label: 'Room daylight', advanced: true },
    'section:opening.overhead': { parent: 'panel:opening', label: 'Overhead openings', advanced: true },
    'section:sun.model': { parent: 'dialog:sun', label: 'The daylight model', advanced: true },
    'section:lighting.model': { parent: 'dialog:lighting', label: 'The light model', advanced: true },
    'section:room.walls': { parent: 'panel:room', label: 'Walls & railings' },
    'section:room.controls': { parent: 'panel:room', label: 'Room controls' },
    'section:room.flooring': { parent: 'panel:room', label: 'Flooring' },
    'section:room.lighting': { parent: 'panel:room', label: 'Behaviour' },
    'dialog:flooring': { parent: 'section:room.flooring', label: 'edit finishes' },
    'dialog:boundaries': { parent: 'section:room.walls', label: 'edit treatments…' },
    'dialog:controls': { parent: 'section:room.controls', label: 'edit the house defaults…' },
    'field:controls.markerTap': { parent: 'dialog:controls', label: 'Tapping a marker' },
    'field:boundary.thicknessFt': { parent: 'section:room.walls', label: 'Wall top width (ft)' },
    'field:boundary.topFinish': { parent: 'section:room.walls', label: 'Wall top finish' },
    'dialog:room-buttons': { parent: 'section:room.controls', label: 'Entity buttons…', instruction: 'Enable room controls to show the entity buttons editor.' },
    'section:opening.covering': { parent: 'panel:opening', label: 'Covering' },
    'dialog:library': { parent: 'panel:library', label: 'edit', element: 'btnEditLibrary' },
    'tool:select': { parent: 'canvas', label: 'Select', tool: 'select' },
    'tool:rect': { parent: 'canvas', label: 'Room', tool: 'rect' },
    'tool:poly': { parent: 'canvas', label: 'Shape', tool: 'poly' },
    'tool:opening': { parent: 'canvas', label: 'Opening', tool: 'aperture' },
    'tool:pan': { parent: 'canvas', label: 'Pan', tool: 'pan' },
  };
  const aliases = {
    'tool:place': 'panel:library', 'registry:library': 'dialog:library',
    'registry:flooring': 'dialog:flooring', 'registry:boundaries': 'section:room.walls',
    'registry:controls': 'section:room.controls', 'field:room.flooring': 'section:room.flooring',
    'field:room.curve': 'section:room.curved', 'field:room.controls': 'section:room.controls',
    'field:room.master': 'section:room.lighting', 'field:room.ganged': 'section:room.lighting',
    'field:opening.covering': 'section:opening.covering', 'field:opening.curtain': 'section:opening.covering',
    'field:item.entity': 'section:item.entity', 'field:item.variant': 'section:item.look',
    'field:item.scheme': 'section:item.colour', 'registry:schemes': 'dialog:schemes',
    'field:item.rot': 'section:item.aim', 'field:item.cone': 'section:item.aim',
    'field:item.fov': 'section:item.aim', 'field:item.range': 'section:item.aim',
    'field:item.watt': 'section:item.lamp', 'field:item.kelvin': 'section:item.lamp',
    'section:item.stairs': 'section:item.properties', 'section:floor.sun': 'dialog:sun',
    'field:project.compass': 'dialog:sun', 'panel:dashboard': 'dialog:dashboard',
    'panel:project': 'dialog:import',
    /* Fields a topic addresses that have no control of their own to point at —
     * they sit among the plain inputs of the panel named here. Aliased rather
     * than registered so the access path says "the floor inspector", which is
     * what a reader is actually looking for, instead of naming a row.
     *
     * These six were being written about and routing NOWHERE: `applies:` only
     * validated a selector's PREFIX, never that its target existed, so
     * `field:opening.at` passed every check while nothing could ever ask for
     * it. The suite now walks these, which is what keeps this list honest. */
    'field:floor.extent': 'panel:floor', 'field:floor.level': 'panel:floor',
    'field:floor.grid': 'field:view.grid', 'field:room.showCount': 'section:room.label',
    'field:opening.at': 'panel:opening', 'field:opening.wall': 'panel:opening',
  };
  const groups = { size: ['w', 'h'], aim: ['rot', 'fov', 'range', 'cone'], lamp: ['watt', 'count', 'efficacy', 'beam', 'kelvin'] };
  function label(id) { return locations[aliases[id] || id]?.label || id; }
  function propLabel(type, key) { return (type.props || []).find((p) => p.key === key)?.label || key; }
  function route(id) {
    id = aliases[id] || id;
    const steps = [], seen = new Set();
    for (let key = id; key;) {
      if (seen.has(key) || !locations[key]) throw new Error('Invalid UI location: ' + key);
      seen.add(key);
      steps.unshift(Object.assign({ id: key }, locations[key]));
      key = locations[key].parent;
    }
    return { id, steps, advanced: steps.some((s) => s.advanced) };
  }
  function looks(type) {
    const r = type.render || {};
    return r.family ? Shapes.variantsOf(r.family) : type.kind === 'furniture' ? Shapes.furnitureVariantsOf(r.shape) : [];
  }
  function propSection(type, prop) {
    if (prop.type === 'channels') return 'channels';
    if (prop.key === 'hitRect') return 'tap';
    if (prop.key === 'variant' && looks(type).length > 1) return 'look';
    if (groups.size.includes(prop.key)) return 'size';
    if (groups.aim.includes(prop.key)) return 'aim';
    if (type.kind === 'fixture' && groups.lamp.includes(prop.key)) return 'lamp';
    return 'properties';
  }
  function forType(key, type, library, prop) {
    const category = (library.categories || []).find((c) => c.id === type.category);
    const place = [label('panel:library'), category?.label, type.label || key].filter(Boolean);
    const section = prop ? propSection(type, prop) : null;
    const steps = [ { label: 'Select ' + (type.label || key) + ' on the plan' },
      { label: label('panel:item') } ];
    if (section) steps.push({ id: 'section:item.' + section, label: section === 'channels' ? prop.label || label('section:item.channels') : label('section:item.' + section) });
    if (prop && !['look', 'channels'].includes(section)) steps.push({ label: prop.label || prop.key });
    const advanced = !!prop?.advanced || section === 'tap';
    const requirements = [];
    if (advanced) requirements.push('Enable ' + label('field:ui.advanced') + ' in the top bar.');
    if (prop && ['fov', 'range'].includes(prop.key) && (type.props || []).some((p) => p.key === 'cone')) {
      requirements.push('Enable ' + propLabel(type, 'cone') + ' in ' + label('section:item.aim') + ' to reveal this setting.');
    }
    return { id: key + (prop ? '.' + prop.key : ''), steps, advanced, requirements,
      placement: place, instruction: 'To add one, choose ' + place.join(' → ') + ', then click the plan. Press Esc to stop placing.' };
  }
  function forSelectors(selectors) {
    const routes = new Map();
    for (const s of selectors) {
      const id = aliases[s] || s;
      if (locations[id]) routes.set(id, route(id));
    }
    // A section path already includes its parent. Keep the useful, specific path.
    return [...routes.values()].filter((r) => ![...routes.values()].some((other) => other.id !== r.id && other.steps.some((s) => s.id === r.id)));
  }
  function bind(document) {
    for (const [id, loc] of Object.entries(locations)) {
      const el = loc.element ? document.getElementById(loc.element) : loc.tool ? document.querySelector('[data-tool="' + loc.tool + '"]') : null;
      if (!el) continue;
      el.setAttribute('data-ui-location', id);
      if (loc.input || loc.glyph) el.setAttribute('aria-label', loc.label);
      else if (loc.toggle) {
        const text = [...el.parentNode.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
        if (text) text.textContent = ' ' + loc.label;
      } else {
        const text = [...el.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
        if (text) text.textContent = loc.label;
      }
    }
  }
  return { locations, aliases, groups, label, propLabel, route, looks, propSection, forType, forSelectors, bind };
}));
