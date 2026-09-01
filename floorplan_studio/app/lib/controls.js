/**
 * controls.js — resolves a room's control surface.
 *
 * Three questions, three answers:
 *
 *   which DESIGN   the surface's shape and position — sheet, rail, dock,
 *                  popover, bar, grid, fullscreen. Data, from controls.json.
 *   which SECTIONS are in it, and in what order.
 *   which ENTITIES each section shows, after its FILTER.
 *
 * The filter is the point. A section can be told to populate *everything* in
 * the room (`source: "all"`) and then narrowed by configuration, rather than
 * the alternative — hand-listing entities, which rots the moment a device is
 * added.
 *
 * Layers merge house -> floor -> room, sections BY ID rather than by array
 * position, so a room that only wants one row hidden writes one line and
 * inherits the rest.
 *
 * (Was popup.js. Renamed when the single sheet became one design among several.)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.Controls = api; root.PopupConfig = api; }   // old global kept as an alias
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* --------------------------------------------------------- shortcuts */

  /* A SHORTCUT is one of the user's own actions: a label plus something to do.
   *
   * The builder has NO vocabulary for these. It does not know what a
   * do-not-disturb, a turbo switch or a movie scene is, and it must not — a
   * house's meanings are its own, and a framework that ships six of them has
   * shipped one house. What it knows is: here is a label, here is an entity or
   * a service, put it in this row.
   *
   * They live on `project.shortcuts`, `floor.shortcuts` and `room.shortcuts`
   * and ACCUMULATE across the three, nearest last, because a house-wide
   * goodnight scene and a room's own reading scene are both worth showing. A
   * nearer layer repeating an `id` replaces that one — which is also how it
   * hides an inherited shortcut, with `enabled: false`.
   *
   * Nothing here creates anything in Home Assistant. A shortcut only ever names
   * an entity or a service that already exists. */
  function layerShortcuts(layer, level) {
    if (!layer) return [];
    const out = [];
    for (const s of layer.shortcuts || []) {
      if (!s || (!s.entity && !s.service)) continue;
      out.push(Object.assign({}, s, { level }));
    }
    /* Two fields from the old hand-written spec format mean "a button for this
     * room": `dnd`, one entity, and `ac_boost`, a list of them. They are read
     * here so an imported plan keeps working, and they arrive as ordinary
     * shortcuts with the labels the old format gave them — the framework gains
     * no concept from either. */
    if (typeof layer.dnd === 'string' && layer.dnd) {
      out.push({ id: 'dnd', label: 'Do not disturb', entity: layer.dnd, slot: 'header', level, legacy: 'dnd' });
    }
    for (const b of layer.boost || []) {
      if (b && b.entity) out.push({ id: 'boost:' + b.entity, label: b.label || 'Boost', entity: b.entity, level, legacy: 'ac_boost' });
    }
    return out;
  }

  /* Every shortcut that applies to one room, nearest layer last. */
  function shortcuts(doc, project, floor, room) {
    const out = [];
    for (const layer of [
      layerShortcuts(project, 'house'),
      layerShortcuts(floor, 'floor'),
      layerShortcuts(room, 'room'),
    ]) {
      for (const s of layer) {
        const i = s.id ? out.findIndex((x) => x.id === s.id) : -1;
        if (i >= 0) out[i] = s; else out.push(s);
      }
    }
    const kept = out.filter((s) => s.enabled !== false);
    if (kept.some((s) => s.order !== undefined)) kept.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    return kept;
  }

  /* Placement, in two rules.
   *
   * `slot: "header"` claims the button row and nothing else. Everything else is
   * OFFERED to every section, and the sections' own filters decide — which is
   * why the shipped rows partition by domain: scenes and scripts to Scenes,
   * automations to Automations, the rest to Shortcuts. A shortcut that names a
   * `section` outright overrides that and appears only there. */
  function headerShortcuts(list) {
    return (list || []).filter((s) => s.slot === 'header');
  }

  function shortcutsOffered(list, sectionId) {
    return (list || []).filter((s) => s.slot !== 'header' && (!s.section || s.section === sectionId));
  }

  function shortcutById(list, id) {
    return (list || []).find((s) => s.id === id) || null;
  }

  /* A button's `target`. A literal entity id passes through; anything else
   * names a shortcut, or `master` — the room's own light group, which is a
   * property of the plan rather than one of the user's actions. */
  function resolveTarget(target, list, room) {
    if (!target) return null;
    const t = String(target).replace(/^@/, '');
    if (t.indexOf('.') >= 0) return t;
    if (t === 'master') return (room && room.master) || null;
    const s = shortcutById(list, t);
    return s ? (s.state || s.entity || null) : null;
  }

  /* ---------------------------------------------------- domain actions */

  /* What a tap does and which widget an entity gets, by DOMAIN. Home
   * Assistant's vocabulary, which every house shares — unlike the shortcuts
   * above. One question, one answer, asked by the card, the marker tap and the
   * editor preview alike; the alternative is a `switch (domain)` in each of
   * them, which is how three backends end up disagreeing about what tapping a
   * scene should do. */
  function actionFor(entityId, doc, overrides) {
    const domain = String(entityId || '').split('.')[0];
    const a = (doc && (doc.domainActions || doc.actions)) || {};
    return Object.assign({ domain }, a.default || {}, (a.byDomain || {})[domain] || {}, overrides || {});
  }

  /* What running a shortcut actually calls. An explicit `service` wins; with
   * only an entity, its domain decides. */
  function shortcutCall(shortcut, doc) {
    if (!shortcut) return null;
    const data = Object.assign({}, shortcut.data || {});
    if (shortcut.service) {
      if (shortcut.entity && data.entity_id === undefined) data.entity_id = shortcut.entity;
      return { service: shortcut.service, data };
    }
    const spec = actionFor(shortcut.entity, doc);
    const tap = spec.tap;
    if (!tap) return null;
    const service = tap === 'toggle' ? spec.domain + '.toggle' : tap.service;
    if (!service) return null;
    return { service, data: Object.assign({ entity_id: shortcut.entity }, tap.data || {}, data) };
  }

  /* `offStates` beats `onRule`: where a domain's off-states are just a list of
   * words (closed, locked, idle) that is the plainest way to say it, and it
   * needs no new rule name. */
  function onByRule(spec, state) {
    if (state === undefined || state === null) return false;
    if (Array.isArray(spec.offStates)) {
      return !spec.offStates.includes(state) && !['unavailable', 'unknown'].includes(state);
    }
    switch (spec.onRule) {
      case 'never': case 'momentary': return false;
      case 'notOff': return !['off', 'unavailable', 'unknown'].includes(state);
      case 'numeric': return isFinite(parseFloat(state));
      default: return state === 'on';
    }
  }

  function isOn(entityId, states, doc) {
    const st = states && states[entityId];
    if (!st) return false;
    return onByRule(actionFor(entityId, doc), st.state);
  }

  /* ------------------------------------------------------------- merging */

  function mergeById(base, over, key) {
    if (!over) return base;
    const out = base.map(clone);
    for (const o of over) {
      const i = out.findIndex((s) => s[key] === o[key]);
      if (i >= 0) {
        // filter merges as a unit rather than key-by-key: a room saying
        // {domains:['light']} means that, not that plus whatever it inherited.
        const filter = o.filter !== undefined ? o.filter : out[i].filter;
        out[i] = Object.assign(out[i], o, filter !== undefined ? { filter } : {});
      } else out.push(clone(o));
    }
    if (over.some((o) => o.order !== undefined)) out.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    return out;
  }

  function applyLayer(acc, layer, doc) {
    if (!layer) return acc;
    if (layer.preset && doc && doc.presets && doc.presets[layer.preset]) {
      const p = Object.assign({}, doc.presets[layer.preset]);
      delete p.preset; delete p._label;
      acc = applyLayer(acc, p, null);
    }
    if (layer.enabled !== undefined) acc.enabled = layer.enabled;
    if (layer.design) acc.design = layer.design;
    if (layer.designOverrides) acc.designOverrides = Object.assign({}, acc.designOverrides, layer.designOverrides);
    if (layer.openOn) acc.openOn = Object.assign({}, acc.openOn, layer.openOn);
    if (layer.dismiss) acc.dismiss = Object.assign({}, acc.dismiss, layer.dismiss);
    if (layer.header) {
      const buttons = mergeById(acc.header.buttons || [], layer.header.buttons, 'id');
      acc.header = Object.assign({}, acc.header, layer.header, { buttons });
    }
    if (layer.sections) acc.sections = mergeById(acc.sections, layer.sections, 'id');
    return acc;
  }

  /* Resolve for one room. `doc` is controls.json. */
  function resolve(doc, project, floor, room) {
    const d = (doc && doc.default) || { enabled: true, design: 'sheet', header: { buttons: [] }, sections: [] };
    let acc = clone(d);
    acc = applyLayer(acc, project && (project.controls || project.popup), doc);
    acc = applyLayer(acc, floor && (floor.controls || floor.popup), doc);
    acc = applyLayer(acc, room && (room.controls || room.popup), doc);

    acc.shortcuts = shortcuts(doc, project, floor, room);

    // A control that cannot do anything is worse than no control.
    acc.header.buttons = (acc.header.buttons || []).filter((b) => {
      if (b.enabled === false) return false;
      if (b.hideWhenMissing && !resolveTarget(b.target, acc.shortcuts, room)) return false;
      return true;
    });
    /* The user's own header buttons, after the built-in four. The framework
     * contributes all_on / all_off / details / close and nothing else; every
     * other button in that row is something this house asked for. */
    acc.header.shortcuts = headerShortcuts(acc.shortcuts);
    acc.sections = acc.sections.filter((s) => s.enabled);

    const designs = (doc && doc.designs) || {};
    acc.designName = acc.design;
    acc.designSpec = Object.assign({}, designs[acc.design] || designs.sheet || {}, acc.designOverrides || {});
    return acc;
  }

  function designs(doc) {
    return Object.entries((doc && doc.designs) || {}).map(([id, d]) => ({ id, ...d }));
  }

  /* ---------------------------------------------------------- candidates */

  /* Everything in this room something could be bound to.
   *
   * `items` are the markers inside the room; `areaEntities` is whatever Home
   * Assistant associates with the room's area, which is how the picker offers
   * things that have no marker yet. */
  function availableEntities(room, items, areaEntities, cuts) {
    const seen = new Set();
    const out = [];
    const add = (entity, source, label, item, shortcut) => {
      if (!entity || seen.has(entity)) return;
      seen.add(entity);
      out.push({
        entity, source, label: label || null, domain: String(entity).split('.')[0],
        item: item || null, shortcut: shortcut || null,
      });
    };
    for (const it of items || []) {
      add(it.entity, 'marker', it.name, it);
      for (const c of (it.props && it.props.channels) || []) add(c.entity, 'channel', c.label, it);
      for (const k of ['presence', 'remote', 'sensor']) if (it.props && it.props[k]) add(it.props[k], 'marker:' + k, null, it);
    }
    for (const s of (cuts && cuts.length ? cuts : layerShortcuts(room, 'room'))) {
      add(s.entity, 'shortcut', s.label, null, s.id || null);
    }
    if (room && room.master) add(room.master, 'room:master');
    for (const e of areaEntities || []) add(e.entity_id || e, 'area', e.name);
    return out;
  }

  /* ------------------------------------------------------------- filters */

  /* Entity ids are snake_case and friendly names are not, so both sides are
   * flattened to one alphabet before anything is compared. Without this,
   * "Guest Room" never matches the key `guest_room` that names it. */
  const normalise = (s) => String(s).toLowerCase().replace(/[\s-]+/g, '_');

  /* A room's own match keys: whatever it declares, else its id and its name.
   * This is what `"match": "@room"` expands to, and it is the whole reason one
   * shipped Scenes section can serve every room in the house without a table
   * of room-to-keyword mappings living next to it. */
  function roomKeys(room) {
    if (!room) return [];
    if (Array.isArray(room.keys) && room.keys.length) return room.keys;
    return [room.id, room.name].filter(Boolean);
  }

  function expandMatch(match, ctx) {
    const list = (Array.isArray(match) ? match : [match]).filter(Boolean);
    const out = [];
    for (const m of list) {
      if (m === '@room') out.push(...roomKeys(ctx && ctx.room));
      else out.push(m);
    }
    return out;
  }

  function oneMatch(hay, needle, mode) {
    if (mode === 'regex') {
      try { return new RegExp(needle, 'i').test(hay); } catch { return false; }
    }
    const n = normalise(needle);
    if (mode === 'word') {
      // 'informal' literally contains 'formal'; a bounded match is the only
      // thing that keeps two rooms' controls apart. A needle that already ends
      // in `_` ("gr_", "dg_" — an entity id's own prefix) stays a plain prefix
      // test: demanding a boundary after it would demand a second underscore
      // right where the id's next word starts.
      if (n.endsWith('_')) return hay.includes(n);
      return new RegExp(`(^|[^a-z0-9])${esc(n)}([^a-z0-9]|$)`, 'i').test(hay);
    }
    return hay.includes(n);
  }

  /* Any one needle matching is enough — a room may answer to two names. */
  function textMatches(cand, match, mode, ctx) {
    const needles = expandMatch(match, ctx);
    if (!needles.length) return true;
    const hay = normalise(`${cand.entity} ${cand.label || ''} ${(cand.item && cand.item.name) || ''}`);
    return needles.some((n) => oneMatch(hay, n, mode));
  }

  function reTest(pattern, value) {
    try { return new RegExp(pattern, 'i').test(value); } catch { return false; }
  }

  /* Narrow a candidate list. Every key is optional and they AND together;
   * `include` is applied last and always wins. */
  function applyFilter(cands, filter, ctx) {
    const f = filter || {};
    const library = (ctx && ctx.library) || { types: {} };
    const states = (ctx && ctx.states) || {};
    const typeOf = (c) => (c.item && c.item.type) || null;
    const libOf = (c) => {
      if (!c.item) return null;
      const t = library.types || {};
      return t[`${c.item.kind}.${c.item.type}`] || t[c.item.type] || null;
    };

    let out = cands.filter((c) => {
      if (f.domains && !f.domains.includes(c.domain)) return false;
      if (f.excludeDomains && f.excludeDomains.includes(c.domain)) return false;
      if (f.kinds && !(c.item && f.kinds.includes(c.item.kind))) return false;
      if (f.shortcuts && !(c.shortcut && f.shortcuts.includes(c.shortcut))) return false;
      if (f.entityPattern && !reTest(f.entityPattern, c.entity)) return false;
      if (f.excludePattern && reTest(f.excludePattern, c.entity)) return false;
      if (f.types && !(typeOf(c) && f.types.includes(typeOf(c)))) return false;
      if (f.excludeTypes && typeOf(c) && f.excludeTypes.includes(typeOf(c))) return false;
      if (f.exclude && f.exclude.includes(c.entity)) return false;
      if (f.deviceClasses) {
        const dc = states[c.entity] && states[c.entity].attributes && states[c.entity].attributes.device_class;
        if (!dc || !f.deviceClasses.includes(dc)) return false;
      }
      if (f.onlyControllable) {
        const t = libOf(c);
        if (t && t.readOnly) return false;
      }
      if (f.hideUnavailable) {
        const st = states[c.entity];
        if (!st || st.state === 'unavailable' || st.state === 'unknown') return false;
      }
      if (!textMatches(c, f.match, f.matchMode, ctx)) return false;
      return true;
    });

    // include wins over everything, so one stubborn entity can be forced back
    // without loosening the filter for the rest.
    if (f.include && f.include.length) {
      const have = new Set(out.map((c) => c.entity));
      for (const id of f.include) {
        if (have.has(id)) continue;
        const found = cands.find((c) => c.entity === id);
        out.push(found || { entity: id, source: 'forced', label: null, domain: String(id).split('.')[0], item: null });
      }
    }

    const sort = f.sort === undefined ? 'name' : f.sort;
    if (sort === 'name') out.sort((a, b) => String(a.label || a.entity).localeCompare(String(b.label || b.entity)));
    else if (sort === 'entity') out.sort((a, b) => a.entity.localeCompare(b.entity));
    else if (sort === 'type') out.sort((a, b) => String(typeOf(a) || '~').localeCompare(String(typeOf(b) || '~')));

    if (f.limit) out = out.slice(0, f.limit);
    return out;
  }

  /* What a section will actually render, so the editor can preview it without
   * duplicating the runtime's logic.
   *
   * A section may name one `source`, or several in `sources[]`, each with its
   * own filter, unioned in order and de-duplicated by entity. That is what lets
   * the shipped Scenes row say "the scenes this house made shortcuts of, plus
   * any scene whose name matches this room" in configuration rather than in
   * code — two populations that need different filters and read as one list.
   *
   * A per-source filter is the only place `shortcuts` can do anything useful:
   * being a shortcut is a property of one population, so AND-ing it across a
   * catalogue source would empty the list. */
  function sectionEntities(section, ctx) {
    const groups = (Array.isArray(section.sources) && section.sources.length)
      ? section.sources
      : [{ source: section.source, entities: section.entities, filter: null }];

    /* An entity that already has a header button does not also get a tile.
     * Putting a shortcut in the header is a statement about where you want it,
     * and a panel that shows the same do-not-disturb twice — once as a button,
     * once as a tile it happens to match — reads as a bug in the plan rather
     * than as two ways to reach one thing. A section can still force it back
     * with `filter.include`, which is applied after this. */
    const inHeader = new Set(headerShortcuts((ctx && ctx.shortcuts) || []).map((s) => s.entity).filter(Boolean));

    const seen = new Set();
    const merged = [];
    for (const g of groups) {
      for (const c of applyFilter(sourceCandidates(g, section, ctx), g.filter, ctx)) {
        if (seen.has(c.entity) || inHeader.has(c.entity)) continue;
        seen.add(c.entity);
        merged.push(c);
      }
    }
    return applyFilter(merged, section.filter, ctx);
  }

  /* The user's shortcuts for this room, at any layer, as filter candidates.
   *
   * `where` is the section asking. A shortcut that claimed the header, or named
   * a different section, is not offered — the placement is the user's, and a
   * row that ignored it would print the same button twice. */
  function shortcutCandidates(ctx, where) {
    const cuts = (ctx && ctx.shortcuts) || layerShortcuts(ctx && ctx.room, 'room');
    return (where === null ? cuts : shortcutsOffered(cuts, where)).map((s) => {
      /* A shortcut that is a bare service call — "run this script with speed 3"
       * — has no entity at all. It still needs a key to be de-duplicated and
       * filtered by, so it gets a synthetic one. Its domain is `shortcut`,
       * which is exactly why it lands in the general row rather than in Scenes
       * or Automations: nothing about a service call says which it is. */
      const key = s.entity || ('shortcut.' + (s.id || s.service || 'x'));
      return {
        entity: key,
        label: s.label || null,
        domain: String(key).split('.')[0],
        item: null,
        shortcut: s.id || null,
        action: s,
        level: s.level,
        source: 'shortcut',
      };
    });
  }

  /* Every entity Home Assistant knows about, for the sections that find their
   * own — a scene named after the room needs no configuration at all, and one
   * added next month joins the row by itself. Offline (no states loaded) this
   * is empty and only the explicit shortcuts show, which is the intended
   * degradation rather than a failure. */
  function catalogueCandidates(ctx) {
    const cat = (ctx && ctx.catalogue) || Object.keys((ctx && ctx.states) || {});
    const states = (ctx && ctx.states) || {};
    return cat.map((e) => {
      const id = e && e.entity_id ? e.entity_id : e;
      const st = states[id];
      return {
        entity: id,
        label: (st && st.attributes && st.attributes.friendly_name) || (e && e.name) || null,
        domain: String(id).split('.')[0],
        item: null,
        source: 'catalogue',
      };
    });
  }

  function sourceCandidates(group, section, ctx) {
    const { room, items, areaEntities } = ctx;
    const kindOf = (i) => i.kind || 'fixture';
    let cands;
    switch (group.source) {
      case 'shortcuts':
        return shortcutCandidates(ctx, group.section || section.id || 'shortcuts');
      case 'catalogue':
        return catalogueCandidates(ctx);
      case 'lights':
        cands = items.filter((i) => kindOf(i) === 'fixture' && i.entity)
          .map((i) => ({ entity: i.entity, label: i.name, domain: i.entity.split('.')[0], item: i, source: 'marker' }));
        break;
      case 'devices':
        cands = items.filter((i) => kindOf(i) === 'device' && i.entity)
          .map((i) => ({ entity: i.entity, label: i.name, domain: i.entity.split('.')[0], item: i, source: 'marker' }));
        break;
      case 'explicit':
        cands = (group.entities || section.entities || []).map((e) => (typeof e === 'string'
          ? { entity: e, label: null, domain: e.split('.')[0], item: null, source: 'explicit' }
          : { entity: e.entity, label: e.label, domain: String(e.entity).split('.')[0], item: null, source: 'explicit' }));
        break;
      case 'all':
      case 'available':
        cands = availableEntities(room, items, areaEntities, ctx.shortcuts);
        break;
      default:
        cands = [];
    }
    return cands;
  }

  /* Fixture-type groups present in a room, honouring a fixture's own `group`
   * override — a marker drawn as a spot can belong to a different button. */
  function groupsFor(items, groupBy, ctx) {
    const map = new Map();
    for (const it of items) {
      if ((it.kind || 'fixture') !== 'fixture' || !it.entity) continue;
      const key = (groupBy === 'group' && it.props && it.props.group) || (it.props && it.props.group) || it.type;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it.entity);
    }
    let out = [...map.entries()].map(([type, entities]) => ({ type, entities: [...new Set(entities)] }));
    if (ctx && ctx.filter) {
      const keep = new Set(applyFilter(
        out.flatMap((g) => g.entities.map((e) => ({ entity: e, domain: e.split('.')[0], label: null, item: null }))),
        ctx.filter, ctx).map((c) => c.entity));
      out = out.map((g) => ({ ...g, entities: g.entities.filter((e) => keep.has(e)) })).filter((g) => g.entities.length);
    }
    return out;
  }

  /* A plain-language summary of a filter, for the editor. Reading back what a
   * filter DOES beats reading the JSON that expresses it. */
  function describeFilter(filter) {
    const f = filter || {};
    const bits = [];
    if (f.domains) bits.push(`domain ${f.domains.join('/')}`);
    if (f.excludeDomains) bits.push(`not ${f.excludeDomains.join('/')}`);
    if (f.kinds) bits.push(f.kinds.join('/'));
    if (f.shortcuts) bits.push(`shortcut ${f.shortcuts.join('/')}`);
    if (f.entityPattern) bits.push(`id matching /${f.entityPattern}/`);
    if (f.excludePattern) bits.push(`not /${f.excludePattern}/`);
    if (f.types) bits.push(`type ${f.types.join('/')}`);
    if (f.excludeTypes) bits.push(`not type ${f.excludeTypes.join('/')}`);
    if (f.deviceClasses) bits.push(`class ${f.deviceClasses.join('/')}`);
    if (f.match) {
      const m = [].concat(f.match);
      bits.push(m.includes('@room') && m.length === 1
        ? 'named after the room'
        : `${f.matchMode || 'contains'} “${m.join('” / “')}”`);
    }
    if (f.onlyControllable) bits.push('controllable only');
    if (f.hideUnavailable) bits.push('available only');
    if (f.exclude && f.exclude.length) bits.push(`${f.exclude.length} excluded`);
    if (f.include && f.include.length) bits.push(`${f.include.length} forced in`);
    if (f.limit) bits.push(`first ${f.limit}`);
    return bits.length ? bits.join(', ') : 'everything the source gives';
  }

  /* A section's sources, for the editor's "where does this come from" line. */
  function describeSources(section) {
    const groups = (Array.isArray(section.sources) && section.sources.length)
      ? section.sources : [{ source: section.source, filter: section.filter }];
    return groups.map((g) => `${g.source || 'nothing'}${g.filter ? ' (' + describeFilter(g.filter) + ')' : ''}`).join(' + ');
  }

  return {
    resolve, designs, availableEntities, sectionEntities, groupsFor, applyFilter,
    describeFilter, describeSources,
    shortcuts, headerShortcuts, shortcutsOffered, shortcutById, shortcutCall,
    resolveTarget, roomKeys,
    actionFor, isOn, onByRule,
  };
}));
