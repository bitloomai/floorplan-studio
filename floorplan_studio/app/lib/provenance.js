/** The deployment ownership contract for app-written dashboards. */
'use strict';

  const STAMP_KEY = 'floorplan_studio';
  const GENERATOR = 'floorplan-studio';
  const SCHEMA = 1;
  const DEFAULT_DASHBOARD = new Set(['', 'lovelace', 'default_view', 'null', 'undefined']);

  function assertPath(urlPath) {
    const value = String(urlPath == null ? '' : urlPath);
    if (DEFAULT_DASHBOARD.has(value)) {
      throw new Error('refusing to write to the default dashboard — it has no url_path, '
        + 'and overwriting it would replace the Home Assistant home screen');
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
      throw new Error(`"${value}" is not a valid dashboard url_path (lower-case letters, digits and hyphens)`);
    }
    return value;
  }

  function stamp(project, { version, urlPath, embedProject, now } = {}) {
    const path = assertPath(urlPath);
    const projectId = project && project.id ? String(project.id) : path;
    const value = {
      generator: GENERATOR,
      schema: SCHEMA,
      version: version || '0',
      url_path: path,
      deployment_id: `${projectId}:${path}`,
      project_id: projectId,
      saved_at: (now || new Date()).toISOString(),
      note: 'Written by Floorplan Studio. Deleting this key stops the editor recognising and updating this dashboard; the cards keep working.',
    };
    if (embedProject && project) {
      value.project = project;
      value.project_bytes = JSON.stringify(project).length;
    }
    return value;
  }

  function readStamp(config) {
    const value = config && config[STAMP_KEY];
    return value && value.generator === GENERATOR && value.schema === SCHEMA ? value : null;
  }

  function assertOwnedConfig(urlPath, config, { allowMissing = false } = {}) {
    const path = assertPath(urlPath);
    if (config == null && allowMissing) return null;
    const value = readStamp(config);
    if (!value) {
      throw new Error(`refusing to replace "${path}": the existing dashboard is not owned by Floorplan Studio`);
    }
    if (value.url_path !== path) {
      throw new Error(`refusing to replace "${path}": its Floorplan Studio ownership stamp names "${value.url_path || 'no path'}"`);
    }
    return value;
  }

module.exports = { STAMP_KEY, GENERATOR, SCHEMA, stamp, readStamp, assertPath, assertOwnedConfig };
