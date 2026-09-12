/**
 * Every Home Assistant entity named by a project, in one place.
 *
 * A binding is more than `item.entity`: cameras can name a presence sensor,
 * extension boards carry one entity per channel, openings can have a contact,
 * a motor and a separate covering motor, room controls name masters and
 * shortcuts, and the daylight model reads sun/weather/solar entities. The
 * editor, generated card, dashboard preflight, headless API and export manifest
 * must agree on this set or one of them will silently stop updating.
 *
 * Runs in Node and in the generated dashboard bundle.
 */
(function (root, factory) {
  const api = factory(
    () => typeof module === 'object' && module.exports ? require('./sun') : root.SunModel,
    () => typeof module === 'object' && module.exports ? require('./controls') : root.Controls,
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EntityBindings = api;
}(typeof self !== 'undefined' ? self : this, function (sunModel, controlsApi) {
  'use strict';

  function collector() {
    const found = new Map();
    const add = (value, reason) => {
      const values = Array.isArray(value) ? value : [value];
      for (const id of values) {
        if (typeof id !== 'string' || !id) continue;
        if (!found.has(id)) found.set(id, new Set());
        if (reason) found.get(id).add(reason);
      }
    };
    return {
      add,
      result: () => [...found.keys()].sort(),
      details: () => [...found.entries()].sort(([a], [b]) => a.localeCompare(b))
        .map(([entity, reasons]) => ({ entity, reasons: [...reasons].sort() })),
    };
  }

  function shortcutBindings(out, shortcut, reason) {
    if (!shortcut || shortcut.enabled === false) return;
    out.add(shortcut.entity, reason);
    out.add(shortcut.state, reason + ':state');
    /* A service-only shortcut may still target an entity in its service data.
     * It need not be watched for painting, but it is a real plan binding and
     * belongs in validation/manifests and bound:no discovery. */
    for (const data of [shortcut.data, shortcut.tap && shortcut.tap.data]) {
      if (data) out.add(data.entity_id, reason + ':service');
    }
  }

  function layerShortcuts(out, layer, reason) {
    if (!layer) return;
    for (const shortcut of layer.shortcuts || []) shortcutBindings(out, shortcut, reason);
    out.add(layer.dnd, reason + ':dnd');
    for (const boost of layer.boost || []) if (boost) out.add(boost.entity, reason + ':boost');
  }

  function controlBindings(out, config, reason) {
    if (!config) return;
    for (const section of config.sections || []) {
      if (!section) continue;
      const sectionReason = `${reason}:section:${section.id || '?'}`;
      const groups = [section, ...(section.sources || [])];
      for (const group of groups) {
        if (!group) continue;
        for (const entity of group.entities || []) {
          out.add(typeof entity === 'string' ? entity : entity && entity.entity, sectionReason + ':explicit');
        }
        out.add(group.filter && group.filter.include, sectionReason + ':forced');
      }
    }
  }

  function collectFloor(out, project, floor, controls, opts) {
    if (!floor) return;
    const prefix = `floor:${floor.id || '?'}`;
    controlBindings(out, project && (project.controls || project.popup), 'house:controls');
    controlBindings(out, floor.controls || floor.popup, prefix + ':controls');
    for (const item of floor.items || []) {
      const reason = `${prefix}:item:${item.id || '?'}`;
      out.add(item.entity, reason);
      const props = item.props || {};
      for (const key of ['presence', 'remote', 'sensor', 'holdEntity']) {
        out.add(props[key], `${reason}:${key}`);
      }
      for (const channel of props.channels || []) if (channel) out.add(channel.entity, `${reason}:channel`);
    }
    for (const opening of floor.openings || []) {
      const reason = `${prefix}:opening:${opening.id || '?'}`;
      out.add(opening.sensor, reason + ':sensor');
      out.add(opening.cover, reason + ':cover');
      out.add(opening.covering && opening.covering.entity, reason + ':covering');
    }
    layerShortcuts(out, floor, prefix + ':shortcut');
    const Controls = controlsApi();
    for (const room of floor.rooms || []) {
      const reason = `${prefix}:room:${room.id || '?'}`;
      out.add(room.master, reason + ':master');
      layerShortcuts(out, room, reason + ':shortcut');
      controlBindings(out, room.controls || room.popup, reason + ':controls');
      /* Resolve as the card does. This also honours an inherited shortcut that
       * a nearer layer replaced or disabled, without making callers reproduce
       * Controls' precedence rules. */
      if (Controls && typeof Controls.shortcuts === 'function') {
        for (const shortcut of Controls.shortcuts(controls, project, floor, room)) {
          shortcutBindings(out, shortcut, reason + ':resolved-shortcut');
        }
      }
      if (Controls && typeof Controls.resolve === 'function') {
        controlBindings(out, Controls.resolve(controls, project, floor, room), reason + ':resolved-controls');
      }
    }
    if (!opts || opts.sun !== false) {
      const Sun = sunModel();
      const sun = Sun && Sun.mergeConfig ? Sun.mergeConfig(project && project.sun, floor.sun) : null;
      if (sun && sun.enabled) {
        if (sun.source === 'entity') out.add(sun.sunEntity, prefix + ':sun');
        out.add(sun.weather && sun.weather.entity, prefix + ':weather');
        out.add(sun.solarSensor && sun.solarSensor.entity, prefix + ':solar');
        /* Kept for old projects whose floor-card header still reads this
         * pre-nested spelling. The daylight model ignores it, but the live
         * card does not, so it remains a real subscription until migration. */
        out.add(project && project.sun && project.sun.weatherEntity, prefix + ':legacy-weather');
      }
    }
  }

  function floor(project, floorDoc, controls, opts) {
    const out = collector();
    /* House shortcuts are inherited by every room, but a floor with no rooms
     * still names them, so collect the layer independently too. */
    layerShortcuts(out, project, 'house:shortcut');
    collectFloor(out, project || {}, floorDoc, controls, opts);
    return opts && opts.details ? out.details() : out.result();
  }

  function project(projectDoc, controls, opts) {
    const projectValue = projectDoc || {};
    const out = collector();
    layerShortcuts(out, projectValue, 'house:shortcut');
    const floors = opts && Array.isArray(opts.floors) ? opts.floors : (projectValue.floors || []);
    for (const floorDoc of floors) collectFloor(out, projectValue, floorDoc, controls, opts);

    const house = (projectValue.dashboard || {}).house;
    if (house) {
      out.add(house.weather, 'dashboard:house:weather');
      out.add(house.people, 'dashboard:house:people');
      for (const count of house.counts || []) if (count) {
        out.add(count.entities, 'dashboard:house:count');
        out.add(count.showWhen && count.showWhen.entity, 'dashboard:house:count-condition');
      }
      for (const stat of house.stats || []) if (stat) {
        out.add(stat.entity, 'dashboard:house:stat');
        out.add(stat.valueEntity, 'dashboard:house:stat-value');
        out.add(stat.showWhen && stat.showWhen.entity, 'dashboard:house:stat-condition');
      }
    }
    return opts && opts.details ? out.details() : out.result();
  }

  return { floor, project };
}));
