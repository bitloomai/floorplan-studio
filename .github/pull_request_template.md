## What this changes, and why

<!-- The diff already says what. Say why: the problem, the choice you made, and
anything you tried and rejected. Link the issue it closes, if there is one. -->

## Screenshots

<!-- For anything visible on the plan, in the editor or on the dashboard: before
and after. Use an invented house — the demo house or a new project — never your
real one. -->

## Checks

- [ ] `node test/verify.js` reports **0 failed**
- [ ] New behaviour has a test in the section of `test/verify.js` it belongs to
- [ ] Regenerated what the change touches, and the suite's `--check`s pass:
      `make-docs.js` (help, figures, live demo), `make-showcase.js`,
      `make-readme-image.js`, `make-test-house.js`, `make-material-gallery.js`
- [ ] Changed an app option: added to `config.yaml` `schema:` **and**
      `translations/en.yaml`
- [ ] Changed a root notice file: ran `npm run sync:licenses`
- [ ] Changed packaging or layout: `node tools/check-repository.js` passes

## The rules this repository runs on

- [ ] No runtime dependency added ([the zero-dependency rule](https://github.com/bitloomai/floorplan-studio/blob/main/CONTRIBUTING.md#the-zero-dependency-rule))
- [ ] No second implementation of something the shared renderer already does
- [ ] Nothing new can write to Home Assistant outside `app/lib/ha-write.js`
- [ ] No real household data: examples and tests use invented `demo_` entity ids,
      and there are no tokens, coordinates or project files from a real home
- [ ] This is my own work, or its source and licence are stated below
      (Apache-2.0 §5 covers what I submit)
