/**
 * help.js — the help corpus: one source, four surfaces.
 *
 * ## Why this exists
 *
 * Help that lives in the UI cannot be read by an agent. Help that lives in
 * DOCS.md cannot be shown next to the control it describes. Help that lives in
 * both is help that disagrees with itself within a month, and the disagreement
 * is invisible because nobody reads all three copies in one sitting.
 *
 * So there is one corpus — `app/help/*.md`, one file per topic — and four
 * things read it:
 *
 *   the editor        a "?" beside each panel and dialog, showing every topic
 *                     that applies THERE, in one consolidated sheet
 *   MCP               `get_help`, so a model can ask what a control means
 *                     instead of inferring it from a key name
 *   GitHub Pages      `tools/make-docs.js` renders the same topics to a static
 *                     site, grouped by category
 *   the suite         asserts every panel has help, every library type has
 *                     help, and no topic points at something that stopped
 *                     existing
 *
 * ## Why a topic is a FILE and not a row in one big document
 *
 * One file per feature is the only arrangement where adding a feature and
 * documenting it are the same commit, and where two people editing two
 * features never touch the same lines. A single `help.json` would be a
 * merge-conflict machine and, worse, a thing nobody opens.
 *
 * ## Two layers, and the second one writes itself
 *
 * AUTHORED topics are prose — what a thing is for, why it works the way it
 * does, what people get wrong. They live in `app/help/`.
 *
 * DERIVED topics are generated from the registries at read time: every library
 * type gets one, built from its own label, group, defaults, looks and the
 * `hint` already attached to each of its props. That is what makes "every
 * fixture and every device carries help" true for all 260 of them without 260
 * hand-written files, and it is why a new type is documented the moment it is
 * added. Authored explanations supplement generated type references through
 * related links; they never replace the current looks and settings.
 *
 * ## Selectors are the join
 *
 * A topic declares where it applies (`applies:`), not the other way round. The
 * UI asks "what applies to `panel:room`" and gets an ordered sheet back. A
 * control does not have to know which topics exist, and a topic does not have
 * to know how the UI is laid out — which is what stops the two drifting.
 *
 * Selector vocabulary, and it is CLOSED so a typo is an error rather than a
 * topic that silently applies to nothing:
 *
 *   panel:<name>        an inspector panel        panel:room
 *   section:<path>      a group inside a panel    section:room.lighting
 *   field:<path>        one control               field:room.flooring
 *   dialog:<name>       a modal                   dialog:sun
 *   type:<kind>.<name>  a library type            type:device.camera
 *   shape:<name>        a furniture drawer        shape:bathtub
 *   registry:<name>     a whole registry          registry:boundaries
 *   concept:<name>      a thing to understand     concept:transmission
 *   tool:<name>         a canvas tool             tool:place
 *   topbar / canvas     the chrome
 *
 * ## Not shipped to the dashboard
 *
 * This is an EDITOR concern. `card-build.js` must never bake this file or the
 * corpus into the generated card: a Lovelace card is not a place anybody reads
 * documentation, and the bytes would be dead weight on every dashboard load.
 * The suite asserts that. Nothing here ever reaches a project document either —
 * help is about the app, not about anybody's house.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const navigation = require('./ui-navigation');

const HELP_DIR = path.join(__dirname, '..', 'help');

/* A closed vocabulary. Anything else is a typo — see the header. */
const SELECTOR_PREFIXES = [
  'panel', 'section', 'field', 'dialog', 'type', 'shape', 'registry',
  'concept', 'tool',
];
const SELECTOR_BARE = ['topbar', 'canvas'];

/* Categories order the generated site and group the editor's index. Kept short
 * on purpose: a category list long enough to need scrolling is a tag list. */
const CATEGORIES = [
  ['start', 'Getting started'],
  ['plan', 'Drawing the plan'],
  ['rooms', 'Rooms'],
  ['walls', 'Walls and openings'],
  ['library', 'The library'],
  ['light', 'Light and daylight'],
  ['controls', 'Controls and popups'],
  ['dashboard', 'The dashboard'],
  ['data', 'Projects, import and export'],
  ['reference', 'Reference'],
];
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c[0]));

/* ---------------------------------------------------------------- parsing */

/* Front matter is `key: value` between two `---` lines, and list values are
 * comma-separated. No YAML parser, because this project has no dependencies
 * and because the moment the format can express nesting, someone will nest
 * something and the corpus stops being greppable. */
function parseFrontMatter(text, where) {
  const errors = [];
  const nl = text.indexOf('\n');
  if (text.slice(0, nl).trim() !== '---') {
    return { meta: {}, body: text, errors: [`${where}: no front matter (must open with ---)`] };
  }
  const end = text.indexOf('\n---', nl);
  if (end === -1) return { meta: {}, body: text, errors: [`${where}: front matter is never closed`] };

  const meta = {};
  for (const raw of text.slice(nl + 1, end).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) { errors.push(`${where}: front-matter line is not "key: value" — ${line}`); continue; }
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key === 'tags' || key === 'applies' || key === 'see') {
      meta[key] = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
    } else if (key === 'order') {
      const n = Number(value);
      if (!Number.isFinite(n)) errors.push(`${where}: order must be a number — ${value}`);
      meta[key] = Number.isFinite(n) ? n : 50;
    } else {
      meta[key] = value;
    }
  }
  const bodyStart = text.indexOf('\n', end + 1);
  return { meta, body: bodyStart === -1 ? '' : text.slice(bodyStart + 1).replace(/^\n+/, ''), errors };
}

function validateTopic(t, where) {
  const errors = [];
  if (!t.id) errors.push(`${where}: no id`);
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(t.id)) errors.push(`${where}: id must be kebab-case — ${t.id}`);
  if (!t.title) errors.push(`${where}: no title`);
  if (!t.summary) errors.push(`${where}: no summary (it is the tooltip and the index line)`);
  if (!t.category) errors.push(`${where}: no category`);
  else if (!CATEGORY_IDS.has(t.category)) {
    errors.push(`${where}: unknown category "${t.category}" — one of ${[...CATEGORY_IDS].join(', ')}`);
  }
  if (!t.applies.length) errors.push(`${where}: applies to nothing, so nothing will ever show it`);
  for (const sel of t.applies) {
    if (SELECTOR_BARE.includes(sel)) continue;
    const prefix = sel.split(':')[0];
    if (!SELECTOR_PREFIXES.includes(prefix)) {
      errors.push(`${where}: "${sel}" is not a selector — prefix must be one of ${SELECTOR_PREFIXES.join(', ')}`);
    } else if (!sel.includes(':') || !sel.split(':')[1]) {
      errors.push(`${where}: "${sel}" has a prefix but no target`);
    }
  }
  if (!t.body.trim()) errors.push(`${where}: no body`);
  return errors;
}

/* ------------------------------------------------------------------ load */

let CACHE = null;

function loadDir(dir) {
  const topics = [];
  const errors = [];
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  } catch (e) {
    return { topics, errors: [`help directory ${dir} is not readable: ${e.message}`] };
  }
  for (const file of files) {
    const where = 'help/' + file;
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    const { meta, body, errors: fmErrors } = parseFrontMatter(raw, where);
    errors.push(...fmErrors);
    const topic = {
      id: meta.id || file.replace(/\.md$/, ''),
      title: meta.title || '',
      summary: meta.summary || '',
      category: meta.category || '',
      tags: meta.tags || [],
      applies: meta.applies || [],
      see: meta.see || [],
      order: meta.order === undefined ? 50 : meta.order,
      source: where,
      derived: false,
      body,
    };
    errors.push(...validateTopic(topic, where));
    topics.push(topic);
  }
  const seen = new Set();
  for (const t of topics) {
    if (seen.has(t.id)) errors.push(`${t.source}: duplicate id "${t.id}"`);
    seen.add(t.id);
  }
  /* A `see` pointing at a topic that no longer exists is a dead end in the UI
   * and a 404 on the site, and it is the single most likely thing to rot. */
  for (const t of topics) {
    for (const ref of t.see) if (!seen.has(ref)) errors.push(`${t.source}: see: "${ref}" does not exist`);
  }
  return { topics, errors };
}

function authored(reload) {
  if (CACHE && !reload) return CACHE;
  CACHE = loadDir(HELP_DIR);
  return CACHE;
}

/* --------------------------------------------------------------- derived */

const sentence = (s) => (s && !/[.!?]$/.test(s.trim()) ? s.trim() + '.' : (s || '').trim());

/* A look's own footprint, when it brings one. `shapes.js` is the authority and
 * is safe to load here — it has no dependencies and runs unmodified in Node. */
let SHAPES = null;
function footprintOf(shape, variant) {
  if (!shape) return '';
  if (!SHAPES) { try { SHAPES = require('./shapes'); } catch (e) { SHAPES = false; } }
  if (!SHAPES || !SHAPES.furnitureVariantSize) return '';
  const size = SHAPES.furnitureVariantSize(shape, variant);
  return size ? `${size[0]} × ${size[1]} ft` : '';
}

/* What a control accepts, for a prop with no hand-written hint. Terse on
 * purpose: this is the line that stops "Rotation (deg)" being the whole of what
 * anyone is told about rotation. */
function describeProp(p, defaults) {
  const bits = [];
  if (p.type === 'select' && Array.isArray(p.options)) {
    bits.push('one of ' + p.options.map((o) => '`' + (o && o.value !== undefined ? o.value : o) + '`').join(', '));
  } else if (p.type === 'number') {
    const range = [p.min, p.max].every((n) => n !== undefined) ? `${p.min} to ${p.max}` : null;
    bits.push('a number' + (range ? ` (${range})` : '') + (p.step ? `, in steps of ${p.step}` : ''));
  } else if (p.type === 'boolean') {
    bits.push('on or off');
  } else if (p.type) {
    bits.push(p.type);
  }
  const dflt = (defaults || {})[p.key];
  if (dflt !== undefined && dflt !== null && typeof dflt !== 'object') bits.push(`default \`${dflt}\``);
  if (p.spec && p.spec !== true) bits.push(`measured in ${p.spec}`);
  if (p.advanced) bits.push('shown under **Advanced**');
  return bits.length ? sentence(bits.join('; ')) : '';
}

/* One topic per library type, built out of what the registry already says.
 *
 * Everything here is a restatement of the type's own record — its label, its
 * group, the looks it offers, and the `hint` already written on each prop — so
 * it cannot drift from the thing it documents: there is nothing to keep in
 * step, because there is only one copy. */
function deriveType(key, type, library) {
  library = library || { categories: [] };
  const [kind, name] = key.includes('.') ? key.split('.') : ['', key];
  const r = type.render || {};
  const d = type.defaults || {};
  const props = type.props || [];
  const looks = navigation.looks(type);
  const out = [];

  out.push(`**${type.label || name}** is a \`${kind || 'library'}\` type`
    + (type.group ? ` in the **${type.group}** collection` : '') + '.');

  if (r.cone) {
    out.push(`It can draw a **${r.cone.style || 'coverage'} cone** — what it reaches. `
      + `It defaults ${d.cone === false ? 'off' : 'on'}; the house or floor Coverage switch must also be enabled.`);
  }
  if (r.bindable) out.push('It can be bound to an entity and react to that entity\'s state.');

  /* Every option gets its own LINE, never a comma-run inside a sentence.
   *
   * "Five to choose from: alcove, corner, freestanding, jacuzzi, shower_bath"
   * is a paragraph you have to parse; a list is one you can scan, and it is the
   * only shape that leaves room to say what each option actually does — the
   * footprint it brings, the range it accepts, what it is for. The same applies
   * to the settings below. Density is not the goal; being answerable at a
   * glance is. */
  if (looks.length) {
    out.push('', '### Looks', '',
      'A look is a different drawing rather than a restyling, and several bring their own'
      + ' footprint — choosing one on an item still at its default size resizes it to'
      + ' something true.', '');
    out.push(accessMarkdown(navigation.forType(key, type, library, { key: 'variant', label: 'Look' })), '');
    for (const o of looks) {
      const value = o && o.value !== undefined ? o.value : o;
      const label = o && o.label ? o.label : null;
      const size = footprintOf(r.shape, value);
      const notes = [label, size].filter(Boolean).join(' · ');
      out.push(`- \`${value}\`${notes ? ' — ' + notes : ''}`);
    }
  }

  const sized = ['w', 'h'].every((k) => d[k] !== undefined);
  if (sized) out.push('', `Default footprint **${d.w} × ${d.h} ft**.`);

  /* `variant` is excluded from the settings list: the Looks section above IS
   * its documentation, and listing it twice reads as two different controls. */
  const settings = props.filter((p) => p.key !== 'variant' || !looks.length);
  if (settings.length) {
    out.push('', '### Settings', '');
    for (const p of settings) {
      const said = [sentence(p.hint), describeProp(p, d)].filter(Boolean).join(' ');
      const access = navigation.forType(key, type, library, p);
      out.push(`- **${p.label || p.key}** (\`${p.key}\`)${said ? ' — ' + said : ''} ${accessMarkdown(access)}`);
    }
  }

  return {
    id: 'type-' + key.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
    title: type.label || name,
    summary: `${type.label || name} — ${kind} type \`${key}\``
      + (type.group ? `, in ${type.group}` : '') + '.',
    category: 'library',
    tags: [kind, type.group, r.shape, r.family, looks.length ? 'variant' : null].filter(Boolean).map((s) => String(s).toLowerCase()),
    applies: ['type:' + key].concat(r.shape ? ['shape:' + r.shape] : []),
    see: [],
    order: 60,
    source: 'derived from the library registry',
    derived: true,
    typeKey: key,
    navigation: [navigation.forType(key, type, library)],
    body: out.join('\n'),
  };
}

function accessMarkdown(route) {
  return '**Find it:** ' + route.steps.map((s) => s.label).join(' → ') + '.'
    + (route.requirements?.length ? ' ' + route.requirements.join(' ') : '')
    + (route.advanced && !route.requirements?.length ? ' Enable Advanced in the top bar.' : '');
}

function navigationMarkdown(topic) {
  const routes = topic.navigation || [];
  if (!routes.length) return '';
  return '### How to access\n\n' + routes.map((r) => {
    const instructions = [r.instruction, ...r.steps.map((s) => s.instruction)].filter(Boolean);
    return '- ' + accessMarkdown(r) + (instructions.length ? ' ' + instructions.join(' ') : '');
  }).join('\n') + '\n\n';
}

function topicBody(topic) { return navigationMarkdown(topic) + topic.body; }

/* -------------------------------------------------------------- the API */

function corpus(library, opts) {
  const loaded = authored((opts || {}).reload);
  const errors = loaded.errors.slice();
  const topics = loaded.topics.map((t) => Object.assign({}, t, { navigation: navigation.forSelectors(t.applies) }));
  const all = topics.slice();

  /* Conceptual prose supplements the generated reference. Replacing it erased
   * stairs and lifts from the type catalogue and hid their current settings. */
  if (library && library.types) {
    for (const [key, type] of Object.entries(library.types)) {
      const derived = deriveType(key, type, library);
      derived.see = topics.filter((t) => t.applies.includes('type:' + key)).map((t) => t.id);
      all.push(derived);
    }
  }
  for (const t of topics) {
    const keys = t.applies.filter((s) => s.startsWith('type:')).map((s) => s.slice(5));
    if (keys.length && library?.types) t.navigation = keys.filter((k) => library.types[k]).map((k) => navigation.forType(k, library.types[k], library));
    if (t.applies.includes('concept:audit')) t.navigation = [{ id: 'audit-command', steps: [{ label: 'Repository terminal' }, { label: 'node tools/audit-plan.js path.project.json' }], instruction: 'This diagnostic is a command-line tool; it is not an editor button.' }];
  }
  const byId = new Map(all.map((t) => [t.id, t]));
  if (byId.size !== all.length) errors.push('Help topic ids must be unique, including generated type ids.');
  return { all, byId, errors };
}

function matches(topic, selector) {
  if (topic.applies.includes(selector)) return true;
  /* `section:room.lighting` is answered by anything applying to `panel:room`
   * only when asked for explicitly; but a topic on `section:room.lighting` DOES
   * answer a request for `panel:room`, because a panel contains its sections.
   * The containment runs one way, which is what keeps a section sheet tight
   * and a panel sheet complete. */
  const [kind, target] = selector.split(':');
  if (kind !== 'panel' || !target) return false;
  return topic.applies.some((s) => s.startsWith('section:' + target + '.')
    || s.startsWith('field:' + target + '.'));
}

function sheet(selectors, library, opts) {
  const { all, errors } = corpus(library, opts);
  const wanted = Array.isArray(selectors) ? selectors : [selectors];
  const hit = new Map();
  for (const sel of wanted) {
    for (const t of all) if (matches(t, sel)) hit.set(t.id, t);
  }
  const list = [...hit.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return { selectors: wanted, topics: list, errors };
}

function search(q, library) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return [];
  const { all } = corpus(library);
  const score = (t) => {
    const haystack = [t.title, t.id, t.summary, ...t.tags, t.body, navigationMarkdown(t)].join(' ').toLowerCase();
    if (!needle.split(/\s+/).every((word) => haystack.includes(word))) return 0;
    let s = 0;
    if (t.title.toLowerCase().includes(needle)) s += 10;
    if (t.id.includes(needle)) s += 8;
    if (t.summary.toLowerCase().includes(needle)) s += 4;
    if (t.tags.some((g) => g.includes(needle))) s += 3;
    if (t.body.toLowerCase().includes(needle)) s += 1;
    return s || 1;
  };
  return all.map((t) => [score(t), t]).filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0] || a[1].title.localeCompare(b[1].title))
    .map(([, t]) => t);
}

/* --------------------------------------------------- markdown, minimally */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Inline: code is pulled out FIRST and put back LAST, so nothing inside
 * backticks is touched by the emphasis or link passes — `**not bold**` inside
 * a code span has to survive exactly as typed.
 *
 * The placeholder is a control character BUILT AT RUNTIME rather than written
 * as an escape. Two reasons, and the second one cost this file a rewrite: the
 * obvious " 0 " marker collides with any real digit in the prose, and a literal
 * control escape in source does not reliably survive being written to disk —
 * it lands as a raw byte and turns the whole module binary to git and grep.
 * String.fromCharCode needs no escape and cannot be mangled in transit.
 *
 * It cannot collide with the input either: the text was HTML-escaped one line
 * earlier, and escaping does not emit control characters. */
const MARK = String.fromCharCode(1);
function inline(s) {
  const code = [];
  let out = esc(s).replace(/`([^`]+)`/g, (_, c) => MARK + (code.push(c) - 1) + MARK);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => {
    if (!/^(https?:\/\/|#[a-z0-9-]|[a-z0-9-]+\.html(?:#|$))/i.test(href)) return t;
    return `<a href="${href}">${t}</a>`;
  });
  return out.replace(new RegExp(MARK + '(\\d+)' + MARK, 'g'), (_, i) => `<code>${code[Number(i)]}</code>`);
}

/* Enough markdown for help text and no more: headings, paragraphs, lists,
 * tables, fenced code and rules. A fuller renderer would be a dependency, and
 * the corpus is written to this subset on purpose. */
function toHtml(md) {
  const lines = String(md || '').split('\n');
  const out = [];
  let i = 0;
  const flushList = (tag, items) => out.push(`<${tag}>` + items.map((x) => `<li>${inline(x)}</li>`).join('') + `</${tag}>`);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }
    const head = /^(#{1,6})\s+(.*)$/.exec(line);
    if (head) { const n = head[1].length; out.push(`<h${n}>${inline(head[2])}</h${n}>`); i++; continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { out.push('<hr>'); i++; continue; }

    if (/^\s*\|/.test(line) && /^\s*\|[-\s|:]+\|?\s*$/.test(lines[i + 1] || '')) {
      const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head2 = row(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(row(lines[i++]));
      out.push('<table><thead><tr>' + head2.map((c) => `<th>${inline(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>');
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      flushList('ul', items);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      flushList('ol', items);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push('<blockquote>' + inline(buf.join(' ')) + '</blockquote>');
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*([-*]\s|\d+\.\s|#{1,6}\s|\||>)/.test(lines[i])
      && !lines[i].startsWith('```')) para.push(lines[i++]);
    out.push('<p>' + inline(para.join(' ')) + '</p>');
  }
  return out.join('\n');
}

module.exports = {
  HELP_DIR, CATEGORIES, SELECTOR_PREFIXES, SELECTOR_BARE,
  parseFrontMatter, loadDir, corpus, sheet, search, deriveType, toHtml, topicBody, navigationMarkdown,
  /* The editor asks for these two together on every "?" click. */
  sheetHtml(selectors, library, opts) {
    const s = opts?.id ? { selectors: [], topics: [corpus(library).byId.get(opts.id)].filter(Boolean) } : sheet(selectors, library, opts);
    return {
      selectors: s.selectors,
      topics: s.topics.map((t) => ({
        id: t.id, title: t.title, summary: t.summary, category: t.category,
        tags: t.tags, derived: t.derived, see: t.see, navigation: t.navigation, html: toHtml(topicBody(t)),
      })),
    };
  },
  categories() { return CATEGORIES.map(([id, label]) => ({ id, label })); },
  validate(library) {
    const { all, errors } = corpus(library, { reload: true });
    return { ok: errors.length === 0, errors, count: all.length };
  },
};
