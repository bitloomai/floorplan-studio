/* Bootstrap and wiring. */
(function () {
  'use strict';

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
    $('btnShortcuts').addEventListener('click', () => Panels.shortcutsDialog());
    $('btnSave').addEventListener('click', save);
    $('modalClose').addEventListener('click', () => Panels.closeModal());
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

    $('snapToggle').addEventListener('change', (e) => { S.view.snap = e.target.checked; });
    $('gridToggle').addEventListener('change', (e) => { S.view.showGrid = e.target.checked; Canvas.paint(); });
    $('gridSize').addEventListener('change', (e) => { S.view.gridSize = Number(e.target.value); Canvas.paint(); });

    $('zoomIn').addEventListener('click', () => Canvas.zoomTo(S.view.zoom * 1.2));
    $('zoomOut').addEventListener('click', () => Canvas.zoomTo(S.view.zoom / 1.2));
    $('zoomFit').addEventListener('click', () => Canvas.fit());

    window.addEventListener('keydown', (ev) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (ev.key === 'Escape') {
        if (!$('modal').hidden) return Panels.closeModal();
        Canvas.cancelPoly();
        if (S.armed) Store.arm(null);
        else Store.select(null);
        return;
      }
      if (typing) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        (ev.shiftKey ? Store.redo() : Store.undo()) || Panels.toast(ev.shiftKey ? 'Nothing to redo' : 'Nothing to undo');
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') { ev.preventDefault(); save(); return; }
      /* Cmd/Ctrl+D is "one more of this" everywhere else; the browser's own
       * bookmark-this-page meaning for it is the one thing worth overriding
       * unconditionally with preventDefault. */
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { ev.preventDefault(); Canvas.duplicateSelected(); return; }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); Canvas.deleteSelected(); return; }
      if (ev.key === 'Enter') { Canvas.finishPoly(); return; }
      /* [ and ] turn the selected item. Shift makes it 45 at a time, which is
       * what a camera on a corner or a bed against a wall actually wants. */
      if (ev.key === '[' || ev.key === ']') {
        ev.preventDefault();
        Canvas.nudgeRotation((ev.key === '[' ? -1 : 1) * (ev.shiftKey ? 45 : 15));
        return;
      }
      /* - and + resize it, for the same reason [ and ] turn it: the handle is
       * 7px and a touch screen has no hover to find it with. */
      if (ev.key === '-' || ev.key === '_' || ev.key === '+' || ev.key === '=') {
        ev.preventDefault();
        Canvas.nudgeSize(ev.key === '-' || ev.key === '_' ? 1 / 1.15 : 1.15);
        return;
      }
      /* Arrow keys move the selected item or room a few inches — the position
       * counterpart to [ ]/- + above, for the same "a 7px handle is hard to
       * grab exactly" reason. Shift jumps a whole foot, same 4x-ish ratio the
       * rotate/resize nudges use. Never mind Home/End/PageUp scrolling the
       * library list — this only fires with a selection, and typing already
       * bailed out above. */
      const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (ARROWS[ev.key]) {
        ev.preventDefault();
        const step = ev.shiftKey ? 1 : 0.25;
        const [dx, dy] = ARROWS[ev.key];
        Canvas.nudgePosition(dx * step, dy * step);
        return;
      }
      if (ev.key === '?') { Panels.shortcutsDialog(); return; }
      const map = { v: 'select', r: 'rect', p: 'poly', a: 'aperture', h: 'pan' };
      if (map[ev.key.toLowerCase()]) Store.setTool(map[ev.key.toLowerCase()]);
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
    });

    Store.on((reason) => {
      if (reason === 'project' || reason === 'floor' || reason === 'remote') { Canvas.paint(); Panels.renderInspector(); }
      if (reason === 'floor' || reason === 'remote') Panels.renderFloors();
      if (reason === 'selection') { Canvas.drawSelection(); Panels.renderInspector(); }
      if (reason === 'tool') { syncTools(); Panels.renderLibrary(); }
      if (reason === 'view') $('zoomLabel').textContent = Math.round(S.view.zoom * 100) + '%';
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
