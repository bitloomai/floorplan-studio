/* The two dialogs that turn a drawing into a dashboard, plus the lighting
 * model's own settings.
 *
 * Kept out of panels.js because these are the only parts of the editor that
 * WRITE to Home Assistant, and having them in one file makes that easy to see.
 * Everything else in the UI reads.
 */
window.PanelsDashboard = (function () {
  'use strict';

  const S = Store.S;
  const h = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'class') n.className = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  };
  const field = (label, control, hint) => h('div', { class: 'field' },
    h('label', {}, label), control, hint ? h('p', { class: 'hint' }, hint) : null);
  /* replaceChildren() stringifies whatever it is given, so a conditional child
   * left as `null` renders the word "null" on the page rather than nothing. */
  const kids = (el, ...list) => el.replaceChildren(...list.flat().filter(Boolean));

  /* ------------------------------------------------------------ dashboard */

  /* Default name: the project's, slugged. Storing the chosen one on the
   * project means a regenerate goes back to the same dashboard rather than
   * quietly creating a second one next to it — which is the single most
   * annoying way for a generator like this to behave. */
  function defaultPath(name) {
    return String(name || 'home-plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home-plan';
  }

  async function dashboardDialog() {
    const proj = S.project;
    proj.dashboard = proj.dashboard || {};
    const d = proj.dashboard;
    const title = d.title || proj.name || 'Home Plan';
    const urlPath = d.urlPath || defaultPath(title);

    const titleIn = h('input', { type: 'text', value: title, style: 'width:100%' });
    const pathIn = h('input', { type: 'text', value: urlPath, style: 'width:100%', spellcheck: 'false', class: 'mono' });
    const houseChk = h('input', { type: 'checkbox', checked: d.includeHouse !== false });
    const floorChk = h('input', { type: 'checkbox', checked: d.includeFloor !== false });
    const embedChk = h('input', { type: 'checkbox', checked: d.embedProject !== false });
    const tabStyleIn = h('select', {},
      h('option', { value: 'icons', selected: d.tabStyle !== 'names' }, 'Icons'),
      h('option', { value: 'names', selected: d.tabStyle === 'names' }, 'Floor names'));
    const summary = h('div', { class: 'hint' }, 'Working out what would be installed…');
    const installBtn = h('button', { class: 'btn primary', disabled: true }, 'Generate dashboard');
    const status = h('p', { class: 'hint' }, '');

    /* Typing in the title auto-follows the path only while the path has not
     * been touched — otherwise renaming the dashboard would silently move it. */
    let pathEdited = !!d.urlPath;
    pathIn.addEventListener('input', () => { pathEdited = true; });
    titleIn.addEventListener('input', () => { if (!pathEdited) pathIn.value = defaultPath(titleIn.value); });

    const body = h('div', {},
      h('p', { class: 'hint' },
        'One dashboard, one tab per floor, with the live plan on each. '
        + 'This is the only thing the app writes to Home Assistant — it never calls a service, '
        + 'and it refuses to write to any dashboard but the one named here.'),
      field('Dashboard name', titleIn),
      field('URL path', pathIn, 'Appears in the address bar and the sidebar. Lower-case letters, digits and hyphens.'),
      field('Floor tabs', tabStyleIn,
        'Icons use each floor’s Dashboard icon. Floor names use the names you chose in the floor panel.'),
      h('div', { class: 'field' },
        h('label', {}, 'Include'),
        h('label', { class: 'inline' }, houseChk, ' House card — name, weather, people, counts (repeated on every tab)'),
        h('label', { class: 'inline' }, floorChk, ' Floor card — how much of the floor is active, by class (per tab)')),
      h('div', { class: 'field' },
        h('label', {}, 'Portable editing'),
        h('label', { class: 'inline' }, embedChk, ' Keep the editable project in Home Assistant'),
        h('p', { class: 'hint' }, 'Allows Floorplan Studio on another browser or app install to pull this project, edit it, and deploy it back.')),
      field('Card theme', themePick(),
        'The plan follows the dashboard’s own theme unless you pin it to one.'),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:6px 0' },
        h('button', { class: 'btn tiny', onclick: () => houseCardDialog() }, 'Configure the house card…'),
        h('button', { class: 'btn tiny', onclick: () => floorCardDialog() }, 'Configure the floor cards…'),
        h('button', { class: 'btn tiny', onclick: () => appearanceDialog() }, 'Appearance & behaviour…')),
      h('div', { class: 'subhead' }, 'What will be installed'),
      summary,
      h('div', { class: 'subhead' }, ' '),
      h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
        installBtn,
        h('a', { class: 'btn', href: 'preview.html', target: '_blank', rel: 'noopener' }, 'Preview the card ↗'),
        h('button', { class: 'btn', onclick: () => Panels.closeModal() }, 'Cancel')),
      status);

    Panels.modal('Generate dashboard', body);

    const opts = () => ({
      title: titleIn.value.trim() || 'Home Plan',
      urlPath: pathIn.value.trim(),
      includeHouse: houseChk.checked,
      includeFloor: floorChk.checked,
      embedProject: embedChk.checked,
      tabStyle: tabStyleIn.value,
      project: S.project,
    });

    async function refresh() {
      installBtn.disabled = true;
      try {
        const r = await API.dashboardPreview(opts());
        if (r.error) { summary.textContent = r.error; return; }
        kids(summary,
          h('div', {}, `${r.views.length} tabs: `, h('strong', {}, r.views.map((v) => v.title).join(' · '))),
          h('div', {}, `Card module ${(r.card.bytes / 1024).toFixed(0)} KiB, covering all ${r.card.floors.length} floors.`),
          h('div', {}, r.mode === 'offline'
            ? 'Home Assistant is not reachable from the app, so nothing can be installed from here.'
            : `${r.entities.wanted} entities referenced`
              + (r.entities.missing.length ? `, ${r.entities.missing.length} of them missing.` : ', all present.')),
          r.entities.missing.length
            ? h('div', { class: 'mono', style: 'margin-top:6px;font-size:11px;opacity:.8' },
              r.entities.missing.slice(0, 8).join(', ') + (r.entities.missing.length > 8 ? ' …' : ''))
            : null,
        );
        installBtn.disabled = r.mode === 'offline';
      } catch (e) {
        summary.textContent = 'Could not work it out: ' + e.message;
      }
    }

    tabStyleIn.addEventListener('change', () => {
      Store.mutate(() => { d.tabStyle = tabStyleIn.value; }, 'dashboard tabs');
      refresh();
    });
    for (const el of [titleIn, pathIn, houseChk, floorChk, embedChk]) el.addEventListener('change', refresh);
    await refresh();

    installBtn.addEventListener('click', async () => {
      installBtn.disabled = true;
      status.textContent = 'Installing…';
      try {
        const r = await API.dashboardInstall(opts());
        if (r.error) { status.textContent = r.error; installBtn.disabled = false; return; }
        /* Remember where it went, so the next generate updates rather than
         * creating a second dashboard beside it. */
        /* Merged, not replaced: the house card's chips and the floor
         * breakdowns live on this same object, and installing must not throw
         * away the configuration that produced what was just installed. */
        Store.mutate(() => {
          S.project.dashboard = Object.assign({}, S.project.dashboard, {
            title: r.title, urlPath: r.urlPath,
            includeHouse: houseChk.checked, includeFloor: floorChk.checked,
            embedProject: embedChk.checked,
            tabStyle: tabStyleIn.value,
            installedAt: new Date().toISOString(),
          });
        }, 'dashboard settings');
        kids(status,
          h('div', {}, `Installed. ${r.views.length} tabs at `, h('strong', {}, '/' + r.urlPath), '.'),
          h('div', {}, `Card resource ${r.resource.action}${r.backedUp ? ', previous config backed up' : ''}.`),
          h('div', {}, r.editable ? 'Editable project stored in Home Assistant.' : 'Dashboard stored without an editable project.'),
          r.untouched.length ? h('div', {}, `${r.untouched.length} other dashboards left untouched.`) : null,
        );
        Panels.toast(`Dashboard "/${r.urlPath}" generated`);
      } catch (e) {
        status.textContent = 'Failed: ' + e.message;
        installBtn.disabled = false;
      }
    });
  }

  /* ------------------------------------------------------------- lighting */

  /* The lamp half of the daylight model. Same shape as the sun dialog next
   * door: every constant is config, nothing about any particular house is
   * baked in, and the numbers are shown in units somebody can reason about. */
  /* Which theme the CARD wears, which is not the same question as which theme
   * the editor wears. The default follows Home Assistant, because a card that
   * ignores the theme the rest of the dashboard is wearing looks like a
   * screenshot pasted onto the page — and this one fills a whole tab. */
  function themePick() {
    const d = S.project.dashboard || (S.project.dashboard = {});
    const themes = Object.entries((S.themes && S.themes.themes) || {});
    return h('select', {
      onchange: (e) => Store.mutate(() => { d.theme = e.target.value || null; }, 'card theme'),
    }, h('option', { value: '', selected: !d.theme }, 'Follow Home Assistant (default)'),
       ...themes.filter(([k]) => k !== 'ha').map(([k, t]) => h('option', { value: k, selected: d.theme === k }, t.name || k)));
  }

  /* ------------------------------------------------------- house card ---- */

  /* Fixed skeleton, configurable contents. The name and the weather are always
   * there — that is what makes the card recognisable from across a room — and
   * everything else in it is the user's: which counts, which live numbers,
   * which people. */
  function houseCardDialog() {
    const proj = S.project;
    proj.dashboard = proj.dashboard || {};
    const hc = proj.dashboard.house || (proj.dashboard.house = {});
    const body = h('div', {});
    const redraw = () => { Panels.closeModal(); houseCardDialog(); };

    body.appendChild(h('p', { class: 'hint' },
      'The card at the top of every tab. Its name and weather are fixed; the chips below them are yours. '
      + 'Counts say how many of something are on, stats show one live number, and the house’s own shortcuts appear as buttons.'));

    body.appendChild(field('Title', h('input', {
      type: 'text', value: hc.title || '', placeholder: proj.name || 'Home', style: 'width:100%',
      onchange: (e) => Store.mutate(() => { hc.title = e.target.value.trim() || null; }, 'house title'),
    })));
    body.appendChild(PanelsExtra.entityRow('Weather entity', hc.weather, ['weather'],
      (id) => { Store.mutate(() => { hc.weather = id; }, 'house weather'); redraw(); }));

    body.appendChild(h('div', { class: 'subhead' }, 'People'));
    body.appendChild(h('p', { class: 'hint' }, 'Shown as chips, lit when they are home.'));
    const people = hc.people || (hc.people = []);
    people.forEach((p, i) => body.appendChild(h('div', { class: 'chanrow' },
      h('span', { class: 'cur mono', style: 'flex:1;min-width:0' }, p),
      h('button', { class: 'btn tiny danger', onclick: () => { Store.mutate(() => { people.splice(i, 1); }, 'person'); redraw(); } }, '✕'))));
    body.appendChild(h('button', {
      class: 'btn tiny',
      onclick: () => Panels.pickEntity({ domains: ['person', 'device_tracker'] },
        (id) => { Store.mutate(() => { people.push(id); }, 'person'); redraw(); }),
    }, '+ person'));

    body.appendChild(h('div', { class: 'subhead' }, 'Counts'));
    body.appendChild(h('p', { class: 'hint' },
      'How many of a class are on. Name marker TYPES and it follows the plan for ever; name a DOMAIN and it follows Home Assistant; name entities and it follows nothing.'));
    const counts = hc.counts || (hc.counts = []);
    counts.forEach((c, i) => {
      body.appendChild(h('div', { class: 'chanrow' },
        iconPick(c),
        h('input', {
          type: 'text', value: c.label || '', placeholder: 'label', style: 'max-width:90px',
          onchange: (e) => Store.mutate(() => { c.label = e.target.value || null; }, 'count label'),
        }),
        h('input', {
          type: 'text', value: (c.types || []).join(', '), placeholder: 'types', style: 'flex:1;min-width:0',
          onchange: (e) => Store.mutate(() => {
            const v = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
            if (v.length) c.types = v; else delete c.types;
          }, 'count types'),
        }),
        h('input', {
          type: 'text', value: c.domain || '', placeholder: 'domain', style: 'max-width:88px',
          onchange: (e) => Store.mutate(() => { c.domain = e.target.value.trim() || null; }, 'count domain'),
        }),
        h('span', { class: 'hint', style: 'margin:0' }, `${(c.entities || []).length || ''}`),
        h('button', { class: 'btn tiny', onclick: () => { Panels.closeModal(); chipOptionsDialog(c, 'count'); } }, 'Options…'),
        h('button', { class: 'btn tiny danger', onclick: () => { Store.mutate(() => { counts.splice(i, 1); }, 'count'); redraw(); } }, '✕')));
    });
    body.appendChild(h('button', {
      class: 'btn tiny',
      onclick: () => { Store.mutate(() => { counts.push({ icon: 'dot', label: 'new', domain: 'light' }); }, 'count'); redraw(); },
    }, '+ count'));

    body.appendChild(h('div', { class: 'subhead' }, 'Stats'));
    body.appendChild(h('p', { class: 'hint' }, 'One live number each. Power reads in kW past a thousand; signed ones show a + when they are positive.'));
    const stats = hc.stats || (hc.stats = []);
    stats.forEach((s, i) => {
      body.appendChild(h('div', { class: 'chanrow' },
        iconPick(s),
        h('input', {
          type: 'text', value: s.label || '', placeholder: 'label', style: 'max-width:84px',
          onchange: (e) => Store.mutate(() => { s.label = e.target.value || null; }, 'stat label'),
        }),
        h('button', {
          class: 'btn tiny mono', style: 'flex:1;min-width:0',
          onclick: () => Panels.pickEntity({ domains: ['sensor', 'input_number', 'number'] },
            (id) => { Store.mutate(() => { s.entity = id; }, 'stat entity'); redraw(); }),
        }, s.entity || 'pick…'),
        h('select', {
          onchange: (e) => Store.mutate(() => { s.format = e.target.value; }, 'stat format'),
        }, ...['raw', 'power', 'energy', 'temperature', 'percent', 'duration'].map((f) => h('option', { value: f, selected: (s.format || 'raw') === f }, f))),
        h('label', { class: 'inline', title: 'show a + when positive' }, h('input', {
          type: 'checkbox', checked: !!s.signed,
          onchange: (e) => Store.mutate(() => { s.signed = e.target.checked; }, 'stat signed'),
        }), ' ±'),
        h('button', { class: 'btn tiny', onclick: () => { Panels.closeModal(); chipOptionsDialog(s, 'stat'); } }, 'Options…'),
        h('button', { class: 'btn tiny danger', onclick: () => { Store.mutate(() => { stats.splice(i, 1); }, 'stat'); redraw(); } }, '✕')));
    });
    body.appendChild(h('button', {
      class: 'btn tiny',
      onclick: () => { Store.mutate(() => { stats.push({ icon: 'energy', format: 'power' }); }, 'stat'); redraw(); },
    }, '+ stat'));

    body.appendChild(h('div', { class: 'subhead' }, ' '));
    body.appendChild(h('button', { class: 'btn', onclick: () => { Panels.closeModal(); dashboardDialog(); } }, '← back'));
    Panels.modal('House card', body);
  }

  /* The common row stays compact; the less common behaviour lives here rather
   * than being available only to somebody hand-editing JSON. Both count and
   * stat chips use the same condition grammar the card runtime consumes. */
  function chipOptionsDialog(spec, kind) {
    const stat = kind === 'stat';
    const body = h('div', {});
    const redraw = () => { Panels.closeModal(); chipOptionsDialog(spec, kind); };
    const check = (label, checked, key, valueWhenChecked, hint) => {
      body.appendChild(h('label', { class: 'inline', style: 'display:flex' }, h('input', {
        type: 'checkbox', checked,
        onchange: (e) => Store.mutate(() => {
          spec[key] = valueWhenChecked === undefined ? e.target.checked : (e.target.checked ? valueWhenChecked : !valueWhenChecked);
        }, `${kind} ${key}`),
      }), ' ', label));
      if (hint) body.appendChild(h('p', { class: 'hint' }, hint));
    };

    body.appendChild(h('p', { class: 'hint' }, stat
      ? 'Choose what this chip displays, what it opens, and when it is visible.'
      : 'Choose how the population is counted and when the aggregate is visible.'));

    if (stat) {
      body.appendChild(h('div', { class: 'subhead' }, 'Value'));
      body.appendChild(PanelsExtra.entityRow('Displayed value entity (optional)', spec.valueEntity, ['sensor', 'input_number', 'number'],
        (id) => { Store.mutate(() => { if (id) spec.valueEntity = id; else delete spec.valueEntity; }, 'stat value entity'); redraw(); }));
      body.appendChild(h('p', { class: 'hint' },
        'Blank displays the chip entity. Set this when a chip should open one entity but read another, such as a washer and its remaining-time sensor.'));
      body.appendChild(field('Tooltip name', h('input', {
        type: 'text', value: spec.name || '', placeholder: spec.entity || 'Stat',
        onchange: (e) => Store.mutate(() => { spec.name = e.target.value.trim() || null; }, 'stat name'),
      })));
      body.appendChild(h('div', { class: 'field row' },
        field('Prefix', h('input', {
          type: 'text', value: spec.prefix || '', placeholder: 'Washing ·',
          onchange: (e) => Store.mutate(() => { spec.prefix = e.target.value || null; }, 'stat prefix'),
        })),
        field('Suffix', h('input', {
          type: 'text', value: spec.suffix || '', placeholder: 'left',
          onchange: (e) => Store.mutate(() => { spec.suffix = e.target.value || null; }, 'stat suffix'),
        }))));
      check('Hide if the value entity does not exist', spec.hideWhenMissing !== false, 'hideWhenMissing');
      check('Hide when the value is unknown or unavailable', !!spec.hideWhenUnavailable, 'hideWhenUnavailable', undefined,
        'Left off, an unknown or unavailable value remains visible as — and can still be opened for diagnosis.');
    } else {
      body.appendChild(h('div', { class: 'subhead' }, 'Counting'));
      const mode = h('select', {
        onchange: (e) => Store.mutate(() => {
          if (e.target.value) spec.mode = e.target.value; else delete spec.mode;
        }, 'count mode'),
      }, ...[
        ['', 'Use the entity domain'], ['on', 'State is exactly on'],
        ['notOff', 'Anything except off/unknown'], ['numeric', 'Any numeric value'], ['never', 'Never active'],
      ].map(([value, label]) => h('option', { value, selected: (spec.mode || '') === value }, label)));
      body.appendChild(field('What counts as active', mode));
      check('Skip Home Assistant groups', !!spec.skipGroups, 'skipGroups', undefined,
        'Prevents a group and its members being counted twice. Applies to domain-based counts.');
      check('Exclude unknown and unavailable entities from the total', !!spec.excludeUnavailable, 'excludeUnavailable');
      check('Hide this chip when zero are active', !!spec.hideWhenZero, 'hideWhenZero');
      check('Show the total as on/total', spec.total !== false, 'total');

      body.appendChild(h('div', { class: 'subhead' }, `Explicit entities (${(spec.entities || []).length})`));
      for (const [i, entity] of (spec.entities || []).entries()) {
        body.appendChild(h('div', { class: 'chanrow' },
          h('span', { class: 'cur mono', style: 'flex:1;min-width:0' }, entity),
          h('button', { class: 'btn tiny danger', onclick: () => {
            Store.mutate(() => { spec.entities.splice(i, 1); if (!spec.entities.length) delete spec.entities; }, 'count entity'); redraw();
          } }, '✕')));
      }
      body.appendChild(h('button', {
        class: 'btn tiny', onclick: () => Panels.pickEntity(null, (id) => {
          Store.mutate(() => { spec.entities = [...new Set([...(spec.entities || []), id])]; }, 'count entity'); redraw();
        }),
      }, '+ entity'));
    }

    body.appendChild(h('div', { class: 'subhead' }, 'Visibility condition'));
    const when = spec.showWhen || null;
    const conditionMode = !when ? 'always' : (when.is ? 'only' : 'hide');
    body.appendChild(field('Show this chip', h('select', {
      onchange: (e) => {
        Store.mutate(() => {
          const mode = e.target.value;
          if (mode === 'always') { delete spec.showWhen; return; }
          const old = spec.showWhen || {};
          const values = old.is || old.not || (mode === 'only' ? ['on'] : ['off', 'idle', 'unknown', 'unavailable']);
          spec.showWhen = { entity: old.entity || spec.entity || null };
          spec.showWhen[mode === 'only' ? 'is' : 'not'] = values;
        }, `${kind} condition`);
        redraw();
      },
    }, h('option', { value: 'always', selected: conditionMode === 'always' }, 'Always'),
       h('option', { value: 'hide', selected: conditionMode === 'hide' }, 'Except when states match'),
       h('option', { value: 'only', selected: conditionMode === 'only' }, 'Only when states match'))));

    if (when) {
      body.appendChild(PanelsExtra.entityRow('Condition entity (blank uses chip entity)', when.entity, null,
        (id) => { Store.mutate(() => { when.entity = id || null; }, `${kind} condition entity`); redraw(); }));
      const key = when.is ? 'is' : 'not';
      body.appendChild(field(key === 'is' ? 'States that show it' : 'States that hide it', h('input', {
        type: 'text', value: (when[key] || []).join(', '), placeholder: key === 'is' ? 'running' : 'off, idle, unknown, unavailable',
        onchange: (e) => Store.mutate(() => {
          when[key] = e.target.value.split(',').map((v) => v.trim()).filter(Boolean);
        }, `${kind} condition states`),
      }), 'Comma-separated Home Assistant state values.'));
    }

    body.appendChild(h('div', { class: 'subhead' }, ' '));
    body.appendChild(h('button', { class: 'btn', onclick: () => { Panels.closeModal(); houseCardDialog(); } }, '← back to house card'));
    Panels.modal(stat ? 'Stat chip options' : 'Count chip options', body);
  }

  /* The icon set is the plan's own drawn paths, never Unicode: a glyph like ⏻
   * renders as a tofu box inside an SVG on Windows and Android. */
  function iconPick(o) {
    const names = (window.Shapes && Object.keys(Shapes.ICONS)) || ['dot'];
    return h('select', {
      style: 'max-width:110px',
      onchange: (e) => Store.mutate(() => { o.icon = e.target.value; }, 'icon'),
    }, ...names.map((n) => h('option', { value: n, selected: (o.icon || 'dot') === n }, n)));
  }

  /* ------------------------------------------------------- appearance --- */

  /* The two behaviours worth a switch, and a stylesheet of your own.
   *
   * The CSS lands inside each card's shadow root, so it styles these cards and
   * cannot reach anything else on the dashboard — which is why it is safe to
   * offer at all, and why it is CSS rather than the `card_mod` approach of
   * reaching into other people's elements. */
  const GLASS_PRESET = `/* Frosted glass, in the style of the old dashboard */
.fps-card {
  background: linear-gradient(135deg, rgba(255,255,255,.62), rgba(254,244,242,.44));
  -webkit-backdrop-filter: blur(22px) saturate(140%);
  backdrop-filter: blur(22px) saturate(140%);
  border: .5px solid rgba(255,255,255,.68);
  border-radius: 22px;
  box-shadow: 0 10px 30px rgba(48,58,92,.12), inset 0 1px 0 rgba(255,255,255,.66);
  transition: box-shadow 220ms ease, border-color 220ms ease;
}
.fps-card:hover {
  border-color: rgba(255,255,255,.86);
  box-shadow: 0 13px 34px rgba(48,58,92,.15), inset 0 1px 0 rgba(255,255,255,.78);
}
.fps-chip, .fps-btn, .fps-tile {
  backdrop-filter: blur(8px);
  transition: transform 160ms ease, box-shadow 160ms ease;
}
.fps-chip:hover, .fps-btn:hover, .fps-tile:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(48,58,92,.14);
}
@media (prefers-reduced-motion: reduce) {
  .fps-card, .fps-chip, .fps-btn, .fps-tile { transition: none; }
  .fps-chip:hover, .fps-btn:hover, .fps-tile:hover { transform: none; }
}`;

  function appearanceDialog() {
    const proj = S.project;
    proj.dashboard = proj.dashboard || {};
    const d = proj.dashboard;
    const body = h('div', {});

    body.appendChild(h('div', { class: 'subhead' }, 'Behaviour'));
    body.appendChild(h('label', { class: 'inline', style: 'display:flex' }, h('input', {
      type: 'checkbox', checked: d.optimistic !== false,
      onchange: (e) => Store.mutate(() => { d.optimistic = e.target.checked; }, 'optimistic'),
    }), ' Paint a tap immediately, before Home Assistant confirms it'));
    body.appendChild(h('p', { class: 'hint' },
      'A tap shows the state it asked for straight away and holds it for the confirmation window below. '
      + 'The guess is dropped the moment the entity reports anything different, and it expires on its own — '
      + 'so a service that fails leaves the plan telling the truth rather than a lie that sticks.'));

    const num = (key, dflt, min, max, label, hint) => {
      body.appendChild(h('label', { class: 'inline', style: 'display:flex;gap:8px;align-items:center' },
        h('span', { style: 'min-width:190px' }, label),
        h('input', {
          type: 'number', min: String(min), max: String(max),
          value: String(d[key] === undefined ? dflt : d[key]),
          style: 'width:96px',
          onchange: (e) => Store.mutate(() => {
            const v = Number(e.target.value);
            if (!isFinite(v)) return;
            d[key] = Math.max(min, Math.min(max, v));
            e.target.value = String(d[key]);
          }, key),
        })));
      if (hint) body.appendChild(h('p', { class: 'hint' }, hint));
    };

    num('optimisticMs', 1600, 0, 10000, 'Confirmation window (ms)',
      'How long the plan holds the guess before it decides the command has not landed.');

    num('retries', 0, 0, 10, 'Re-send if unconfirmed',
      'Zero means never. A device that has drifted off a Zigbee or Z-Wave mesh can swallow a command '
      + 'outright while still reporting as online — the call succeeds, nothing happens, and nothing says so. '
      + 'Set this above zero and the plan re-sends that many times before giving up and showing the real state. '
      + 'An unavailable entity is never retried: it is known to be gone.');

    num('retryMs', 1000, 200, 10000, 'Gap between re-sends (ms)', null);

    body.appendChild(h('label', { class: 'inline', style: 'display:flex' }, h('input', {
      type: 'checkbox', checked: d.pendingStyle !== false,
      onchange: (e) => Store.mutate(() => { d.pendingStyle = e.target.checked; }, 'pendingStyle'),
    }), ' Show markers as in-flight while a command is unconfirmed'));
    body.appendChild(h('p', { class: 'hint' },
      'A marker with a command in flight pulses instead of sitting still, so a guess does not look like a '
      + 'settled state. Turn this off to have a guess paint exactly like confirmed state.'));

    body.appendChild(h('label', { class: 'inline', style: 'display:flex' }, h('input', {
      type: 'checkbox', checked: d.tooltips !== false,
      onchange: (e) => Store.mutate(() => { d.tooltips = e.target.checked; }, 'tooltips'),
    }), ' Show what a marker is on hover'));
    body.appendChild(h('p', { class: 'hint' },
      'Name, state, brightness or speed. Never shown on a touch screen, where there is no hover and the tip would sit under your thumb.'));

    body.appendChild(h('div', { class: 'subhead' }, 'Your own CSS'));
    body.appendChild(h('p', { class: 'hint' },
      'Appended to the cards’ own stylesheet, inside their shadow root — it styles these cards and can reach nothing else on the dashboard. '
      + 'Useful class names: .fps-card, .fps-house, .fps-floorcard, .fps-chip, .fps-btn, .fps-tile, .fps-panel, .fps-svg, .fps-tip.'));
    const ta = h('textarea', {
      rows: 14, spellcheck: 'false', class: 'mono',
      style: 'width:100%;font-size:12px;line-height:1.45',
      onchange: (e) => Store.mutate(() => { d.css = e.target.value.trim() || null; }, 'card css'),
    });
    ta.value = d.css || '';
    body.appendChild(ta);
    body.appendChild(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' },
      h('button', {
        class: 'btn tiny',
        onclick: () => { ta.value = GLASS_PRESET; Store.mutate(() => { d.css = GLASS_PRESET; }, 'card css'); },
      }, 'Insert the frosted-glass preset'),
      h('button', {
        class: 'btn tiny danger',
        onclick: () => { ta.value = ''; Store.mutate(() => { d.css = null; }, 'card css'); },
      }, 'Clear')));
    body.appendChild(h('p', { class: 'hint' },
      'It is applied when you next generate the dashboard. Check it first in the card preview.'));

    body.appendChild(h('div', { class: 'subhead' }, ' '));
    body.appendChild(h('button', { class: 'btn', onclick: () => { Panels.closeModal(); dashboardDialog(); } }, '← back'));
    Panels.modal('Appearance & behaviour', body);
  }

  /* ------------------------------------------------------- floor cards --- */

  /* One breakdown shape for the whole house, or one per floor. Left alone it is
   * derived from what each floor actually has, by library category — which is
   * the answer that never needs maintaining. */
  function floorCardDialog() {
    const proj = S.project;
    proj.dashboard = proj.dashboard || {};
    const body = h('div', {});
    body.appendChild(h('p', { class: 'hint' },
      'Under the plan on each tab: how many of that floor’s devices are active, out of how many, with a row per class. '
      + 'Left alone, the classes are whatever the floor actually has — adding a heater to the plan adds a heater row, and there is no list to maintain.'));

    const cats = (S.library.categories || []).map((c) => c.id);
    const current = ((proj.dashboard.floor || {}).breakdown || []).map((b) => b.category).filter(Boolean);
    body.appendChild(h('div', { class: 'subhead' }, 'Classes to show'));
    body.appendChild(h('p', { class: 'hint' }, 'Tick none to let each floor derive its own.'));
    for (const c of cats) {
      const label = (S.library.categories.find((x) => x.id === c) || {}).label || c;
      body.appendChild(h('label', { class: 'inline', style: 'display:flex' }, h('input', {
        type: 'checkbox', checked: current.includes(c),
        onchange: (e) => Store.mutate(() => {
          const d = proj.dashboard.floor || (proj.dashboard.floor = {});
          const list = d.breakdown || (d.breakdown = []);
          const i = list.findIndex((x) => x.category === c);
          if (e.target.checked && i < 0) list.push({ category: c, label });
          if (!e.target.checked && i >= 0) list.splice(i, 1);
          if (!list.length) delete proj.dashboard.floor;
        }, 'floor breakdown'),
      }), ' ', label));
    }

    body.appendChild(h('div', { class: 'subhead' }, 'Per floor'));
    body.appendChild(h('p', { class: 'hint' }, 'A floor with its own breakdown ignores the house setting above. Set one from that floor’s panel.'));
    for (const f of proj.floors || []) {
      const own = (f.dashboard || {}).breakdown;
      body.appendChild(h('div', { class: 'chanrow' },
        h('span', { style: 'flex:1' }, f.name || f.id),
        h('span', { class: 'hint', style: 'margin:0' }, own ? `${own.length} classes of its own` : 'derived from the plan'),
        own ? h('button', { class: 'btn tiny', onclick: () => { Store.mutate(() => { delete f.dashboard; }, 'floor breakdown'); Panels.closeModal(); floorCardDialog(); } }, 'reset') : ''));
    }

    body.appendChild(h('div', { class: 'subhead' }, ' '));
    body.appendChild(h('button', { class: 'btn', onclick: () => { Panels.closeModal(); dashboardDialog(); } }, '← back'));
    Panels.modal('Floor cards', body);
  }

  function lightingDialog() {
    const proj = S.project;
    proj.lighting = proj.lighting || {};
    const cfg = Lighting.mergeConfig(proj.lighting);
    const body = h('div', {});
    const preview = h('p', { class: 'hint' }, '');

    const set = (key, value) => Store.mutate(() => {
      S.project.lighting = S.project.lighting || {};
      S.project.lighting[key] = value;
    }, 'lighting');

    const slider = (key, label, min, max, step, fmt) => {
      const val = h('span', { class: 'mono' }, fmt(cfg[key]));
      const input = h('input', {
        type: 'range', min, max, step, value: cfg[key],
        oninput: (e) => { cfg[key] = Number(e.target.value); val.textContent = fmt(cfg[key]); set(key, cfg[key]); describe(); },
      });
      return h('div', { class: 'field' }, h('label', {}, label, ' — ', val), input);
    };

    function describe() {
      preview.textContent =
        `A room reads fully lit at ${cfg.targetFc} foot-candles — about `
        + `${Math.round(cfg.targetFc * 100 / (cfg.utilisation * 90))} watts of LED per 100 sq ft. `
        + `At night the plan dims to ${Math.round(cfg.scrim * 100)}%, and a lit room lifts back by up to `
        + `${Math.round(cfg.maxWash * 100)}%.`;
    }

    body.append(
      h('p', { class: 'hint' },
        'Lamps light rooms the same way the sun does: watts × lamp count × efficacy gives lumens, '
        + 'lumens over the room’s floor area gives foot-candles, and that becomes the wash you see. '
        + 'Set each fitting’s own watts on its marker; these are the constants that turn them into light.'),
      h('label', { class: 'inline' },
        h('input', {
          type: 'checkbox', checked: cfg.enabled !== false,
          onchange: (e) => { cfg.enabled = e.target.checked; set('enabled', cfg.enabled); },
        }), ' Model artificial light'),
      h('div', { class: 'subhead' }, 'Night'),
      slider('scrim', 'Darkness with no daylight', 0, 0.8, 0.02, (v) => `${Math.round(v * 100)}%`),
      slider('maxWash', 'Most a lit room can lift', 0.1, 1, 0.02, (v) => `${Math.round(v * 100)}%`),
      h('div', { class: 'subhead' }, 'Brightness'),
      slider('targetFc', 'Fully lit at', 4, 60, 1, (v) => `${v} fc`),
      slider('gamma', 'Response curve', 0.3, 1.5, 0.05, (v) => v.toFixed(2)),
      slider('utilisation', 'Light reaching the floor', 0.2, 1, 0.05, (v) => `${Math.round(v * 100)}%`),
      h('div', { class: 'subhead' }, 'Coverage'),
      h('label', { class: 'inline' },
        h('input', {
          type: 'checkbox', checked: (S.project.coverage || {}).enabled !== false,
          onchange: (e) => Store.mutate(() => {
            S.project.coverage = Object.assign({}, S.project.coverage, { enabled: e.target.checked });
          }, 'coverage'),
        }), ' Draw what devices reach'),
      h('p', { class: 'hint' },
        'The wedge a camera sees, a motion sensor covers, an AC blows across or a speaker throws — '
        + 'drawn from each marker’s own field of view, range and facing. Turn it off and the markers '
        + 'stay exactly where they are; only the wedges go, and their numbers are kept. '
        + 'Worth turning off in a house whose sensors sit close together, where the coverage can end '
        + 'up hiding the plan it is drawn on.'),
      h('div', { class: 'subhead' }, 'Doors'),
      h('label', { class: 'inline' },
        h('input', {
          type: 'checkbox', checked: (S.project.doors || {}).swingArc !== false,
          onchange: (e) => Store.mutate(() => {
            S.project.doors = Object.assign({}, S.project.doors, { swingArc: e.target.checked });
          }, 'swing arcs'),
        }), ' Draw the arc a door swings through'),
      h('p', { class: 'hint' },
        'The dashed quarter-circle on an open door. It is drawing convention rather than '
        + 'information — the leaf already shows which way the door opens — so a plan with many '
        + 'doors close together often reads better without it. Any single door can override this '
        + 'in its own panel, and turning it off changes nothing about how doors behave.'),
      h('div', { class: 'subhead' }, 'Motion'),
      h('label', { class: 'inline' },
        h('input', {
          type: 'checkbox', checked: cfg.motion !== false,
          onchange: (e) => { cfg.motion = e.target.checked; set('motion', cfg.motion); },
        }), ' Animate fans, sirens, airflow and coverage'),
      h('p', { class: 'hint' },
        'Everything animated is state-driven and stops when the state does. '
        + 'A viewer whose system asks for reduced motion gets none of it either way.'),
      h('div', { class: 'subhead' }, ' '),
      preview,
    );
    describe();
    Panels.modal('Lighting', body);
  }

  return { dashboardDialog, lightingDialog, houseCardDialog, floorCardDialog, appearanceDialog };
}());
