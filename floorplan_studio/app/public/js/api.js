/* Thin fetch wrapper.
 *
 * Every URL here is RELATIVE on purpose. Under Home Assistant ingress the app
 * is served from /api/hassio_ingress/<token>/, so an absolute '/api/project'
 * would escape the ingress prefix and 404. Relative paths resolve against the
 * document base and work in both dev and ingress without knowing the prefix. */
window.API = (function () {
  'use strict';

  async function req(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    const text = await res.text();
    let body = null;
    if (text) { try { body = JSON.parse(text); } catch { body = text; } }
    if (!res.ok) throw new Error((body && body.error) || `${res.status} ${res.statusText}`);
    return body;
  }

  return {
    bootstrap: () => req('api/bootstrap'),
    project: () => req('api/project'),
    saveProject: (project) => req('api/project', { method: 'PUT', body: JSON.stringify(project) }),
    saveLibrary: (lib) => req('api/library', { method: 'PUT', body: JSON.stringify(lib) }),
    saveThemes: (themes) => req('api/themes', { method: 'PUT', body: JSON.stringify(themes) }),
    saveFlooring: (doc) => req('api/flooring', { method: 'PUT', body: JSON.stringify(doc) }),
    saveBoundaries: (doc) => req('api/boundaries', { method: 'PUT', body: JSON.stringify(doc) }),
    saveControls: (doc) => req('api/controls', { method: 'PUT', body: JSON.stringify(doc) }),
    sun: (lat, lon, at) => req(`api/sun?lat=${lat}&lon=${lon}${at ? '&at=' + encodeURIComponent(at) : ''}`),
    entities: (refresh) => req('api/entities' + (refresh ? '?refresh=1' : '')),
    states: () => req('api/states'),
    fixtures: () => req('api/fixtures'),
    loadFixture: (file) => req('api/fixtures/load', { method: 'POST', body: JSON.stringify({ file }) }),
    importLegacy: (dir) => req('api/import/legacy', { method: 'POST', body: JSON.stringify({ dir }) }),
    dashboardDiscover: () => req('api/dashboard/discover'),
    dashboardReopen: (urlPath) => req('api/dashboard/reopen', { method: 'POST', body: JSON.stringify({ urlPath }) }),
    dashboardPreview: (opts) => req('api/dashboard/preview', { method: 'POST', body: JSON.stringify(opts) }),
    /* The one call in this file that CHANGES anything in Home Assistant. */
    dashboardInstall: (opts) => req('api/dashboard/install', { method: 'POST', body: JSON.stringify(opts) }),
    exportBundle: (project, format, floorId) =>
      req('api/export', { method: 'POST', body: JSON.stringify({ project, format, floorId }) }),
  };
}());
