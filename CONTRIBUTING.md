# Contributing to Floorplan Studio

Thanks for looking. This document says what the project will accept, what it
will not, and what happens to a contribution once it is sent.

## Licensing of contributions

Floorplan Studio is Apache-2.0. Under **§5 of that licence**, anything you
deliberately submit for inclusion is contributed under the same terms, unless
you say otherwise in writing at the time you submit it.

There is no CLA to sign. §5 already does the work one would do, and asking
contributors to sign a document to fix a typo is friction without benefit.

Two things follow, and both are conditions of a change being merged:

- **Submit only work you have the right to submit.** Your own, or something you
  hold the rights to relicense.
- **Do not paste in code from another project**, however small, without saying
  where it came from and under what licence. See "The zero-dependency rule"
  below — this is the single easiest way to have a pull request rejected.

By opening a pull request you are asserting the equivalent of the
[Developer Certificate of Origin](https://developercertificate.org/). Sign-offs
(`git commit -s`) are welcome but not required.

## The zero-dependency rule

`package.json` declares no dependencies, there is no lockfile, and every
`require()` in `floorplan_studio/app/` resolves to a sibling file or a Node.js built-in. This is
a deliberate design constraint, not an accident waiting to be corrected, and
`test/verify.js` enforces it.

It buys three things worth more than any single library would be:

- **Licence clarity.** There is no transitive dependency tree to audit, so
  `THIRD_PARTY_NOTICES.md` is a document a person can actually read and verify.
- **A shell-free image.** The production image is distroless, with no package
  manager and nothing to `npm install` at build time.
- **Supply chain.** A home automation app with access to somebody's house has
  no business pulling a hundred packages it did not read.

**A pull request that adds a runtime dependency will not be merged.** If a
problem genuinely needs one, open an issue and make the argument first — the
answer may be yes, but it will be a deliberate decision with the notices and the
image updated to match, not a side effect of review.

Build-time and development tooling is a separate question and a softer no; the
same "open an issue first" applies.

## Before you open a pull request

```bash
node test/verify.js
```

The suite is self-contained: no network, no Home Assistant, no fixtures beyond
what is in the repository. It must report **0 failed**. One legacy round-trip
check skips unless `FPS_LEGACY_DIR` is set; that skip is expected.

Then, as applicable:

- **Changed `tools/make-test-house.js`, or how plans are rendered?** Run
  `node tools/make-test-house.js` and `node tools/make-readme-image.js`, and
  commit `test/house/` and `docs/hero-plan.svg`. The suite pins both to their
  generators.
- **Changed packaging or the repository layout?** Run `node tools/check-repository.js` — it fails if the tree would not install as a Home Assistant app repository.
- **Changed `LICENSE`, `NOTICE`, or `THIRD_PARTY_NOTICES.md`?** Edit the root
  copy, then run `npm run sync:licenses`; the app-folder copies are generated
  inputs required by its independent Docker build context.
- **Added or changed an app option?** Add it to `floorplan_studio/config.yaml`'s `schema:` *and* to
  `floorplan_studio/translations/en.yaml`. A test checks that every schema key is translated,
  because an untranslated option shows the user a raw key.
- **Bumped the version?** `floorplan_studio/config.yaml`, `package.json` and `store.js`'s
  `VERSION` must agree, and `floorplan_studio/CHANGELOG.md` must have the entry. Tests check the
  first part; the changelog is on you.
- **Touched the icon or logo?** Edit `branding/*.svg`, never the PNGs — those
  are generated. Re-export with `node tools/serve-static.js` and commit both
  the SVG and the regenerated PNG. See `floorplan_studio/DOCS.md`, section "Branding".

New behaviour needs a test. The suite is a plain script with an `ok(name, cond)`
helper — no framework, no runner, no configuration. Add to the section it
belongs in.

## House style

The codebase has a strong and consistent voice. Match it rather than your own.

- **Comments say *why*, never *what*.** The code already says what it does. The
  comments exist for the decision that is not visible in the code — why a
  constant has that value, what broke last time, what this deliberately does not
  do. Read a few files before writing one.
- **One implementation of anything.** The editor, the SVG export, the preview
  and the generated card all call the same renderer, because a second copy is a
  second thing to drift. If a change introduces a parallel implementation, it
  will be asked to share instead.
- **Keep the writable surface small.** Everything that can change Home Assistant
  goes through `ha-write.js`, so a reviewer reads one file to know the blast
  radius. Do not add a second path.
- Two-space indent, single quotes, semicolons. Match the file you are in.

## Reporting bugs

Open an issue with the app version, your Home Assistant version and
architecture, what you did, what happened, and what you expected.

**Redact before you paste.** Logs, project JSON and dashboard configs from a
real house carry access tokens, latitude/longitude, `person.*` and
`device_tracker.*` state, and entity ids that name your rooms and family. A
reduced synthetic case is worth more than a real one anyway.

For anything with a security dimension, do not open an issue — see
[SECURITY.md](SECURITY.md).

## Support policy

Floorplan Studio is maintained by one person as an unpaid side project, and the
honest version is more useful than an implied guarantee:

- **There is no response-time commitment.** Issues and pull requests are handled
  on a best-effort basis, in bursts, with quiet stretches between.
- **Security reports come first.** See `SECURITY.md` for how to send one
  privately.
- **The current stage is `experimental`,** and `README.md` lists what is not yet
  release-ready. Until `1.0.0`, storage migrations and workflow changes remain
  possible; they will be documented in `CHANGELOG.md`.
- **Only the latest version is supported.** Before reporting, update and check
  the problem is still there.
- **No support for modified or repackaged builds.** Apache-2.0 lets you fork,
  modify and redistribute — that is the point of it — but a fork's bugs belong
  to the fork.
- **Some requests will be declined,** and being a reasonable idea is not enough.
  The zero-dependency rule, the single-renderer rule and the small writable
  surface are the ones most likely to be the reason. A declined feature is not a
  judgement on the person who asked.

Response times, a supported-version window and a public issue-triage process
will be documented before the first stable release.
