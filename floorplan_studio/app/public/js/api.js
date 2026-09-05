/* Thin fetch wrapper.
 *
 * Every URL here is RELATIVE on purpose. Under Home Assistant ingress the app
 * is served from /api/hassio_ingress/<token>/, so an absolute '/api/project'
 * would escape the ingress prefix and 404. Relative paths resolve against the
 * document base and work in both dev and ingress without knowing the prefix. */
window.API = (function () {
  'use strict';

  /* Identifies THIS tab to the server, so the live-update stream can tell
   * this editor's own save from somebody else's and not report it back as a
   * change made elsewhere. It never leaves this page's own app and means
   * nothing to anything else, so it is a random string rather than anything
   * derived from the user or the session.
   *
   * `crypto.randomUUID` exists only in a secure context, and Home Assistant is
   * routinely reached over plain http on a LAN — so the fallback is the path
   * that actually runs for many people, not a theoretical one. */
  const CLIENT_ID = (() => {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    } catch (e) { /* not a secure context */ }
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  })();

  async function req(path, opts) {
    /* Merge headers rather than let opts replace them wholesale: a caller
     * adding one header used to silently drop the Content-Type every JSON
     * body here depends on. */
    const o = Object.assign({}, opts);
    o.headers = Object.assign({ 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
    const res = await fetch(path, o);
    const text = await res.text();
    let body = null;
    if (text) { try { body = JSON.parse(text); } catch { body = text; } }
    if (!res.ok) {
      /* The message alone is not always the whole answer: a refused import
       * also reports which file failed and why. Carrying the parsed body on
       * the error lets a caller that wants the detail show it, while every
       * existing `catch (e) => toast(e.message)` keeps working unchanged. */
      const err = new Error((body && body.error) || `${res.status} ${res.statusText}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  return {
    bootstrap: () => req('api/bootstrap'),
    project: () => req('api/project'),
    clientId: () => CLIENT_ID,
    saveProject: (project) => req('api/project', {
      method: 'PUT',
      headers: { 'X-FPS-Client': CLIENT_ID },
      body: JSON.stringify(project),
    }),
    saveLibrary: (lib) => req('api/library', { method: 'PUT', body: JSON.stringify(lib) }),
    saveThemes: (themes) => req('api/themes', { method: 'PUT', body: JSON.stringify(themes) }),
    saveFlooring: (doc) => req('api/flooring', { method: 'PUT', body: JSON.stringify(doc) }),
    saveBoundaries: (doc) => req('api/boundaries', { method: 'PUT', body: JSON.stringify(doc) }),
    saveControls: (doc) => req('api/controls', { method: 'PUT', body: JSON.stringify(doc) }),
    sun: (lat, lon, at) => req(`api/sun?lat=${lat}&lon=${lon}${at ? '&at=' + encodeURIComponent(at) : ''}`),
    /* Help. The server renders the markdown, so this page carries no parser
     * and cannot disagree with the generated site about what a topic says. */
    help: (selectors) => req('api/help?for=' + encodeURIComponent([].concat(selectors).join(','))),
    helpTopic: (id) => req('api/help?id=' + encodeURIComponent(id)),
    helpSearch: (q) => req('api/help?q=' + encodeURIComponent(q)),
    helpIndex: () => req('api/help'),
    entities: (refresh) => req('api/entities' + (refresh ? '?refresh=1' : '')),
    states: () => req('api/states'),
    fixtures: () => req('api/fixtures'),
    loadFixture: (file) => req('api/fixtures/load', { method: 'POST', body: JSON.stringify({ file }) }),
    /* `files` is [{ name, text }] — read in the browser, so the app server
     * never opens a path on its own filesystem to satisfy an import. */
    importUpload: (files) => req('api/import/upload', { method: 'POST', body: JSON.stringify({ files }) }),
    dashboardDiscover: () => req('api/dashboard/discover'),
    dashboardReopen: (urlPath) => req('api/dashboard/reopen', { method: 'POST', body: JSON.stringify({ urlPath }) }),
    dashboardPreview: (opts) => req('api/dashboard/preview', { method: 'POST', body: JSON.stringify(opts) }),
    /* The one call in this file that CHANGES anything in Home Assistant. */
    dashboardInstall: (opts) => req('api/dashboard/install', { method: 'POST', body: JSON.stringify(opts) }),
    exportBundle: (project, format, floorId) =>
      req('api/export', { method: 'POST', body: JSON.stringify({ project, format, floorId }) }),
  };
}());
