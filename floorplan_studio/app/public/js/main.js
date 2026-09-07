/* Bootstrap and wiring. */
(function () {
  'use strict';

  UINavigation.bind(document);
  const S = Store.S;
  const $ = (id) => document.getElementById(id);
  let saveTimer = null;

  function markSaved(saved) {
    S.dirty = !saved;
    const el = $('saveState');
    el.textContent = saved ? 'saved' : 'unsaved changes';
    el.classList.toggle('dirty', !saved);
  }

  /* Autosave, debounced. The explicit Save button exists anyway: an autosave
   * that is the ONLY way to persist leaves you guessing whether your last edit
   * made it, which is exactly the anxiety this tool is supposed to remove. */
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1500);
  }

  async function save() {
    clearTimeout(saveTimer);
    try {
      await API.saveProject(S.project);
      markSaved(true);
    } catch (e) {
      Panels.toast('Could not save: ' + e.message, true);
    }
  }

  async function loadStates() {
    try {
      const res = await API.states();
      S.states = res.states || {};
      if (S.view.live) Canvas.paint();
    } catch { /* offline is fine — markers just draw in their unavailable style */ }
  }

  /* ---------- what every command actually does ----------
   *
   * `input-actions.js` says what the commands ARE, what they are called and
   * which keys ask for them; this says what they do. Keys, the shortcut bar
   * and the shortcuts dialog all arrive here, so a command cannot be bound to
   * a key and missing from the buttons, or listed in the dialog and wired to
   * nothing. The suite checks the two halves line up. */
  const RUN = {
    'tool-select': () => Store.setTool('select'),
    'tool-rect': () => Store.setTool('rect'),
    'tool-poly': () => Store.setTool('poly'),
    'tool-aperture': () => Store.setTool('aperture'),
    'tool-pan': () => Store.setTool('pan'),

    escape: () => {
      if (!$('modal').hidden) { Panels.closeModal(); return; }
      if (closeOverlays()) return;
      Canvas.cancelPoly();
      if (S.armed) Store.arm(null);
      else Store.select(null);
    },
    multi: () => Store.setMultiSelect(!S.view.multiSelect),

    'nudge-left': (ev) => Canvas.nudgePosition(-step(ev), 0),
    'nudge-right': (ev) => Canvas.nudgePosition(step(ev), 0),
    'nudge-up': (ev) => Canvas.nudgePosition(0, -step(ev)),
    'nudge-down': (ev) => Canvas.nudgePosition(0, step(ev)),
    'rotate-left': (ev) => Canvas.nudgeRotation(ev && ev.shiftKey ? -45 : -15),
    'rotate-right': (ev) => Canvas.nudgeRotation(ev && ev.shiftKey ? 45 : 15),
    smaller: () => Canvas.nudgeSize(1 / 1.15),
    bigger: () => Canvas.nudgeSize(1.15),
    duplicate: () => Canvas.duplicateSelected(),
    delete: () => Canvas.deleteSelected(),

    undo: () => { Store.undo() || Panels.toast('Nothing to undo'); },
    redo: () => { Store.redo() || Panels.toast('Nothing to redo'); },
    save,
    'finish-poly': () => Canvas.finishPoly(),

    'zoom-fit': () => Canvas.fit(),
    'zoom-out': () => Canvas.zoomStep(1 / 1.2),
    'zoom-in': () => Canvas.zoomStep(1.2),
    'shortcut-bar': () => showQuickBar(!quickBarOn),
    shortcuts: () => Panels.shortcutsDialog(),
  };

  /* Arrows move a few inches, Shift a whole foot — the same 4x-ish ratio the
   * rotate and resize nudges use. A button has no Shift, so it gets the small
   * step, which is the one you want when you are tapping repeatedly. */
  const step = (ev) => (ev && ev.shiftKey ? 1 : 0.25);

  /* Whether a BUTTON for this command should be live. A key press never asks:
   * pressing Delete with nothing selected has always been a no-op. A button
   * that looks pressable and does nothing is a different thing entirely. */
  const ENABLED = {
    undo: () => Store.canUndo(),
    redo: () => Store.canRedo(),
    selection: () => !!(S.selection || S.multi.length),
    poly: () => S.tool === 'poly',
  };
  const actionEnabled = (a) => (a.needs ? ENABLED[a.needs]() : true);

  function runAction(id, ev) {
    const fn = RUN[id];
    if (fn) fn(ev);
  }

  /* ---------- the shortcut bar ----------
   *
   * A tablet has no keyboard, so every key this editor answers to is a key
   * somebody cannot press: no Ctrl+Z to take back the room they just dragged,
   * no `[` to turn a camera, no arrows to move a marker three inches. The bar
   * is those commands as buttons, off by default on a machine with a keyboard
   * and on by default where the pointer is coarse — and remembered either way,
   * because it is a fact about how somebody works, not about their house. */
  let quickBarOn = false;
  const QUICK_KEY = 'fps.quickbar';
  try {
    const saved = window.localStorage.getItem(QUICK_KEY);
    quickBarOn = saved === null
      ? !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      : saved === '1';
  } catch (e) { /* an iframe with site data blocked; the button still works */ }

  function showQuickBar(on) {
    quickBarOn = !!on;
    $('quickBar').hidden = !quickBarOn;
    $('btnQuickBar').setAttribute('aria-expanded', String(quickBarOn));
    $('btnQuickBar').setAttribute('aria-pressed', String(quickBarOn));
    try { window.localStorage.setItem(QUICK_KEY, quickBarOn ? '1' : '0'); } catch (e) { /* this session only */ }
  }

  function buildQuickBar() {
    const bar = $('quickBar');
    const h = Panels.h;
    const parts = [];
    for (const [, list] of InputActions.groups(InputActions.quick())) {
      const group = h('div', { class: 'quick-group' });
      for (const a of list) {
        const keys = (a.keys || []).join(' or ');
        const btn = h('button', {
          class: 'quick-btn', type: 'button', 'data-action': a.id,
          title: a.label + (keys ? '  (' + keys + ')' : ''), 'aria-label': a.label,
        });
        /* A tool's icon is CLONED from the rail rather than drawn again here.
         * Two drawings of the Select arrow is one drawing that goes stale. */
        const icon = a.tool ? document.querySelector('.tool[data-tool="' + a.tool + '"] svg') : null;
        const glyph = a.glyph || a.label;
        if (icon) btn.appendChild(icon.cloneNode(true));
        else btn.appendChild(h('span', { class: 'quick-glyph' + (glyph.length > 1 ? ' word' : '') }, glyph));
        btn.addEventListener('click', () => runAction(a.id));
        group.appendChild(btn);
      }
      parts.push(group);
    }
    bar.replaceChildren(...parts);
    syncQuickBar();
  }

  function syncQuickBar() {
    for (const btn of $('quickBar').querySelectorAll('.quick-btn')) {
      const a = InputActions.byId(btn.dataset.action);
      if (!a) continue;
      btn.disabled = !actionEnabled(a);
      const pressed = a.tool ? (S.tool === a.tool && !S.armed)
        : a.id === 'multi' ? S.view.multiSelect : null;
      if (pressed === null) btn.removeAttribute('aria-pressed');
      else btn.setAttribute('aria-pressed', String(pressed));
    }
  }

  /* ---------- drawers ----------
   *
   * Below `--narrow` the rail and the inspector stop being columns and become
   * overlays; above it these classes mean nothing and the CSS ignores them.
   * One at a time, because two open at once on a 768 px screen is no plan at
   * all. */
  const OVERLAYS = [['rail-open', 'btnRail'], ['insp-open', 'btnInspector'], ['more-open', 'btnMore']];

  function setOverlay(which) {
    for (const [cls, btn] of OVERLAYS) {
      const on = cls === which;
      document.body.classList.toggle(cls, on);
      $(btn).setAttribute('aria-expanded', String(on));
    }
    $('scrim').hidden = !which;
  }

  function toggleOverlay(which) {
    setOverlay(document.body.classList.contains(which) ? null : which);
  }

  /* Returns whether it had anything to close, so Esc can fall through to
   * deselecting when it did not. */
  function closeOverlays() {
    const open = OVERLAYS.some(([cls]) => document.body.classList.contains(cls));
    if (open) setOverlay(null);
    return open;
  }

  function bindChrome() {
    $('projectName').addEventListener('change', (e) => {
      Store.mutate(() => { S.project.name = e.target.value; }, 'rename project');
    });

    document.querySelectorAll('.tool').forEach((btn) => {
      btn.addEventListener('click', () => Store.setTool(btn.dataset.tool));
    });

    $('floorSelect').addEventListener('change', (e) => {
      S.activeFloorId = e.target.value;
      Store.select(null);
      Store.emit('floor');
    });
    $('btnAddFloor').addEventListener('click', () => Panels.addFloor());

    $('libSearch').addEventListener('input', () => Panels.renderLibrary());
    $('btnEditLibrary').addEventListener('click', () => Panels.editLibrary());
    $('btnSun').addEventListener('click', () => PanelsExtra.sunDialog());
    $('btnLighting').addEventListener('click', () => PanelsDashboard.lightingDialog());
    $('btnLogic').addEventListener('click', () => PanelsExtra.logicDialog());
    $('btnDashboard').addEventListener('click', () => PanelsDashboard.dashboardDialog());
    $('btnImport').addEventListener('click', () => Panels.importDialog());

    /* Time scrubber. Daylight is the one thing you cannot check by waiting,
     * so the plan can be driven to any hour of the current date. */
    const applyTime = (mins) => {
      const base = S.when ? new Date(S.when) : new Date();
      base.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
      S.when = base;
      $('timeLabel').textContent = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
      Canvas.paint();
      showSun();
    };
    $('timeSlider').addEventListener('input', (e) => applyTime(Number(e.target.value)));
    $('timeNow').addEventListener('click', () => {
      S.when = null;
      const now = new Date();
      $('timeSlider').value = now.getHours() * 60 + now.getMinutes();
      $('timeLabel').textContent = now.toTimeString().slice(0, 5);
      Canvas.paint(); showSun();
    });
    $('btnExport').addEventListener('click', () => Panels.exportDialog());
    $('btnHelp').addEventListener('click', () => Panels.helpDialog());
    $('btnShortcuts').addEventListener('click', () => Panels.shortcutsDialog());
    $('btnSave').addEventListener('click', save);
    $('modalClose').addEventListener('click', () => Panels.closeModal());
    $('modal').addEventListener('cancel', (ev) => { ev.preventDefault(); Panels.closeModal(); });
    $('modal').addEventListener('click', (ev) => { if (ev.target.id === 'modal') Panels.closeModal(); });

    $('themePick').addEventListener('change', (e) => {
      if (e.target.value === '__edit') { Panels.renderThemePicker(); Panels.editTheme(); return; }
      Store.mutate(() => { S.project.activeTheme = e.target.value; }, 'theme');
      Panels.applyUiTheme();
    });

    $('livePreview').addEventListener('change', (e) => {
      S.view.live = e.target.checked;
      if (S.view.live) loadStates();
      Canvas.paint();
    });

    /* Remembered in this browser, so it is set once rather than every session.
     * The change emits `selection`, which is what repaints the open panel — the
     * toggle has to act on what you are already looking at, not on the next
     * thing you click. */
    $('advancedMode').checked = S.advanced;
    $('advancedMode').addEventListener('change', (e) => Store.setAdvanced(e.target.checked));

    $('snapToggle').addEventListener('change', (e) => { S.view.snap = e.target.checked; });
    $('gridToggle').addEventListener('change', (e) => { S.view.showGrid = e.target.checked; Canvas.paint(); });
    $('gridSize').addEventListener('change', (e) => { S.view.gridSize = Number(e.target.value); Canvas.paint(); });

    /* Distance/dimension guides are a saved project setting (the "dashboard
     * level" the user asked for), not a per-tab view flag like the grid
     * above — so it goes through Store.mutate and travels with the project. */
    const setGuides = (patch) => Store.mutate(() => {
      S.project.guides = Object.assign({ enabled: true, units: 'ft' }, S.project.guides, patch);
    }, 'guides');
    $('guidesToggle').checked = (S.project.guides || {}).enabled !== false;
    $('guidesUnits').value = (S.project.guides || {}).units || 'ft';
    $('guidesToggle').addEventListener('change', (e) => setGuides({ enabled: e.target.checked }));
    $('guidesUnits').addEventListener('change', (e) => setGuides({ units: e.target.value }));

    /* Through the same commands the keys use, so the button and the key
     * cannot start meaning different things — and `zoomStep` keeps the middle
     * of the view still instead of walking away from what you were looking
     * at. */
    $('zoomIn').addEventListener('click', () => runAction('zoom-in'));
    $('zoomOut').addEventListener('click', () => runAction('zoom-out'));
    $('zoomFit').addEventListener('click', () => runAction('zoom-fit'));

    $('btnQuickBar').addEventListener('click', () => runAction('shortcut-bar'));
    $('btnRail').addEventListener('click', () => toggleOverlay('rail-open'));
    $('btnInspector').addEventListener('click', () => toggleOverlay('insp-open'));
    $('btnMore').addEventListener('click', () => toggleOverlay('more-open'));
    $('scrim').addEventListener('click', () => setOverlay(null));
    /* Picking a tool or a type is the end of what the rail was open for. */
    $('tools').addEventListener('click', () => setOverlay(null));
    $('libraryList').addEventListener('click', () => setOverlay(null));
    /* A dialog opened from the ⋯ menu must not open behind it. */
    $('topbarMore').addEventListener('click', (ev) => { if (ev.target.closest('.btn')) setOverlay(null); });

    /* The columns come back when there is room for them, and a drawer left
     * open would then be a panel floating over its own permanent copy. */
    try {
      const wide = window.matchMedia('(min-width: 901px)');
      const onWide = (e) => { if (e.matches) setOverlay(null); };
      if (wide.addEventListener) wide.addEventListener('change', onWide);
      else if (wide.addListener) wide.addListener(onWide);
    } catch (e) { /* no matchMedia: the drawers simply never appear */ }

    /* One lookup, one dispatch. Every key this editor answers to is declared
     * in `input-actions.js` with the command it asks for, so a key cannot be
     * bound here and missing from the shortcuts dialog, or promised by the
     * dialog and bound to nothing — which is exactly how "Space pans" came to
     * be printed on the Pan tool for a year with no code reading the space
     * bar. Shift is read by the handlers, not by the match: on a nudge or a
     * turn it makes the step bigger rather than asking for something else. */
    window.addEventListener('keydown', (ev) => {
      const action = InputActions.matchKey(ev);
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      /* Esc is the one key that works from inside a dialog and from inside a
       * text field: it is how you back out of both. */
      if (action && action.anywhere) { ev.preventDefault(); runAction(action.id, ev); return; }
      if (!$('modal').hidden || typing || !action) return;
      /* Ctrl/Cmd+D bookmarks the page, Ctrl+0 resets browser zoom, Delete goes
       * back a page on some setups: in an editor every one of those is the
       * wrong answer, so a matched action always wins the key. */
      ev.preventDefault();
      runAction(action.id, ev);
    });

    window.addEventListener('beforeunload', (ev) => {
      if (S.dirty) { ev.preventDefault(); ev.returnValue = ''; }
    });
  }

  /* Live readout beside the scrubber, so the numbers behind the picture are
   * always visible rather than hidden in a dialog. */
  function showSun() {
    const box = $('sunBox');
    const cfg = Store.sunConfig();
    box.hidden = !cfg.enabled;
    if (!cfg.enabled) return;
    const sc = SunModel.scene(cfg, S.states, S.when);
    $('sunReadout').textContent = sc
      ? `☀ ${sc.elevation.toFixed(0)}° az ${sc.azimuth.toFixed(0)}° · ${Math.round(sc.day * 100)}%`
      : 'no location set';
  }

  function syncTools() {
    document.querySelectorAll('.tool').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.tool === S.tool && !S.armed));
    });
    $('openingOpts').hidden = S.tool !== 'aperture';

    // SVGElement.className is a read-only SVGAnimatedString, not a string —
    // assigning to it throws. Attribute setter is the only way in.
    $('canvas').setAttribute('class', 'tool-' + S.tool);
    syncQuickBar();
  }

  async function boot() {
    let data;
    try {
      data = await API.bootstrap();
    } catch (e) {
      /* `e.message` can echo content the server read from disk (a corrupt
       * project.json's own parse-error text, which some JS engines quote a
       * snippet of the bad JSON into) — not attacker-controlled by a stranger,
       * but a user's own file could still carry `<` /`&` that innerHTML would
       * parse as markup instead of showing verbatim. textContent never does. */
      const p = document.createElement('p');
      p.style.cssText = 'padding:40px;font:15px system-ui';
      p.textContent = `Floorplan Studio could not reach its own backend: ${e.message}`;
      document.body.replaceChildren(p);
      return;
    }

    S.project = data.project;
    S.library = data.library;
    S.themes = data.themes;
    S.flooring = data.flooring;
    S.boundaries = data.boundaries;
    S.controls = data.controls;
    S.meta = { mode: data.mode, version: data.version, haConfigured: data.haConfigured };

    if (!S.project.floors || !S.project.floors.length) {
      S.project.floors = [{
        id: 'ground', name: 'Ground Floor', level_ft: 0, icon: 'mdi:floor-plan',
        extent: { w: 40, h: 40 }, grid: { size: 0.5, snap: true, reference: null },
        rooms: [], apertures: [], items: [],
      }];
    }
    S.activeFloorId = S.project.floors[0].id;
    S.project.activeTheme = S.project.activeTheme || S.themes.active || Object.keys(S.themes.themes)[0];
    $('projectName').value = S.project.name || 'My House';

    /* The Opening tool's type list. Doors first, because that is what people
     * come looking for — the previous version always placed a plain door and
     * left you to change it in the inspector afterwards, which meant nothing on
     * screen ever said the tool could place a window. */
    const opTypes = Object.entries((S.boundaries && S.boundaries.openingTypes) || {});
    const doorsFirst = opTypes.sort((a, b) => {
      /* A plain door outranks the rest of its own group so it lands as the
       * default: alphabetical within doors would open the tool on "Bi-fold". */
      const rank = (k) => (k === 'door' ? 0 : /^door/.test(k) ? 1 : /window|glaz|clerestory|skylight/.test(k) ? 2 : 3);
      return rank(a[0]) - rank(b[0]) || String(a[1].label).localeCompare(String(b[1].label));
    });
    $('openingType').replaceChildren(...doorsFirst.map(([k, t]) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = t.label || k;
      return o;
    }));
    S.openingType = doorsFirst.length ? doorsFirst[0][0] : 'door';
    $('openingType').value = S.openingType;
    $('openingType').addEventListener('change', (ev) => { S.openingType = ev.target.value; });

    Canvas.init({
      onStatus: ({ x, y, room }) => {
        $('coordReadout').textContent = `${x.toFixed(2)}, ${y.toFixed(2)} ft`;
        $('roomReadout').textContent = room || '';
      },
      /* Double-tapping something on a touch screen asks to see it. Where the
       * inspector is a permanent column there is nothing to do — it is already
       * showing what was tapped — so this only means anything in drawer mode,
       * and `setOverlay` is a no-op above the breakpoint by construction. */
      onInspect: () => { if (document.body.clientWidth <= 900) setOverlay('insp-open'); },
    });

    Store.on((reason) => {
      if (reason === 'project' || reason === 'remote') {
        $('guidesToggle').checked = (S.project.guides || {}).enabled !== false;
        $('guidesUnits').value = (S.project.guides || {}).units || 'ft';
      }
      if (reason === 'project' || reason === 'floor' || reason === 'remote') { Canvas.paint(); Panels.renderInspector(); }
      if (reason === 'floor' || reason === 'remote') Panels.renderFloors();
      if (reason === 'selection') { Canvas.drawSelection(); Panels.renderInspector(); }
      if (reason === 'tool') { syncTools(); Panels.renderLibrary(); }
      if (reason === 'view') $('zoomLabel').textContent = Math.round(S.view.zoom * 100) + '%';
      /* Undo, Delete and the nudges are only live when there is something to
       * undo or something selected, and every one of those changes with an
       * event above. A button that looks pressable and is not is worse than no
       * button at all — especially where it is the only way to reach the
       * command. */
      syncQuickBar();
      if (reason === 'project' || reason === 'floor' || reason === 'remote') showSun();
      if (reason === 'project') {
        markSaved(false); scheduleSave();
        // Keep the theme select a pure function of the project. Undo can change
        // the active theme too, and a dropdown showing the previous one is a lie.
        Panels.applyUiTheme(); Panels.renderThemePicker();
      }
      if (reason === 'remote') {
        // The project just arrived from elsewhere (an MCP tool call, most
        // likely) already saved — reflect it without re-triggering a save.
        $('projectName').value = S.project.name || 'My House';
        Panels.applyUiTheme(); Panels.renderThemePicker();
        markSaved(true);
      }
    });

    bindChrome();
    buildQuickBar();
    showQuickBar(quickBarOn);
    Panels.renderAll();
    syncTools();
    Canvas.paint();
    Canvas.fit();
    showSun();
    markSaved(true);

    /* Entity list is best-effort: with no HA credentials the picker still opens
     * and you can type an id by hand, which is what makes the editor usable
     * completely offline. */
    try {
      const res = await API.entities();
      S.entities = res.entities || [];
      if (res.error) Panels.toast(`Entity list unavailable (${res.error}) — you can still type entity ids.`, true);
    } catch { /* handled above */ }
    loadStates();
    setInterval(() => { if (S.view.live) loadStates(); }, 30000);
    watchRemoteChanges();
  }

  /* Live view of whatever else is editing this same project — an MCP tool
   * call is the point of this, but a second browser tab hits the same path.
   * One Server-Sent Events connection; the event carries only a timestamp,
   * so this fetches the project itself rather than trusting a pushed copy.
   * Several tool calls in quick succession collapse into one fetch. */
  function watchRemoteChanges() {
    let fetchTimer = null;
    let lastNudge = 0;
    const es = new EventSource('api/project/stream');
    es.addEventListener('registry', async () => {
      if (S.dirty || !$('modal').hidden) {
        Panels.toast('Shared settings changed elsewhere. Finish your edit, then reload to use them.', true);
        return;
      }
      try {
        const data = await API.bootstrap();
        if (S.dirty || !$('modal').hidden) return;
        for (const key of ['library','themes','flooring','boundaries','controls']) S[key] = data[key];
        Panels.applyUiTheme(); Panels.renderThemePicker(); Panels.renderLibrary(); Panels.renderInspector(); Canvas.paint();
      } catch { Panels.toast('Shared settings changed. Reload to use them.', true); }
    });
    es.addEventListener('project', (ev) => {
      /* Our OWN autosave reaches this stream like any other write, and the
       * server notifies before it answers the PUT — so this tab hears its own
       * save land while `S.dirty` is still true for the keystrokes made since,
       * and used to warn that the plan had changed elsewhere on every single
       * autosave. Drop the echo of our own write; react to everything else. */
      let data = {};
      try { data = JSON.parse(ev.data || '{}'); } catch (e) { /* treat as somebody else's */ }
      if (data.origin && data.origin === API.clientId()) return;

      if (S.dirty) {
        const now = Date.now();
        if (now - lastNudge > 5000) {
          lastNudge = now;
          Panels.toast('The plan changed elsewhere. Save or reload to see it — your local edits are kept either way.', true);
        }
        return;
      }
      clearTimeout(fetchTimer);
      fetchTimer = setTimeout(async () => {
        try {
          const project = await API.project();
          if (!S.dirty) Store.replaceProject(project);
        } catch (e) { /* the next event will try again */ }
      }, 300);
    });
    // EventSource reconnects on its own; nothing else to do on error.
  }

  boot();
}());
