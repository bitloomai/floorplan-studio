#!/usr/bin/env node
/**
 * check-repository.js — is this a valid Home Assistant app repository?
 *
 *   node tools/check-repository.js
 *
 * ## Why this replaced a bundler
 *
 * This used to be `bundle-addon.js`, which ASSEMBLED a repository-shaped folder
 * under `dist/` from a development tree that had `config.yaml` at its root. That
 * was the right tool for the wrong layout: the thing users install was generated
 * output, so it could only be reviewed after the fact, and nothing stopped the
 * committed tree from drifting away from what the bundler produced.
 *
 * The repository now IS the deliverable — `repository.yaml` at the root, the
 * app in one folder beside it, exactly the shape `home-assistant/apps-example`
 * documents. So there is nothing left to assemble, and the useful job is the
 * opposite one: fail loudly if the committed tree is not installable.
 *
 * Run it before pushing. It is also wired into `test/verify.js`, so the suite
 * catches a layout mistake without anyone remembering to run this.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const problems = [];
const fail = (msg) => problems.push(msg);
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const has = (...p) => fs.existsSync(path.join(ROOT, ...p));
const cfgDockerfile = (dir) => (has(dir, 'Dockerfile') ? read(dir, 'Dockerfile') : '');

/* ---- the repository ---- */

if (!has('repository.yaml')) {
  fail('repository.yaml is missing from the repository root — Home Assistant cannot read this as an app repository at all.');
} else {
  const repo = read('repository.yaml');
  for (const key of ['name', 'url', 'maintainer']) {
    if (!new RegExp(`^${key}:\\s*\\S`, 'm').test(repo)) fail(`repository.yaml has no ${key}`);
  }
}

/* An app is any directory holding a config.yaml. Finding them rather than
 * hardcoding the name is what makes this still correct the day a second one is
 * added — and what lets it notice a stray one nobody meant to publish. */
const apps = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && fs.existsSync(path.join(ROOT, e.name, 'config.yaml')))
  .map((e) => e.name);

if (!apps.length) fail('no app folder found — a repository needs at least one directory containing config.yaml.');

/* ---- each app ---- */

for (const dir of apps) {
  const cfg = read(dir, 'config.yaml');
  const at = (msg) => fail(`${dir}: ${msg}`);

  const slug = (/^slug:\s*["']?([^"'\s]+)/m.exec(cfg) || [])[1];
  if (!slug) at('config.yaml has no slug');
  /* Not required by Supervisor, but every app repository in the wild does
   * it, and `config.yaml`'s own url has to name the folder anyway. */
  else if (slug !== dir) at(`folder name and slug disagree (folder "${dir}", slug "${slug}") — the convention is that they match`);

  for (const key of ['name', 'version', 'description', 'arch']) {
    if (!new RegExp(`^${key}:`, 'm').test(cfg)) at(`config.yaml has no ${key}`);
  }

  /* What Supervisor and the store actually read. `run.sh` is in the documented
   * list but is an s6/bashio convention; this image is distroless and its
   * entrypoint is node, so its absence is correct, not missing. */
  for (const f of ['Dockerfile', 'README.md', 'DOCS.md', 'CHANGELOG.md', 'icon.png', 'logo.png',
    'translations/en.yaml', 'apparmor.txt', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) {
    if (!has(dir, ...f.split('/'))) at(`${f} is missing`);
  }

  /* The url should point at this folder in this repository, or the store links
   * somewhere that no longer exists. */
  const url = (/^url:\s*["']?([^"'\s]+)/m.exec(cfg) || [])[1];
  if (url && !url.endsWith('/' + dir)) at(`config.yaml url does not end in /${dir} — it is "${url}"`);
  if (has('repository.yaml') && url) {
    const repoUrl = (/^url:\s*["']?([^"'\s]+)/m.exec(read('repository.yaml')) || [])[1];
    if (repoUrl && !url.startsWith(repoUrl)) at(`config.yaml url is not inside repository.yaml's url (${repoUrl})`);
  }

  /* Every COPY source must exist INSIDE the app folder.
   *
   * Supervisor builds each app with its own directory as the Docker build
   * context, and a build context has no parent: `COPY ../thing` is not a path
   * Docker will follow, it is an error. So a Dockerfile naming anything that
   * lives beside the app rather than inside it fails at build time, on the
   * user's machine, with a message about a file not found in the context.
   *
   * This is what makes the LICENSE/NOTICE copies below load-bearing rather than
   * redundant — and it is how `COPY package.json` was caught after the
   * repository was restructured and package.json stayed at the root. */
  for (const line of cfgDockerfile(dir).split('\n')) {
    const m = /^COPY\s+(?:--\S+\s+)*(\S+)\s+\S+/.exec(line.trim());
    if (!m || m[1].startsWith('--')) continue;
    if (!has(dir, ...m[1].split('/'))) {
      at(`Dockerfile copies "${m[1]}", which is not in the app folder — a Docker build context has no parent, so this fails the build.`);
    }
  }

  /* The root notices are canonical and tools/sync-license-files.js copies them
   * into the app's independent Docker build context. Keep this check here too:
   * a forgotten sync must fail before it reaches somebody's Supervisor. */
  for (const f of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) {
    if (has(dir, f) && has(f) && read(dir, f) !== read(f)) {
      at(`${f} differs from the copy at the repository root`);
    }
  }

  /* Nothing private may be PUBLISHED from the installable folder.
   *
   * `app/data` is a real household's saved plan, written by the dev server just
   * by running it. Its existence on a developer's disk is normal and not the
   * problem; being committed or baked into the image is. So this checks the two
   * gates rather than the file — flagging the directory itself would cry wolf
   * on every machine that has ever started the app. */
  if (has(dir, 'app', 'data')) {
    const ignored = (file, rule) => has(file) && new RegExp(`^${rule}`, 'm').test(read(file));
    if (!ignored('.gitignore', `/?${dir}/app/data/?$`)) {
      at('app/data exists and .gitignore does not exclude it — that is runtime state from a real house.');
    }
    if (!ignored(path.join(dir, '.dockerignore'), 'app/data/?$')) {
      at('app/data exists and the app\'s .dockerignore does not exclude it — it would be baked into the image.');
    }
  }
  if (has(dir, 'fixtures')) at('fixtures/ is inside the app folder — development fixtures are not shipped.');
}

/* ---- report ---- */

if (problems.length) {
  console.error(`Floorplan Studio repository check: ${problems.length} problem${problems.length > 1 ? 's' : ''}\n`);
  for (const p of problems) console.error('  - ' + p);
  console.error('\nThis tree would not install cleanly as a Home Assistant app repository.');
  process.exit(1);
}

console.log(`Floorplan Studio repository check: OK`);
console.log(`  repository.yaml + ${apps.length} app${apps.length > 1 ? 's' : ''}: ${apps.join(', ')}`);
console.log('\nAdd it to Home Assistant with the repository URL in repository.yaml.');

module.exports = { problems, apps };
