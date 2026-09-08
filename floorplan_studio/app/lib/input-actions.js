/**
 * input-actions.js — every command the editor has, and how each device says it.
 *
 * ## Why this is one list
 *
 * The same fifteen commands were written down in four places: the `keydown`
 * switch in `main.js`, the table in the "Keyboard shortcuts" dialog, the prose
 * in `app/help/canvas-tools.md`, and the site built from it. Nothing tied them
 * together, so the dialog could promise a key nothing bound and the help could
 * describe a gesture that had never been implemented — which is exactly what
 * had happened: every tooltip said Space panned the canvas and no code
 * anywhere read the space bar.
 *
 * So the catalogue is the source and everything else reads it:
 *
 *   main.js          binds `match` to a handler of the same `id`
 *   the shortcut bar the buttons a keyboardless tablet taps instead
 *   the dialog       "Keyboard shortcuts", grouped by `group`
 *   help.js          a generated catalogue inside `input-devices`, so the
 *                    editor sheet, MCP's get_help and the site all say what
 *                    the code actually does
 *   the suite        asserts every action has a handler and a button, that no
 *                    two actions claim one key, and that the prose is derived
 *
 * Runs unmodified in Node and the browser, like every other file in `lib/`:
 * the docs build reads it under Node, the page gets the same bytes served at
 * `js/input-actions.js`.
 *
 * ## What is NOT here
 *
 * Behaviour. An action knows its name, its keys, whether it needs a selection
 * and how it should read on a button; what it DOES lives in `main.js`, next to
 * the things it acts on. A catalogue that could run code would be a second
 * place to look for what a key does.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.InputActions = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Written once. Ctrl on Windows and Linux, Cmd on a Mac — the code treats
   * them as the same modifier, so the label has to as well. */
  const MOD = 'Ctrl/Cmd';

  /* `needs` decides whether a shortcut-bar button is live. A key press never
   * consults it: pressing Delete with nothing selected has always been a
   * no-op, but a BUTTON that looks pressable and does nothing is a bug
   * report. The vocabulary is closed — see `NEEDS`. */
  const NEEDS = ['undo', 'redo', 'selection', 'poly'];

  const ACTIONS = [
    /* ---- tools ----
     *
     * They are in the shortcut bar as well as the rail because the rail is a
     * drawer on a narrow screen: without them, changing tool on a tablet
     * costs two taps and covers the plan in between. Their icons are not
     * drawn here — the bar clones the rail's own SVG, so there is one drawing
     * of each tool rather than a second set to keep in step. */
    { id: 'tool-select', group: 'Tools', label: 'Select / move', tool: 'select',
      keys: ['V'], match: [{ key: 'v' }], quick: true,
      hint: 'Pick, move, resize and rotate what is already on the plan.' },
    { id: 'tool-rect', group: 'Tools', label: 'Draw a rectangular room', tool: 'rect',
      keys: ['R'], match: [{ key: 'r' }], quick: true,
      hint: 'Drag a rectangle; it becomes a room.' },
    { id: 'tool-poly', group: 'Tools', label: 'Draw a room outline', tool: 'poly',
      keys: ['P'], match: [{ key: 'p' }], quick: true,
      hint: 'Click or tap each corner, then finish the outline.' },
    { id: 'tool-aperture', group: 'Tools', label: 'Place a door, window or opening', tool: 'aperture',
      keys: ['A'], match: [{ key: 'a' }], quick: true,
      hint: 'Click near a wall — an opening has to sit on one.' },
    { id: 'tool-pan', group: 'Tools', label: 'Pan', tool: 'pan',
      keys: ['H'], match: [{ key: 'h' }], quick: true,
      hint: 'Drag to move the plan around. Space does the same thing while held.' },

    /* ---- placing ---- */
    /* No button. Every gesture Esc backs out of has a nearer way out already —
     * a dialog has its ✕, placing ends by choosing Select, a selection drops
     * when you tap the floor — and a row of buttons long enough to include the
     * redundant ones is a row nobody reads. */
    { id: 'escape', group: 'Placing', label: 'Stop placing, deselect, close a dialog',
      glyph: 'Esc', keys: ['Esc'], match: [{ key: 'Escape' }], anywhere: true,
      hint: 'The one key that always backs out of whatever you are in the middle of.' },
    { id: 'multi', group: 'Placing', label: 'Add to the selection',
      glyph: 'Multi', keys: ['Shift+click'], quick: true, toggle: true,
      hint: 'Shift-click adds and removes on a mouse. On a touch screen there is no Shift,'
        + ' so this button latches the same behaviour: every tap adds, and a drag across'
        + ' empty floor draws a selection box instead of panning.' },

    /* ---- the selection ---- */
    { id: 'nudge-left', group: 'The selected item or room', label: 'Move left',
      glyph: '←', keys: ['←'], match: [{ key: 'ArrowLeft' }], quick: true, needs: 'selection',
      hint: 'Three inches at a time; hold Shift for a foot.' },
    { id: 'nudge-up', group: 'The selected item or room', label: 'Move up',
      glyph: '↑', keys: ['↑'], match: [{ key: 'ArrowUp' }], quick: true, needs: 'selection' },
    { id: 'nudge-down', group: 'The selected item or room', label: 'Move down',
      glyph: '↓', keys: ['↓'], match: [{ key: 'ArrowDown' }], quick: true, needs: 'selection' },
    { id: 'nudge-right', group: 'The selected item or room', label: 'Move right',
      glyph: '→', keys: ['→'], match: [{ key: 'ArrowRight' }], quick: true, needs: 'selection' },
    { id: 'rotate-left', group: 'The selected item or room', label: 'Turn anticlockwise',
      glyph: '↺', keys: ['['], match: [{ key: '[' }], quick: true, needs: 'selection',
      hint: '15° a step, or 45° with Shift held.' },
    { id: 'rotate-right', group: 'The selected item or room', label: 'Turn clockwise',
      glyph: '↻', keys: [']'], match: [{ key: ']' }], quick: true, needs: 'selection' },
    { id: 'smaller', group: 'The selected item or room', label: 'Smaller',
      glyph: '−', keys: ['−'], match: [{ key: '-' }, { key: '_' }], quick: true, needs: 'selection' },
    { id: 'bigger', group: 'The selected item or room', label: 'Bigger',
      glyph: '+', keys: ['+'], match: [{ key: '+' }, { key: '=' }], quick: true, needs: 'selection' },
    { id: 'duplicate', group: 'The selected item or room', label: 'Duplicate',
      glyph: '⊕', keys: [MOD + '+D'], match: [{ key: 'd', mod: true }], quick: true, needs: 'selection',
      hint: 'Drops a copy a short step away, already selected.' },
    { id: 'delete', group: 'The selected item or room', label: 'Remove',
      glyph: '✕', keys: ['Delete', 'Backspace'], match: [{ key: 'Delete' }, { key: 'Backspace' }],
      quick: true, needs: 'selection' },

    /* ---- editing ---- */
    { id: 'undo', group: 'Editing', label: 'Undo',
      glyph: '↶', keys: [MOD + '+Z'], match: [{ key: 'z', mod: true, shift: false }],
      quick: true, needs: 'undo' },
    { id: 'redo', group: 'Editing', label: 'Redo',
      glyph: '↷', keys: [MOD + '+Shift+Z', MOD + '+Y'],
      match: [{ key: 'z', mod: true, shift: true }, { key: 'y', mod: true }],
      quick: true, needs: 'redo',
      hint: MOD + '+Y as well as ' + MOD + '+Shift+Z, because Windows editors bind the first and Mac ones the second.' },
    { id: 'save', group: 'Editing', label: 'Save',
      glyph: '⤓', keys: [MOD + '+S'], match: [{ key: 's', mod: true }],
      hint: 'The plan also autosaves a second and a half after you stop editing.' },
    { id: 'finish-poly', group: 'Editing', label: 'Finish the outline you are drawing',
      glyph: '✓', keys: ['Enter', 'Double-click'], match: [{ key: 'Enter' }],
      quick: true, needs: 'poly' },

    /* ---- view ---- */
    { id: 'zoom-fit', group: 'View', label: 'Fit the floor in the window',
      glyph: 'Fit', keys: [MOD + '+0'], match: [{ key: '0', mod: true }],
      hint: 'The fastest way back to something you placed a long way outside the house.' },
    { id: 'zoom-out', group: 'View', label: 'Zoom out',
      glyph: '−', keys: [MOD + '+−'], match: [{ key: '-', mod: true }, { key: '_', mod: true }],
      hint: 'The status bar carries −, + and Fit as buttons at every window size, which is why the shortcut bar does not repeat them.' },
    { id: 'zoom-in', group: 'View', label: 'Zoom in',
      glyph: '+', keys: [MOD + '+='], match: [{ key: '=', mod: true }, { key: '+', mod: true }] },
    { id: 'shortcut-bar', group: 'View', label: 'Show or hide the shortcut buttons',
      glyph: 'S', keys: ['S'], match: [{ key: 's', mod: false }], toggle: true,
      hint: 'The same row of buttons the **S** in the top bar opens.' },
    { id: 'shortcuts', group: 'View', label: 'This list',
      glyph: '?', keys: ['?'], match: [{ key: '?' }],
      hint: 'Also the ⌨ button in the top bar.' },
  ];

  /* How to get around the plan, per device. This is the table people actually
   * need — "can I pinch to zoom" is a question about a device, not about a
   * command — and it is the reason the catalogue has two halves: an action has
   * a key, a gesture has three answers and no key at all. */
  const GESTURES = [
    { id: 'pan', label: 'Move around a zoomed-in plan',
      mouse: 'Drag with the middle button, hold Space and drag, or use the H tool. The scroll wheel scrolls.',
      trackpad: 'Two-finger scroll, in any direction.',
      touch: 'Drag one finger on empty floor, or two fingers anywhere — including over a room.' },
    { id: 'zoom', label: 'Zoom',
      mouse: MOD + ' and the scroll wheel, or the − / + buttons in the status bar.',
      trackpad: 'Pinch. It zooms about the pointer, so the thing under it stays under it.',
      touch: 'Pinch with two fingers. It zooms about the middle of the pinch.' },
    { id: 'select', label: 'Select one thing',
      mouse: 'Click it.', trackpad: 'Click or tap it.', touch: 'Tap it.' },
    { id: 'multi', label: 'Select several',
      mouse: 'Shift-click each, or drag a box across empty floor.',
      trackpad: 'Shift-click each, or drag a box across empty floor.',
      touch: 'Turn on **Multi** in the shortcut bar, then tap each one; a drag then draws the box.' },
    { id: 'move', label: 'Move something',
      mouse: 'Drag it. Hold Alt to ignore the alignment guides.',
      trackpad: 'Drag it. Hold Alt to ignore the alignment guides.',
      touch: 'Drag it, or select it and use the arrow buttons for an exact few inches.' },
    { id: 'straight', label: 'Drag or extend in a straight line',
      mouse: 'Keep going the way you started and it locks to that axis — a dashed line shows which. A 45° drag locks to the diagonal. Shift locks immediately; Alt turns it off.',
      trackpad: 'Keep going the way you started and it locks to that axis — a dashed line shows which. A 45° drag locks to the diagonal. Shift locks immediately; Alt turns it off.',
      touch: 'Keep going the way you started and it locks to that axis, so a thumb that slips sideways while stretching a room upward no longer widens it. Move well off the line to let go.' },
    { id: 'place', label: 'Place something from the library',
      mouse: 'Click the type then click the plan, or drag the type onto the plan.',
      trackpad: 'Click the type then click the plan, or drag the type onto the plan.',
      touch: 'Tap the type, then tap the plan. It stays armed, so ten of the same fixture is ten taps.' },
    { id: 'properties', label: 'Open the properties of what you selected',
      mouse: 'The inspector is always on the right.',
      trackpad: 'The inspector is always on the right.',
      touch: 'On a narrow screen it is a drawer: the ▤ button in the top bar, or double-tap the thing.' },
  ];

  /* The three things a pointer can be, in the order the tables read best.
   * `pointerType` is what the browser reports; a Surface reports both over its
   * life, which is why the editor sizes its handles from the LAST pointer used
   * rather than from a media query answered once at load. */
  const DEVICES = [
    ['mouse', 'Mouse and keyboard'],
    ['trackpad', 'Trackpad'],
    ['touch', 'Touch'],
  ];

  const byId = (id) => ACTIONS.find((a) => a.id === id) || null;
  const quick = () => ACTIONS.filter((a) => a.quick);

  /* Groups in catalogue order, which is deliberate: the dialog and the
   * shortcut bar both read top to bottom, and "what tool am I in" comes before
   * "what do I do to the thing I picked". */
  function groups(list) {
    const out = [];
    for (const a of list || ACTIONS) {
      const row = out.find((g) => g[0] === a.group);
      if (row) row[1].push(a); else out.push([a.group, [a]]);
    }
    return out;
  }

  /* Does this keyboard event ask for an action? One matcher per accepted
   * spelling; `shift` is only consulted when the matcher names it, because
   * Shift is a MODIFIER on most of these (a bigger nudge, a coarser turn)
   * rather than part of what is being asked for. */
  function matchKey(ev) {
    const mod = !!(ev.ctrlKey || ev.metaKey);
    const key = String(ev.key || '');
    for (const a of ACTIONS) {
      for (const m of a.match || []) {
        if (String(m.key).toLowerCase() !== key.toLowerCase()) continue;
        if (!!m.mod !== mod) continue;
        if (m.shift !== undefined && !!m.shift !== !!ev.shiftKey) continue;
        return a;
      }
    }
    return null;
  }

  /* ---- the generated help ----
   *
   * Markdown, because that is what the corpus is: `help.js` appends this to
   * the authored `input-devices` topic exactly the way it appends the flooring
   * and opening catalogues to theirs. The editor's sheet, MCP and the site
   * then all render the same text, and none of them can describe a key that
   * this file does not bind. */
  function reference() {
    const out = [];

    out.push('### Getting around the plan', '');
    out.push('| | ' + DEVICES.map((d) => d[1]).join(' | ') + ' |');
    out.push('| --- | --- | --- | --- |');
    for (const g of GESTURES) {
      out.push(`| **${g.label}** | ${g.mouse} | ${g.trackpad} | ${g.touch} |`);
    }

    for (const [group, list] of groups()) {
      out.push('', '### ' + group, '');
      out.push('| Keys | What it does | Button |');
      out.push('| --- | --- | --- |');
      for (const a of list) {
        const keys = (a.keys || []).map((k) => '`' + k + '`').join(' or ') || '—';
        const said = [a.label, a.hint].filter(Boolean).join('. ').replace(/\.\./g, '.');
        out.push(`| ${keys} | ${said} | ${a.quick ? 'yes' : '—'} |`);
      }
    }

    out.push('', 'Every row marked **yes** above is also a button in the shortcut bar —'
      + ' the **S** in the top bar — so a tablet with no keyboard attached can reach all of'
      + ` them. That is ${quick().length} of the ${ACTIONS.length} commands; the rest are`
      + ' either already a button somewhere else in the chrome or only meaningful with a'
      + ' keyboard in front of you.');

    return out.join('\n');
  }

  return { MOD, NEEDS, ACTIONS, GESTURES, DEVICES, byId, quick, groups, matchKey, reference };
}));
