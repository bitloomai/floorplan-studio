/* Source for the generated help site's interactions. Copied by make-docs.js. */
(function () {
  'use strict';
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const media = matchMedia('(min-width:861px)');
  const side = $('side'), sideButton = $('sideBtn'), close = $('sideClose');
  const main = document.querySelector('main'), top = document.querySelector('.top');
  function setSide(open, remember, focus) {
    root.dataset.side = open ? 'open' : 'closed';
    sideButton.setAttribute('aria-expanded', String(open));
    side.inert = !open;
    main.inert = top.inert = open && !media.matches;
    root.classList.toggle('drawer-open', open && !media.matches);
    if (remember && media.matches) { try { localStorage.setItem('fps-docs-side', root.dataset.side); } catch (_) {} }
    if (focus) (open && !media.matches ? close : sideButton).focus();
  }
  function restoreSide() {
    let saved;
    try { saved = localStorage.getItem('fps-docs-side'); } catch (_) {}
    setSide(media.matches && saved !== 'closed', false, false);
  }
  restoreSide();
  media.addEventListener('change', restoreSide);
  sideButton.addEventListener('click', () => setSide(root.dataset.side !== 'open', true, true));
  close.addEventListener('click', () => setSide(false, true, true));
  $('scrim').addEventListener('click', () => setSide(false, false, true));
  side.addEventListener('click', (e) => { if (e.target.closest('a') && !media.matches) setSide(false, false, true); });
  document.addEventListener('keydown', (e) => {
    if (media.matches || root.dataset.side !== 'open') return;
    if (e.key === 'Escape') { setSide(false, false, true); e.preventDefault(); }
    if (e.key === 'Tab') {
      const items = [...side.querySelectorAll('a,button')].filter((el) => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });
  $('themeBtn').addEventListener('click', () => {
    const current = root.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
    root.dataset.theme = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('fps-docs-theme', root.dataset.theme); } catch (_) {}
  });

  const input = $('q'), results = $('results');
  let loading, hits = [], selected = -1, request = 0;
  function hide() { results.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
  function message(text) { results.replaceChildren(); const p = document.createElement('p'); p.className = 'none'; p.textContent = text; results.append(p); results.hidden = false; input.setAttribute('aria-expanded', 'true'); }
  function draw() {
    results.replaceChildren();
    if (!hits.length) return message('No matches. Try a type, setting or feature name.');
    hits.forEach((hit, i) => {
      const a = document.createElement('a'); a.href = hit.u; a.id = 'result-' + i;
      a.setAttribute('role', 'option'); a.setAttribute('aria-selected', String(i === selected));
      a.classList.toggle('sel', i === selected);
      const title = document.createElement('strong'); title.textContent = hit.t;
      const summary = document.createElement('span'); summary.textContent = hit.s.replace(/`/g, '');
      a.append(title, summary); results.append(a);
    });
    results.hidden = false; input.setAttribute('aria-expanded', 'true');
    if (selected >= 0) { input.setAttribute('aria-activedescendant', 'result-' + selected); $('result-' + selected).scrollIntoView({block:'nearest'}); }
    else input.removeAttribute('aria-activedescendant');
  }
  async function search() {
    const ticket = ++request, q = input.value.trim().toLowerCase();
    hits = []; selected = -1;
    if (!q) return hide();
    message('Searching…');
    try {
      if (!loading) loading = fetch('search.json').then((r) => { if (!r.ok) throw Error('Search unavailable'); return r.json(); }).catch((e) => { loading = null; throw e; });
      const index = await loading;
      if (ticket !== request || document.activeElement !== input) return;
      const words = q.split(/\s+/);
      hits = index.map((t) => {
        const hay = [t.t,t.s,t.k,t.g,t.n].join(' ').toLowerCase();
        if (!words.every((w) => hay.includes(w))) return [0,t];
        const title = t.t.toLowerCase();
        const titleWords = title.split(/[^a-z0-9]+/);
        return [1 + (title === q ? 40 : title.includes(q) ? 20 : 0) + words.filter((w) => titleWords.includes(w)).length * 10 + words.filter((w) => title.includes(w)).length * 2,t];
      }).filter(([s]) => s).sort((a,b) => b[0]-a[0] || a[1].t.localeCompare(b[1].t)).slice(0,15).map(([,t]) => t);
      draw();
    } catch (_) { if (ticket === request) message('Search could not load. Try again, or browse the contents.'); }
  }
  input.addEventListener('input', search);
  input.addEventListener('focus', search);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { ++request; hide(); input.blur(); }
    if (!hits.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      selected = (selected + (e.key === 'ArrowDown' ? 1 : selected < 0 ? 0 : -1) + hits.length) % hits.length;
      draw(); e.preventDefault();
    } else if (e.key === 'Enter') { location.href = hits[Math.max(0, selected)].u; e.preventDefault(); }
  });
  document.addEventListener('click', (e) => { if (!results.contains(e.target) && e.target !== input) { ++request; hide(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !document.activeElement.isContentEditable && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !top.inert) { e.preventDefault(); input.focus(); }
  });

  const filter = $('typeFilter');
  function filterTypes() {
    if (!filter) return;
    const words = filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const cards = [...document.querySelectorAll('.type')];
    let visible = 0;
    cards.forEach((card) => { card.hidden = !words.every((w) => card.dataset.search.includes(w)); if (!card.hidden) visible++; });
    document.querySelectorAll('[data-group]').forEach((group) => { group.hidden = ![...group.querySelectorAll('.type')].some((c) => !c.hidden); });
    $('typeCount').textContent = visible + ' of ' + cards.length;
    $('typeEmpty').hidden = visible !== 0;
  }
  if (filter) { filter.addEventListener('input', filterTypes); $('clearFilter').addEventListener('click', () => { filter.value = ''; filterTypes(); filter.focus(); }); }
  function revealHash() {
    let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch (_) { return; }
    const target = document.getElementById(id);
    if (!target) return;
    if (target.classList.contains('type')) {
      if (filter) { filter.value = ''; filterTypes(); }
      const detail = target.querySelector('details'); if (detail) detail.open = true;
    }
    target.scrollIntoView({block:'start', behavior:'instant'});
  }
  window.addEventListener('hashchange', revealHash);
  window.addEventListener('load', revealHash);
  revealHash();
}());
