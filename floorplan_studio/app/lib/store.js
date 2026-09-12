/**
 * Persistence. Six documents live side by side in the app's /data volume:
 * the project (all floors) and the five registries it reads — library, themes,
 * flooring, boundaries and popup layout. Each is seeded
 * from app/defaults/ the first time the app runs and is user-owned after
 * that — a later app update never overwrites an edited library or theme.
 *
 * Writes are atomic (tmp file + rename) because the editor autosaves, and a
 * half-written project.json would lose the whole house.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const VERSION = '0.0.1';
const DEFAULTS_DIR = path.join(__dirname, '..', 'defaults');
const DATA_DIR = process.env.FPS_DATA_DIR || path.join(__dirname, '..', 'data');
const registryListeners = new Set();

/* Whoever else changed the project — a human's autosave, or an MCP tool call
 * from an AI driving the plan — the editor's live view needs to know a new
 * copy is on disk, without polling. One in-process pub/sub, subscribed to by
 * the SSE endpoint in server.js; nothing here knows or cares who is listening.
 *
 * `origin` is WHO wrote it, when the caller knows: an opaque id the editor
 * sends with its own save. It is carried through untouched so a listener can
 * tell its own write from somebody else's — without it, the editor's own
 * autosave comes straight back at it as "the plan changed elsewhere", which
 * is both wrong and the one message guaranteed to make someone distrust the
 * tool with unsaved work in it. A writer that names no origin (MCP) is
 * genuinely somebody else and every listener hears about it. */
const changeListeners = new Set();
function onProjectChange(fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); }
function notifyProjectChange(project, origin) {
  for (const fn of changeListeners) { try { fn(project, origin || null); } catch (e) { /* one bad listener must not break the rest */ } }
}

const FILES = {
  project: 'project.json',
  library: 'library.json',
  themes: 'themes.json',
  flooring: 'flooring.json',
  boundaries: 'boundaries.json',
  controls: 'controls.json',
};

/* An earlier version called this popup.json and held only one design. If a
 * user's data dir still has it, seed controls.json from it rather than handing
 * them the shipped default and losing their configuration. */
const LEGACY_RENAMES = { controls: 'popup.json' };

async function readDeploymentHistory() {
  try { return JSON.parse(await fsp.readFile(path.join(DATA_DIR, 'project-deployments.json'), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}
async function deploymentTime(id) {
  const history = await readDeploymentHistory();
  return Object.prototype.hasOwnProperty.call(history, id) ? history[id] : null;
}

function emptyProject() {
  return {
    schemaVersion: 1,
    id: 'house',
    name: 'My House',
    units: 'ft',
    ppf: 22,
    origin: [34, 34],
    activeTheme: 'frosted',
    compass: {
      // Screen direction -> compass bearing. Defaults to the intuitive
      // "up = north". Imported plans may be rotated, which is exactly the sort
      // of thing that should be a setting rather than tribal knowledge. The
      // editor prints the resolved words next to every edge.
      up: 'N', right: 'E', down: 'S', left: 'W',
    },
    floors: [],
    savedAt: null,
  };
}

async function ensureFile(key) {
  const target = path.join(DATA_DIR, FILES[key]);
  if (fs.existsSync(target)) return target;
  const oldName = LEGACY_RENAMES[key] && path.join(DATA_DIR, LEGACY_RENAMES[key]);
  if (oldName && fs.existsSync(oldName)) {
    await fsp.copyFile(oldName, target);
    console.log('[floorplan-studio] migrated ' + LEGACY_RENAMES[key] + ' -> ' + FILES[key]);
    return target;
  }
  const seed = path.join(DEFAULTS_DIR, FILES[key]);
  if (fs.existsSync(seed)) {
    await fsp.copyFile(seed, target);
  } else {
    await writeAtomic(target, emptyProject());
  }
  return target;
}

/* A counter, so two writes to the SAME file from this process cannot pick the
 * same temp path. Keyed on the pid alone they did: both wrote
 * `project.json.tmp-<pid>`, the first rename moved it, and the second failed
 * with ENOENT — surfacing as a 500 from an ordinary save. Rare, because it
 * needs two writes genuinely in flight together (an autosave landing while an
 * MCP call writes, say), and silent when it happened. */
let tmpSeq = 0;

/* One queue per file, so two writes to the SAME document never overlap.
 *
 * The unique temp name above stops them choosing the same scratch path, but it
 * does not stop two renames landing on one target at once — which on Windows
 * fails with EPERM rather than ENOENT, because a rename onto a file another
 * handle is touching is simply not permitted. Both are the same underlying
 * mistake: a document being replaced is not a thing two callers can do at once.
 *
 * Queueing is the whole fix, and it is cheap: writes to DIFFERENT documents
 * still run in parallel, and the queue for one document is almost always empty
 * — it exists for the case that actually happens, an editor autosave landing at
 * the same moment an MCP call writes. The chain never rejects, so one failed
 * write cannot wedge every write after it. */
const writeQueues = new Map();

/* Run `fn` after everything already queued for this file. The chain is kept
 * rejection-free so one failed write cannot wedge every write behind it. */
function enqueue(file, fn) {
  const queued = (writeQueues.get(file) || Promise.resolve()).then(fn, fn);
  writeQueues.set(file, queued.catch(() => {}));
  return queued;
}

async function rawWriteAtomic(file, obj) {
  const tmp = `${file}.tmp-${process.pid}-${++tmpSeq}`;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  try {
    await fsp.rename(tmp, file);
  } catch (e) {
    /* Never leave the temp behind for someone to find and wonder about. */
    await fsp.unlink(tmp).catch(() => {});
    throw e;
  }
  return obj;
}

function writeAtomic(file, obj) {
  return enqueue(file, () => rawWriteAtomic(file, obj));
}

/* Fill in top-level keys a document gained after it was written.
 *
 * A migrated or hand-edited registry can predate a feature — an old popup.json
 * has no `designs` at all, and silently handing that to the editor leaves it
 * with no surfaces to choose from. Merge the shipped default's missing keys in
 * rather than overwriting the user's own, which would throw their config away
 * to fix a gap. */
function upgradeDoc(key, doc) {
  const seed = path.join(DEFAULTS_DIR, FILES[key]);
  if (!fs.existsSync(seed) || !doc || typeof doc !== 'object') return doc;
  let fresh;
  try { fresh = JSON.parse(fs.readFileSync(seed, 'utf8')); } catch { return doc; }
  let added = [];
  if (key === 'themes') {
    for (const [id, theme] of Object.entries(doc.themes || {})) for (const token of ['annotationPin','annotationInk']) {
      if (theme.plan && theme.plan[token] === undefined && fresh.themes?.[id]?.plan?.[token] !== undefined) {
        theme.plan[token] = fresh.themes[id].plan[token]; added.push(id + '.' + token);
      }
    }
  }
  if (key === 'library') {
    added.push(...renameLibraryTypes(doc, fresh));
    /* This was a shipped semantic error, not a style preference: the one
     * entry claimed to be both a bicycle and a scooter while drawing neither
     * well. Preserve a user's custom label, but migrate the exact old stock
     * wording now that scooter and motorcycle have their own types. */
    const bike = doc.types && doc.types['furniture.bike'];
    if (bike && bike.label === 'Bike / scooter') { bike.label = 'Bicycle'; added.push('furniture.bike.label'); }
    added.push(...migrateStockFurnitureShapes(doc));
    added.push(...migrateStockFanDefaults(doc, fresh));
  }
  for (const k of Object.keys(fresh)) {
    if (doc[k] === undefined) { doc[k] = fresh[k]; added.push(k); }
  }
  // Stock sections added since: append the ones this document has never seen,
  // disabled where the shipped default has them disabled.
  if (key === 'controls' && doc.default && Array.isArray(doc.default.sections) && fresh.default) {
    const have = new Set(doc.default.sections.map((x) => x.id));
    for (const sec of fresh.default.sections || []) {
      if (!have.has(sec.id)) { doc.default.sections.push(sec); added.push('section:' + sec.id); }
    }
  }
  /* The framework used to ship a "Do not disturb" header button and a `roles`
   * table naming six of one house's concepts. Both were a mistake: what an
   * entity MEANS belongs to the house, not to the builder. A saved document
   * written before that correction still carries them, so they are removed
   * here — the same behaviour now comes from a shortcut the user writes, and
   * leaving the old button in place shows it twice.
   *
   * This is the one upgrade step that DELETES rather than fills in, which is
   * why it names exactly what it removes and touches nothing else. */
  if (key === 'controls') {
    if (doc.roles) { delete doc.roles; added.push('-roles'); }
    if (doc.actions && doc.domainActions === undefined && doc.actions.byDomain) {
      doc.domainActions = doc.actions;
      delete doc.actions;
      added.push('actions -> domainActions');
    }
    const dropStockDnd = (buttons) => {
      if (!Array.isArray(buttons)) return;
      const i = buttons.findIndex((b) => b && b.id === 'dnd' && (b.target === '@dnd' || b.target === undefined));
      if (i >= 0) { buttons.splice(i, 1); added.push('-header:dnd'); }
    };
    dropStockDnd(doc.default && doc.default.header && doc.default.header.buttons);
    for (const p of Object.values(doc.presets || {})) dropStockDnd(p.header && p.header.buttons);
  }
  // A category is a palette heading, and a type whose category nothing declares
  // is a type nobody can find. Categories are an ARRAY (they are ordered), so
  // they need their own merge rather than the object one below.
  if (Array.isArray(fresh.categories) && Array.isArray(doc.categories)) {
    const have = new Set(doc.categories.map((c) => c && c.id));
    for (const c of fresh.categories) {
      if (c && !have.has(c.id)) { doc.categories.push(c); added.push('category:' + c.id); }
    }
  }
  // The action registry gains domains the same way, so a saved controls.json
  // learns what to do with a helper domain that shipped after it was written.
  if (key === 'controls' && fresh.domainActions && doc.domainActions && doc.domainActions.byDomain) {
    for (const [d, spec] of Object.entries(fresh.domainActions.byDomain || {})) {
      if (doc.domainActions.byDomain[d] === undefined) {
        doc.domainActions.byDomain[d] = spec;
        added.push('domainAction:' + d);
      }
    }
  }
  // Named collections gain entries too — a document written before a preset
  // or a theme shipped should still offer it. Existing keys are never touched.
  for (const coll of ['presets', 'designs', 'types', 'themes', 'openingTypes', 'aliases']) {
    if (!fresh[coll] || typeof fresh[coll] !== 'object' || Array.isArray(fresh[coll])) continue;
    if (!doc[coll] || typeof doc[coll] !== 'object') continue;
    for (const [k, v] of Object.entries(fresh[coll])) {
      if (doc[coll][k] === undefined) { doc[coll][k] = v; added.push(coll + ':' + k); }
    }
  }
  if (key === 'library') added.push(...fillTypeGaps(doc, fresh));
  if (key === 'flooring') {
    added.push(...fillFlooringReflectance(doc, fresh));
    added.push(...migrateStockGroundFinishes(doc, fresh));
    // An existing options table must learn new generators and fields as well
    // as new finishes; otherwise an upgrade can draw them but cannot edit them.
    for (const [generator, specs] of Object.entries(fresh.generatorOptions || {})) {
      if (doc.generatorOptions[generator] === undefined) {
        doc.generatorOptions[generator] = specs;
        added.push('generatorOptions:' + generator);
      } else if (Array.isArray(doc.generatorOptions[generator])) {
        const have = new Set(doc.generatorOptions[generator].map((s) => s.key));
        for (const spec of specs) if (!have.has(spec.key)) {
          doc.generatorOptions[generator].push(spec);
          added.push(generator + '.' + spec.key);
        }
      }
    }
  }
  // A schema rename touches every entry in the document, and 250 comma-separated
  // notes in the app log is not a report, it is a wall. Name the first few
  // and count the rest.
  if (added.length) {
    const shown = added.slice(0, 8).join(', ');
    console.log(`[floorplan-studio] ${FILES[key]}: filled in ${shown}`
      + (added.length > 8 ? ` and ${added.length - 8} more` : ''));
  }
  return doc;
}

/* A saved flooring document written before `reflectance` existed keeps its
 * original entries forever: the merge above adds new TYPES a document has
 * never seen, and `fillTypeGaps` — the step that tops up fields on entries
 * that already exist — has only ever run for the library.
 *
 * That is not cosmetic. `lighting.js` reads reflectance as the share of light
 * a floor throws back, and a type that omits it reflects NOTHING, so every
 * room standing on one of those finishes was quietly credited zero floor
 * bounce while the shipped default said 0.35 or 0.65. Nothing reports it: the
 * plan just renders a little darker than the model intended, which is exactly
 * the "declared, documented, read as absent" failure this codebase keeps
 * finding in its own registries.
 *
 * Deliberately narrow. Only `reflectance`, only where the entry does not have
 * one at all, and only for a key the shipped defaults still carry — a value
 * the user has set, including a deliberate 0, is defined and therefore never
 * touched, and a finish they invented is left alone entirely. */
function fillFlooringReflectance(doc, fresh) {
  const notes = [];
  if (!doc.types || typeof doc.types !== 'object') return notes;
  for (const [key, type] of Object.entries(doc.types)) {
    if (!type || typeof type !== 'object' || type.reflectance !== undefined) continue;
    const shipped = fresh.types && fresh.types[key];
    if (!shipped || shipped.reflectance === undefined) continue;
    type.reflectance = shipped.reflectance;
    notes.push(key + '.reflectance');
  }
  return notes;
}

/* Bare soil and cobblestone shipped pointing at the wrong generator: soil was
 * drawn by `speckle` (a scatter of dots, which on earth colours reads as a
 * flat panel with the plan grid ruled over it) and cobblestone by an ungraded
 * `gravel` with no stone size, so its setts came out the size of grit. Both
 * generators now draw a real surface, but a materialised `flooring.json` keeps
 * whatever it saved: the merge above only ever ADDS entries, so an install
 * that has run once would have kept the old drawing forever. That is the same
 * "declared, documented, read as absent" trap `fillFlooringReflectance` exists
 * for, one level up — the finish is still there, it is simply drawn by the
 * generator it was given before a better one existed.
 *
 * Grass also needs a material colour: the old outdoor-background token is
 * nearly white in light themes and navy in dark ones.
 * Migrate only the old stock generator and options, regardless of JSON key
 * order. A colour, a density or a
 * generator the user chose is theirs and is never touched. */
function migrateStockGroundFinishes(doc, fresh) {
  const notes = [];
  if (!doc.types || typeof doc.types !== 'object' || !fresh.types) return notes;
  const stock = [
    { key: 'soil', was: { generator: 'speckle', options: { color: '#6b4a35', density: 130 } } },
    { key: 'cobble', was: { generator: 'gravel', options: { color: '#b9b6ae', density: 300 } } },
    { key: 'grass', was: { generator: 'grass', options: { color: '@floorOutdoor', density: 110 } } },
  ];
  for (const { key, was } of stock) {
    const type = doc.types[key], shipped = fresh.types[key];
    if (!type || !shipped || type.generator !== was.generator) continue;
    const options = type.options || {};
    if (Object.keys(options).length !== Object.keys(was.options).length
        || Object.entries(was.options).some(([k, v]) => options[k] !== v)) continue;
    type.generator = shipped.generator;
    type.options = JSON.parse(JSON.stringify(shipped.options));
    notes.push(key + '.generator');
  }
  return notes;
}

/* Fan scale is a presentation default, not a claim that the blades are only
 * two feet across: a real four-foot footprint dominated ordinary room plans.
 * Migrate only the exact old stock values. A user-edited default or a curated
 * subset/order of looks remains theirs. */
function migrateStockFanDefaults(doc, fresh) {
  const notes = [];
  if (!doc.types || typeof doc.types !== 'object') return notes;
  const fan = doc.types['device.fan'];
  const freshFan = fresh.types && fresh.types['device.fan'];
  if (fan && freshFan && fan.label === 'Ceiling fan'
      && fan.render && fan.render.family === 'fan'
      && fan.render.resize && fan.render.resize.prop === 'sweep'
      && fan.defaults && fan.defaults.sweep === 4) {
    fan.defaults.sweep = freshFan.defaults.sweep;
    notes.push('device.fan.defaults.sweep');
  }

  const oldLooks = ['blades3', 'blades4', 'blades5', 'slim', 'caged'];
  for (const [id, type] of Object.entries(doc.types)) {
    if (!type || !type.render || type.render.family !== 'fan' || !Array.isArray(type.props)) continue;
    const look = type.props.find((p) => p && p.key === 'variant');
    const freshType = fresh.types && fresh.types[id];
    const freshLook = freshType && Array.isArray(freshType.props)
      ? freshType.props.find((p) => p && p.key === 'variant') : null;
    if (look && freshLook && JSON.stringify(look.options) === JSON.stringify(oldLooks)) {
      look.options = JSON.parse(JSON.stringify(freshLook.options));
      notes.push(`${id}.props:variant.options`);
    }
  }
  return notes;
}

/* These entries shipped with a semantically wrong shared silhouette. Migrate
 * only the exact old stock mapping: a user who deliberately assigned another
 * shape keeps it, while an untouched saved library receives the corrected
 * top-down footprint on its next read. */
function migrateStockFurnitureShapes(doc) {
  const notes = [];
  const fixes = {
    'furniture.oven': ['appliance', 'oven'],
    'furniture.microwave': ['appliance', 'microwave'],
    'furniture.bunk': ['bed', 'bunk'],
    'furniture.sectional': ['sofa', 'sectional'],
    'furniture.bidet': ['wc', 'bidet'],
    'furniture.garden_bed': ['lawn', 'garden_bed'],
    'furniture.hedge': ['lawn', 'hedge'],
    'furniture.fountain': ['pond', 'fountain'],
    'furniture.gazebo': ['pergola', 'gazebo'],
    'furniture.deck_chair': ['bench', 'deck_chair'],
    'furniture.hammock': ['bench', 'hammock'],
    'furniture.swing_set': ['pergola', 'swing_set'],
    'furniture.slide': ['stairs', 'slide'],
    'furniture.trampoline': ['table_round', 'trampoline'],
    'furniture.fire_pit': ['table_round', 'fire_pit'],
    'furniture.parasol': ['table_round', 'parasol'],
    'furniture.statue': ['table_round', 'statue'],
    'furniture.greenhouse': ['shed', 'greenhouse'],
    'furniture.dog_house': ['shed', 'dog_house'],
    'furniture.bird_bath': ['table_round', 'bird_bath'],
    'furniture.gym_bench': ['bench', 'gym_bench'],
    'furniture.table_tennis': ['pool_table', 'table_tennis'],
    'furniture.recliner': ['armchair', 'recliner'],
    'furniture.aquarium': ['mirror', 'aquarium'],
    'furniture.ironing_board': ['desk', 'ironing_board'],
    'furniture.changing_table': ['counter', 'changing_table'],
    'furniture.dressing_table': ['desk', 'dressing_table'],
    'furniture.console_table': ['desk', 'console_table'],
    'furniture.bar_counter': ['counter', 'bar_counter'],
    'furniture.kitchen_trolley': ['counter', 'kitchen_trolley'],
    'furniture.wine_rack': ['rack', 'wine_rack'],
    'furniture.filing_cabinet': ['rack', 'filing_cabinet'],
    'furniture.sump': ['water', 'sump'],
    'furniture.septic': ['water', 'septic'],
    'furniture.generator_set': ['appliance', 'generator_set'],
    'furniture.ups_rack': ['rack', 'ups_rack'],
    'furniture.boiler_unit': ['appliance', 'boiler_unit'],
    'furniture.softener_unit': ['appliance', 'softener_unit'],
    'furniture.workbench': ['counter', 'workbench'],
  };
  for (const [id, [oldShape, newShape]] of Object.entries(fixes)) {
    const type = doc.types && doc.types[id];
    if (type && type.render && type.render.shape === oldShape) {
      type.render.shape = newShape;
      notes.push(`${id}.shape`);
    }
  }
  return notes;
}

/* Library keys became `<kind>.<name>` in schema 3.
 *
 * Filling in the new keys without removing the old ones would leave the palette
 * showing every type twice, so this runs FIRST: the saved entry moves to its new
 * name, keeping whatever the user changed about it, and only then does the
 * regular "add what is missing" pass run. A bare name that two kinds claim
 * (`solar`, `water`) has no alias by design, and the device is the one that
 * historically won that lookup, so that is where it goes — noisily. */
function renameLibraryTypes(doc, fresh) {
  const notes = [];
  if (!doc.types || typeof doc.types !== 'object') return notes;
  const aliases = fresh.aliases || {};
  /* Bare names two kinds now claim, mapped to the one that historically won the
   * lookup — a saved document written before the second claimant existed meant
   * this one. `counter` joined the list when the logic layer arrived: a kitchen
   * worktop and a counter helper are both "counter", and a plan that predates
   * helpers can only have meant the worktop. */
  const AMBIGUOUS = { solar: 'device.solar', water: 'device.water', counter: 'furniture.counter' };
  for (const bare of Object.keys(doc.types)) {
    if (fresh.types[bare]) continue;                 // still a real key
    const target = aliases[bare] || AMBIGUOUS[bare];
    if (!target || !fresh.types[target]) continue;   // genuinely the user's own type
    if (doc.types[target] === undefined) doc.types[target] = doc.types[bare];
    delete doc.types[bare];
    notes.push(`renamed ${bare} -> ${target}`);
  }
  return notes;
}

/* An existing type entry gains what it lacks, one level deeper than the
 * top-level pass: a `fixture.spot` saved before wattage existed should end up
 * with the watt/count/efficacy props without losing the colour the user set on
 * it. Same rule throughout — never overwrite, only fill. `props` is keyed by
 * `key` rather than by position, because appending by index would duplicate
 * every prop the moment the shipped order changed. */
/* Old prop key -> the key that replaced it. Dropped from a saved library only
 * when the shipped one carries the replacement and no longer carries the old
 * name, so this can never delete something a user still relies on. */
const RETIRED_PROPS = { hit_rect: 'hitRect' };

function fillTypeGaps(doc, fresh) {
  const notes = [];
  if (!doc.types || typeof doc.types !== 'object') return notes;
  for (const [k, freshType] of Object.entries(fresh.types || {})) {
    const mine = doc.types[k];
    if (!mine || typeof mine !== 'object') continue;
    for (const [field, value] of Object.entries(freshType)) {
      if (field === 'props') {
        if (!Array.isArray(value)) continue;
        if (!Array.isArray(mine.props)) { mine.props = JSON.parse(JSON.stringify(value)); notes.push(`${k}.props`); continue; }
        const have = new Map(mine.props.map((p) => [p && p.key, p]));
        for (const p of value) {
          if (!p) continue;
          const existing = have.get(p.key);
          if (!existing) { mine.props.push(JSON.parse(JSON.stringify(p))); notes.push(`${k}.props:${p.key}`); continue; }
          /* A prop the document already has still needs the DESCRIPTIVE fields
           * the shipped one has since gained — `spec`, `advanced`, `hint`, and
           * the option list a picker is built from. This is the same gap
           * `fillFlooringReflectance` exists for, one level down: adding whole
           * props worked, topping up a prop already present did not, so a
           * long-lived install kept a `variant` list that predates half the
           * looks the renderer draws and showed every fine-tuning number in the
           * default panel because nothing there was ever marked advanced.
           *
           * Only fields that are ABSENT are filled, so anything edited in the
           * library editor stands. `options` is the one exception worth naming:
           * it is topped up by MEMBERSHIP rather than replaced, because a list
           * somebody curated is theirs but a look the renderer can draw and the
           * picker never offers is simply unreachable. */
          for (const f of ['spec', 'advanced', 'hint', 'label', 'type', 'min', 'max', 'step', 'domains', 'noun', 'variantFamily']) {
            if (p[f] !== undefined && existing[f] === undefined) { existing[f] = JSON.parse(JSON.stringify(p[f])); notes.push(`${k}.props:${p.key}.${f}`); }
          }
          if (Array.isArray(p.options) && Array.isArray(existing.options)) {
            const seen = new Set(existing.options.map((o) => (o && typeof o === 'object' ? o.value : o)));
            for (const o of p.options) {
              const v = o && typeof o === 'object' ? o.value : o;
              if (!seen.has(v)) { existing.options.push(JSON.parse(JSON.stringify(o))); notes.push(`${k}.props:${p.key}.options:${v}`); }
            }
          }
        }
        /* A prop the shipped library has RENAMED leaves its old self behind
         * forever otherwise. `hit_rect` is the case that proved it: the
         * renderer only ever read `hitRect`, so the old key was a control that
         * did nothing, and after the rename an upgraded install carried both. */
        const shippedKeys = new Set(value.map((p) => p && p.key));
        for (let i = mine.props.length - 1; i >= 0; i--) {
          const key = mine.props[i] && mine.props[i].key;
          if (key && RETIRED_PROPS[key] && shippedKeys.has(RETIRED_PROPS[key]) && !shippedKeys.has(key)) {
            mine.props.splice(i, 1);
            notes.push(`${k}.props:-${key}`);
          }
        }
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (!mine[field] || typeof mine[field] !== 'object') { mine[field] = JSON.parse(JSON.stringify(value)); notes.push(`${k}.${field}`); continue; }
        for (const [sub, v] of Object.entries(value)) {
          if (mine[field][sub] === undefined) { mine[field][sub] = JSON.parse(JSON.stringify(v)); notes.push(`${k}.${field}.${sub}`); }
        }
      } else if (mine[field] === undefined) {
        mine[field] = value; notes.push(`${k}.${field}`);
      }
    }
  }
  return notes;
}

/* Read the project from inside a queue slot this process already holds.
 *
 * `readDoc` cannot be used there. Its corrupt-file recovery goes through
 * `ensureFile`, and the project is the one document with no shipped seed — so
 * that path writes `emptyProject()` with `writeAtomic`, which enqueues on this
 * very file and would wait on the slot we are standing in. A deadlock in a
 * save is indistinguishable from a hung editor, so it must be impossible
 * rather than unlikely. */
async function readProjectInSlot(file) {
  let raw;
  try { raw = await fsp.readFile(file, 'utf8'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; return emptyProject(); }
  try { return upgradeDoc('project', JSON.parse(raw)); }
  catch (e) {
    const broken = file + '.broken-' + Date.now();
    await fsp.rename(file, broken).catch(() => {});
    console.error(`[floorplan-studio] project.json was unreadable (${e.message}); moved to ${path.basename(broken)}`);
    return emptyProject();
  }
}

/* The shape checks every project write makes, whoever is writing. Separate
 * from the write itself because a transaction has to make them AFTER its edit
 * callback has run, while a whole-document save makes them before it queues. */
function assertProjectShape(project) {
  if (!project || typeof project !== 'object') throw new Error('project must be an object');
  if (!Array.isArray(project.floors)) throw new Error('project.floors must be an array');
  const noteErrors = [];
  for (const floor of project.floors) if (floor) require('./annotations').validate(floor, (path, message) => noteErrors.push(path + ': ' + message), () => {}, 'annotations');
  if (noteErrors.length) throw new Error(noteErrors.join('; '));
}

/* Everything between "we hold the slot" and "the new bytes are on disk".
 *
 * Shared by `writeProject` and `editProject`, so there is one answer to what a
 * save does: reconcile the review notes against the copy being replaced, let
 * the caller validate the RESULT of that, snapshot, then rename into place.
 *
 * `validate` runs after the reconcile and not before, because reconcile is what
 * turns a note whose target an edit just deleted into a plain pin — validating
 * first reports that note as a dangling target, and the warning is already
 * untrue by the time the caller reads it. */
async function commitProject(file, project, validate) {
  if ((project.floors || []).some(f => f.annotations?.length)) {
    let previous;
    try { previous = JSON.parse(await fsp.readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (previous?.id === project.id) require('./annotations').reconcile(previous, project, await readDoc('library'));
  }
  if (validate) await validate(project);
  await snapshotProject();
  const installedAt = await deploymentTime(project.id);
  if (installedAt) project.dashboard = { ...project.dashboard, installedAt };
  project.savedAt = new Date().toISOString();
  project.schemaVersion = project.schemaVersion || 1;
  return rawWriteAtomic(file, project);
}

async function readDoc(key) {
  const file = await ensureFile(key);
  const raw = await fsp.readFile(file, 'utf8');
  try {
    return upgradeDoc(key, JSON.parse(raw));
  } catch (e) {
    // A corrupt document should not take the editor down with it. Keep the bad
    // copy for forensics and fall back to the shipped default.
    const broken = file + '.broken-' + Date.now();
    await fsp.rename(file, broken).catch(() => {});
    console.error(`[floorplan-studio] ${FILES[key]} was unreadable (${e.message}); moved to ${path.basename(broken)}`);
    await ensureFile(key);
    return upgradeDoc(key, JSON.parse(await fsp.readFile(file, 'utf8')));
  }
}

async function init() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  for (const key of Object.keys(FILES)) await ensureFile(key);
}

/* Backups: keep the last N project versions so a bad edit is recoverable from
 * inside the app rather than from a host-level snapshot. */
const KEEP_BACKUPS = 10;
async function snapshotProject() {
  const file = path.join(DATA_DIR, FILES.project);
  if (!fs.existsSync(file)) return;
  const dir = path.join(DATA_DIR, 'backups');
  await fsp.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fsp.copyFile(file, path.join(dir, `project-${stamp}.json`));
  const kept = (await fsp.readdir(dir)).filter((f) => f.startsWith('project-')).sort();
  for (const old of kept.slice(0, Math.max(0, kept.length - KEEP_BACKUPS))) {
    await fsp.unlink(path.join(dir, old)).catch(() => {});
  }
}

/* The Lovelace config that was on a dashboard before we replaced it.
 *
 * Kept here rather than trusted to Home Assistant's own history, because there
 * isn't one: `lovelace/config/save` overwrites, full stop. If a generate goes
 * wrong the only copy of what used to be there is this file, so it is written
 * BEFORE the save and never rotated out by the project backups' counter — a
 * dashboard is somebody's home screen and ten plan edits should not age it out.
 */
async function backupDashboard(urlPath, config) {
  const dir = path.join(DATA_DIR, 'backups');
  await fsp.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safe = String(urlPath).replace(/[^a-z0-9-]/gi, '_');
  const file = path.join(dir, `dashboard-${safe}-${stamp}.json`);
  await writeAtomic(file, config);
  const kept = (await fsp.readdir(dir)).filter((f) => f.startsWith(`dashboard-${safe}-`)).sort();
  for (const old of kept.slice(0, Math.max(0, kept.length - KEEP_BACKUPS))) {
    await fsp.unlink(path.join(dir, old)).catch(() => {});
  }
  return file;
}

module.exports = {
  VERSION,
  dataDir: () => DATA_DIR,
  init,
  /* Exported for the suite. This is the mechanism the audits keep catching out
   * — a field the shipped registry has and a long-lived saved copy does not —
   * and it was untestable from outside while it lived behind readDoc(). */
  upgradeDoc,
  emptyProject,
  backupDashboard,

  async readProject() {
    const project = await readDoc('project');
    const installedAt = await deploymentTime(project.id);
    if (installedAt) project.dashboard = { ...project.dashboard, installedAt };
    return project;
  },
  async markProjectDeployed(project, installedAt) {
    const file = path.join(DATA_DIR, 'project-deployments.json');
    await enqueue(file, async () => {
      const history = await readDeploymentHistory();
      if (!Object.prototype.hasOwnProperty.call(history, project.id)) {
        Object.defineProperty(history, project.id, { value: installedAt, enumerable: true });
      }
      await rawWriteAtomic(file, history);
    });
  },
  /* `opts.origin` identifies the writer for the live-view listeners above.
   * Optional on purpose: a caller that does not care (MCP) passes nothing and
   * is reported to everyone, which is the correct answer for it. */
  async writeProject(project, opts) {
    assertProjectShape(project);
    const file = path.join(DATA_DIR, FILES.project);
    /* Snapshot AND write inside one queue slot. Queuing only the write is not
     * enough: `snapshotProject` copies the very file a concurrent rename is
     * replacing, so the backup is what fails instead. `commitProject` uses
     * `rawWriteAtomic` rather than `writeAtomic` because we are already holding
     * the slot — queueing again from inside it would wait on ourselves.
     *
     * This replaces the whole document with a copy the caller read at some
     * earlier moment. That is right for the editor, which owns the document it
     * is displaying and is told over SSE when somebody else saves, and wrong
     * for a partial edit: use `editProject` for those. */
    const saved = await enqueue(file, () => commitProject(file, project));
    notifyProjectChange(saved, opts && opts.origin);
    return saved;
  },

  /* Read, modify, validate and write as ONE transaction, with the project's
   * queue slot held across all four steps.
   *
   * This is the difference between "change that lamp's colour" keeping the rest
   * of the house and silently reverting it. A caller that reads the project,
   * edits its own copy and calls `writeProject` is holding a snapshot from
   * before everything it does not know about: an editor autosave or a second
   * assistant landing in that window is overwritten with no error and no trace,
   * and the bigger the document the wider the window. Reading INSIDE the slot
   * closes it — the copy being edited cannot be stale, because nothing else can
   * write between that read and the rename.
   *
   * `edit(project)` mutates in place; `opts.validate(project)` sees the result.
   * Either may throw, and a throw writes NOTHING: no snapshot, no rename, the
   * document on disk untouched. Same contract as `editRegistry`, which has
   * composed concurrent registry patches this way since it was written. */
  async editProject(edit, opts) {
    if (typeof edit !== 'function') throw new Error('editProject needs an edit function');
    /* Outside the slot on purpose: seeding a missing project.json goes through
     * `writeAtomic`, which queues on this same file. */
    const file = await ensureFile('project');
    const saved = await enqueue(file, async () => {
      const project = await readProjectInSlot(file);
      /* Overlay the deployment receipt exactly as `readProject` does, so an
       * edit callback sees the same document `get_project` would have shown it. */
      const installedAt = await deploymentTime(project.id);
      if (installedAt) project.dashboard = { ...project.dashboard, installedAt };
      await edit(project);
      assertProjectShape(project);
      return commitProject(file, project, opts && opts.validate);
    });
    notifyProjectChange(saved, opts && opts.origin);
    return saved;
  },
  onProjectChange,

  readLibrary: () => readDoc('library'),
  onRegistryChange(fn) { registryListeners.add(fn); return () => registryListeners.delete(fn); },
  editRegistry(name, edit) {
    if (!['library', 'themes', 'flooring', 'boundaries', 'controls'].includes(name)) throw new Error('unknown registry');
    const file = path.join(DATA_DIR, FILES[name]);
    // Read inside the same file queue as writes, so concurrent agent patches
    // compose instead of each saving a stale full copy.
    return enqueue(file, async () => {
      const doc = upgradeDoc(name, JSON.parse(await fsp.readFile(file, 'utf8')));
      await edit(doc);
      await rawWriteAtomic(file, doc);
      for (const fn of registryListeners) { try { fn(name); } catch {} }
      return doc;
    });
  },
  writeLibrary(lib) {
    if (!lib || typeof lib.types !== 'object') throw new Error('library.types must be an object');
    return writeAtomic(path.join(DATA_DIR, FILES.library), lib);
  },

  readThemes: () => readDoc('themes'),
  writeThemes(themes) {
    if (!themes || typeof themes.themes !== 'object') throw new Error('themes.themes must be an object');
    return writeAtomic(path.join(DATA_DIR, FILES.themes), themes);
  },

  readFlooring: () => readDoc('flooring'),
  writeFlooring(doc) {
    if (!doc || typeof doc.types !== 'object') throw new Error('flooring.types must be an object');
    return writeAtomic(path.join(DATA_DIR, FILES.flooring), doc);
  },

  readBoundaries: () => readDoc('boundaries'),
  writeBoundaries(doc) {
    if (!doc || typeof doc.types !== 'object') throw new Error('boundaries.types must be an object');
    return writeAtomic(path.join(DATA_DIR, FILES.boundaries), doc);
  },

  readControls: () => readDoc('controls'),
  writeControls(doc) {
    if (!doc || typeof doc.default !== 'object') throw new Error('controls.default must be an object');
    if (!doc.designs || typeof doc.designs !== 'object') throw new Error('controls.designs must be an object');
    return writeAtomic(path.join(DATA_DIR, FILES.controls), doc);
  },
};
