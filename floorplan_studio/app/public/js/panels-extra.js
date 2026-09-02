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
  const toast = (...a) => P().toast(...a);

  /* Screen edge -> the compass word the project says it means. Screen-relative
   * everywhere, compass only for display: mixing the two is the classic way to
   * put a window on the wrong side of a house. */
  const EDGE = { n: 'top', e: 'right', s: 'bottom', w: 'left' };
  function wallLabel(wall) {
    const c = (S.project && S.project.compass) || { up: 'N', right: 'E', down: 'S', left: 'W' };
    const map = { n: c.up, e: c.right, s: c.down, w: c.left };
    return `${EDGE[wall]} (${map[wall] || '?'})`;
  }

  /* ---------------------------------------------------------- flooring ---- */

  function flooringField(box, room) {
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
      h('label', {}, 'Flooring',
        h('button', {
          class: 'link', style: 'float:right;font-weight:400',
          title: 'Change what this finish looks like, or add one',
          onclick: () => editFlooring(cur),
        }, 'edit finishes')),
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
        type: 'color', value: normHex(o.color || (def.options || {}).color || '#e6eaf0'),
        oninput: (e) => Store.mutate(() => { room.flooringOptions = Object.assign({}, room.flooringOptions, { color: e.target.value }); }, 'flooring colour'),
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
      oninput: (e) => Store.mutate(() => {
        room.flooringOptions = Object.assign({}, room.flooringOptions, { reflectance: Number(e.target.value) / 100 });
      }, 'floor reflection'),
    })));
    box.appendChild(h('p', { class: 'hint' },
      `${(def.label || cur)} reflects about ${Math.round(typeR * 100)}% by default. `
      + 'Raise it for a gloss finish, drop it for matte or a dark stone — a brighter floor lifts the whole room, '
      + 'a dark one leaves it needing more light. Set 0% for a flat colour that bounces nothing.'));

    if (room.flooringOptions) {
      box.appendChild(h('button', { class: 'btn tiny', onclick: () => Store.mutate(() => { room.flooringOptions = null; }, 'reset flooring') }, 'Reset to the type’s own look'));
    }
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

    function drawList() {
      const groups = [...new Set(Object.values(doc.types).map((t) => t.group || 'Other'))];
      listBox.replaceChildren(...groups.map((g) => h('div', {},
        h('div', { class: 'subhead', style: 'margin:6px 0 2px;border-top:0;padding-top:0' }, g),
        ...Object.entries(doc.types)
          .filter(([, t]) => (t.group || 'Other') === g)
          .map(([k, t]) => h('button', {
            class: 'btn tiny',
            style: 'display:block;width:100%;text-align:left;margin-bottom:2px'
              + (k === current ? ';outline:2px solid var(--accent)' : ''),
            onclick: () => { current = k; draw(); },
          }, `${t.label || k}  ·  ${t.generator || '?'}`)))));
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
        const swatch = h('input', {
          type: 'color', value: normHex(val), style: 'width:38px;flex:none',
          oninput: (e) => { text.value = e.target.value; set(e.target.value); },
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
            oninput: (e) => set(Number(e.target.value) / 100),
          }));
      }

      const step = spec.kind === 'angle' ? 15 : (spec.step ?? 1);
      return h('div', { class: 'field' }, h('label', {}, spec.label || spec.key),
        h('input', {
          type: 'number', step, min: spec.min, value: val === undefined ? '' : val,
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
          oninput: (e) => { t.reflectance = Number(e.target.value) / 100; flooringChanged(); drawForm(); },
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
      listBox, addBtn, h('div', { class: 'subhead' }, ' '), formBox));
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
    box.appendChild(h('div', { class: 'subhead' }, 'Walls & railings'));
    box.appendChild(h('p', { class: 'hint' },
      'Each edge is a wall unless you say otherwise. Change one to glass railing, grill or open and the daylight model follows for free — it only ever reads transmission.'));

    const bTypes = Object.entries((S.boundaries && S.boundaries.types) || {});
    const bGroups = [...new Set(bTypes.map(([, t]) => t.group || 'Other'))];
    const edges = PlanScene.roomEdges(room).filter((e) => !e.diagonal);

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
      const span = edge.hi - edge.lo;
      const partial = !!(existing && (existing.from !== undefined || existing.to !== undefined));

      box.appendChild(h('div', { class: 'chanrow' },
        h('span', { class: 'hint', style: 'margin:0;flex:1' }, `${wallLabel(edge.wall)}${suffix} · ${span.toFixed(1)} ft`),
        h('select', {
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
    box.appendChild(h('div', { class: 'subhead' }, 'Room controls'));

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
      for (const b of ((S.controls && S.controls.default && S.controls.default.header && S.controls.default.header.buttons) || [])) {
        const on = (eff.header.buttons || []).some((x) => x.id === b.id);
        /* A button pointing at something this room has not got cannot be turned
         * on, and naming what is missing beats "unavailable". */
        const missing = !!b.hideWhenMissing && !Controls.resolveTarget(b.target, eff.shortcuts, room);
        box.appendChild(h('label', { class: 'inline', style: 'display:flex', title: missing ? `nothing here answers to “${b.target}”` : '' },
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

        const row = h('div', { style: 'margin-bottom:2px' });
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
          row.appendChild(h('div', { style: 'padding-left:20px' },
            h('p', { class: 'hint', style: 'margin:2px 0' },
              `from ${Controls.describeSources(merged)} — ${Controls.describeFilter(merged.filter)}`),
            h('button', { class: 'link', onclick: () => editFilter(floor, room, def.id, ctx) }, 'edit filter…')));
        }
        box.appendChild(row);
      }

      box.appendChild(h('button', { class: 'btn tiny', style: 'margin-top:6px', onclick: () => editRoomButtons(floor, room) }, 'Entity buttons…'));
    }

    /* --- what this room is bound to --- */
    shortcutsEditor(box, room, 'room', floor);

    /* --- which words this room answers to --- */
    box.appendChild(h('div', { class: 'subhead' }, 'Match keys'));
    box.appendChild(h('p', { class: 'hint' },
      'How sections that find their own entities recognise this room — a scene or an automation named after any of these joins its rows. Blank means the room’s id and name, which is usually right; set it when the entities are named after something else (a “Guest Room” whose scenes are all gr_…).'));
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
    box.appendChild(h('div', { class: 'subhead' }, 'Behaviour'));
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
      list));
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
    modal(`${room.name} — ${sectionId} filter`, body);
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

    box.appendChild(h('div', { class: 'subhead' }, has('fov') ? 'Aim and coverage' : 'Aim'));

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
        h('label', {}, 'Facing'),
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
        }), 'Detection cone')));
    }

    if (has('fov') && coneOn) {
      const fov = Number(val('fov', 90));
      const range = Number(val('range', 14));
      box.appendChild(h('div', { class: 'field row' },
        h('div', {}, h('label', {}, 'Field of view (°)'), numInput(fov, (v) => Store.mutate(() => { item.props.fov = v; }, 'fov'), 5)),
        h('div', {}, h('label', {}, 'Range (ft)'), numInput(range, (v) => Store.mutate(() => { item.props.range = v; }, 'range'), 0.5)),
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

    box.appendChild(h('div', { class: 'subhead' }, 'Light output'));
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

    box.appendChild(field('Covering', h('select', {
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
      oninput: (e) => Store.mutate(() => { op.covering.position = Number(e.target.value); }, 'covering position'),
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
    box.appendChild(h('h2', {}, def.label || 'Opening'));
    box.appendChild(h('p', { class: 'hint' }, h('span', { class: 'badge' }, op.id), ' · ', op.room, ' · ', wallLabel(op.wall)));

    box.appendChild(field('Type', h('select', {
      onchange: (e) => Store.mutate(() => {
        op.type = e.target.value;
        const p = (types[e.target.value] || {}).props || {};
        for (const k of ['w', 'h', 'sill']) if (p[k] !== undefined && op[k] === undefined) op[k] = p[k];
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
    const curtain = op.curtain ?? 1;
    box.appendChild(field(`Transmission — ${Math.round(trans * 100)}%`, h('input', {
      type: 'range', min: 0, max: 1, step: 0.05, value: trans,
      oninput: (e) => Store.mutate(() => { op.transmission = Number(e.target.value); }, 'transmission'),
    })));
    coveringFields(box, op);
    const covT = PlanScene.coveringTransmission(op, S.boundaries, S.states || {});
    const area = (op.w ?? props.w ?? 0) * (op.h ?? props.h ?? 0);
    box.appendChild(h('p', { class: 'hint' },
      `Effective ${Math.round(trans * curtain * covT * 100)}% over ${area.toFixed(1)} sq ft of opening. `
      + 'That single number is all the light model reads — for the sun coming in, and for how far a lamp inside spills out through it.'));

    /* --- door behaviour --- */
    const style = (def.render && def.render.style) || '';
    if (/swing|slide|pocket|fold/.test(style)) {
      box.appendChild(h('div', { class: 'subhead' }, 'Door'));
      if (/swing|fold/.test(style)) {
        box.appendChild(h('div', { class: 'field row' },
          h('div', {}, h('label', {}, 'Swing'), h('select', {
            onchange: (e) => Store.mutate(() => { op.swing = e.target.value; }, 'swing'),
          }, ...['in', 'out'].map((v) => h('option', { value: v, selected: (op.swing || 'in') === v }, v)))),
          h('div', {}, h('label', {}, 'Hinge'), h('select', {
            onchange: (e) => Store.mutate(() => { op.hinge = e.target.value; }, 'hinge'),
          }, ...['start', 'end'].map((v) => h('option', { value: v, selected: (op.hinge || 'start') === v }, v)))),
        ));
        box.appendChild(field('Leaves', numInput(op.leaves ?? props.leaves ?? 1, (v) => Store.mutate(() => { op.leaves = v || 1; }, 'leaves'), 1)));
        box.appendChild(h('p', { class: 'hint' }, 'Swing is drawn live — read the arc rather than trusting the word. Which side “in” lands on depends on whether the door sits on the room’s min or max edge, and “Hinge” flips which jamb it turns on.'));

        /* The house sets whether arcs are drawn; this door can disagree. Blank
         * inherits, exactly like every other scoped setting here. */
        const houseArc = (S.project.doors || {}).swingArc !== false;
        box.appendChild(field('Swing arc', h('select', {
          onchange: (e) => Store.mutate(() => {
            if (e.target.value === '') delete op.arc; else op.arc = e.target.value === 'on';
          }, 'swing arc'),
        },
        h('option', { value: '', selected: op.arc === undefined }, `Follow the house (${houseArc ? 'shown' : 'hidden'})`),
        h('option', { value: 'on', selected: op.arc === true }, 'Always show'),
        h('option', { value: 'off', selected: op.arc === false }, 'Always hide'))));
      }

      box.appendChild(entityRow('Contact sensor', op.sensor, ['binary_sensor'],
        (id) => Store.mutate(() => { op.sensor = id; }, 'door sensor')));
      box.appendChild(h('p', { class: 'hint' },
        '‘off’ is closed; everything else — unavailable, unknown, a flat battery, a deleted entity — draws OPEN. A dead sensor degrades to the default rather than claiming a door is shut when nothing knows.'));

      if (!op.sensor) {
        box.appendChild(field('Drawn as', h('select', {
          onchange: (e) => Store.mutate(() => { op.open = e.target.value === 'open'; }, 'open'),
        }, ...['open', 'closed'].map((v) => h('option', { value: v, selected: (op.open !== false) === (v === 'open') }, v)))));
      } else {
        const st = S.states[op.sensor];
        box.appendChild(h('p', { class: 'hint' }, st ? `Currently ${st.state} → drawn ${st.state === 'off' ? 'closed' : 'open'}.` : 'No state for that sensor in the snapshot.'));
      }
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

    body.appendChild(h('p', { class: 'hint' },
      'Give the house a location and the plan models daylight: sky brightness from the real solar elevation, and a beam through every opening along the true azimuth, scaled by that opening’s transmission. Set it once for the house; any floor may override it.'));

    body.appendChild(h('div', { class: 'field' },
      h('label', { class: 'inline' }, h('input', {
        type: 'checkbox', checked: !!proj.sun.enabled,
        onchange: (e) => { Store.mutate(() => { proj.sun.enabled = e.target.checked; }, 'sun'); refresh(); },
      }), ' Daylight enabled for the whole house')));

    const loc = proj.sun.location || (proj.sun.location = { lat: null, lon: null });
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
      'Location domains are stripped from the entity feed on purpose, so this often will not resolve — coordinates typed here are the reliable route.'));

    body.appendChild(field('Which bearing points UP the screen', h('select', {
      onchange: (e) => { Store.mutate(() => { proj.sun.screenUpBearing = Number(e.target.value); }, 'bearing'); refresh(); },
    }, ...[[0, 'North'], [90, 'East'], [180, 'South'], [270, 'West']].map(([v, l]) =>
      h('option', { value: v, selected: Number(proj.sun.screenUpBearing || 0) === v }, l)))));
    body.appendChild(h('p', { class: 'hint' },
      'The only place plan rotation lives. Everything else is screen-relative, so a plan drawn with north to the left is a setting rather than tribal knowledge.'));

    proj.compass = proj.compass || {};
    body.appendChild(h('label', { class: 'inline' },
      h('input', {
        type: 'checkbox', checked: proj.compass.show !== false,
        onchange: (e) => { Store.mutate(() => { proj.compass.show = e.target.checked; }, 'compass'); refresh(); },
      }), ' Show a compass on the plan'));
    body.appendChild(h('p', { class: 'hint' },
      'Drawn from the bearing above, so the needle and the sun beams can never disagree. On by default whenever daylight is modelled — a lit plan with no north mark asks the reader to take the lighting on trust.'));

    const amb = proj.sun.ambient || (proj.sun.ambient = {});
    body.appendChild(field('Glazing that counts as fully daylit (glazed ÷ floor area)', h('input', {
      type: 'number', step: 0.01, min: 0.01, max: 1,
      value: amb.referenceExposure ?? 0.16,
      onchange: (e) => { Store.mutate(() => { amb.referenceExposure = Number(e.target.value) || 0.16; }, 'daylight reference'); refresh(); },
    })));
    body.appendChild(h('p', { class: 'hint' },
      'A room glazed to this share of its own floor reads as fully lit by day; below it, proportionally less. Building practice puts usable daylight near 0.10 and good daylight near 0.20. Raise it if rooms look too bright by day, lower it if they look too dark. Any room can override it in its own panel.'));

    body.appendChild(entityRow('Weather entity (dims the sky)', (proj.sun.weather || {}).entity, ['weather'],
      (id) => { Store.mutate(() => { proj.sun.weather = Object.assign({}, proj.sun.weather, { entity: id }); }, 'weather'); refresh(); }));

    const ss = proj.sun.solarSensor || (proj.sun.solarSensor = {});
    body.appendChild(entityRow('Solar power sensor (corroborates)', ss.entity, ['sensor'],
      (id) => { Store.mutate(() => { ss.entity = id; }, 'solar sensor'); refresh(); }));
    body.appendChild(field('Its peak output (W)', h('input', {
      type: 'number', value: ss.peakW ?? '',
      onchange: (e) => { Store.mutate(() => { ss.peakW = e.target.value === '' ? null : Number(e.target.value); }, 'peakW'); refresh(); },
    })));
    body.appendChild(h('p', { class: 'hint' },
      'The panels only ever pull the estimate down toward what is really happening — they cannot invent light the geometry says is not there. Ignored below 12° elevation, where a low sun makes almost no power even on a clear day.'));

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
    modal('Sun & location', body);
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

    modal('Shortcuts, scenes & automations', body);
  }

  return { flooringField, editFlooring, roomExtras, renderOpeningPanel, sunDialog, wallLabel, entityRow, editRoomButtons, editFilter, aimFields, lampFields, shortcutsEditor, logicDialog };
}());
