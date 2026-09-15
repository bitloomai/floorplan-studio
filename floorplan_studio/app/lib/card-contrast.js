/**
 * Can the dashboard's room popup be READ in the colours it will be drawn in?
 *
 * The popup is painted from the app theme's `ui` tokens, which the card writes
 * onto itself as `--fps-*` custom properties (card-runtime, fpsApplyTheme).
 * Anything the card draws on its own surface has to come from one of those
 * tokens. When a rule leaned on a Home Assistant variable instead, a glass HA
 * theme made it invisible — the light dots' ring followed `--divider-color`,
 * which Frosted Glass Light sets to a faint near-white (2026-09-15) — and no
 * setting anywhere could fix it without a code release.
 *
 * With every popup colour a token, a readability problem is a registry edit.
 * This module says WHICH edit: it resolves the theme the card will use (for
 * "Follow Home Assistant", the light or dark base each of the house's HA
 * themes selects), measures each pair that has to be legible against the
 * WCAG minimum, and names the `themes` registry path that fixes a failure.
 * `preview_dashboard` and the editor's Generate dialog both report it, so a
 * problem is caught before a deploy rather than on somebody's phone.
 *
 * Pure: no I/O. The caller hands in Home Assistant's `frontend/get_themes`
 * result when it has one (ha-write.readThemes).
 */

'use strict';

/* The popup's colours. `css` is the property fpsApplyTheme writes; the suite
 * holds this list and that function together. `lampRim` is a PLAN token (the
 * lamp colour is the plan's), the rest are `ui`. */
const CARD_TOKENS = [
  { key: 'panelBg', css: '--fps-surface', label: 'Popup background' },
  { key: 'railBg', css: '--fps-surface-2', label: 'Tile and button background' },
  { key: 'ink', css: '--fps-ink', label: 'Popup text' },
  { key: 'inkSoft', css: '--fps-ink-soft', label: 'Section labels, counts and readings' },
  { key: 'panelBorder', css: '--fps-line', label: 'Tile borders, dividers and the grab bar' },
  { key: 'accent', css: '--fps-accent', label: 'A running device’s tile and the brightness slider' },
  { key: 'accentInk', css: '--fps-accent-ink', label: 'Text on a running device’s tile' },
  { key: 'swatchRing', css: '--fps-swatch-ring', label: 'The ring round a light’s colour dot' },
  { key: 'scrim', css: '--fps-scrim', label: 'The veil behind the popup, drawn at 30%' },
  { key: 'lampRim', group: 'plan', css: '--fps-lamp', label: 'A lit light’s tile and button tint, drawn at 16%' },
];

/* What has to be legible. 4.5:1 is WCAG AA for text, 3:1 for a UI mark that
 * is not text (a ring someone has to see to know a light is there). A
 * background may be a MIX: a lit light's tile is the lamp colour at 16% over
 * the tile background, which is what the stylesheet's color-mix draws. */
const PAIRS = [
  { id: 'text', label: 'Popup text', fg: 'ink', bg: 'panelBg', min: 4.5 },
  { id: 'tile-text', label: 'Tile text', fg: 'ink', bg: 'railBg', min: 4.5 },
  { id: 'soft-text', label: 'Section labels and counts', fg: 'inkSoft', bg: 'panelBg', min: 4.5 },
  { id: 'tile-reading', label: 'A reading on a tile', fg: 'inkSoft', bg: 'railBg', min: 4.5 },
  /* `fix` when the colour to move is not the foreground: white text cannot get
   * whiter, so a running tile that is too light is fixed in its blue. */
  { id: 'running-tile', label: 'Text on a running device’s tile', fg: 'accentInk', bg: 'accent', min: 4.5, fix: 'accent' },
  { id: 'lit-tile', label: 'Text on a lit light’s tile', fg: 'ink', bg: { mix: 'lampRim', amount: 0.16, over: 'railBg' }, min: 4.5 },
  { id: 'light-dot', label: 'The ring round a light’s colour dot', fg: 'swatchRing', bg: 'railBg', min: 3 },
];

/* ------------------------------------------------------------- colour maths */

function parse(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    const a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  return null;   // var(), a named colour, color-mix: not something to guess at
}

/* `top` at `alpha` (times its own alpha) over an opaque `under`. */
function blend(top, under, alpha) {
  const a = (alpha === undefined ? 1 : alpha) * (top[3] === undefined ? 1 : top[3]);
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
}

function luminance(rgb) {
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

function ratio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const hex = (rgb) => '#' + rgb.slice(0, 3).map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

/* The card decides light or dark by its inherited text colour, with this
 * weighting (card-runtime hostIsDark): bright text means a dark ground. The
 * same rule here, so the report picks the base the card will pick. */
function textIsBright(rgb) {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 > 0.55;
}

/* ------------------------------------------------------ theme resolution */

/* The theme the dashboard's cards use, exactly as fpsApplyTheme finds it. */
function dashboardTheme(themesDoc, project) {
  const themes = (themesDoc && themesDoc.themes) || {};
  const wanted = ((project || {}).dashboard || {}).theme || 'ha';
  for (const id of [wanted, (project || {}).activeTheme, (themesDoc || {}).active]) {
    if (id && themes[id]) return { id, theme: themes[id], wanted };
  }
  return { id: null, theme: {}, wanted };
}

/* Which HA theme puts the card on which base. Every theme the house has set as
 * a default, in every mode it defines. A text colour that is a var() cannot be
 * measured here, so that theme could be either — both are checked. */
function homeAssistantModes(haThemes) {
  if (!haThemes || typeof haThemes !== 'object') return null;
  const themes = haThemes.themes || {};
  const rows = [];
  const one = (name, fallbackMode, role) => {
    const t = name && themes[name];
    if (!t) {
      rows.push({ theme: name || 'Home Assistant’s own', role, mode: fallbackMode, uses: fallbackMode });
      return;
    }
    const modes = t.modes && typeof t.modes === 'object' && Object.keys(t.modes).length ? Object.keys(t.modes) : [null];
    for (const mode of modes) {
      const vars = Object.assign({}, t, mode ? t.modes[mode] : {});
      const rgb = parse(vars['primary-text-color']);
      rows.push({ theme: name, role, mode: mode || 'single', uses: rgb ? (textIsBright(rgb) ? 'dark' : 'light') : 'unknown' });
    }
  };
  one(haThemes.default_theme === 'default' ? null : haThemes.default_theme, 'light', 'default');
  if (haThemes.default_dark_theme) one(haThemes.default_dark_theme, 'dark', 'dark mode');
  return rows;
}

function tokenValue(ui, plan, key) {
  if (key === 'lampRim') return parse(plan.lampRim || plan.lampWarm);
  return parse(ui[key]);
}

/* Measure one base. `owner(key)` says which theme holds the token, so a fix
 * names the entry that actually wins. */
function measure(ui, plan, owner) {
  const problems = [];
  const unreadable = [];
  const white = [255, 255, 255, 1];
  for (const pair of PAIRS) {
    const bgRef = typeof pair.bg === 'string' ? { key: pair.bg } : pair.bg;
    const under = tokenValue(ui, plan, bgRef.over || bgRef.key);
    let bg = under && under[3] < 1 ? blend(under, white) : under;
    if (bg && bgRef.mix) {
      const top = tokenValue(ui, plan, bgRef.mix);
      bg = top ? blend(top, bg, bgRef.amount) : null;
    }
    let fg = tokenValue(ui, plan, pair.fg);
    let fallback = false;
    /* A theme saved before the ring had a token: the stylesheet draws it in the
     * soft ink at 60%, so measure that. */
    if (!fg && pair.fg === 'swatchRing') {
      const soft = tokenValue(ui, plan, 'inkSoft');
      fg = soft && bg ? blend(soft, bg, 0.6) : null;
      fallback = true;
    }
    if (!fg || !bg) { unreadable.push(pair.id); continue; }
    const r = ratio(fg[3] < 1 ? blend(fg, bg) : fg, bg);
    if (r + 1e-9 < pair.min) {
      const fixKey = fallback ? 'swatchRing' : (pair.fix || pair.fg);
      problems.push({
        pair: pair.id, label: pair.label, ratio: Math.round(r * 100) / 100, min: pair.min,
        fg: { token: pair.fg, colour: hex(fg), fallback },
        bg: { token: bgRef.mix ? `${bgRef.mix} ${Math.round(bgRef.amount * 100)}% over ${bgRef.over}` : bgRef.key, colour: hex(bg) },
        fix: { tool: 'edit_registry', name: 'themes', path: ['themes', owner(fixKey), fixKey === 'lampRim' ? 'plan' : 'ui', fixKey] },
      });
    }
  }
  const missing = CARD_TOKENS.filter((t) => (t.group === 'plan' ? !(plan.lampRim || plan.lampWarm) : ui[t.key] === undefined)).map((t) => t.key);
  return { problems, missing, unmeasured: unreadable };
}

/* The report. `haThemes` is Home Assistant's `frontend/get_themes` result, or
 * null when the app cannot reach it — then a following theme is checked on
 * both of its bases. */
function report(themesDoc, project, haThemes) {
  const doc = themesDoc || { themes: {} };
  const found = dashboardTheme(doc, project);
  const t = found.theme || {};
  const out = { theme: found.id, requested: found.wanted, follows: !!t.follows, bases: [], homeAssistant: null };
  if (!found.id) { out.note = 'No theme could be resolved; the card draws in Home Assistant’s own colours.'; return out; }

  if (!t.follows) {
    const m = measure(t.ui || {}, t.plan || {}, () => found.id);
    out.bases.push(Object.assign({ base: found.id, name: t.name || found.id, when: ['always'] }, m));
  } else {
    const rows = homeAssistantModes(haThemes);
    out.homeAssistant = rows;
    const when = { light: [], dark: [] };
    if (rows) {
      for (const r of rows) {
        const label = `${r.theme}${r.mode && r.mode !== 'single' ? ` (${r.mode})` : ''}`;
        if (r.uses === 'unknown') { when.light.push(label + ' — could not tell'); when.dark.push(label + ' — could not tell'); } else when[r.uses].push(label);
      }
    }
    for (const mode of ['light', 'dark']) {
      if (rows && !when[mode].length) continue;           // no HA theme of the house lands here
      const baseId = t.follows[mode];
      const base = (doc.themes || {})[baseId] || {};
      const ui = Object.assign({}, t.ui, base.ui);
      const plan = Object.assign({}, t.plan, base.plan);
      const owner = (key) => {
        const group = key === 'lampRim' ? 'plan' : 'ui';
        if (base[group] && base[group][key] !== undefined) return baseId;
        if (t[group] && t[group][key] !== undefined) return found.id;
        return baseId;
      };
      const m = measure(ui, plan, owner);
      out.bases.push(Object.assign({
        base: baseId, name: base.name || baseId, mode,
        when: rows ? when[mode] : [`Home Assistant in ${mode} mode`],
      }, m));
    }
  }
  out.problems = out.bases.reduce((n, b) => n + b.problems.length, 0);
  return out;
}

/* One line per problem, for a dialog or a log. */
function summarise(r) {
  if (!r || !r.bases) return [];
  const lines = [];
  for (const b of r.bases) {
    for (const p of b.problems) {
      lines.push(`${p.label}: ${p.ratio}:1, needs ${p.min}:1 in ${b.name} — themes › ${p.fix.path.slice(1).join(' › ')}`);
    }
  }
  return lines;
}

/* The help catalogue: every popup token, what it paints, and its value in each
 * shipped theme that defines `ui`. */
function reference(themesDoc) {
  const themes = Object.entries((themesDoc && themesDoc.themes) || {}).filter(([, t]) => t.ui && !t.follows);
  const head = ['| Token | What it paints | Card property |'].concat(themes.map(([, t]) => ` ${t.name || ''} |`)).join('');
  const out = [
    'Every colour the room popup draws comes from these tokens, so a colour that is hard to read is one registry edit: `edit_registry({ name: "themes", path: ["themes", "<theme>", "ui", "<token>"], value: "#rrggbb" })`, or the Theme dialog in the editor. **Follow Home Assistant** uses Frosted or Blueprint as its base, so edit the base. The dot ring and the veil are new; a theme saved before them is given the shipped values on the next start.',
    '',
    head,
    '| --- | --- | --- |' + themes.map(() => ' --- |').join(''),
  ];
  for (const tok of CARD_TOKENS) {
    const cells = themes.map(([, t]) => ` ${(tok.group === 'plan' ? (t.plan || {})[tok.key] : t.ui[tok.key]) || '—'} |`).join('');
    out.push(`| \`${tok.group === 'plan' ? 'plan.' : 'ui.'}${tok.key}\` | ${tok.label} | \`${tok.css}\` |${cells}`);
  }
  out.push('', '### What has to be readable', '',
    '`preview_dashboard` and the Generate dialog measure these against the theme the dashboard will actually use — for Follow Home Assistant, the base each of the house’s Home Assistant themes selects — and name the token to change.', '',
    '| Check | Colour | On | Minimum |', '| --- | --- | --- | --- |');
  for (const p of PAIRS) {
    const bg = typeof p.bg === 'string' ? `\`${p.bg}\`` : `\`${p.bg.mix}\` at ${Math.round(p.bg.amount * 100)}% over \`${p.bg.over}\``;
    out.push(`| ${p.label} | \`${p.fg}\` | ${bg} | ${p.min}:1 |`);
  }
  return out.join('\n');
}

module.exports = { CARD_TOKENS, PAIRS, parse, ratio, luminance, blend, homeAssistantModes, dashboardTheme, report, summarise, reference };
