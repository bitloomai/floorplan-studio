/* The configuration-heavy panels: flooring, wall treatments, the room control
 * popup, openings/doors, and the sun.
 *
 * Split out of panels.js because these are the parts that read the REGISTRIES
 * rather than the project — every list here is built from flooring.json,
 * boundaries.json, controls.json or the sun defaults, so adding a flooring type or
 * a railing style shows up in the UI with no code change at all. */
window.PanelsExtra = (function () {
  'use strict';

  const S = Store.S;
  const P = () => window.Panels;
  const h = (...a) => P().h(...a);
  const field = (...a) => P().field(...a);
  const numInput = (...a) => P().numInput(...a);
  const modal = (...a) => P().modal(...a);
  const pickEntity = (...a) => P().pickEntity(...a);
  const panelTitle = (...a) => P().panelTitle(...a);
  const helpBtn = (...a) => P().helpBtn(...a);
  const toast = (...a) => P().toast(...a);

  function settingHelp(summary, title, ...tips) {
    return h('div', { class: 'setting-help' }, h('p', {}, summary),
      h('details', {}, h('summary', {}, title), h('ul', {}, ...tips.map(tip => h('li', {}, tip)))));
  }

  /* Screen edge -> the compass word the project's bearing says it means.
   * Screen-relative everywhere, compass only for display: mixing the two is
   * the classic way to put a window on the wrong side of a house.
   *
   * Derived from `sun.screenUpBearing` rather than read from
   * `project.compass` — that field used to be an independent default that
   * nothing updated when the bearing changed, so the needle would rotate and
   * this label would not. See `SunModel.compassLetters`. */
  const EDGE = { n: 'top', e: 'right', s: 'bottom', w: 'left' };
  function wallLabel(wall) {
    const bearing = (S.project && S.project.sun && S.project.sun.screenUpBearing) || 0;
    const c = SunModel.compassLetters(bearing);
    const map = { n: c.up, e: c.right, s: c.down, w: c.left };
    return `${EDGE[wall]} (${map[wall] || '?'})`;
  }

  /* ---------------------------------------------------------- flooring ---- */

  function flooringField(box, room) {
    const group = h('section', { class: 'settings-group', 'aria-label': 'Floor finish' }, h('h3', {}, 'Floor finish'));
    box.appendChild(group);
    box = group;
    const types = Object.entries((S.flooring && S.flooring.types) || {});
    const groups = [...new Set(types.map(([, t]) => t.group || 'Other'))];
    const cur = room.flooring || 'plain';
    const picker = h('select', {
      onchange: (e) => Store.mutate(() => { room.flooring = e.target.value; }, 'flooring'),
    }, ...groups.map((g) => h('optgroup', { label: g },
      ...types.filter(([, t]) => (t.group || 'Other') === g)
        .map(([k, t]) => h('option', { value: k, selected: cur === k }, t.label || k)))));

    /* The picker chooses WHICH finish; this opens what a finish IS. They were
     * previously two different things with only the first reachable — you could
     * say "this room is oak" and had no way to say what oak looks like. */
    const row = h('div', { class: 'field' },
      h('label', { 'data-ui-location': 'section:room.flooring' }, UINavigation.label('section:room.flooring'),
        h('button', {
          class: 'link', style: 'float:right;font-weight:400',
          title: 'Change what this finish looks like, or add one',
          onclick: () => editFlooring(cur),
        }, UINavigation.label('dialog:flooring'))),
      picker);
    box.appendChild(row);

    const def = (S.flooring && S.flooring.types && S.flooring.types[cur]) || {};
    if (def.generator === 'script') {
      box.appendChild(h('p', { class: 'hint' }, 'This finish is drawn by a script. Its options are editable under “edit finishes”; the script body itself lives in flooring.json.'));
    }
    // Per-room overrides of the flooring's own options — angle and colour are
    // the two people actually want to vary room to room.
    const o = room.flooringOptions || {};
    box.appendChild(h('div', { class: 'field row' },
      h('div', {}, h('label', {}, 'Angle'), numInput(o.angle ?? (def.options || {}).angle ?? 0,
        (v) => Store.mutate(() => { room.flooringOptions = Object.assign({}, room.flooringOptions, { angle: v ?? 0 }); }, 'flooring angle'), 15)),
      h('div', {}, h('label', {}, 'Colour'), h('input', {
        /* `onchange`, not `oninput`: a native colour input fires `input` on
         * every drag tick while its picker is open, and `Store.mutate` repaints
         * the ENTIRE room panel synchronously (see `renderInspector`'s
         * `box.replaceChildren()`) — which recreates this very element mid-drag
         * and closes the browser's own picker the instant it opens. `change`
         * fires once, when the picker commits, by which point tearing the
         * panel down is harmless. */
        type: 'color', value: normHex(o.color || (def.options || {}).color || '#e6eaf0'),
        onchange: (e) => Store.mutate(() => { room.flooringOptions = Object.assign({}, room.flooringOptions, { color: e.target.value }); }, 'flooring colour'),
      })),
    ));
    /* How much light this floor throws back.
     *
     * A property of the SURFACE, not of the lamps: white polished marble bounces
     * light round the room and black granite swallows it, so two identical
     * fittings over them are not the same amount of usable light. Each flooring
     * type carries its real figure; this is the per-room override, because the
     * same tile comes in gloss and matte and only the person standing in the
     * room knows which was laid. */
    const typeR = def.reflectance ?? (def.options || {}).reflectance ?? 0;
    const curR = o.reflectance ?? typeR;
    box.appendChild(field(`Reflection — ${Math.round(curR * 100)}%`, h('input', {
      type: 'range', min: 0, max: 100, step: 1, value: Math.round(curR * 100),
      onchange: (e) => Store.mutate(() => {
        room.flooringOptions = Object.assign({}, room.flooringOptions, { reflectance: Number(e.target.value) / 100 });
      }, 'floor reflection'),
    })));
    box.appendChild(settingHelp(
      `${def.label || cur}: ${Math.round(typeR * 100)}% reflection by default.`, 'Choosing reflection',
      'Raise it for a glossy finish; lower it for matte or dark stone.',
      'More reflection makes the room brighter with the same lighting.',
      'Use 0% for a flat colour that reflects no light.'));

    if (room.flooringOptions) {
      box.appendChild(h('button', { class: 'btn tiny', onclick: () => Store.mutate(() => { room.flooringOptions = null; }, 'reset flooring') }, 'Reset to the type’s own look'));
    }
  }

  /* ----------------------------------------------- the boundaries editor ---
   *
   * The room panel chooses WHICH treatment a wall run has. Nothing chose what a
   * treatment IS — `API.saveBoundaries` existed and no part of the editor ever
   * called it, exactly as `saveFlooring` sat unused before the flooring editor.
   * So a wall was 0.75 ft thick because that is what shipped, and a jali passed
   * half the daylight because that is what shipped, and changing either meant
   * hand-editing boundaries.json inside the container.
   *
   * Three registries live in this one document and they are genuinely
   * different things, so they get three tabs rather than one merged list:
   * what a WALL RUN is made of, what an OPENING is, and what COVERS one.
   *
   * `transmission` is the field to be careful with: it feeds BOTH light models
   * — daylight coming in and a lamp's glow going out — so it is not styling,
   * and the editor says so rather than presenting it as one number among
   * several. */

  let boundariesTimer;
  function boundariesChanged() {
    Canvas.paint();
    Store.emit('selection');
    clearTimeout(boundariesTimer);
    boundariesTimer = setTimeout(() => API.saveBoundaries(S.boundaries)
      .catch((e) => toast(e.message, true)), 600);
  }

  /* Where a treatment is actually used, asked before anything destructive and
   * shown beside it either way: a number here is the difference between "this
   * is a spare" and "this is every external wall in the house". */
  function usesOfBoundary(key) {
    const out = [];
    for (const f of (S.project.floors || [])) {
      for (const b of (f.boundaries || [])) if (b.type === key) out.push(`${f.name || f.id} / ${b.room}`);
    }
    return out;
  }
  function usesOfOpening(key) {
    const out = [];
    for (const f of (S.project.floors || [])) {
      for (const o of (f.openings || [])) if (o.type === key) out.push(`${f.name || f.id} / ${o.room}`);
    }
    return out;
  }

  function editBoundaries(startTab) {
    const doc = S.boundaries || (S.boundaries = {});
    doc.types = doc.types || {};
    doc.openingTypes = doc.openingTypes || {};
    doc.coverings = doc.coverings || {};
    let tab = startTab || 'types';
    const A = P().dialogAdvanced();

    const body = h('div', {});
    const listBox = h('div', { style: 'max-height:200px;overflow:auto;border:1px solid var(--panelBorder);border-radius:6px;padding:4px' });
    const formBox = h('div', {});
    const current = { types: null, openingTypes: null, coverings: null };

    const num = (label, obj, key, step, hint, fallback) => field(label, h('input', {
      type: 'number', step, value: obj[key] ?? '',
      placeholder: fallback === undefined ? '' : String(fallback),
      onchange: (e) => {
        if (e.target.value === '') delete obj[key]; else obj[key] = Number(e.target.value);
        boundariesChanged();
      },
    }), hint);

    const text = (label, obj, key, hint, placeholder) => field(label, h('input', {
      type: 'text', value: obj[key] ?? '', placeholder: placeholder || '',
      onchange: (e) => {
        if (!e.target.value.trim()) delete obj[key]; else obj[key] = e.target.value.trim();
        boundariesChanged();
      },
    }), hint);

    /* A fraction of the light that crosses this thing. Drawn as a slider AND a
     * number because the two questions are different: "roughly how open is
     * this" is a drag, and "make it exactly 0.42 like the spec sheet says" is
     * typing. They write the same value. */
    function transmissionRow(obj, key, label, hint) {
      const readout = h('span', { class: 'mono' }, String(obj[key] ?? 0));
      const write = (v) => { obj[key] = v; readout.textContent = String(v); boundariesChanged(); };
      return h('div', { class: 'field' },
        h('label', {}, label, ' — ', readout),
        h('div', { style: 'display:flex;gap:8px;align-items:center' },
          h('input', {
            type: 'range', min: 0, max: 1, step: 0.01, value: obj[key] ?? 0,
            onchange: (e) => write(Number(e.target.value)),
          }),
          h('input', {
            type: 'number', min: 0, max: 1, step: 0.01, value: obj[key] ?? 0, style: 'width:80px',
            onchange: (e) => write(Math.max(0, Math.min(1, Number(e.target.value) || 0))),
          })),
        h('p', { class: 'hint' }, hint));
    }

    function drawList() {
      const bag = doc[tab];
      const groups = [...new Set(Object.values(bag).map((t) => t.group || 'Other'))];
      listBox.replaceChildren(...groups.map((g) => h('div', {},
        h('div', { class: 'subhead', style: 'margin:6px 0 2px;border-top:0;padding-top:0' }, g),
        ...Object.entries(bag)
          .filter(([, t]) => (t.group || 'Other') === g)
          .map(([k, t]) => h('button', {
            class: 'btn tiny',
            style: 'display:block;width:100%;text-align:left;margin-bottom:2px'
              + (k === current[tab] ? ';outline:2px solid var(--accent)' : ''),
            onclick: () => { current[tab] = k; draw(); },
          }, `${t.label || k}  ·  passes ${Math.round((t.transmission ?? 0) * 100)}%`)))));
    }

    function drawForm() {
      const key = current[tab];
      const t = doc[tab][key];
      formBox.replaceChildren();
      if (!t) { formBox.appendChild(h('p', { class: 'empty' }, 'Pick one on the left.')); return; }
      formBox.appendChild(h('div', { class: 'subhead' }, `${t.label || key}  ·  ${key}`));
      formBox.appendChild(text('Name', t, 'label'));
      formBox.appendChild(text('Group', t, 'group', 'Groups the picker’s list. A new name makes a new group.'));

      if (tab === 'types') {
        formBox.appendChild(transmissionRow(t, 'transmission', 'Daylight it passes',
          'Feeds BOTH light models — daylight coming in and a lamp’s glow going out — so this is '
          + 'not styling. 1 is an open edge, 0 is solid masonry, and a jali is about half.'));
        A.adv(formBox, (box) => {
          box.appendChild(num('Thickness (ft)', t, 'thicknessFt', 0.05,
            'How thick the run is drawn. 0 draws a line rather than a wall, which is what an '
            + 'open edge or a threshold wants.'));
          box.appendChild(num('Height (ft)', t, 'heightFt', 0.5,
            'How high it stands. A railing and a parapet differ by this and little else; it is '
            + 'what tells the plan a balcony edge is not a wall.'));
          box.appendChild(text('Tint', t, 'tint',
            'A colour light takes on as it crosses — bronze glazing, a green polycarbonate sheet. '
            + 'Clear glazing has none and simply carries the lamp’s own colour through.', '#rrggbb'));
        });
        const used = usesOfBoundary(key);
        formBox.appendChild(h('p', { class: 'hint' }, used.length
          ? `Used on ${used.length} wall run${used.length === 1 ? '' : 's'}: ${used.slice(0, 4).join(', ')}${used.length > 4 ? ' …' : ''}`
          : 'Not used anywhere in this plan yet.'));
      }

      if (tab === 'openingTypes') {
        const p = t.props || (t.props = {});
        formBox.appendChild(h('div', { class: 'field row' },
          h('div', {}, h('label', {}, 'Default width (ft)'), h('input', {
            type: 'number', step: 0.25, value: p.w ?? '',
            onchange: (e) => { p.w = Number(e.target.value) || undefined; boundariesChanged(); },
          })),
          h('div', {}, h('label', {}, 'Default height (ft)'), h('input', {
            type: 'number', step: 0.25, value: p.h ?? '',
            onchange: (e) => { p.h = Number(e.target.value) || undefined; boundariesChanged(); },
          }))));
        formBox.appendChild(transmissionRow(t, 'transmission', 'Daylight it passes when SHUT',
          'A shut window still passes most of its light; a shut door passes none.'));
        A.adv(formBox, (box) => {
          box.appendChild(transmissionRow(t, 'openTransmission', 'Daylight it passes when OPEN',
            'Almost always 1 — an open hole passes everything. It is separate from the shut '
            + 'figure because that is the whole point of a door: the two states are not the same '
            + 'opening, and a plan drawn at midday with the doors open is a different plan.'));
          box.appendChild(text('Hint', t, 'hint',
            'One line shown wherever this type is offered, and in its generated documentation.'));
        });
        const used = usesOfOpening(key);
        formBox.appendChild(h('p', { class: 'hint' }, used.length
          ? `Used by ${used.length} opening${used.length === 1 ? '' : 's'}.`
          : 'Not used anywhere in this plan yet.'));
      }

      if (tab === 'coverings') {
        formBox.appendChild(transmissionRow(t, 'closed', 'Daylight it passes when CLOSED',
          'A blackout blind is 0. A sheer curtain is most of the way to 1, which is why drawing '
          + 'them the same way makes a room read wrong at both ends of the day.'));
        formBox.appendChild(transmissionRow(t, 'open', 'Daylight it passes when OPEN',
          'What is left of the opening once the covering is out of the way.'));
      }
      A.note(formBox, 'the parts of a treatment a plan rarely needs to change');
    }

    function draw() { drawList(); drawForm(); }

    const tabBtn = (id, label) => h('button', {
      class: 'btn tiny', style: tab === id ? 'outline:2px solid var(--accent)' : '',
      onclick: () => { tab = id; current[tab] = current[tab] || Object.keys(doc[tab])[0]; draw(); },
    }, label);

    for (const k of ['types', 'openingTypes', 'coverings']) current[k] = Object.keys(doc[k])[0];
    body.append(
      h('p', { class: 'hint' },
        'What a wall run, an opening or a covering IS. Changes apply everywhere that type is '
        + 'used, on every floor, and are saved as you make them.'),
      h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px' },
        tabBtn('types', 'Wall treatments'), tabBtn('openingTypes', 'Openings'), tabBtn('coverings', 'Coverings')),
      listBox, h('div', { class: 'subhead' }, ' '), formBox);
    draw();
    modal(null, body,
      { location: 'dialog:boundaries', rebuild: () => editBoundaries(tab) });
  }

  /* ------------------------------------------------- the controls editor ---
   *
   * `API.saveControls` was the second endpoint the editor never called. The
   * room panel could switch a section on and edit its filter; the registry
   * those sections come FROM — their labels, whether they are read-only, what
   * the header says — was reachable only by hand-editing controls.json.
   *
   * It also answers a promise the help corpus was already making. "What a tap
   * does depends on the entity's domain, and you can see the whole table in the
   * controls registry" was true of the FILE and of nothing a person could open.
   * The table is here, built from the registry itself. */

  let controlsTimer;
  function controlsChanged() {
    Store.emit('selection');
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(() => API.saveControls(S.controls)
      .catch((e) => toast(e.message, true)), 600);
  }

  function editControls() {
    const doc = S.controls || (S.controls = {});
    doc.default = doc.default || {};
    const d = doc.default;
    d.header = d.header || {};
    const A = P().dialogAdvanced();
    const body = h('div', {});

    body.append(h('p', { class: 'hint' },
      'The house-wide defaults every room’s popup starts from. A room overrides any of it in '
      + 'its own panel; this is what it inherits.'));

    body.append(h('div', { class: 'subhead' }, 'The popup header'));
    body.append(h('label', { class: 'inline' }, h('input', {
      type: 'checkbox', checked: d.header.show !== false,
      onchange: (e) => { d.header.show = e.target.checked; controlsChanged(); },
    }), ' Show the header at all'));
    body.append(h('label', { class: 'inline' }, h('input', {
      type: 'checkbox', checked: d.header.showCount !== false,
      onchange: (e) => { d.header.showCount = e.target.checked; controlsChanged(); },
    }), ' …with a count of what is on'));
    body.append(field('How the count reads', h('input', {
      type: 'text', value: d.header.countFormat || '{on} of {total} on', class: 'mono',
      onchange: (e) => { d.header.countFormat = e.target.value || undefined; controlsChanged(); },
    }), '`{on}` and `{total}` are replaced. Counted over ENTITIES rather than markers, because one switch can drive two fittings.'));

    body.append(h('div', { class: 'subhead' }, 'Sections'));
    body.append(h('p', { class: 'hint' },
      'Every room’s popup is built from these. Switching one off here switches it off for the '
      + 'whole house; a room can still turn it back on.'));
    for (const sec of d.sections || []) {
      const row = h('div', { class: 'control-section' });
      row.append(h('label', { class: 'inline', style: 'display:flex' }, h('input', {
        type: 'checkbox', checked: sec.enabled !== false,
        onchange: (e) => { sec.enabled = e.target.checked; controlsChanged(); },
      }), ' ', h('input', {
        type: 'text', value: sec.label || sec.id, style: 'margin-left:6px',
        onchange: (e) => { sec.label = e.target.value || undefined; controlsChanged(); },
      }), h('span', { class: 'badge', style: 'margin-left:auto' }, sec.type || 'entities')));
      A.adv(row, (box) => {
        box.append(h('label', { class: 'inline' }, h('input', {
          type: 'checkbox', checked: !!sec.readOnly,
          onchange: (e) => { sec.readOnly = e.target.checked || undefined; controlsChanged(); },
        }), ' Show state without offering to change it'));
        box.append(h('label', { class: 'inline' }, h('input', {
          type: 'checkbox', checked: !!sec.shortLabels,
          onchange: (e) => { sec.shortLabels = e.target.checked || undefined; controlsChanged(); },
        }), ' Shorten the names — drop the room’s own name from each row'));
        box.append(h('label', { class: 'inline' }, h('input', {
          type: 'checkbox', checked: !!sec.swatch,
          onchange: (e) => { sec.swatch = e.target.checked || undefined; controlsChanged(); },
        }), ' Show each light’s colour as a swatch'));
      });
      body.append(row);
    }

    /* The domain table. Read-only on purpose: it is the framework's answer to
     * "what does tapping a thing of this kind do", and a house that needs a
     * different answer for one entity says so with a shortcut rather than by
     * redefining what every light in the plan does. Shown because the help
     * already told people it existed. */
    body.append(h('div', { class: 'subhead' }, 'What a tap does, by domain'));
    body.append(h('p', { class: 'hint' },
      'The mapping is a registry rather than a guess. A light toggles, a scene activates, a '
      + 'sensor opens more-info. Anything not listed falls through to the default.'));
    const byDomain = (doc.domainActions || {}).byDomain || {};
    const table = h('table', { class: 'grid' },
      h('tr', {}, h('th', {}, 'Domain'), h('th', {}, 'Drawn as'), h('th', {}, 'A tap'), h('th', {}, 'A long press')));
    const describeAction = (a) => !a ? 'more-info' : (typeof a === 'string' ? a : a.service || 'more-info');
    for (const [domain, spec] of Object.entries(byDomain)) {
      table.append(h('tr', {},
        h('td', { class: 'mono' }, domain),
        h('td', {}, spec.control || 'toggle'),
        h('td', { class: 'mono' }, describeAction(spec.tap)),
        h('td', { class: 'mono' }, spec.alt ? describeAction(spec.alt) + (spec.altLabel ? ` (${spec.altLabel})` : '') : '—')));
    }
    body.append(table);
    body.append(h('p', { class: 'hint' },
      `${Object.keys(byDomain).length} domains, plus a default of `
      + `${describeAction((doc.domainActions || {}).default && doc.domainActions.default.tap)} for anything else.`));

    A.note(body, 'per-section read-only, short labels and colour swatches');
    modal(null, body, { location: 'dialog:controls', rebuild: editControls });
  }

  /* ------------------------------------------------- the flooring editor ---
   *
   * The room panel above chooses WHICH finish a room has. Nothing chose what a
   * finish IS: `saveFlooring` existed in api.js and no part of the editor ever
   * called it, so oak was whatever oak shipped as, and adding the finish your
   * house actually has meant hand-editing flooring.json inside the container.
   *
   * The fields offered per generator come from `flooring.generatorOptions` —
   * the registry, not a table kept here. A copy in this file is the thing that
   * goes stale the first time a generator gains an option, which is the same
   * failure as a property nothing renders: the control exists, it just stops
   * matching what draws. Anything a type carries that the schema does not
   * describe is still shown, generically, so nothing becomes uneditable — a
   * `script` finish's own options arrive that way. */

  let flooringTimer;
  function flooringChanged() {
    Canvas.paint();
    Store.emit('selection');
    clearTimeout(flooringTimer);
    flooringTimer = setTimeout(() => API.saveFlooring(S.flooring)
      .catch((e) => toast(e.message, true)), 600);
  }

  /* A key has to survive being an object key, an SVG pattern id fragment and a
   * room's stored `flooring` value, so it is reduced to the same slug shape the
   * shipped types use rather than trusted from a label. */
  function flooringKeyFor(label, existing) {
    let base = String(label || 'finish').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'finish';
    let key = base;
    let n = 2;
    while (existing[key]) { key = base + '_' + n; n++; }
    return key;
  }

  /* Which rooms, on which floors, are standing on this finish. Asked before a
   * delete: removing one out from under a room leaves it drawing the fallback
   * with nothing saying why, and the room's own stored value still naming a
   * finish that no longer exists. */
  function roomsUsingFlooring(key) {
    const out = [];
    for (const f of (S.project.floors || [])) {
      for (const r of (f.rooms || [])) if ((r.flooring || 'plain') === key) out.push(`${f.name || f.id} / ${r.name || r.id}`);
    }
    return out;
  }

  function editFlooring(startKey) {
    const doc = S.flooring || (S.flooring = { types: {} });
    doc.types = doc.types || {};
    const generators = Object.keys(doc.generatorOptions || {});
    let current = doc.types[startKey] ? startKey : Object.keys(doc.types)[0];

    const listBox = h('div', { style: 'max-height:190px;overflow:auto;border:1px solid var(--panelBorder);border-radius:6px;padding:4px' });
    const formBox = h('div', {});
    const search = h('input', { type: 'search', placeholder: 'Find a finish, material or pattern…',
      'aria-label': 'Search floor finishes', style: 'width:100%;margin-bottom:6px', oninput: () => drawList() });

    function drawList() {
      const query = search.value.trim().toLowerCase();
      const entries = Object.entries(doc.types).filter(([key, t]) =>
        [key, t.label, t.group, t.generator].join(' ').toLowerCase().includes(query));
      const groups = [...new Set(entries.map(([, t]) => t.group || 'Other'))];
      listBox.replaceChildren(...groups.map((g) => h('div', {},
        h('div', { class: 'subhead', style: 'margin:6px 0 2px;border-top:0;padding-top:0' }, g),
        ...entries
          .filter(([, t]) => (t.group || 'Other') === g)
          .map(([k, t]) => h('button', {
            class: 'btn tiny',
            style: 'display:block;width:100%;text-align:left;margin-bottom:2px'
              + (k === current ? ';outline:2px solid var(--accent)' : ''),
            onclick: () => { current = k; draw(); },
          }, `${t.label || k}  ·  ${t.generator || '?'}`)))));
      if (!entries.length) listBox.append(h('p', { class: 'hint' }, 'No finishes match.'));
    }

    /* One row per option. `kind` picks the control; a colour is a TEXT box with
     * a picker beside it because a shipped value is often a theme token
     * (@floorWood) and a bare colour input cannot hold one — it would silently
     * turn the token into black the moment the row was touched. */
    function optionRow(t, spec) {
      const o = t.options || (t.options = {});
      const set = (v) => { if (v === undefined || v === '') delete o[spec.key]; else o[spec.key] = v; flooringChanged(); };
      const val = o[spec.key];

      if (spec.kind === 'color') {
        const text = h('input', {
          type: 'text', value: val === undefined ? '' : String(val), placeholder: '@token or #hex',
          style: 'flex:1;min-width:0',
          onchange: (e) => set(e.target.value.trim()),
        });
        /* `onchange`: `set()` calls `flooringChanged()`, which emits
         * `Store.emit('selection')` — and that repaints the room panel the
         * same destructive way `Store.mutate` does (see the note on the
         * per-room swatch above). `input` fires on every drag tick, so the
         * panel behind this modal was rebuilding, and the swatch with it,
         * before a drag ever reached a second colour. */
        const swatch = h('input', {
          type: 'color', value: normHex(val), style: 'width:38px;flex:none',
          onchange: (e) => { text.value = e.target.value; set(e.target.value); },
        });
        return h('div', { class: 'field' }, h('label', {}, spec.label || spec.key),
          h('div', { style: 'display:flex;gap:6px' }, text, swatch));
      }

      if (spec.kind === 'colorList') {
        return h('div', { class: 'field' }, h('label', {}, spec.label || spec.key),
          h('input', {
            type: 'text', value: Array.isArray(val) ? val.join(', ') : (val || ''),
            placeholder: '#aaa, #bbb, #ccc',
            onchange: (e) => {
              const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
              set(list.length ? list : undefined);
            },
          }));
      }

      if (spec.kind === 'fraction') {
        return h('div', { class: 'field' }, h('label', {}, `${spec.label || spec.key} — ${Math.round((val ?? 0) * 100)}%`),
          h('input', {
            type: 'range', min: 0, max: 100, step: 1, value: Math.round((val ?? 0) * 100),
            onchange: (e) => set(Number(e.target.value) / 100),
          }));
      }

      const step = spec.kind === 'angle' ? 15 : (spec.step ?? 1);
      return h('div', { class: 'field' }, h('label', {}, spec.label || spec.key),
        h('input', {
          type: 'number', step, min: spec.min, max: spec.max, value: val === undefined ? '' : val,
          onchange: (e) => set(e.target.value === '' ? undefined : Number(e.target.value)),
        }));
    }

    function drawForm() {
      const t = doc.types[current];
      if (!t) { formBox.replaceChildren(h('p', { class: 'hint' }, 'Nothing selected.')); return; }
      const schema = (doc.generatorOptions && doc.generatorOptions[t.generator]) || [];
      const described = new Set(schema.map((s) => s.key));
      /* Whatever this type carries that its generator's schema does not name —
       * a script's own options, or an option added to a generator before the
       * schema caught up. Shown rather than hidden: an option that draws and
       * cannot be reached is exactly what this whole dialog is fixing. */
      const extra = Object.keys(t.options || {})
        .filter((k) => !described.has(k) && k !== 'script' && k !== 'reflectance')
        .map((k) => ({ key: k, kind: typeof t.options[k] === 'number' ? 'number' : 'color', label: k, step: 'any' }));

      const usedBy = roomsUsingFlooring(current);

      formBox.replaceChildren(
        field('Name', h('input', {
          type: 'text', value: t.label || '',
          onchange: (e) => { t.label = e.target.value; flooringChanged(); drawList(); },
        })),
        h('div', { class: 'field row' },
          h('div', {}, h('label', {}, 'Group'), h('input', {
            type: 'text', value: t.group || '', placeholder: 'Basic',
            onchange: (e) => { t.group = e.target.value || 'Other'; flooringChanged(); drawList(); },
          })),
          h('div', {}, h('label', {}, 'Pattern'), h('select', {
            onchange: (e) => { t.generator = e.target.value; flooringChanged(); draw(); },
          }, ...generators.map((g) => h('option', { value: g, selected: t.generator === g }, g)))),
        ),
        /* The number both light models read. It belongs to the SURFACE, not to
         * the lamps over it, which is why it sits with the finish rather than
         * only in the room panel's override. */
        field(`Reflection — ${Math.round((t.reflectance ?? 0) * 100)}%`, h('input', {
          type: 'range', min: 0, max: 100, step: 1, value: Math.round((t.reflectance ?? 0) * 100),
          onchange: (e) => { t.reflectance = Number(e.target.value) / 100; flooringChanged(); drawForm(); },
        })),
        h('p', { class: 'hint' }, 'How much light this surface throws back — polished white marble is about 65%, mid oak 25%, black granite 5%. Both light models read it, so it changes how bright a room lit by the same fittings actually looks.'),
        h('div', { class: 'subhead' }, 'Pattern options'),
        ...(schema.length || extra.length
          ? [...schema, ...extra].map((s) => optionRow(t, s))
          : [h('p', { class: 'hint' }, 'This pattern takes no options.')]),
        t.generator === 'script'
          ? h('p', { class: 'hint' }, 'The script body itself is edited in flooring.json — this dialog changes the values it reads.')
          : null,
        h('div', { class: 'subhead' }, ' '),
        h('p', { class: 'hint' }, usedBy.length
          ? `Used by ${usedBy.length} room${usedBy.length === 1 ? '' : 's'}: ${usedBy.slice(0, 6).join(', ')}${usedBy.length > 6 ? '…' : ''}`
          : 'No room uses this finish.'),
        h('div', { style: 'display:flex;gap:6px' },
          h('button', {
            class: 'btn tiny',
            onclick: () => {
              const key = flooringKeyFor((t.label || current) + ' copy', doc.types);
              doc.types[key] = JSON.parse(JSON.stringify(t));
              doc.types[key].label = (t.label || current) + ' copy';
              current = key;
              flooringChanged(); draw();
            },
          }, 'Duplicate'),
          /* Deleting a finish a room is standing on would leave that room
           * drawing the fallback while its own stored value still named
           * something gone. Refused, with the rooms named, rather than done
           * quietly and explained later. */
          h('button', {
            class: 'btn tiny danger',
            onclick: () => {
              if (usedBy.length) {
                toast(`${usedBy.length} room${usedBy.length === 1 ? '' : 's'} still use this finish — change them first.`, true);
                return;
              }
              if (Object.keys(doc.types).length <= 1) { toast('This is the last finish; there has to be one.', true); return; }
              if (!confirm(`Delete the finish "${t.label || current}"?`)) return;
              delete doc.types[current];
              current = Object.keys(doc.types)[0];
              flooringChanged(); draw();
            },
          }, 'Delete'),
        ),
      );
    }

    function draw() { drawList(); drawForm(); }
    draw();

    const addBtn = h('button', {
      class: 'btn tiny',
      onclick: () => {
        const key = flooringKeyFor('New finish', doc.types);
        doc.types[key] = { label: 'New finish', group: 'Custom', generator: 'plain', reflectance: 0.35, options: { color: '#d8dce2' } };
        current = key;
        flooringChanged(); draw();
      },
    }, '+ New finish');

    modal('Floor finishes', h('div', {},
      h('p', { class: 'hint' }, 'What each finish looks like and how much light it throws back. Changes apply everywhere that finish is used, on every floor, and are saved as you make them.'),
      search, listBox, addBtn, h('div', { class: 'subhead' }, ' '), formBox), { help: 'dialog:flooring', rebuild: () => editFlooring(current) });
  }


  // A theme token (@floorWood) is not a colour input value; fall back rather
  // than handing <input type=color> something it will silently turn black.
  function normHex(v) { return /^#[0-9a-f]{6}$/i.test(v) ? v : '#e6eaf0'; }

  /* -------------------------------------------------------- room extras ---- */

  function roomExtras(box, floor, room) {
    /* --- walls, railings, grills ---
     *
     * One row per REAL EDGE, not per compass letter. A letter is not unique —
     * an L-shaped room has six edges and only four letters, so two come back
     * "e" and two "s" — and a picker with four rows could only ever set both
     * of a pair at once. Rows are keyed on the edge's own index, which is what
     * `boundary.edge` addresses, and the letter is kept alongside so a plan
     * written before this still resolves.
     *
     * Each row can also cover PART of its wall. The renderer has always read
     * `from`/`to` and cut the edge at those marks; nothing ever wrote them, so
     * "the middle third of this balcony is glass" was a JSON edit. */
    box.appendChild(P().locationTitle('section:room.walls'));
    /* The picker below chooses WHICH treatment a run has; this opens what a
     * treatment IS — the same pairing the flooring section has, and for the
     * same reason: choosing from a list you cannot edit is only half a
     * registry. */
    box.appendChild(h('p', { class: 'hint', style: 'margin-top:0' },
      h('button', { class: 'link', 'data-ui-location': 'dialog:boundaries', onclick: () => editBoundaries('types') }, UINavigation.label('dialog:boundaries'))));
    box.appendChild(h('p', { class: 'hint' },
      'Each edge is a wall unless you say otherwise. Change one to glass railing, grill or open and the daylight model follows for free — it only ever reads transmission.'));

    const bTypes = Object.entries((S.boundaries && S.boundaries.types) || {});
    const bGroups = [...new Set(bTypes.map(([, t]) => t.group || 'Other'))];
    /* One row per WALL, which is not the same as one row per segment. A bowed
     * wall is flattened into a dozen short diagonals that all share a `src` —
     * the original corner they were bowed toward — so they are grouped back
     * into the single wall a person sees. Without this a curved wall either
     * vanished from the picker (it was filtered out as diagonal) or would have
     * appeared a dozen times.
     *
     * A segment with no wall letter at all is a genuinely diagonal edge of a
     * hand-drawn outline; it has no compass name to offer and is skipped. */
    const segLen = (e) => (e.lo !== undefined && e.hi !== undefined
      ? e.hi - e.lo
      : Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]));
    const grouped = new Map();
    for (const e of PlanScene.roomEdges(room)) {
      if (!e.wall) continue;
      const key = e.src === undefined ? e.index : e.src;
      const g = grouped.get(key);
      if (!g) grouped.set(key, Object.assign({}, e, { index: key, len: segLen(e), curved: !!e.diagonal }));
      else { g.len += segLen(e); g.curved = g.curved || !!e.diagonal; }
    }
    const edges = [...grouped.values()];

    /* Same letter twice means the label alone cannot tell them apart, so those
     * rows get a number. A plain rectangle never sees one. */
    const letterCount = {};
    for (const e of edges) letterCount[e.wall] = (letterCount[e.wall] || 0) + 1;
    const seen = {};

    const findBoundary = () => (floor.boundaries || []);
    const boundaryFor = (edge) => findBoundary().find((b) => b.room === room.id
      && (b.edge === edge.index || (b.edge === undefined && b.wall === edge.wall)));

    const writeBoundary = (edge, changes) => Store.mutate(() => {
      floor.boundaries = floor.boundaries || [];
      const i = floor.boundaries.findIndex((b) => b.room === room.id
        && (b.edge === edge.index || (b.edge === undefined && b.wall === edge.wall)));
      const existing = i >= 0 ? floor.boundaries[i] : null;
      const next = Object.assign({}, existing, changes);
      if (!next.type) { if (i >= 0) floor.boundaries.splice(i, 1); return; }
      /* Keep the id: MCP addresses boundaries by one (`b1`, `b2`, …) the same
       * way it addresses openings, so a run drawn here has to be reachable
       * there too, and one edited here must not lose the id it already had. */
      if (!next.id) {
        const taken = new Set(floor.boundaries.map((b) => b.id).filter(Boolean));
        let n = 1; while (taken.has('b' + n)) n++;
        next.id = 'b' + n;
      }
      next.room = room.id;
      next.wall = edge.wall;
      next.edge = edge.index;
      /* A whole-edge run stores no range at all, so it keeps following the
       * wall if the room is later reshaped. Only a deliberate partial one
       * pins numbers down. */
      if (next.from === undefined || next.from === null || Number(next.from) <= edge.lo + 1e-6) delete next.from;
      if (next.to === undefined || next.to === null || Number(next.to) >= edge.hi - 1e-6) delete next.to;
      if (i >= 0) floor.boundaries[i] = next; else floor.boundaries.push(next);
    }, 'boundary');

    for (const edge of edges) {
      seen[edge.wall] = (seen[edge.wall] || 0) + 1;
      const suffix = letterCount[edge.wall] > 1 ? ' ' + seen[edge.wall] : '';
      const existing = boundaryFor(edge);
      const cur = existing ? existing.type : '';
      const def = cur && S.boundaries.types[cur];
      const span = edge.len;
      const partial = !!(existing && (existing.from !== undefined || existing.to !== undefined));

      box.appendChild(h('div', { class: 'boundary-row' },
        h('span', { class: 'hint', style: 'margin:0;flex:1' }, `${wallLabel(edge.wall)}${suffix} · ${span.toFixed(1)} ft${edge.curved ? ' · curved' : ''}`),
        h('select', {
          'aria-label': `${wallLabel(edge.wall)}${suffix} wall treatment`,
          onchange: (e) => writeBoundary(edge, { type: e.target.value }),
        }, h('option', { value: '', selected: !cur }, 'default wall'),
           ...bGroups.map((g) => h('optgroup', { label: g },
             ...bTypes.filter(([, t]) => (t.group || 'Other') === g)
               .map(([k, t]) => h('option', { value: k, selected: cur === k }, t.label || k))))),
        h('span', { class: 'hint', style: 'margin:0', title: 'light transmission' }, def ? `☀${Math.round(def.transmission * 100)}%` : ''),
      ));

      /* The range only appears once the edge has a treatment: "part of a
       * default wall" is not a thing you can express, and offering the fields
       * anyway would suggest it is. */
      if (!cur) continue;
      if (edge.curved) {
        box.appendChild(h('p', { class: 'hint' },
          'A curved wall takes its treatment whole — there is no straight axis to measure a range along.'));
        continue;
      }
      box.appendChild(h('div', { class: 'field' },
        h('label', { class: 'inline' }, h('input', {
          type: 'checkbox', checked: partial,
          onchange: (e) => writeBoundary(edge, e.target.checked
            ? { from: Math.round((edge.lo + span * 0.25) * 100) / 100, to: Math.round((edge.lo + span * 0.75) * 100) / 100 }
            : { from: null, to: null }),
        }), ' Only part of this wall')));
      if (partial) {
        box.appendChild(h('div', { class: 'field row' },
          h('div', {}, h('label', {}, `From (${edge.lo.toFixed(1)})`),
            numInput(existing.from ?? edge.lo, (v) => writeBoundary(edge, { from: v }), 0.5)),
          h('div', {}, h('label', {}, `To (${edge.hi.toFixed(1)})`),
            numInput(existing.to ?? edge.hi, (v) => writeBoundary(edge, { to: v }), 0.5)),
        ));
        box.appendChild(h('p', { class: 'hint' },
          'Measured along the wall in plan feet, not from its corner — the same numbers the room’s own coordinates use. The rest of the edge stays a default wall.'));
      }
    }


    /* --- control surface --- */
    box.appendChild(P().locationTitle('section:room.controls'));
    box.appendChild(h('p', { class: 'hint', style: 'margin-top:0' },
      h('button', { class: 'link', 'data-ui-location': 'dialog:controls', onclick: () => editControls() }, UINavigation.label('dialog:controls'))));

    const cfg = room.controls || room.popup || null;
    const presets = Object.entries((S.controls && S.controls.presets) || {});
    const curPreset = (cfg && cfg.preset) || '';
    box.appendChild(field('Preset', h('select', {
      onchange: (e) => Store.mutate(() => {
        delete room.popup;
        if (!e.target.value) { room.controls = null; return; }
        room.controls = Object.assign({}, room.controls || {}, { preset: e.target.value });
      }, 'controls preset'),
    }, h('option', { value: '', selected: !curPreset }, 'inherit from floor / house'),
       ...presets.map(([k, p]) => h('option', { value: k, selected: curPreset === k }, p._label || k)))));

    const eff = Controls.resolve(S.controls, S.project, floor, room);

    box.appendChild(h('div', { class: 'field' },
      h('label', { class: 'inline' }, h('input', {
        type: 'checkbox', checked: eff.enabled !== false,
        onchange: (e) => Store.mutate(() => {
          delete room.popup;
          room.controls = Object.assign({}, room.controls || {}, { enabled: e.target.checked });
        }, 'controls enabled'),
      }), ' Controls enabled for this room')));

    if (eff.enabled === false) {
      box.appendChild(h('p', { class: 'hint' }, 'Tapping this room does nothing. That is the right answer for a room with nothing to control — a dead sheet is worse than no sheet.'));
    } else {
      /* --- which surface --- */
      const designs = Controls.designs(S.controls);
      box.appendChild(field('Design', h('select', {
        onchange: (e) => Store.mutate(() => {
          delete room.popup;
          room.controls = Object.assign({}, room.controls || {}, { design: e.target.value });
        }, 'controls design'),
      }, ...designs.map((d) => h('option', { value: d.id, selected: eff.designName === d.id }, d.label || d.id)))));
      const dspec = designs.find((d) => d.id === eff.designName);
      if (dspec) {
        box.appendChild(h('p', { class: 'hint' }, dspec.description || ''));
        box.appendChild(h('p', { class: 'hint' },
          `${dspec.surface} · anchored ${dspec.anchor} · ${dspec.columns ? dspec.columns + ' columns' : 'flowing'} · ${dspec.density}`));
      }

      /* --- header buttons --- */
      box.appendChild(h('p', { class: 'hint', style: 'margin-top:10px' }, 'Header buttons'));
      const headerButtons = h('div', { class: 'option-grid' });
      box.appendChild(headerButtons);
      for (const b of ((S.controls && S.controls.default && S.controls.default.header && S.controls.default.header.buttons) || [])) {
        const on = (eff.header.buttons || []).some((x) => x.id === b.id);
        /* A button pointing at something this room has not got cannot be turned
         * on, and naming what is missing beats "unavailable". */
        const missing = !!b.hideWhenMissing && !Controls.resolveTarget(b.target, eff.shortcuts, room);
        headerButtons.appendChild(h('label', { class: 'inline', title: missing ? `nothing here answers to “${b.target}”` : '' },
          h('input', {
            type: 'checkbox', checked: on, disabled: missing,
            onchange: (e) => Store.mutate(() => {
              delete room.popup;
              room.controls = room.controls || {};
              room.controls.header = room.controls.header || {};
              room.controls.header.buttons = room.controls.header.buttons || [];
              const i = room.controls.header.buttons.findIndex((x) => x.id === b.id);
              const entry = { id: b.id, enabled: e.target.checked };
              if (i >= 0) room.controls.header.buttons[i] = entry; else room.controls.header.buttons.push(entry);
            }, 'controls button'),
          }), ' ', b.label || b.id, missing ? ' (nothing bound)' : ''));
      }

      /* --- sections, each with a live count and its filter --- */
      const items = (floor.items || []).filter((i) => PlanScene.pointInRoom(room, i.at[0], i.at[1]));
      const ctx = { room, items, areaEntities: [], library: S.library, states: S.states, filter: null };

      const noStates = !Object.keys(S.states || {}).length;
      box.appendChild(h('p', { class: 'hint', style: 'margin-top:10px' },
        'Sections — the count is what this room would actually show'));
      if (noStates) {
        // A filter with hideUnavailable counts zero when nothing knows any
        // states yet. Correct, but it reads as a broken filter unless said.
        box.appendChild(h('p', { class: 'hint' },
          'No live states loaded, so any section filtering on availability counts zero. Tick “Live states” in the toolbar to see real numbers.'));
      }
      for (const def of ((S.controls && S.controls.default && S.controls.default.sections) || [])) {
        const live = eff.sections.find((x) => x.id === def.id);
        const on = !!live;
        const merged = live || def;
        let count = '';
        if (merged.type === 'entities') {
          count = String(Controls.sectionEntities(merged, ctx).length);
        } else if (merged.type === 'groups') {
          count = String(Controls.groupsFor(items, merged.groupBy, ctx).length);
        }

        const row = h('div', { class: 'control-section' });
        row.appendChild(h('label', { class: 'inline', style: 'display:flex' }, h('input', {
          type: 'checkbox', checked: on,
          onchange: (e) => Store.mutate(() => {
            delete room.popup;
            room.controls = room.controls || {};
            room.controls.sections = room.controls.sections || [];
            const i = room.controls.sections.findIndex((x) => x.id === def.id);
            const entry = { id: def.id, enabled: e.target.checked };
            if (i >= 0) room.controls.sections[i] = Object.assign(room.controls.sections[i], entry);
            else room.controls.sections.push(entry);
          }, 'controls section'),
        }), ' ', def.label || def.id,
           count !== '' ? h('span', { class: 'badge', style: 'margin-left:auto' }, count) : ''));

        if (on && merged.type === 'entities') {
          row.appendChild(h('details', { class: 'filter-details' },
            h('summary', {}, 'Sources & filter'),
            h('p', { class: 'hint' }, `Sources: ${Controls.describeSources(merged)}`),
            h('p', { class: 'hint' }, `Filter: ${Controls.describeFilter(merged.filter)}`)));
          row.appendChild(h('button', { class: 'link', onclick: () => editFilter(floor, room, def.id, ctx) }, 'Edit filter…'));
        }
        box.appendChild(row);
      }

      box.appendChild(h('button', { class: 'btn tiny', 'data-ui-location': 'dialog:room-buttons', style: 'margin-top:6px', onclick: () => editRoomButtons(floor, room) }, UINavigation.label('dialog:room-buttons')));
    }

    /* --- what this room is bound to --- */
    shortcutsEditor(box, room, 'room', floor);

    /* --- which words this room answers to --- */
    box.appendChild(h('div', { class: 'subhead' }, 'Match keys'));
    box.appendChild(settingHelp('Leave blank to match the room’s name and id.', 'When to add match keys',
      'Matching scenes and automations join this room’s controls automatically.',
      'Add a key when entity names use another name, such as gr_ for Guest Room.'));
    box.appendChild(field('Keys (comma separated)', h('input', {
      type: 'text', value: (room.keys || []).join(', '),
      placeholder: `${room.id}, ${room.name || ''}`.trim(),
      onchange: (e) => Store.mutate(() => {
        const v = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
        room.keys = v.length ? v : null;
      }, 'room keys'),
    })));
    const kctx = { room, items: [], areaEntities: [], states: S.states, library: S.library, shortcuts: eff.shortcuts };
    const scenesSec = ((S.controls && S.controls.default && S.controls.default.sections) || []).find((x) => x.id === 'scenes');
    if (scenesSec) {
      const found = Controls.sectionEntities(scenesSec, kctx);
      box.appendChild(h('p', { class: 'hint' }, found.length
        ? `Matches right now: ${found.slice(0, 6).map((c) => c.entity).join(', ')}${found.length > 6 ? ` and ${found.length - 6} more` : ''}`
        : 'Nothing matches yet. With no live states loaded that is expected — only bound entities can be listed offline.'));
    }

    /* --- behaviour --- */
    box.appendChild(P().locationTitle('section:room.lighting'));
    box.appendChild(h('div', { class: 'field' },
      h('label', { class: 'inline' }, h('input', {
        type: 'checkbox', checked: !!room.ganged,
        onchange: (e) => Store.mutate(() => { room.ganged = e.target.checked; }, 'ganged'),
      }), ' Ganged — lamps share one physical switch')));
    if (room.ganged) box.appendChild(h('p', { class: 'hint' }, 'Tapping any lamp acts on all of them, and the on-count badge is suppressed because “1 of 2” is not a state that exists.'));

    box.appendChild(field('Part of another room', h('select', {
      onchange: (e) => Store.mutate(() => { room.part_of = e.target.value || null; }, 'part_of'),
    }, h('option', { value: '', selected: !room.part_of }, '(its own room)'),
       ...(floor.rooms || []).filter((r) => r.id !== room.id)
         .map((r) => h('option', { value: r.id, selected: room.part_of === r.id }, r.name)))));
    if (room.part_of) box.appendChild(h('p', { class: 'hint' }, 'Merged into that room: no wall is drawn on the seam between them, and it gets no label of its own.'));

  }

  /* ----------------------------------------------------------- shortcuts -- */

  /* The user's own actions. There is no list of kinds here and there must not
   * be: a shortcut is a label and something to do, and what it MEANS —
   * do-not-disturb, turbo, movie night — is the label. Every field below is
   * free: pick any entity of any domain, or write a service call out.
   *
   * `layer` is a room, a floor or the project itself; all three take the same
   * shortcuts and they accumulate house -> floor -> room. */
  /* ------------------------------------------------- colour schemes ------ */

  /* The mini editor behind the item panel's "edit colours…" link.
   *
   * It is a separate popup rather than more rows in the inspector for the same
   * reason the flooring editor is: the picker chooses WHICH scheme, and this
   * says what a scheme IS. Those are different questions, and only the first
   * one belongs beside the thing you are pointing at.
   *
   * WHAT LIVES WHERE is the whole design, and the dialog says so out loud:
   *
   *   shipped schemes   live in the renderer (`SCHEMES` in shapes.js). They
   *                     reach the editor, the exported SVG and the generated
   *                     card identically, they are the same on every install,
   *                     and they are never written into anybody's project.
   *                     They cannot be edited here — duplicate one instead,
   *                     which is also the fastest way to a colour that works,
   *                     because every default is taken off a real fitting.
   *
   *   your own schemes  live on the PROJECT (`project.schemes`), so they are
   *                     saved, undoable, carried in the export, and baked into
   *                     the dashboard card with the rest of the document. A
   *                     project that travels takes its colours with it.
   *
   * And when the two collide, the document wins — see `resolveScheme` in
   * shapes.js. A project that carries a scheme called `teak` keeps its own
   * teak forever, so a future app version shipping a default of that name can
   * never silently repaint a plan somebody already drew.
   */

  function customSchemes() {
    if (!Array.isArray(S.project.schemes)) S.project.schemes = [];
    return S.project.schemes;
  }

  /* Every item on every floor painted in this scheme. Asked before a delete
   * for the same reason the flooring editor asks: removing one out from under
   * an item leaves it drawing the theme while its own stored value still names
   * something that no longer exists. */
  function itemsUsingScheme(id) {
    const out = [];
    for (const f of S.project.floors || []) {
      for (const it of f.items || []) if (it.scheme === id) out.push(`${f.name || f.id} / ${it.name || it.id}`);
    }
    return out;
  }

  function schemeIdFor(label, taken) {
    return Store.uniqueId(label || 'scheme', new Set(taken));
  }

  function editSchemes(item, type) {
    const mine = customSchemes();
    /* Open on whatever the item is already wearing, so the link lands you on
     * the thing you were looking at rather than at the top of a list. */
    let current = (item && item.scheme) || (mine[0] && mine[0].id) || Object.keys(Shapes.SCHEMES)[0];
    const previewType = type || { kind: 'device', render: { family: 'fan' }, defaults: {} };
    const previewKey = item ? item.kind + '.' + item.type : 'preview';

    const listBox = h('div', { style: 'max-height:190px;overflow:auto;border:1px solid var(--panelBorder);border-radius:6px;padding:4px' });
    const formBox = h('div', {});
    const search = h('input', { type: 'search', placeholder: 'Find a colour or material…',
      'aria-label': 'Search colour schemes', style: 'width:100%;margin-bottom:6px', oninput: () => drawList() });

    const all = () => Shapes.schemeList(mine);
    const find = (id) => all().find((s) => s.id === id) || null;
    const rawCustom = (id) => mine.find((s) => s && s.id === id) || null;

    /* A scheme is project data, so every write goes through `Store.mutate` —
     * that is what makes it undoable and what schedules the save. */
    const change = (fn, label) => {
      Store.mutate(() => { fn(); }, label);
      Canvas.paint();
      draw();
    };

    function drawList() {
      const entries = all().filter(s => [s.id, s.label, s.group].join(' ').toLowerCase().includes(search.value.trim().toLowerCase()));
      const groups = [...new Set(entries.map((s) => s.group || 'Other'))];
      listBox.replaceChildren(...groups.map((g) => h('div', {},
        h('div', { class: 'subhead', style: 'margin:6px 0 2px;border-top:0;padding-top:0' }, g),
        ...entries.filter((s) => (s.group || 'Other') === g).map((s) => {
          const btn = h('button', {
            class: 'btn tiny',
            style: 'display:flex;align-items:center;gap:6px;width:100%;text-align:left;margin-bottom:2px'
              + (s.id === current ? ';outline:2px solid var(--accent)' : ''),
            onclick: () => { current = s.id; draw(); },
          });
          btn.appendChild(P().typeIcon(previewKey, previewType, { scheme: s, px: 18, props: item && item.props }));
          btn.appendChild(h('span', {}, s.label + (s.custom ? ' · yours' : '')));
          return btn;
        }))));
      if (!entries.length) listBox.append(h('p', { class: 'hint' }, 'No schemes match.'));
    }

    /* One colour. A text box beside the picker because a value pasted from a
     * paint chart or a product page is how most of these actually arrive, and
     * because `<input type=color>` cannot show you what it is holding. */
    function colourRow(s, key, label, hint) {
      const set = (v) => {
        const clean = Shapes.schemeColour(v, null);
        if (!clean) { toast(`"${v}" is not a colour — use #rgb or #rrggbb.`, true); drawForm(); return; }
        change(() => { rawCustom(s.id)[key] = clean; }, 'scheme colour');
      };
      const text = h('input', {
        type: 'text', value: s[key], style: 'flex:1;min-width:0',
        onchange: (e) => set(e.target.value.trim()),
      });
      /* `onchange`, never `input`: `change()` repaints this dialog, and a
       * picker that rebuilds itself on every drag tick closes under the
       * pointer. The flooring editor learnt the same lesson. */
      const chip = h('input', {
        type: 'color', value: Shapes.schemeColour(s[key], '#888888'), style: 'width:38px;flex:none',
        onchange: (e) => set(e.target.value),
      });
      return h('div', { class: 'field' }, h('label', {}, label),
        h('div', { style: 'display:flex;gap:6px' }, text, chip),
        h('p', { class: 'hint', style: 'margin:2px 0 0' }, hint));
    }

    function previewRow(s) {
      const box = h('div', { style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap' });
      const one = (label, on) => {
        const cell = h('div', { style: 'text-align:center' });
        cell.appendChild(P().typeIcon(previewKey, previewType, { scheme: s, px: 64, on, props: item && item.props }));
        cell.appendChild(h('div', { class: 'hint' }, label));
        return cell;
      };
      box.appendChild(one('at rest', false));
      /* Furniture has no state to be in, so a second copy of it would say
       * nothing. Everything else gets both, because "does this still read as
       * ON?" is the question a scheme can get wrong. */
      if (previewType.kind !== 'furniture') box.appendChild(one('running', true));
      return box;
    }

    function drawForm() {
      const s = find(current);
      if (!s) { formBox.replaceChildren(h('p', { class: 'hint' }, 'Nothing selected.')); return; }
      const raw = rawCustom(s.id);
      const used = itemsUsingScheme(s.id);

      const duplicate = h('button', {
        class: 'btn tiny',
        onclick: () => {
          const label = s.label + ' copy';
          const id = schemeIdFor(label, all().map((x) => x.id));
          change(() => {
            customSchemes().push({ id, label, group: raw ? (s.group || 'Custom') : 'Custom', fill: s.fill, line: s.line, glyph: s.glyph, accent: s.accent });
          }, 'add scheme');
          current = id;
          draw();
        },
      }, raw ? 'Duplicate' : 'Duplicate to edit');

      const applyBtn = item ? h('button', {
        class: 'btn tiny primary',
        onclick: () => { Store.mutate(() => { item.scheme = s.id; }, 'colour'); Canvas.paint(); toast(`Painted in ${s.label}`); },
      }, 'Use on this item') : null;

      if (!raw) {
        formBox.replaceChildren(
          h('div', { class: 'subhead' }, s.label),
          h('p', { class: 'hint' }, 'A scheme that ships with the app. It is part of the renderer rather than part of your project, so it is the same on every install and is never written into your file — which is also why it cannot be edited here. Duplicate it and the copy is yours.'),
          previewRow(s),
          h('div', { style: 'display:flex;gap:6px;margin-top:10px' }, duplicate, applyBtn),
        );
        return;
      }

      formBox.replaceChildren(
        field('Name', h('input', {
          type: 'text', value: raw.label || '',
          onchange: (e) => change(() => { raw.label = e.target.value.trim().slice(0, 60) || raw.id; }, 'scheme name'),
        })),
        field('Group', h('input', {
          type: 'text', value: raw.group || 'Custom', placeholder: 'Custom',
          onchange: (e) => change(() => { raw.group = e.target.value.trim().slice(0, 40) || 'Custom'; }, 'scheme group'),
        })),
        previewRow(s),
        h('div', { class: 'subhead' }, 'Colours'),
        colourRow(s, 'fill', 'Body', 'The object itself — a marker’s disc, the whole footprint of a piece of furniture.'),
        colourRow(s, 'line', 'Trim', 'Its outline, and everything drawn on it in outline: cushions, arms, shelf edges.'),
        colourRow(s, 'glyph', 'Detail', 'The strokes drawn inside a marker at rest — a fan’s blades, an icon.'),
        colourRow(s, 'accent', 'When live', 'What it turns when it is on: an LED ring, a lit downlight, a status light. Keep it clearly different from the trim, or the plan stops saying which things are running.'),
        h('p', { class: 'hint' }, s.accent === s.line
          ? 'This accent is the same colour as the trim, so a marker in this scheme will fall back to the theme’s own live colour rather than draw ON and OFF the same.'
          : 'A lit lamp still draws in the colour it is emitting, and an unavailable entity still draws as unavailable. Light beats paint.'),
        h('div', { class: 'subhead' }, ' '),
        h('p', { class: 'hint' }, used.length
          ? `Used by ${used.length} item${used.length === 1 ? '' : 's'}: ${used.slice(0, 6).join(', ')}${used.length > 6 ? '…' : ''}`
          : 'Nothing uses this scheme yet.'),
        h('div', { style: 'display:flex;gap:6px' },
          applyBtn, duplicate,
          h('button', {
            class: 'btn tiny danger',
            onclick: () => {
              if (used.length) { toast(`${used.length} item${used.length === 1 ? '' : 's'} still use this scheme — repaint them first.`, true); return; }
              if (!confirm(`Delete the scheme "${s.label}"?`)) return;
              change(() => {
                const arr = customSchemes();
                arr.splice(arr.findIndex((x) => x && x.id === s.id), 1);
              }, 'delete scheme');
              current = (customSchemes()[0] || {}).id || Object.keys(Shapes.SCHEMES)[0];
              draw();
            },
          }, 'Delete'),
        ),
      );
    }

    function draw() { drawList(); drawForm(); }
    draw();

    const addBtn = h('button', {
      class: 'btn tiny',
      onclick: () => {
        const id = schemeIdFor('My colour', all().map((x) => x.id));
        change(() => {
          customSchemes().push({ id, label: 'My colour', group: 'Custom', fill: '#8d939c', line: '#5a6069', glyph: '#3f444b', accent: '#3fb2ff' });
        }, 'add scheme');
        current = id;
        draw();
      },
    }, '+ New scheme');

    modal('Colour schemes', h('div', {},
      h('p', { class: 'hint' }, 'What a thing is made of. The schemes that ship with the app are taken off real fittings and real timber, and they are part of the app rather than part of your plan. The ones you make live in this project — they are saved with it, they travel in its export, and they are baked into the dashboard card, so a plan you send somebody arrives in its own colours.'),
      search, listBox, addBtn, h('div', { class: 'subhead' }, ' '), formBox), { help: 'dialog:schemes', rebuild: () => editSchemes(item, type) });
  }

  function shortcutsEditor(box, layer, level, floor) {
    const cuts = layer.shortcuts || (layer.shortcuts = []);

    box.appendChild(h('div', { class: 'subhead' }, 'Shortcuts'));
    box.appendChild(h('p', { class: 'hint' },
      level === 'room'
        ? 'Buttons for this room: a scene, an automation to pause, a helper to flip, a script to run. Anything already in Home Assistant — nothing here creates anything.'
        : `Shortcuts at ${level} level appear in every room ${level === 'house' ? 'in the house' : 'on this floor'} as well. A room repeating the same id replaces it, or hides it.`));

    /* The two fields the old spec format had for this. Shown as what they are
     * now, with one button to move them across, because two places to set the
     * same fact is how the two disagree. */
    if (layer.dnd) {
      box.appendChild(h('div', { class: 'chanrow' },
        h('span', { class: 'badge' }, 'old spec'),
        h('span', { class: 'cur mono', style: 'flex:1;min-width:0', title: layer.dnd }, layer.dnd),
        h('button', {
          class: 'btn tiny',
          onclick: () => Store.mutate(() => {
            cuts.push({ id: 'dnd', label: 'Do not disturb', entity: layer.dnd, slot: 'header' });
            layer.dnd = null;
          }, 'convert dnd'),
        }, 'make a shortcut')));
    }
    if ((layer.boost || []).length) {
      box.appendChild(h('button', {
        class: 'btn tiny', onclick: () => Store.mutate(() => {
          for (const b of layer.boost) if (b.entity) cuts.push({ id: 'boost:' + b.entity, label: b.label || 'Boost', entity: b.entity });
          layer.boost = [];
        }, 'convert boost'),
      }, `make shortcuts of ${layer.boost.length} old boost switch(es)`));
    }

    const sectionIds = ((S.controls && S.controls.default && S.controls.default.sections) || [])
      .filter((s) => s.type === 'entities').map((s) => s.id);

    cuts.forEach((s, i) => {
      const row = h('div', { style: 'margin-bottom:6px' });
      row.appendChild(h('div', { class: 'chanrow' },
        h('input', {
          type: 'text', value: s.label || '', placeholder: 'label', style: 'flex:1;min-width:0',
          onchange: (e) => Store.mutate(() => { s.label = e.target.value || null; }, 'shortcut label'),
        }),
        h('button', {
          class: 'btn tiny mono', style: 'flex:1;min-width:0', title: s.entity || 'pick any entity',
          onclick: () => pickEntity({}, (id) => Store.mutate(() => {
            s.entity = id;
            if (!s.id) s.id = id.replace(/\./g, '_');
            if (!s.label) s.label = id.split('.')[1].replace(/_/g, ' ');
          }, 'shortcut entity')),
        }, s.entity || 'pick…'),
        h('button', { class: 'btn tiny danger', onclick: () => Store.mutate(() => { cuts.splice(i, 1); }, 'shortcut remove') }, '✕')));

      const where = h('select', {
        onchange: (e) => Store.mutate(() => {
          const v = e.target.value;
          if (v === 'header') { s.slot = 'header'; delete s.section; }
          else { delete s.slot; if (v) s.section = v; else delete s.section; }
        }, 'shortcut placement'),
      }, h('option', { value: '', selected: !s.slot && !s.section }, 'wherever it fits'),
         h('option', { value: 'header', selected: s.slot === 'header' }, 'header button row'),
         ...sectionIds.map((id) => h('option', { value: id, selected: s.section === id }, 'section: ' + id)));
      row.appendChild(h('div', { class: 'chanrow' }, where,
        h('input', {
          type: 'text', value: s.service || '', placeholder: 'service (optional)', style: 'flex:1;min-width:0',
          title: 'Override what a tap calls, e.g. script.turn_on. Blank means the entity’s domain decides.',
          onchange: (e) => Store.mutate(() => { s.service = e.target.value.trim() || null; }, 'shortcut service'),
        }),
        h('input', {
          type: 'text', value: s.data ? JSON.stringify(s.data) : '', placeholder: 'data {…}', style: 'max-width:110px',
          title: 'Service data, e.g. {"speed": 3}',
          onchange: (e) => {
            const raw = e.target.value.trim();
            if (!raw) return Store.mutate(() => { delete s.data; }, 'shortcut data');
            try {
              const v = JSON.parse(raw);
              e.target.classList.remove('bad');
              Store.mutate(() => { s.data = v; }, 'shortcut data');
            } catch (err) { e.target.classList.add('bad'); toast('Not valid JSON — ' + err.message, true); }
          },
        })));
      box.appendChild(row);
    });

    box.appendChild(h('button', {
      class: 'btn tiny',
      onclick: () => pickEntity({}, (id) => Store.mutate(() => {
        cuts.push({ id: id.replace(/\./g, '_'), label: id.split('.')[1].replace(/_/g, ' '), entity: id });
      }, 'add shortcut')),
    }, '+ shortcut'));

    if (level === 'room' && floor) {
      const inherited = Controls.shortcuts(S.controls, S.project, floor, layer).filter((x) => x.level !== 'room');
      if (inherited.length) {
        box.appendChild(h('p', { class: 'hint' },
          `Also here, from further out: ${inherited.map((x) => `${x.label || x.entity} (${x.level})`).join(', ')}`));
      }
    }
  }

  function entityRow(label, value, domains, onPick) {
    return h('div', { class: 'field' }, h('label', {}, label),
      h('div', { class: 'entity-pick' },
        h('span', { class: 'cur mono', title: value || '' }, value || '(none)'),
        h('button', { class: 'btn tiny', onclick: () => pickEntity({ domains }, onPick) }, 'Pick…'),
        value ? h('button', { class: 'btn tiny', title: 'Clear', onclick: () => onPick(null) }, '✕') : null));
  }

  /* ------------------------------------------------- popup entity buttons -- */

  function editRoomButtons(floor, room) {
    const items = (floor.items || []).filter((i) => PlanScene.pointInRoom(room, i.at[0], i.at[1]));
    const avail = Controls.availableEntities(room, items, []);
    room.controls = room.controls || room.popup || {};
    delete room.popup;
    room.controls.sections = room.controls.sections || [];
    let extras = room.controls.sections.find((s) => s.id === 'extras');
    if (!extras) {
      extras = { id: 'extras', enabled: true, source: 'explicit', entities: [] };
      room.controls.sections.push(extras);
    }
    extras.entities = extras.entities || [];

    const list = h('div', {});
    const draw = () => {
      list.replaceChildren(h('p', { class: 'hint' }, `${extras.entities.length} extra button(s).`));
      extras.entities.forEach((e, i) => {
        list.appendChild(h('div', { class: 'chanrow' },
          h('span', { class: 'mono' }, e.entity || e),
          h('input', {
            type: 'text', placeholder: 'label', value: e.label || '',
            onchange: (ev) => { extras.entities[i] = { entity: e.entity || e, label: ev.target.value }; Store.mutate(() => {}, 'popup extras'); },
          }),
          h('button', { class: 'btn tiny danger', onclick: () => { extras.entities.splice(i, 1); Store.mutate(() => {}, 'popup extras'); draw(); } }, '✕')));
      });
    };
    draw();

    const grid = h('div', { class: 'lib-items' });
    for (const a of avail) {
      grid.appendChild(h('button', {
        class: 'lib-item', title: a.entity,
        onclick: () => {
          if (!extras.entities.some((x) => (x.entity || x) === a.entity)) extras.entities.push({ entity: a.entity, label: a.label });
          Store.mutate(() => {}, 'popup extras'); draw();
        },
      }, h('span', { class: 'lbl' }, a.label || a.entity)));
    }

    modal(`${room.name} — popup buttons`, h('div', {},
      h('p', { class: 'hint' }, 'Everything already bound to something in this room. Pick one to add it as a button, or reach for any entity at all.'),
      avail.length ? grid : h('p', { class: 'empty' }, 'Nothing is bound in this room yet.'),
      h('button', { class: 'btn tiny', style: 'margin-top:8px', onclick: () => pickEntity(null, (id) => { extras.entities.push({ entity: id, label: null }); Store.mutate(() => {}, 'popup extras'); draw(); }) }, 'Any entity…'),
      list), { help: 'dialog:room-buttons', rebuild: () => editRoomButtons(floor, room) });
  }

  /* ---------------------------------------------------------- filter ---- */

  /* A section can be pointed at everything in the room and then narrowed here.
   * The live count updates as you type, so you can see what a filter actually
   * keeps rather than guessing from the JSON. */
  function editFilter(floor, room, sectionId, ctx) {
    room.controls = room.controls || room.popup || {};
    delete room.popup;
    room.controls.sections = room.controls.sections || [];
    let sec = room.controls.sections.find((x) => x.id === sectionId);
    if (!sec) { sec = { id: sectionId, enabled: true }; room.controls.sections.push(sec); }

    const base = ((S.controls.default.sections || []).find((x) => x.id === sectionId)) || {};
    const merged = () => Object.assign({}, base, sec, { filter: sec.filter !== undefined ? sec.filter : base.filter });
    sec.filter = sec.filter !== undefined ? sec.filter : Object.assign({}, base.filter || {});

    const body = h('div', {});
    const out = h('div', {});

    const redraw = () => {
      const m = merged();
      const kept = Controls.sectionEntities(m, ctx);
      out.replaceChildren(
        h('p', { class: 'hint' }, `${kept.length} entit${kept.length === 1 ? 'y' : 'ies'} — ${Controls.describeFilter(m.filter)}`),
        h('div', { class: 'entity-list', style: 'max-height:30vh' },
          ...(kept.length ? kept.map((c) => h('div', { class: 'entity-row' },
            h('div', { style: 'flex:1;min-width:0' },
              h('div', { class: 'en' }, c.label || c.entity),
              h('div', { class: 'eid' }, c.entity)),
            h('span', { class: 'badge' }, c.source)))
            : [h('p', { class: 'empty' }, 'Nothing matches — the section would be empty.')])));
      Store.mutate(() => {}, 'filter');
    };

    const setF = (k, v) => {
      if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) delete sec.filter[k];
      else sec.filter[k] = v;
      redraw();
    };
    const list = (v) => String(v || '').split(/[,\s]+/).filter(Boolean);

    body.appendChild(h('p', { class: 'hint' },
      'Every field is optional and they all apply together. “Force in” wins over the rest, so one stubborn entity can be kept without loosening the filter.'));

    body.appendChild(field('Source', h('select', {
      onchange: (e) => { sec.source = e.target.value; redraw(); },
    }, ...['lights', 'devices', 'all', 'explicit'].map((v) =>
      h('option', { value: v, selected: (merged().source || 'all') === v }, v === 'all' ? 'everything in this room' : v)))));

    body.appendChild(field('Domains (blank = any)', h('input', {
      type: 'text', value: (sec.filter.domains || []).join(' '), placeholder: 'light switch fan',
      onchange: (e) => setF('domains', list(e.target.value)),
    })));
    body.appendChild(field('Exclude domains', h('input', {
      type: 'text', value: (sec.filter.excludeDomains || []).join(' '), placeholder: 'sensor binary_sensor',
      onchange: (e) => setF('excludeDomains', list(e.target.value)),
    })));
    body.appendChild(field('Marker kinds', h('input', {
      type: 'text', value: (sec.filter.kinds || []).join(' '), placeholder: 'fixture device',
      onchange: (e) => setF('kinds', list(e.target.value)),
    })));
    body.appendChild(field('Library types', h('input', {
      type: 'text', value: (sec.filter.types || []).join(' '), placeholder: 'spot tube strip',
      onchange: (e) => setF('types', list(e.target.value)),
    })));
    body.appendChild(h('div', { class: 'field row' },
      h('div', {}, h('label', {}, 'Name contains'), h('input', {
        type: 'text', value: sec.filter.match || '',
        onchange: (e) => setF('match', e.target.value),
      })),
      h('div', {}, h('label', {}, 'Match mode'), h('select', {
        onchange: (e) => setF('matchMode', e.target.value),
      }, ...['contains', 'word', 'regex'].map((v) => h('option', { value: v, selected: (sec.filter.matchMode || 'contains') === v }, v)))),
    ));
    body.appendChild(h('div', { class: 'field' },
      h('label', { class: 'inline' }, h('input', {
        type: 'checkbox', checked: !!sec.filter.onlyControllable,
        onchange: (e) => setF('onlyControllable', e.target.checked || ''),
      }), ' Controllable only (drop read-only types)')));
    body.appendChild(h('div', { class: 'field' },
      h('label', { class: 'inline' }, h('input', {
        type: 'checkbox', checked: !!sec.filter.hideUnavailable,
        onchange: (e) => setF('hideUnavailable', e.target.checked || ''),
      }), ' Hide unavailable')));
    body.appendChild(h('div', { class: 'field row' },
      h('div', {}, h('label', {}, 'Sort'), h('select', {
        onchange: (e) => setF('sort', e.target.value),
      }, ...['name', 'entity', 'type', 'none'].map((v) => h('option', { value: v, selected: (sec.filter.sort || 'name') === v }, v)))),
      h('div', {}, h('label', {}, 'Limit (0 = all)'), numInput(sec.filter.limit || 0, (v) => setF('limit', v || ''), 1)),
    ));
    body.appendChild(field('Never show (entity ids)', h('input', {
      type: 'text', value: (sec.filter.exclude || []).join(' '),
      onchange: (e) => setF('exclude', list(e.target.value)),
    })));
    body.appendChild(field('Force in (entity ids)', h('input', {
      type: 'text', value: (sec.filter.include || []).join(' '),
      onchange: (e) => setF('include', list(e.target.value)),
    })));
    body.appendChild(h('button', { class: 'btn tiny', onclick: () => { sec.filter = {}; redraw(); modal('Filter — ' + sectionId, body); } }, 'Clear filter'));

    body.appendChild(h('div', { class: 'subhead' }, 'Result'));
    body.appendChild(out);
    redraw();
    modal(`${room.name} — ${sectionId} filter`, body, { rebuild: () => editFilter(floor, room, sectionId, ctx) });
  }

  /* ------------------------------------------------------ opening / door -- */

  /* ------------------------------------------------------------- aim ---- */

  /* Facing, and what the facing reaches.
   *
   * A bearing is not a number you can read off a drawing, so the primary
   * control is the handle on the canvas and this is the readout — with a dial
   * for coarse setting and the eight compass points for the common cases. The
   * number box stays, because "exactly 137°" is occasionally the answer and a
   * dial can never give it to you. */
  const COMPASS = [['↑', 0], ['↗', 45], ['→', 90], ['↘', 135], ['↓', 180], ['↙', 225], ['←', 270], ['↖', 315]];

  function aimFields(box, item, type, props) {
    const has = (k) => props.some((p) => p.key === k);
    const d = type.defaults || {};
    const val = (k, fb) => item.props[k] ?? d[k] ?? fb;

    box.appendChild(P().locationTitle('section:item.aim'));

    if (has('rot')) {
      const deg = Number(val('rot', 0)) || 0;
      const dial = h('div', { class: 'dial' });
      for (const [glyph, at] of COMPASS) {
        dial.appendChild(h('button', {
          class: 'btn tiny' + (((deg % 360) + 360) % 360 === at ? ' primary' : ''),
          title: `${at}°`,
          onclick: () => Store.mutate(() => { item.props.rot = at; }, 'rotate'),
        }, glyph));
      }
      box.appendChild(h('div', { class: 'field' },
        h('label', {}, UINavigation.propLabel(type, 'rot')),
        dial,
        numInput(deg, (v) => Store.mutate(() => { item.props.rot = ((Math.round(v || 0) % 360) + 360) % 360; }, 'rotate'), 5)));
      box.appendChild(h('p', { class: 'hint' },
        'Drag the ring handle on the plan to point it, or press [ and ] — hold Shift for 45° steps. '
        + '0° is up the screen; the compass mapping lives in the Sun dialog, not here.'));
    }

    /* A type whose cone can be switched off says so here, and the numbers the
     * cone is drawn FROM only appear once it is on — a field of view that
     * changes nothing you can see reads as a broken control. The values are
     * kept either way, so turning it back on restores what was set. */
    const hasConeToggle = has('cone');
    const coneOn = hasConeToggle
      ? (item.props.cone !== undefined ? item.props.cone !== false : d.cone !== false)
      : true;

    if (hasConeToggle) {
      box.appendChild(h('div', { class: 'field' }, h('label', {},
        h('input', {
          type: 'checkbox', checked: coneOn, style: 'width:auto;margin-right:6px',
          onchange: (e) => Store.mutate(() => { item.props.cone = e.target.checked; }, 'detection cone'),
        }), UINavigation.propLabel(type, 'cone'))));
    }

    if (has('fov') && coneOn) {
      const fov = Number(val('fov', 90));
      const range = Number(val('range', 14));
      box.appendChild(h('div', { class: 'field row' },
        h('div', {}, h('label', {}, UINavigation.propLabel(type, 'fov')), numInput(fov, (v) => Store.mutate(() => { item.props.fov = v; }, 'fov'), 5)),
        h('div', {}, h('label', {}, UINavigation.propLabel(type, 'range')), numInput(range, (v) => Store.mutate(() => { item.props.range = v; }, 'range'), 0.5)),
      ));
      const area = (Math.PI * range * range) * (Math.min(360, Math.max(0, fov)) / 360);
      box.appendChild(h('p', { class: 'hint' },
        `Covers about ${Math.round(area)} sq ft. The wedge on the plan is that area — it is drawn from these two numbers, not decoration.`));
    } else if (has('fov') && !coneOn) {
      box.appendChild(h('p', { class: 'hint' },
        'The cone is off, so this marker draws no wedge. Switch it on to set the field of view and range — whatever was set before is kept.'));
    } else if (has('range')) {
      box.appendChild(field('Range (ft)', numInput(Number(val('range', 14)), (v) => Store.mutate(() => { item.props.range = v; }, 'range'), 0.5)));
    }
  }

  /* ------------------------------------------------------------ lamps ---- */

  /* Wattage, and what it does.
   *
   * The numbers on their own mean nothing — 5 W is either plenty or nothing
   * depending on how many of them and how big the room is — so the panel does
   * the sum and says what the room ends up at. That is the whole reason the
   * wattage exists: `lighting.js` turns it into the wash you can see. */
  function lampFields(box, floor, item, type, props) {
    const d = type.defaults || {};
    const val = (k, fb) => item.props[k] ?? d[k] ?? fb;
    const num = (k, fb) => Number(val(k, fb)) || fb;

    box.appendChild(P().locationTitle('section:item.lamp'));
    box.appendChild(h('div', { class: 'field row' },
      h('div', {}, h('label', {}, 'Watts each'), numInput(num('watt', 9), (v) => Store.mutate(() => { item.props.watt = v; }, 'watt'))),
      h('div', {}, h('label', {}, 'Lamps here'), numInput(num('count', 1), (v) => Store.mutate(() => { item.props.count = Math.max(1, Math.round(v || 1)); }, 'count'), 1)),
    ));
    box.appendChild(h('div', { class: 'field row' },
      h('div', {}, h('label', {}, 'Efficacy (lm/W)'), numInput(num('efficacy', 90), (v) => Store.mutate(() => { item.props.efficacy = v; }, 'efficacy'))),
      h('div', {}, h('label', {}, 'Colour (K)'), numInput(num('kelvin', 3000), (v) => Store.mutate(() => { item.props.kelvin = v; }, 'kelvin'), 50)),
    ));
    if (props.some((p) => p.key === 'beam')) {
      box.appendChild(field('Pool spread (ft)', numInput(num('beam', 2.6), (v) => Store.mutate(() => { item.props.beam = v; }, 'beam'), 0.1)));
    }

    const out = Lighting.lampOutput(item, type, null, Lighting.mergeConfig(S.project.lighting, floor && floor.lighting));
    const bits = [`${Math.round(out.ratedLumens)} lm`];
    if (out.count > 1) bits.push(`${out.count} × ${out.watt} W = ${out.watt * out.count} W`);

    /* What this contributes to the room it stands in, which is the number
     * somebody is actually deciding about when they type a wattage. */
    const room = item.room
      ? (floor.rooms || []).find((r) => r.id === item.room)
      : PlanScene.roomAt(floor, item.at[0], item.at[1]);
    if (room) {
      const cfg = Lighting.mergeConfig(S.project.lighting, floor && floor.lighting);
      const area = Math.max(1, SunModel.roomArea(PlanScene.primaryRoom(floor, room) || room));
      const alone = Lighting.roomLight([{ item, type, on: true, output: out, colour: null }], area, cfg);
      bits.push(`${alone.fc.toFixed(1)} fc alone in ${room.name || room.id}`);
    }
    box.appendChild(h('p', { class: 'hint' },
      bits.join(' · ')
      + `. A room reads fully lit at ${Lighting.mergeConfig(S.project.lighting).targetFc} fc — set that under Light.`));
  }

  /* What hangs in front of this opening. Optional on every door and window —
   * an opening with no covering is exactly as it was before any of this.
   *
   * Two ways to say how open it is, and they are not alternatives so much as a
   * fallback chain: bind a cover entity and it follows that live; set the
   * position by hand and it stays there. A bound cover that has gone quiet
   * falls back to the hand-set position, which is the last thing anybody
   * actually said about it. */
  function coveringFields(box, op) {
    const all = (S.boundaries && S.boundaries.coverings) || {};
    if (!Object.keys(all).length) return;
    const cov = op.covering || null;
    const groups = [...new Set(Object.values(all).map((c) => c.group || 'Other'))];

    box.appendChild(P().locationTitle('section:opening.covering'));
    box.appendChild(field(UINavigation.label('section:opening.covering'), h('select', {
      onchange: (e) => Store.mutate(() => {
        if (!e.target.value) { op.covering = null; return; }
        op.covering = Object.assign({ position: 100 }, op.covering, { type: e.target.value });
      }, 'covering'),
    }, h('option', { value: '', selected: !cov }, 'none'),
       ...groups.map((g) => h('optgroup', { label: g },
         ...Object.entries(all).filter(([, c]) => (c.group || 'Other') === g)
           .map(([k, c]) => h('option', { value: k, selected: cov && cov.type === k }, c.label || k)))))));

    if (!cov || !cov.type || cov.type === 'none') return;
    const spec = all[cov.type] || {};
    const pos = cov.position ?? 100;

    box.appendChild(entityRow('Follows this cover entity', cov.entity, ['cover'],
      (id) => Store.mutate(() => { op.covering.entity = id; }, 'covering entity')));

    box.appendChild(field(`Open — ${Math.round(pos)}%`, h('input', {
      type: 'range', min: 0, max: 100, step: 5, value: pos,
      onchange: (e) => Store.mutate(() => { op.covering.position = Number(e.target.value); }, 'covering position'),
    })));
    box.appendChild(h('p', { class: 'hint' },
      `${spec.label || cov.type} passes ${Math.round((spec.open ?? 1) * 100)}% wide open and `
      + `${Math.round((spec.closed ?? 1) * 100)}% shut.`
      + (cov.entity ? ' The slider is the fallback for when that entity is unavailable.' : '')));
  }

  function renderOpeningPanel(box, floor, op) {
    const types = (S.boundaries && S.boundaries.openingTypes) || {};
    const def = types[op.type] || {};
    const props = def.props || {};
    box.appendChild(panelTitle(def.label || 'Opening', 'panel:opening'));
    box.appendChild(h('p', { class: 'hint' }, h('span', { class: 'badge' }, op.id), ' · ', op.room, ' · ', wallLabel(op.wall)));

    box.appendChild(field('Type', h('select', {
      onchange: (e) => Store.mutate(() => {
        op.type = e.target.value;
        const p = (types[e.target.value] || {}).props || {};
        for (const k of ['swing', 'hinge', 'leaves', 'leafRatio', 'slideTo', 'depth']) delete op[k];
        for (const [k, value] of Object.entries(p)) if (op[k] === undefined && value !== null) op[k] = value;
      }, 'opening type'),
    }, ...Object.entries(types).map(([k, t]) => h('option', { value: k, selected: op.type === k }, t.label || k)))));

    box.appendChild(h('div', { class: 'field row' },
      h('div', {}, h('label', {}, 'Along wall (ft)'), numInput(op.at, (v) => Store.mutate(() => { op.at = v ?? 0; }, 'at'))),
      h('div', {}, h('label', {}, 'Width (ft)'), numInput(op.w ?? props.w, (v) => Store.mutate(() => { op.w = v || 1; }, 'w'))),
    ));
    box.appendChild(h('div', { class: 'field row' },
      h('div', {}, h('label', {}, 'Height (ft)'), numInput(op.h ?? props.h, (v) => Store.mutate(() => { op.h = v; }, 'h'))),
      h('div', {}, h('label', {}, 'Sill (ft)'), numInput(op.sill ?? props.sill, (v) => Store.mutate(() => { op.sill = v; }, 'sill'))),
    ));

    /* --- daylight --- */
    box.appendChild(h('div', { class: 'subhead' }, 'Daylight'));
    const trans = op.transmission ?? def.transmission ?? 1;
    box.appendChild(field(`Transmission — ${Math.round(trans * 100)}%`, h('input', {
      type: 'range', min: 0, max: 1, step: 0.05, value: trans,
      onchange: (e) => Store.mutate(() => { op.transmission = Number(e.target.value); }, 'transmission'),
    })));
    coveringFields(box, op);
    const effectiveTransmission = PlanScene.openingTransmission(op, S.boundaries, null, S.view.live ? S.states || {} : {});
    const area = (op.w ?? props.w ?? 0) * (op.h ?? props.h ?? 0);
    box.appendChild(settingHelp(
      `Effective transmission: ${Math.round(effectiveTransmission * 100)}% · ${area.toFixed(1)} sq ft.`, 'How transmission works',
      'Includes the opening position and any covering.',
      'Affects both daylight coming in and lamplight spilling out.'));

    /* --- door behaviour --- */
    const style = (def.render && def.render.style) || '';
    if (/swing|slide|pocket|fold|telescopic|scissor|roll|sectional|tilt/.test(style)) {
      box.appendChild(P().locationTitle('section:opening.mechanism'));
      if (/swing|fold/.test(style)) {
        box.appendChild(h('div', { class: 'field row' },
          h('div', {}, h('label', {}, 'Swing'), h('select', {
            onchange: (e) => Store.mutate(() => { op.swing = e.target.value; }, 'swing'),
          }, ...['in', 'out'].map((v) => h('option', { value: v, selected: (op.swing || props.swing || 'in') === v }, v)))),
          h('div', {}, h('label', {}, 'Hinge'), h('select', {
            disabled: !!(def.render || {}).split || (style === 'swing' && (op.leaves ?? props.leaves ?? 1) === 2),
            onchange: (e) => Store.mutate(() => { op.hinge = e.target.value; }, 'hinge'),
          }, ...['start', 'end'].map((v) => h('option', { value: v, selected: (op.hinge || props.hinge || 'start') === v }, v)))),
        ));
        const split = !!(def.render || {}).split;
        const leafOptions = style === 'swing' ? [1, 2] : split ? [4, 8, 12] : [2, 4, 6, 8, 10, 12];
        box.appendChild(field('Leaves', h('select', { onchange: (e) => Store.mutate(() => { op.leaves = Number(e.target.value); }, 'leaves') },
          ...leafOptions.map(v => h('option', {value:v,selected:(op.leaves ?? props.leaves ?? 1) === v}, String(v))))));
        if (style === 'swing' && (op.leaves ?? props.leaves ?? 1) === 2) box.appendChild(field('First leaf share', h('input', {
          type:'range',min:.1,max:.9,step:.05,value:op.leafRatio ?? props.leafRatio ?? .5,
          onchange:(e)=>Store.mutate(()=>{op.leafRatio=Number(e.target.value);},'leaf share'),
        })));
        box.appendChild(settingHelp('Swing direction is relative to this room.', 'Swing and hinge guide',
          'In opens into this room; out opens away from it.',
          'Start is left on a horizontal wall and top on a vertical wall.',
          'Paired leaves hinge at both outer posts.'));

        /* The house sets whether arcs are drawn; this door can disagree. Blank
         * inherits, exactly like every other scoped setting here. */
        const houseArc = (S.project.doors || {}).swingArc !== false;
        if (style === 'swing') box.appendChild(field('Swing arc', h('select', {
          onchange: (e) => Store.mutate(() => {
            if (e.target.value === '') delete op.arc; else op.arc = e.target.value === 'on';
          }, 'swing arc'),
        },
        h('option', { value: '', selected: op.arc === undefined }, `Follow the house (${houseArc ? 'shown' : 'hidden'})`),
        h('option', { value: 'on', selected: op.arc === true }, 'Always show'),
        h('option', { value: 'off', selected: op.arc === false }, 'Always hide'))));
      }

      if (/slide|pocket|telescopic|scissor|side_sectional/.test(style)) {
        const directions = style === 'slide' ? ['start', 'end', 'both'] : ['start', 'end'];
        box.appendChild(field('Slide toward', h('select', {onchange:(e)=>Store.mutate(()=>{op.slideTo=e.target.value;},'slide direction')},
          ...directions.map(v=>h('option',{value:v,selected:(op.slideTo ?? props.slideTo ?? 'start')===v},v === 'both' ? 'Both ends' : v)))));
      }
      if (/telescopic|scissor/.test(style)) box.appendChild(field('Panels', h('select', {onchange:(e)=>Store.mutate(()=>{op.leaves=Number(e.target.value);},'panels')},
        ...(style === 'scissor' ? [3,4,5,6] : [2,3,4,5,6]).map(v=>h('option',{value:v,selected:(op.leaves ?? props.leaves ?? 3)===v},String(v))))));
      if (/sectional|tilt/.test(style)) box.appendChild(field('Parking depth (ft)', numInput(op.depth ?? props.depth ?? 7,
        v=>Store.mutate(()=>{op.depth=Math.max(1,v ?? 7);},'parking depth'),.25)));
      if (def.hint) box.appendChild(h('p',{class:'hint'},def.hint));
      box.appendChild(entityRow('Contact sensor', op.sensor, ['binary_sensor'],
        (id) => Store.mutate(() => { op.sensor = id; }, 'opening sensor')));
      box.appendChild(entityRow('Motor / cover entity', op.cover, ['cover'],
        (id) => Store.mutate(() => { op.cover = id; }, 'opening cover')));
      box.appendChild(settingHelp('Contact sensor takes priority over the motor.', 'Readings and unavailable devices',
        'Contact sensor: off means closed; on means open.',
        'Without a contact sensor, the motor reports its opening percentage.',
        'Unknown or unavailable readings use the type default and a hollow status pip. They do not confirm closure.'));
      if (!op.sensor && !op.cover) {
        box.appendChild(field('Preview opening (%)', h('input', {type:'range',min:0,max:100,step:5,
          value:op.position ?? ((op.open ?? def.defaultOpen ?? true) ? 100 : 0),
          onchange:(e)=>Store.mutate(()=>{op.position=Number(e.target.value);},'opening preview')})));
      } else {
        const status = PlanScene.openingState(op, def, S.states || {});
        box.appendChild(h('p', {class:'hint'}, status.known ? 'Currently ' + status.state + ' · ' + Math.round(status.position * 100) + '% open' : 'No reliable reading — preview uses the type default.'));
      }
    }

    /* A bay projects out of the wall it sits in, and how far was a number the
     * renderer read with nothing to set it — every bay in every plan was drawn
     * at the same 1.5 ft. */
    if (style === 'bay') {
      box.appendChild(field('Projection from the wall (ft)',
        numInput(op.projectFt ?? 1.5, (v) => Store.mutate(() => { op.projectFt = v ?? 1.5; }, 'bay projection'), 0.25)));
    }

    /* Overhead openings — a skylight, a light well, a double-height void — are
     * holes in the CEILING, not gaps in a wall. The renderer has always known
     * to keep them out of the wall runs; nothing ever let you say so. */
    if (S.advanced) {
      box.appendChild(P().locationTitle('section:opening.overhead'));
      box.appendChild(h('label', { class: 'inline' }, h('input', {
        type: 'checkbox', checked: !!op.overhead,
        onchange: (e) => Store.mutate(() => { op.overhead = e.target.checked || undefined; }, 'overhead'),
      }), ' Overhead — a skylight or a void, not a hole in a wall'));
      box.appendChild(h('p', { class: 'hint' },
        'It stops cutting a gap in the wall it names and stops being offered to the room next door, '
        + 'while its area and transmission still count toward daylight.'));
    } else {
      box.appendChild(h('p', { class: 'hint adv-note' }, 'More settings here — tick Advanced in the top bar.'));
    }

    box.appendChild(h('div', { class: 'subhead' }, ' '));
    box.appendChild(h('button', { class: 'btn danger', onclick: () => Canvas.deleteSelected() }, 'Delete opening'));
  }

  /* ------------------------------------------------------------- the sun -- */

  function sunDialog() {
    const proj = S.project;
    proj.sun = proj.sun || {};
    const floor = Store.floor();
    const out = h('div', {});
    const body = h('div', {});

    body.appendChild(settingHelp('Set daylight for the house; individual floors can override it.', 'How daylight is modelled',
      'Your location determines the sun’s height and direction.',
      'Each opening’s transmission controls how much daylight enters.'));

    body.appendChild(h('div', { class: 'field' },
      h('label', { class: 'inline' }, h('input', {
        type: 'checkbox', checked: !!proj.sun.enabled,
        onchange: (e) => { Store.mutate(() => { proj.sun.enabled = e.target.checked; }, 'sun'); refresh(); },
      }), ' Daylight enabled for the whole house')));

    const loc = proj.sun.location || (proj.sun.location = { lat: null, lon: null });
    body.appendChild(h('h3', { class: 'subhead' }, 'Location & orientation'));
    body.appendChild(h('div', { class: 'field row' },
      h('div', {}, h('label', {}, 'Latitude'), h('input', {
        type: 'number', step: 0.0001, value: loc.lat ?? '',
        onchange: (e) => { Store.mutate(() => { loc.lat = e.target.value === '' ? null : Number(e.target.value); }, 'lat'); refresh(); },
      })),
      h('div', {}, h('label', {}, 'Longitude'), h('input', {
        type: 'number', step: 0.0001, value: loc.lon ?? '',
        onchange: (e) => { Store.mutate(() => { loc.lon = e.target.value === '' ? null : Number(e.target.value); }, 'lon'); refresh(); },
      })),
    ));
    body.appendChild(h('button', {
      class: 'btn tiny',
      onclick: () => {
        const z = S.states['zone.home'];
        if (z && z.attributes && z.attributes.latitude != null) {
          Store.mutate(() => { loc.lat = z.attributes.latitude; loc.lon = z.attributes.longitude; }, 'location');
          toast('Taken from zone.home'); refresh();
        } else {
          toast('zone.home carries no coordinates in the redacted snapshot — enter them by hand.', true);
        }
      },
    }, 'Try Home Assistant’s home location'));
    body.appendChild(h('p', { class: 'hint' },
      'Enter coordinates manually if Home Assistant’s location is unavailable.'));

    body.appendChild(field('Which bearing points UP the screen', h('select', {
      onchange: (e) => { Store.mutate(() => { proj.sun.screenUpBearing = Number(e.target.value); }, 'bearing'); refresh(); },
    }, ...[[0, 'North'], [90, 'East'], [180, 'South'], [270, 'West']].map(([v, l]) =>
      h('option', { value: v, selected: Number(proj.sun.screenUpBearing || 0) === v }, l)))));
    body.appendChild(h('p', { class: 'hint' },
      'Sets the compass direction at the top of the plan.'));

    proj.compass = proj.compass || {};
    body.appendChild(h('label', { class: 'inline' },
      h('input', {
        type: 'checkbox', checked: proj.compass.show !== false,
        onchange: (e) => { Store.mutate(() => { proj.compass.show = e.target.checked; }, 'compass'); refresh(); },
      }), ' Show a compass on the plan'));
    body.appendChild(h('p', { class: 'hint' },
      'The compass follows the bearing above.'));

    /* Read merged, write on change. Materialising `sun.ambient` merely to show
     * its value put an empty object into the project the moment anybody opened
     * this dialog — harmless, but a document should record decisions, not the
     * fact that somebody once looked at a panel. */
    body.appendChild(h('h3', { class: 'subhead' }, 'Daylight brightness'));
    body.appendChild(field('Glazing target (glazed area ÷ floor area)', h('input', {
      type: 'number', step: 0.01, min: 0.01, max: 1,
      value: (proj.sun.ambient || {}).referenceExposure ?? 0.16,
      onchange: (e) => {
        Store.mutate(() => {
          proj.sun.ambient = Object.assign({}, proj.sun.ambient, { referenceExposure: Number(e.target.value) || 0.16 });
        }, 'daylight reference');
        refresh();
      },
    })));
    body.appendChild(settingHelp('Glazing target is a share of the room’s floor area.', 'Adjusting daylight brightness',
      'At this share, a room is modelled as fully daylit; below it, proportionally less.',
      'Raise the target if rooms look too bright; lower it if they look too dark.',
      'Each room can override this target in its inspector.'));

    body.appendChild(h('h3', { class: 'subhead' }, 'Weather & solar sensors'));
    body.appendChild(entityRow('Weather entity (dims the sky)', (proj.sun.weather || {}).entity, ['weather'],
      (id) => { Store.mutate(() => { proj.sun.weather = Object.assign({}, proj.sun.weather, { entity: id }); }, 'weather'); refresh(); }));

    const ss = proj.sun.solarSensor || (proj.sun.solarSensor = {});
    body.appendChild(entityRow('Solar power sensor (corroborates)', ss.entity, ['sensor'],
      (id) => { Store.mutate(() => { ss.entity = id; }, 'solar sensor'); refresh(); }));
    body.appendChild(field('Its peak output (W)', h('input', {
      type: 'number', value: ss.peakW ?? '',
      onchange: (e) => { Store.mutate(() => { ss.peakW = e.target.value === '' ? null : Number(e.target.value); }, 'peakW'); refresh(); },
    })));
    body.appendChild(settingHelp('Solar output can reduce the daylight estimate.', 'How solar readings are used',
      'Readings only dim the estimate; they cannot add light beyond the model.',
      'Ignored when the sun is below 12° elevation, where power output is low even on a clear day.'));

    if (floor) {
      body.appendChild(h('div', { class: 'subhead' }, `This floor — ${floor.name}`));
      const hasOverride = !!(floor.sun && Object.keys(floor.sun).length);
      body.appendChild(h('div', { class: 'field' },
        h('label', { class: 'inline' }, h('input', {
          type: 'checkbox', checked: hasOverride,
          onchange: (e) => { Store.mutate(() => { floor.sun = e.target.checked ? { enabled: true } : null; }, 'floor sun'); refresh(); },
        }), ' Override the house setting here')));
      if (hasOverride) {
        body.appendChild(h('div', { class: 'field' },
          h('label', { class: 'inline' }, h('input', {
            type: 'checkbox', checked: floor.sun.enabled !== false,
            onchange: (e) => { Store.mutate(() => { floor.sun.enabled = e.target.checked; }, 'floor sun'); refresh(); },
          }), ' Daylight on this floor')));
        body.appendChild(h('p', { class: 'hint' }, 'A basement, or a floor with no glazing, is usually worth turning off — it saves an ambient wash nothing justifies.'));
      }
    }

    /* ---- advanced ----
     *
     * The constants the daylight model runs on. Every one of them was read by
     * `sun.js` and reachable from nowhere in the editor: the sky curve, the
     * beam geometry, the floor and ceiling of the ambient wash, how much the
     * panels are allowed to argue with the almanac. A house never needs to
     * touch them, which is why they are behind the Advanced toggle rather than
     * in the list above — but "never needs to" is not "cannot".
     *
     * The tick that reveals them is in this dialog's OWN header, not only the
     * top bar: a dialog is a full-screen overlay, so the top bar's copy is
     * covered while this is open. Said either way round — the note when it is
     * off, the settings when it is on — through the same `adv`/`note` pair the
     * panels use, so the wording cannot drift from theirs. */
    const A = P().dialogAdvanced();
    body.appendChild(P().locationTitle('section:sun.model'));
    A.adv(body, () => {
      /* Read from the MERGED config and write only on change. Materialising a
       * group just to show it would stamp the whole default block into
       * project.json the moment anybody opened this dialog, and a project
       * carrying an explicit copy of every default is one that stops tracking
       * them when they improve. */
      const merged = SunModel.mergeConfig(proj.sun);
      const numIn = (label, group, key, step, hint) => field(label, h('input', {
        type: 'number', step, value: (merged[group] || {})[key] ?? '',
        onchange: (e) => {
          Store.mutate(() => {
            const next = Object.assign({}, SunModel.DEFAULTS[group], proj.sun[group]);
            if (e.target.value === '') delete next[key]; else next[key] = Number(e.target.value);
            proj.sun[group] = next;
          }, 'sun ' + key);
          refresh();
        },
      }), hint);

      body.appendChild(h('div', { class: 'subhead' }, 'Advanced — the ambient wash'));
      body.appendChild(numIn('Darkest a lit room gets at night', 'ambient', 'nightFloor', 0.01,
        'The floor under the daylight term, so a room is never drawn as a black hole.'));
      body.appendChild(numIn('Brightest by day', 'ambient', 'max', 0.05));
      body.appendChild(numIn('Share a room with no glazing still receives', 'ambient', 'scatter', 0.01,
        'Light that arrives round corners and through doorways rather than through a window of its own.'));
      body.appendChild(numIn('Sky share an outdoor room takes', 'ambient', 'outdoor', 0.05,
        '1 is open sky. Lower it for a terrace that is open above but overshadowed.'));

      body.appendChild(h('div', { class: 'subhead' }, 'Advanced — the sky curve'));
      body.appendChild(h('p', { class: 'hint' },
        'How sky strength follows the sun’s elevation. It peaks well before the zenith on '
        + 'purpose: a plan cares how much light gets THROUGH a window, and a high sun enters '
        + 'a vertical opening at a poor angle.'));
      body.appendChild(numIn('First light at (° elevation)', 'extinction', 'riseAt', 1));
      body.appendChild(numIn('Full strength from (°)', 'extinction', 'peakFrom', 1));
      body.appendChild(numIn('…to (°)', 'extinction', 'peakTo', 1));
      body.appendChild(numIn('Fall-off past the peak', 'extinction', 'falloff', 0.05));

      body.appendChild(h('div', { class: 'subhead' }, 'Advanced — sun patches'));
      body.appendChild(numIn('Head height of an opening (ft)', 'beam', 'headFt', 0.5,
        'Beam length is this over the tangent of the elevation, which is why a near-zenith noon throws shorter patches than a low morning sun.'));
      body.appendChild(numIn('Longest patch drawn (ft)', 'beam', 'maxFt', 1));
      body.appendChild(numIn('Stop drawing below (° elevation)', 'beam', 'minElevation', 1));
      body.appendChild(numIn('Spread (°)', 'beam', 'spreadDeg', 1));

      body.appendChild(h('div', { class: 'subhead' }, 'Advanced — corroboration'));
      body.appendChild(numIn('How much the panels are believed', 'solarSensor', 'weight', 0.05,
        'They only ever pull the estimate DOWN toward what is really happening.'));
      body.appendChild(numIn('Ignore them below (° elevation)', 'solarSensor', 'minElevation', 1));
      body.appendChild(numIn('Weather factor for a state nobody listed', 'weather', 'default', 0.05));

      body.appendChild(h('div', { class: 'subhead' }, 'Advanced — where the position comes from'));
      body.appendChild(field('Solar position', h('select', {
        onchange: (e) => { Store.mutate(() => { proj.sun.source = e.target.value; }, 'sun source'); refresh(); },
      },
      h('option', { value: 'compute', selected: (proj.sun.source || 'compute') !== 'entity' }, 'Compute it from the location above'),
      h('option', { value: 'entity', selected: proj.sun.source === 'entity' }, 'Take it from Home Assistant’s own sun entity')),
      'Computing it needs only a latitude and longitude and works with no Home Assistant at all. Taking it from the entity gives you one source of truth instead of two that can disagree.'));
      if (proj.sun.source === 'entity') {
        body.appendChild(entityRow('Sun entity', proj.sun.sunEntity || 'sun.sun', ['sun'],
          (id) => { Store.mutate(() => { proj.sun.sunEntity = id; }, 'sun entity'); refresh(); }));
      }

      /* What each weather condition does to the sky.
       *
       * Sixteen numbers the model has always read and nothing could reach: the
       * multiplier applied to sky strength when the weather entity reports
       * that condition. They are listed FROM THE DEFAULTS rather than from a
       * hand-written list of conditions, so a condition added to the registry
       * appears here with no code change — and the labels are the Home
       * Assistant condition strings themselves, because those are what the
       * entity actually reports and translating them would only make the row
       * harder to match against what you see in Developer Tools.
       *
       * Only a changed one is written. A project carrying an explicit copy of
       * all sixteen stops tracking them when they improve. */
      const wxDefaults = SunModel.DEFAULTS.weather.factors;
      const wxSet = (key, value) => Store.mutate(() => {
        const next = Object.assign({}, wxDefaults, (proj.sun.weather || {}).factors);
        if (value === null) delete next[key]; else next[key] = value;
        proj.sun.weather = Object.assign({}, proj.sun.weather, { factors: next });
      }, 'weather ' + key);
      body.appendChild(h('div', { class: 'subhead' }, 'Advanced — what the weather does to the sky'));
      body.appendChild(h('p', { class: 'hint' },
        '1 is a clear sky at full strength; 0.35 is a third of it. These apply only while a '
        + 'weather entity is set above — with none, the fallback beside it is used for everything.'));
      const wxGrid = h('div', { class: 'option-grid' });
      const wxNow = ((proj.sun.weather || {}).factors) || {};
      for (const key of Object.keys(wxDefaults)) {
        wxGrid.appendChild(h('div', { class: 'field' },
          h('label', {}, key.replace(/-/g, ' ')),
          h('input', {
            type: 'number', step: 0.05, min: 0, max: 1,
            value: wxNow[key] ?? wxDefaults[key],
            title: `default ${wxDefaults[key]}`,
            onchange: (e) => wxSet(key, e.target.value === '' ? null : Number(e.target.value)),
          })));
      }
      body.appendChild(wxGrid);
      body.appendChild(h('button', {
        class: 'btn tiny', style: 'margin-top:6px',
        onclick: () => { Store.mutate(() => { if (proj.sun.weather) delete proj.sun.weather.factors; }, 'weather factors'); sunDialog(); },
      }, 'Back to the shipped values'));
    });
    A.note(body, 'the ambient wash, the sky curve, sun patches, the beam and what the weather does to the sky');

    body.appendChild(h('div', { class: 'subhead' }, 'Right now'));
    body.appendChild(out);

    function refresh() {
      const cfg = Store.sunConfig();
      const sc = SunModel.scene(cfg, S.states, S.when);
      out.replaceChildren();
      if (!sc) {
        out.appendChild(h('p', { class: 'warn' },
          cfg.enabled ? 'Enabled, but there is no usable location yet.' : 'Daylight is off.'));
      } else {
        const ev = cfg.location.lat != null ? SunModel.dayEvents(cfg.location.lat, cfg.location.lon, S.when || new Date()) : null;
        const t = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
        out.appendChild(h('table', { class: 'grid' },
          h('tr', {}, h('th', {}, 'Elevation'), h('td', {}, `${sc.elevation.toFixed(1)}°`)),
          h('tr', {}, h('th', {}, 'Azimuth'), h('td', {}, `${sc.azimuth.toFixed(1)}° true · ${sc.screenAngle.toFixed(0)}° on screen`)),
          h('tr', {}, h('th', {}, 'Sky'), h('td', {}, `${Math.round(sc.day * 100)}%${sc.solar != null ? ` · panels say ${Math.round(sc.solar * 100)}%` : ''}`)),
          h('tr', {}, h('th', {}, 'Beam reach'), h('td', {}, `${sc.beamLength.toFixed(1)} ft`)),
          ev ? h('tr', {}, h('th', {}, 'Sunrise / sunset'), h('td', {}, `${t(ev.sunrise)} / ${t(ev.sunset)}`)) : null,
        ));
      }
      Canvas.paint();
      const sb = document.getElementById('sunBox');
      if (sb) sb.hidden = !Store.sunConfig().enabled;
    }

    refresh();
    modal(null, body, { location: 'dialog:sun', rebuild: sunDialog });
  }

  /* The whole logic layer in one place: what the house binds, and a read-out of
   * everything bound anywhere. The overview matters more than it looks — a role
   * bound twice, or a scene bound to the wrong room, is invisible while you are
   * looking at one room's panel and obvious in a list. */
  function logicDialog() {
    const proj = S.project;
    const body = h('div', {});

    body.appendChild(h('p', { class: 'hint' },
      'A shortcut is one of your own actions: a label plus something to do — activate a scene, run a script, flip a helper, pause an automation, switch anything at all. The builder has no idea what any of them mean, which is the point: “Do not disturb” and “Turbo” are your words, not its. They cascade house → floor → room like every other setting, and none of them is created here — each names something that already exists in Home Assistant.'));

    shortcutsEditor(body, proj, 'house');

    body.appendChild(h('div', { class: 'subhead' }, 'Everywhere in this plan'));
    const rows = [];
    /* The raw layers rather than the resolved ones: this list is here to show
     * WHERE each shortcut was written, and resolving would collapse an override
     * into a single line — hiding exactly the duplicate you opened it to find. */
    const walk = (layer, where) => {
      for (const s of layer.shortcuts || []) {
        if (s && (s.entity || s.service)) {
          rows.push({ where, label: s.label || s.id, entity: s.entity || s.service, slot: s.slot || s.section || '' });
        }
      }
      if (layer.master) rows.push({ where, label: 'room light group', entity: layer.master, slot: '' });
      if (layer.dnd) rows.push({ where, label: 'Do not disturb (old spec field)', entity: layer.dnd, slot: 'header' });
      for (const x of layer.boost || []) {
        if (x && x.entity) rows.push({ where, label: (x.label || 'Boost') + ' (old spec field)', entity: x.entity, slot: '' });
      }
    };
    walk(proj, 'house');
    for (const f of proj.floors || []) {
      walk(f, f.name || f.id);
      for (const r of f.rooms || []) walk(r, `${f.name || f.id} · ${r.name || r.id}`);
    }
    for (const it of (proj.floors || []).flatMap((f) => (f.items || []).map((i) => [f, i]))) {
      if ((it[1].kind || '') === 'logic' && it[1].entity) {
        rows.push({ where: `${it[0].name || it[0].id} · on the plan`, label: it[1].name || it[1].type, entity: it[1].entity, slot: 'marker' });
      }
    }
    if (!rows.length) {
      body.appendChild(h('p', { class: 'hint' }, 'Nothing yet. Add a shortcut — a scene, a helper, an automation, any entity at all — and it appears here, in that room’s control surface, and on the generated dashboard.'));
    } else {
      const table = h('table', { class: 'grid' },
        h('tr', {}, h('th', {}, 'Label'), h('th', {}, 'Entity or service'), h('th', {}, 'Where'), h('th', {}, 'Shown')));
      for (const r of rows) {
        table.appendChild(h('tr', {}, h('td', {}, r.label || ''),
          h('td', { class: 'mono' }, r.entity), h('td', {}, r.where),
          h('td', {}, r.slot ? h('span', { class: 'badge' }, r.slot) : '')));
      }
      body.appendChild(table);
      body.appendChild(h('p', { class: 'hint' },
        `${rows.length} in all. Every one reaches the generated dashboard. None of them is created here — each names something that already exists in Home Assistant.`));
    }

    modal(null, body, { location: 'dialog:logic', rebuild: logicDialog });
  }

  return { flooringField, editFlooring, editSchemes, editBoundaries, editControls, roomExtras, renderOpeningPanel, sunDialog, wallLabel, entityRow, editRoomButtons, editFilter, aimFields, lampFields, shortcutsEditor, logicDialog };
}());
