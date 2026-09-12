# Changelog

## Unreleased

### Wide exterior walls stay inside the plan

- Increasing **Wall top width** no longer grows an exterior wall equally inside
  and outside the room edge. The edge is now the wall's outer face and the full
  configured width fills inward, so a wide wall cannot create the protruding
  block beyond a building or site corner.
- Exterior runs also stop at their boundary endpoints; adjoining inward bands
  overlap inside the corner instead of relying on an extension beyond it.
  Shared walls between two indoor rooms keep their existing centred geometry.
- The inward direction comes from the room outline's winding rather than a
  hard-coded compass letter, so clockwise and reversed polygon outlines agree.

### An assistant can see your devices, and the app says it is ready to use

- **`list_entities`.** The app has always held a redacted Home Assistant entity
  catalogue — the editor's picker is built on it — and nothing on the MCP side
  ever returned it, so an assistant had to invent entity ids or ask for every
  one. It can now filter that catalogue by domain, `device_class`, free text
  over the id and the friendly name, current state, and `bound` — where
  `bound: "no"` is everything not already used anywhere the generated dashboard
  would name it, which is the list of what is left to place. Bounded paging lets
  an assistant read an installation with more than 500 matching entities without
  allowing one unbounded response.
- Every library type already declared the `domains` it binds to, so the binding
  loop is `list_library` → `list_entities({domain})` → `edit_collection`, and
  `find_objects({entity:"light.x"})` says which marker is on a given entity.
- **The privacy filter is now a test, not a comment.** `/api/states` carries
  latitude and longitude for `person` and `device_tracker`; the suite stands up
  a real stand-in Home Assistant serving deliberately impossible coordinates
  and asserts no location-tracking domain, coordinate value or coordinate
  attribute survives into the answer. Entity ids, friendly names and current
  states remain visible to the authorized assistant because those are what the
  binding workflow searches and checks.
- With no Home Assistant credentials the tool answers `mode: "offline"` and an
  empty list rather than failing, the way the editor degrades — an unbound
  marker still draws, so a plan can be built now and bound later.
- The guide has claimed since it was written that this server "holds the live
  entity names". It does now.

### It is an alpha, and it is meant to be used

- The status wording across `README.md`, the app README, `DOCS.md` and the help
  site now says so: the editor, the library, the light models and the generated
  dashboard work, and people are welcome to install it and draw their house.
  `experimental` describes the packaging and the release process, and Home
  Assistant's own `stage:` field has no "alpha" — `experimental` is the closest
  of the three values it offers, which the README now spells out so the badge
  and `config.yaml` do not look like they disagree.
- Two precautions are stated wherever that is: generate to a new dashboard path
  rather than over one you rely on, and keep an exported copy of the project.
- The help site had no statement of status anywhere — the one surface somebody
  reads *before* installing. **Getting started** now has one.

### Clearing a review, and telling an agent what a type can do

- **The Notes list has a Clear button**, and it deletes exactly what the list is
  showing. It follows the filter — Done notes → "Clear done (4)" finishes a
  review off and leaves the open ones; All notes clears the floor — and when the
  list was opened from an object's inspector it is scoped to that object. The
  label says which and how many, it confirms, and the whole lot comes back with
  one undo. `note-clear` is in the command catalogue, so the generated shortcut
  list and the help site document it without being told twice.
- An assistant does the same with `edit_collection` → `remove` and `ids`.
- **`list_library` now reports what a type can DO.** Its `render` summary
  carries `bindable` (takes an entity and shows state, which some furniture
  does), `surface` (accepts a finish on its horizontal faces), `cone` (can draw
  a coverage wedge at all) and `resize`/`resize2` naming the prop that sizes it
  on each axis. The guide has told agents to check `render.bindable` for a
  while; nothing in the tool had ever returned it. Drawing internals — icons,
  fills, blade counts — are deliberately left out, so nothing copies one onto an
  item.
- **A prop's `hint` now ships with it.** For a free-text prop it is the only
  statement of what the value has to be: `treadFinish`'s hint says "flooring
  key", and without it an agent saw an empty text box and no way to find out.
  `advanced` and `step` ship too.
- **The three horizontal surfaces are written down in one place** — a room's
  floor, a stair's treads, the top of a wall — in the contract, the guide and
  `DOCS.md`, with the reminder that only a room's floor is credited with
  bouncing light back.

### An assistant works on the plan without downloading the house

- **`find_objects` returns only what a job touches.** Filter across every floor
  or one, by id, library type (bare or `kind.type`), kind, the room an object is
  tagged with, its bound entity (`"none"` finds the unbound), free text, or
  distance from a point. `fields` projects dot paths, `summary` returns an index
  row, and every result carries the `floorId` and `id` an edit takes.
- **`get_project({outline:true})` is the index rather than the contents** —
  every floor with its extent, its counts, its room names, and a census of the
  item types on it. On the committed test house it is under a quarter of the
  document it describes, and it does not grow with geometry or properties.
- **`edit_batch` applies up to 200 edits as one validation and one write**, with
  one editor refresh. A rejected entry names its index and writes nothing at
  all, so a batch cannot leave a plan half-edited. `edit_collection` takes `ids`
  for the common case of one update against several objects.
- The per-collection edit helpers no longer save; the tool that called them
  does. That is the whole of what made a batch possible, and it means nothing
  can be true of a batch that is not true of doing the edits one at a time.
- The MCP contract and the shipped guide now say this outright, because an
  agent that reads the whole project and writes it back is not working from a
  missing feature — it is working from a habit.

### A review note attaches to what you were pointing at

- **A note dropped on bare canvas is no longer a bare coordinate.** It attaches
  to whatever is on top at that spot: the item, then the wall, then the room,
  then the floor. `Annotations.locate` answers that from the renderer's own hit
  shapes, so a headless caller gets the same chain the editor's canvas does, and
  a note added through MCP with an `at` and no `target` resolves it too.
- **The pin now sits where you right-clicked**, not at the target's centre. The
  attachment says what the note is about and the pin says where you were
  looking; a note about a damp corner belongs to the room and sits in the corner.
- **`list_annotations` returns the data around each note**: the floor, the room
  it is really about, the target chain under its pin, and the items and openings
  within eight feet with their distance, type key and bound entity. "This corner
  is too dark" now arrives with the room, its floor finish and the lamps in
  reach of it.
- `canvas.js` no longer carries its own copy of "which wall is under the
  pointer" — `Annotations.nearestEdge` is shared by the editor menu and the
  headless lookup, and the floor is always the last candidate so feedback
  anywhere on the plan has a scope. The floor is excluded from **Select behind**,
  where it would only mean "deselect".

### The help system gained the half that was missing

- **A "Working with an AI" section**, in the editor's help, on the published
  site and through `get_help`: what the MCP server is, how to connect a client,
  what it can and cannot touch, how to turn it off, and how to reach it over
  HTTPS from outside the house. The app's most distinctive feature had no user
  documentation at all.
- **Review notes have their own topic** rather than a paragraph at the end of
  the canvas tools, covering what a note attaches to, what happens when you move
  or delete that, and what an assistant sees when it reads one.
- The index card for **The library** described vegetation, because the category
  card shows its lowest-ordered topic and the library's overview was not it.
  The library topics are ordered deliberately now.
- `README.md`, the app README and `DOCS.md` describe the new tools, and the app
  README says where help is.

### Testing status

- The app is **currently being tested in detail in Home Assistant**, and every
  surface that used to say it had never been installed now says that instead.
  The stage remains `experimental` on purpose.

### Screens, soundbars and air conditioners are the shape they are

- **A television now reads as a television from above.** `screen.flat` drew a
  2.3 × 1.4 box — a cabinet, not a screen — and `size` was one number, so no
  amount of dragging made a 55-inch panel look like one. `device.tv` declares a
  second axis and ships slim: its body goes from 19.5 × 11.9 to 19.5 × 4.4, with
  the stand drawn behind the panel so the depth you set is the screen's own.
- **A soundbar and an air conditioner can be turned.** Every `cool` variant and
  the `speaker.bar` look offered `Facing (deg)` and drew identically at every
  angle — `device.ac` even *defaults* facing to 270°, which is somebody
  recording which way the unit points and getting nothing back for it. They are
  drawn aimed now. A ceiling cassette stays unturned on purpose: it is square
  and blows four ways.
- **Depth on the plan** joins `Marker size` under Advanced on `device.tv`,
  `device.speaker`, `device.ac`, `device.ac_window`, `device.ac_outdoor` and
  `device.heat_pump`, and each look that ships with those types reads it.
  Everything except the television keeps the exact proportion it drew before, so
  only the TV changes on an existing plan.
- The renderer now passes `RY` **only** for a type that declares a `resize2`.
  `markerExtent` answers `{rx, ry: rx}` when there is no second axis, which is
  right for hit geometry and for the resize handles and wrong to hand a drawer:
  "no second axis" and "a depth that happens to equal the width" would look
  identical to it, and a set-top box switched to the flat-panel look would draw
  as deep as it is wide.
- The suite only ever checked one direction — a family that turns, used by a
  type offering no facing. The reverse, a type offering facing whose family
  draws no direction, was a documented decision on the grounds that those
  markers are radially symmetric. That was true of discs and not of a wall
  unit with a front, which is how a whole family of them went unnoticed.

### A switchback lands where you actually turn round

- The landing on a U-switchback was drawn at a **fixed** end of the well — the
  right for an east-west run, the top for a north-south one — while which end
  the two flights actually meet at flips with `dir`. So it was right for
  `ew`+`down` and `ns`+`up`, and at the opposite end from the turn for the other
  two. The flights now shift to make room for the landing at the end where
  flight one stops and flight two starts, and the travel arrows follow it.
- Nothing made this visible while treads were bare: the only thing that
  disagreed was the fade past a floor cut, applied to dashed riser lines at 0.38
  opacity. Filling treads with a material put one solid step at the far end of
  an otherwise faint flight, marooned across the well from every other solid
  tread — which is what it looks like when a run's numbering and its landing
  disagree about where you turn round.

### The headless API, which had shipped undocumented

- `/app-api/v1` — REST plus a WebSocket, for a native or remote client that
  cannot complete Ingress's cookie handshake — is behind the app option
  `headless_endpoints_enabled`, default off, and is now written down. It shipped
  with a good comment in `config.yaml` and `app-api.js`, an entry in neither
  README, no line in DOCS.md and no changelog entry, even though `app-api.js`'s
  own header says it is what "keeps the safety claim in DOCS.md true for a phone
  as well as for the editor". It is not a Home Assistant proxy, it never lends
  the app's supervisor credential, and writes require an admin token.

### Help that can be looked up where the control is

- Eight controls added by the batches above — Notes, State on the plan, Tread
  finish, Wall top width, Wall top finish, room **id**, Tapping a marker, and
  the status bar's Grid and snap — are registered as UI locations, so the
  editor's "?", MCP `get_help` and the site's "Find a control" page can all
  reach them and say where they are. `ui-navigation.js` had not been touched by
  any of the eight batches.
- Six selectors that were already being written about routed nowhere
  (`field:floor.extent`, `field:floor.level`, `field:floor.grid`,
  `field:room.showCount`, `field:opening.at`, `field:opening.wall`).
  `validateTopic` checked a selector's *prefix* against the closed vocabulary
  and never that its target existed, so the promise that "a typo is an error
  rather than a topic that silently applies to nothing" held for `type:` and
  `shape:` and for nothing else. The suite now walks every selector that names a
  place, and checks that a location naming a DOM control names one that exists.

### Targeted review notes

- `floor.annotations` pins a note to a floor, a room, an item, an opening, a
  wall — including a default wall that has no override of its own — or a bare
  point. Notes draw as numbered pins at a constant size on screen, and **Notes**
  (`N`) lists a floor's open and done feedback.
- A note follows its target when the target moves, keeping its own pin offset,
  and survives the target's deletion as a point note rather than vanishing with
  it. **Delete object and its notes** is the explicit way to discard both. Room
  renames rewrite attachments. Undo and redo cover all of it in one entry.
- `list_annotations` reads notes back with their targets expanded — item type,
  label and current properties — and `edit_collection` with
  `collection: "annotations"` adds, edits, restatuses and removes them.
  Validation rejects malformed notes, and edits made outside the browser keep
  their attachments.
- **Notes never reach Home Assistant.** They are stripped from the dashboard
  card's data and from the editable project embedded in the deployment's
  ownership stamp, including the legacy floor sidecar; the exported SVG never
  draws pins. An exported project file keeps them, because that is the copy you
  would hand to somebody to review.

### A canvas context menu

- Right-click the plan — or hold one finger or a pen still for half a second —
  for the objects under the pointer, **Select behind** for the overlapped ones,
  turn, stacking order, item copy/paste, opening previews, the shared wall-top
  width and material controls, and adding a note. Arrow keys navigate it, Enter
  chooses, Escape closes. A hold cancels on movement, a second pointer, release,
  cancellation, capture loss or blur. Right-click still finishes a polygon while
  the Shape tool is drawing.

### Materials on every horizontal surface

- Stair **treads**, landings and winders take any of the 178 floor finishes
  (`props.treadFinish`, with `props.treadFinishOptions` for the generator
  overrides). The material paints the surfaces the stair actually has, rotates
  with it, leaves the well and the centre of a spiral bare, and stays faint
  beyond a floor cut. Riser lines, direction arrows and step lights stay above it.
- **Wall tops** gain a width (`props.thicknessFt`) and a finish
  (`props.topFinish`, `props.topFinishOptions`) on any enclosing treatment. A
  material is generated once over the floor extent and clipped to the bands, so
  its physical scale is continuous across the house and a wall two rooms both
  name is painted once rather than twice. An open edge or threshold has no wall
  top and offers neither.
- SVG export now receives the saved boundary and flooring registries, so an
  exported plate is painted like the editor rather than from the defaults.

### Room ids that read like room names

- A newly drawn room takes its id from its name — "Formal Living" becomes
  `formal_living` — and keeps following the name until the id is edited or the
  project is deployed. Collisions get `_2`, `_3`; a name in another script keeps
  that script.
- Editing **id**, or choosing **Match the name**, rewrites items, openings, wall
  overrides, merged-room references and review notes on that floor in one undo
  step. Entity ids are data rather than references and are left alone.
- The deployment record lives in `project-deployments.json`, outside the project
  document, so undoing a dashboard setting cannot re-arm automatic renaming for
  a room that is already published.

### Coverings, openings and skylights

- A covering now **draws** as the top-down footprint it occupies: drapes gather
  into end stacks, a roller's head cassette stays put while the fabric darkens
  as it comes down, venetian and vertical slats turn on their axis, mesh reads
  as a screen, and an awning projects out from the wall by its own `projectFt`
  with the plan's bounds making room for it. Vertical travel becomes ink density,
  because from above there is nothing else it could honestly be.
- **State on the plan** — shut, part open, open, or follow the type — is stored
  on the opening rather than being a preview, so a door drawn closed is closed in
  the editor, the exported plate and the generated card alike. The control only
  appears on a type that has a state to be in.
- A glazed panel is drawn as **one aperture**: the corner-to-corner diagonal that
  made a long thin panel read as a light fitting is gone, and its colour scheme
  reaches it at last through the type's own `render.fill`/`render.line`. Eight
  cuts — plain, grid, diagonal, chevron, hexagon, arabesque, floral, starburst —
  are drawn at a pitch in **feet**, so a bigger panel gets more of the pattern
  rather than a magnified copy. The cut is drawn, not modelled: set the panel's
  transmission yourself.

### Selection, sizing and direct manipulation

- The editor and the card now share **one** answer to what is under the pointer.
  A marker's target is how big it is drawn rather than a fixed 17px circle, a
  perimeter cove is hit along the run you can see, rotated furniture is hit by a
  box that turns with it, and targets rank by area so the smallest thing under
  the pointer wins instead of whichever was placed last.
- `render.resize2` gives a marker a **second axis**. Each handle pair drags its
  own dimension, on the object's own axes, so a board turned ninety degrees still
  has its width dragged by the handle that visibly moves its width; `Shift` keeps
  the proportions and `-`/`+` always scale both. A type declaring no second axis
  is unchanged.
- A drag **latches to the axis** it started along once it has travelled far
  enough to have one, with a dashed hairline showing which; a 45° drag latches to
  the diagonal. `Shift` latches immediately, `Alt` switches it off. A tablet has
  neither key, which is why the latch is automatic.
- `Alt`-drag pans from **bare floor** only. It used to pan from anywhere, which
  meant `Alt` could never reach any drag — so "hold `Alt` to ignore the alignment
  guides", promised by the gesture catalogue since it existed, had never once
  worked. The middle button, `Space` and the H tool still pan from anywhere.
- Perimeter fittings draw six ways — cove, strip, channel, plaster-in slot, rope
  and wall-wash — from one polygon, so an L-shaped room and a curved wall stay
  one problem. A cove marker that names a room with `item.room` now draws that
  room's outline even when the marker sits outside the slab it lights.
- Smart plugs gain a puck, a rounded square, a USB-port square and a long slab
  body, with the status light as a rim or a corner pip rather than a recoloured
  body — a row of solid blobs cannot say which one is switched.

### Four controls whose machinery already existed

- **Facing** is now offered by every type whose drawing can actually be turned.
  Radially symmetric families keep theirs harmlessly; a family that *can* turn,
  used by a type offering no way to turn it, is asserted against.
- **What a marker tap does** is settable per house (`openOn.markerTap`), the
  other half of `markerHold`. `auto` runs the domain action but opens more-info
  when holding is set to do nothing — a wall tablet with `markerHold: "none"`
  previously had no way into an entity's dialog at all. A type's own
  `render.tapAction: "moreInfo"` still beats both.
- The **Save** button says which of four things is true — Save, Saving…, Saved
  (greyed out, nothing to do) and Retry save — with the time of the last
  successful write beside it.
- Reopening a dashboard from Home Assistant records when it was installed, so an
  imported project knows it is published.

### Mouse, trackpad and touch

- One catalogue (`app/lib/input-actions.js`) now defines every command, its
  keys and its button. The keyboard, the shortcut bar, the shortcuts dialog and
  the help all read it, so the editor can no longer document a key it does not
  bind — `Space` to pan was promised by every Pan tooltip and bound by nothing.
- Pinch to zoom and two-finger pan on touch; one finger moves the plan unless
  the press starts on the current selection, so looking around no longer drags
  a room. A press counts as a tap until it has travelled ~9 px (3 px for a
  mouse), which also stops taps leaving no-op undo entries.
- Zoom holds the point it was asked to hold: the pointer for wheel and trackpad
  pinch, the middle of the pinch on touch, the middle of the view for the
  status bar's `−`/`+` and `Ctrl`/`Cmd`+`0`/`−`/`=`.
- `Space` held pans from any tool. `Ctrl`/`Cmd`+`Y` redoes alongside
  `Ctrl`/`Cmd`+`Shift`+`Z`.
- **S** in the top bar shows a row of shortcut buttons — the keyboard's
  commands for a tablet that has no keyboard — on by default for a coarse
  pointer, off with a keyboard, remembered per browser. **Multi** latches
  Shift-click for touch, including box selection.
- Below 900 px the rail and inspector become drawers (**☰**, **▤**,
  double-tap) and the top bar's secondary controls fold into **⋯**, so a tablet
  in portrait draws on the whole window. Resize handles and the rotation knob
  size themselves from the pointer last used, and the knob is now a constant
  size on screen at any zoom.

### Prompt-based registry authoring

- MCP now reads the complete library and edits shared library, flooring, theme,
  boundary and control registries with atomic field updates and safe key paths.
- Idle editors refresh after registry edits; active local edits are preserved
  with a reload notice. The shipped guide covers custom finishes, schemes and
  room badge placement and sizing.


### Material gallery navigation and movable room badges

- The complete material gallery now lives in the GitHub Pages guide's shared
  shell, sidebar, theme switcher and search. README links open its Materials
  section; the material generator supplies figures rather than a second site.
- Drag room badges independently of their rooms, including to adjacent floor
  space. Corner handles and keyboard sizing scale the text and count together.
  Moves/resizes are undoable; Delete hides the selected badge. Advanced offers
  a numeric size and a reset to automatic position and default size.
- Badge position, rotation and scale carry through rendering, dashboard hit
  targets, project persistence and spec export/import.

### Flooring materials and shared colour palettes

- Expanded stock flooring from 66 to 178 finishes across 14 groups, including
  timber species, parquet layouts, porcelain, marble, natural stone, terrazzo,
  cement tiles, woven fibres, resilient floors, oxide cement and decking.
- Added chevron, basketweave, hexagon, encaustic, weave and stud generators.
  Herringbone now fills its repeating cell; chevron has its own mitred joints.
  Tile shades can vary and terrazzo supports sized, angular chips.
- Expanded shared item colours from 28 to 76 schemes. A generated stock
  colour catalogue accompanies the existing project-owned scheme editor.
- New flooring entries and missing generator controls merge into saved
  registries while preserving existing entries and edited field definitions.
- Added a complete generated material gallery and flooring sheet for the
  repository README. Reflectance defaults are documented as model estimates.

### Dialog keyboard access and stock floor finishes

- Dialogs use native modal focus containment and background inertness, return
  focus on close, and keep the Advanced toggle focused when rebuilding.
  Editor shortcuts stay inactive while a dialog is open.
- The tatami and radial-inlay script examples live in
  `samples/flooring-script-examples.json`, outside the selectable defaults.

### The other four registries document themselves now

- **Choice registries generate their own catalogues.** The library's 261 types have
  always written their own reference; the wall treatments, opening types,
  coverings, floor finishes and control surfaces did not — so the prose beside
  them quoted them from memory, and it had already drifted ("a flat list of
  68", "about thirty others", and a promise that you could "see the whole table
  in the controls registry" when nothing showed that table). Each of those
  topics now carries a catalogue built from the registry itself, including the
  **31-domain** table of what a tap does. The hand-typed restatements are gone,
  and the suite fails if one comes back.
- **Built from the LIVE registries.** The editor and MCP were handing the help
  corpus only the boundaries document, so a catalogue would have described the
  finishes a house shipped with rather than the ones it has. All four are
  passed now — a house that edits its own registry gets documentation about
  that registry, in the editor, in `get_help` and on the site.

### Advanced is honoured everywhere, by the frame rather than by each dialog

- **The dialog frame carries the tick.** A dialog is a full-screen overlay, so
  the top bar's copy is covered while one is open. Every settings dialog now
  hands the frame the function that opened it, and the frame renders the
  app-wide toggle and re-runs the dialog when it changes. Doing it once, in the
  frame, is the point: the next dialog to grow an advanced section inherits a
  working toggle instead of quietly repeating the bug.
- **One `adv()`/`note()` for panels and dialogs alike**, so a dialog cannot
  drift from the panels' wording or, worse, hide a section with no sign it
  exists. Both say what is behind the tick, not just how many things.

### Nothing the renderers read is unreachable from the editor

- **Two registry editors.** `saveBoundaries` and `saveControls` existed in the
  API and were called by nothing, so wall treatments and the house's control
  defaults were read-only in the app while writable by the server and by MCP.
  **Room → Walls & railings → edit treatments…** now edits treatments, opening
  types and coverings — including thickness, height, tint and what an opening
  passes when *open*, which is the whole point of a door. **Room controls →
  edit the house defaults…** edits the header, the sections and their read-only
  and short-label settings, and shows the domain-action table.
- **The weather's effect on daylight is editable.** Sixteen per-condition
  multipliers the model has always read and nothing could reach, listed from
  the registry so a new condition appears with no code change.
- Also reachable at last: the rooms that never show a live count
  (`chips.hideRooms`), how the popup header counts (`countFormat`), and whether
  the house card carries every shortcut in the plan.
- The suite now asserts both directions — that every once-unreachable option is
  named by the editor, and that every registry the server will store is one the
  editor can edit.

### Eleven shipped options that nothing read, and the places help could not reach

- **The generated dashboard honours `openOn` and `dismiss`.** Both have been in
  `defaults/controls.json` since controls existed, and every key but
  `dismiss.backdrop` reached the card and was ignored — so a popup could not be
  closed with Escape despite the registry shipping `escape: true`. A room's
  **name** and the **floor around it** are now separate tap targets, each
  switchable on its own; `retap`, `escape`, `grabBar` and `close` each do what
  they say; and a long press on a marker opens more-info, opens its room's
  popup, or does nothing, per `markerHold`. All of it is editable under
  **Dashboard… → Appearance & behaviour** and cascades house → floor → room.
- **A design's own description of itself now reaches the surface it builds.**
  `persistent` (the docked panel does not close when you tap its room again),
  `inlineSections` (the compact bar runs its sections along the strip instead
  of stacking them off the bottom), `density` and `animation` were declared by
  the shipped designs and read by nothing, so every surface came up identically
  however it had been described. Entry animations drop wholesale for a viewer
  who has asked for reduced motion.
- The suite now asserts that **every option the controls registry declares is
  read by something**, so a declared behaviour that silently does not happen
  fails here rather than in somebody's house.

### Help that reaches the places it describes

- **Dialogs have a "?".** Panels have had one since they existed; the thirteen
  dialogs never did, so topics written about the Sun, Light, Logic, Dashboard,
  Import and Export dialogs were reachable from everywhere except the thing
  they describe. The dialog frame now carries it, from the same
  `ui-navigation.js` record the docs derive their access paths from — which
  also means a dialog's heading and the written path to it can no longer be two
  different names for one place.
- **Advanced is reachable from inside a dialog.** A dialog is a fixed
  full-screen overlay, so the top bar's Advanced tick was *covered* while one
  was open: the daylight model's constants and the light model's were reachable
  only by someone who had ticked it beforehand, with nothing on screen saying
  they existed. Both dialogs now carry the tick in their own header and say
  what is being withheld when it is off — the rule the panels already followed.
- **Six advanced areas are declared where the docs can see them.** Room name
  position, per-room daylight, a marker's long-press target, a manual room
  override, overhead openings and the two model sections were gated behind
  `S.advanced` in the panels and absent from `ui-navigation.js`, so the
  documentation described them as though they were on screen. The suite now
  checks both directions: that each is declared advanced, and that the panel
  hiding it names the same location.
- **The Logic dialog is documented.** It was the one UI location nothing was
  written about, and the check that would have caught it only ever asked about
  panels. It asks about every location now.

### Counts that are counted rather than typed

- The MCP contract said "65 finishes across Basic/Wood/Stone/India/Outdoor"
  while the registry had grown to 68 in six groups — and that is the text a
  model treats as ground truth about a house it is editing. It is derived now.
  Both READMEs said 258 library types against an actual 261, and quoted suite
  totals from several hundred checks ago. The suite asserts all of them.

### Two drawings corrected by looking at them

- **A ceiling fan is mostly blades.** `lightkit3` shipped with a 0.34R hub, the
  largest of any fan look by half again, and read as a dinner plate with three
  little wings — the wrong way round, since a fan built around a light has a
  compact motor precisely because the lamp is what hangs below it. The head is
  0.26R now, its lens is proportionate, and the blades are a broader profile of
  their own. They reach exactly as far as before: the sweep is a real
  measurement in feet and must not drift. The bound is checked on the whole
  family rather than on the one look, because the next fan added will be
  tempted the same way.
- **`plank` can draw grain.** Without it a plank pattern is a grid of uniform
  blocks with a dark line round each, which is a drawing of *brickwork* — and
  reads as brickwork the moment the joints are anything but hairline, as the
  first wooden-finish tile did. `grain` (default 0, off, so no existing floor
  moved) draws lengthwise figure inside each board, in the board's own colour
  rather than the joint's. It runs ALONG the plank, and nothing else in the
  pattern does; that is what tells timber from masonry at a glance. The
  wooden-finish tile now sets it, with a thinner joint and real tone variation
  between boards.

### A veined tile, and a wooden-finish one

- **A marble-look tile can now be drawn at all.** `tile` had a grid and no
  veins, `marble` had veins and no grid, and a glazed vitrified tile printed
  with a marble pattern — the commonest bedroom floor in a modern house here —
  is both. A field generator may now bring its own base instead of taking a
  flat colour, so `marble` lays the same grid the tile generator does when a
  finish gives it a `tileW`. Anything that returns only nodes still gets
  exactly the plain base it always got.
- **`veinColor2` draws a second vein system.** Statuario and Calacatta carry a
  grey structural vein and a sparser, finer gold one, and drawing both in one
  colour is what makes a printed tile read as a flat grey slab. Adding it moves
  no vein of the first set.
- **`veinWidth` and `veinOpacity` make veining as strong as the material
  actually is.** The defaults are a natural slab's, deliberately faint; a
  printed tile is not faint. Both default to 1, so every existing finish keeps
  exactly the veining it had, and both are editable in the finish editor.
- **Two finishes ship using them** — `vitrified_marble` ("Marble-look tile 4×2,
  grey & gold veins", India) and `wood_tile` ("Wooden-finish tile", Wood): a
  ceramic plank with a real grout joint, which is neither laminate nor timber
  and reflects less light than either. 68 finishes now.
- **No two shipped finishes may draw the same floor**, checked the same way no
  two marker looks, wall treatments or colour schemes may.

### Colour schemes, and the seating and fans they are most worth having on

- **An item can now say what it is made of.** A new **Colour** section in the
  item inspector paints any fixture, device or piece of furniture in a colour
  scheme: a matte-black ceiling fan, a teak sideboard, a chrome tap, a navy
  velvet sofa. Every item starts on **plain**, so nothing already drawn
  changes until you say so.
- **28 schemes ship with the app**, grouped Finish / Wood / Upholstery /
  Stone and taken off real fittings and real timber rather than invented —
  matte black, graphite, ivory, **cream gold**, brushed nickel, polished
  chrome, antique brass, oil-rubbed bronze, copper, stainless, sanitary
  white, teak, walnut, oak, rosewood, wenge, whitewashed oak, and eight
  upholstery tones. Cream gold is the cream-body/gold-trim finish almost every
  ceiling fan sold in India comes in alongside matte black, and neither ivory
  (cream and khaki) nor antique brass (gold throughout) was it — the whole
  look is the contrast between the two.
- **No two shipped schemes may paint the same thing**, checked the same way
  no two marker looks and no two wall treatments may.
- **A scheme is four colours, and each answers a different question**: the
  body, its trim, the detail strokes inside a marker at rest, and what it
  turns when it is live — an LED ring, a lit downlight, a status light.
- **Light beats paint.** A lit lamp still draws in the colour it is emitting
  and an entity that reports itself unavailable still draws as unavailable,
  whatever either is painted. The suite pins that no scheme, shipped or
  invented, can make a marker draw the same on as off.
- **Make your own, in a mini editor of its own** — the *edit colours…* link
  beside the picker. Duplicate a shipped scheme (which cannot be edited: it is
  part of the app, not part of your plan), rename it, set its four colours
  against a live preview of the thing you are painting, and delete it when
  nothing is wearing it.
- **Your own schemes live on the project**, so they are saved, undoable,
  carried in the export and baked into the generated dashboard card — a plan
  you send somebody arrives in its own colours with nothing to install
  alongside it. Importing an exported project brings them back.
- **A project's own scheme beats a shipped one of the same name, permanently.**
  A future release adding a default called `teak` cannot silently repaint a
  plan somebody already drew.
- **The export now includes the editor's own `project.json`** alongside the
  legacy-shaped floor specs, which is what makes that round trip real: the old
  format has nowhere to put anything it never had a word for.
- **`get_registry({name:"schemes"})`** lists both halves over MCP, and an item
  may be placed with a `scheme`.
- **Sofas, sectionals and recliners are now several pieces of furniture each,
  not one.** Sixteen looks where there were three, and each carries its own
  real footprint, because with seating the look IS the floor it takes up:
  - Sofa — straight, **bench seat** (one continuous stretched cushion),
    chesterfield, armless, **daybed** (one arm, meant for a wall) and curved.
  - Sectional — **left- and right-handed L**, **U-shaped**, **chaise** (no arm
    at its foot, which is what tells it from a corner unit) and modular.
  - Recliner — **single, two-seat and three-seat suites**, and two- and
    three-seat with the drinks consoles between them.
- **Two fans most new houses here actually have.** `plank3` is a BLDC fan:
  straight pressed-sheet blades with squared tips and the ring of indicator
  LEDs under the motor, lit whenever the fan is. `lightkit3` is a fan with the
  light built into it — swept blades around a lit disc that dims with the lamp
  it stands for.
- **An unlit fan light no longer disappears into a dark fan.** The lens was
  drawn in the housing's own colour, which is true of nothing — a diffuser is
  opal whatever the fitting is made of — so a matte-black fan on a night plan
  collapsed into one dark disc. It is derived from the housing now: pale on a
  dark fan, dark on a pale one, and measured against every scheme so it cannot
  vanish into any of them.

### Configuration layout and working-tree audit

- Align checkboxes with their labels throughout inspectors and dialogs. Group
  floor finishes, wall treatments and room controls; reveal longer explanations
  on demand. Improve field spacing, keyboard labels and narrow-window wrapping.
- Commit flooring and opening slider changes after a drag, so repainting the
  inspector cannot interrupt the gesture.
- Keep guide controls synchronized after undo and project replacement, and
  measure to the floor extent rather than the drawing's decorative padding.
- Keep oversized stairwells within the stair footprint, and retain the visible
  portion of partially open pocket doors.
- Fix the app rendering taller than a tablet's actual visible viewport, which
  clipped the last line or two of the rail, inspector and canvas with no way
  to scroll to them; also reserve room at the bottom of those panels and the
  save toast for a device's home-indicator/gesture-bar inset.
- `test/verify.js`'s "your own house" drift check now reports the live
  document's divergence from the `fixtures/` reference without failing the
  run — it was wired through the same reporter as a real failure, contradicting
  its own comment that drift is expected once you start editing.

### Gates and garage doors, drawn in plan and driven by their own sensor

- **A compound wall can now carry a gate, and a garage a shutter.** Fourteen
  new opening types cover what an individual villa actually has on its
  boundary: a pedestrian gate, single and paired swing gates, tracked,
  cantilever, paired and telescopic sliding gates, single and paired folding
  gates, a collapsible lattice gate, and rolling, sectional, tilt-up and
  side-sliding garage doors. They are openings like any other, so they cut the
  wall, take a covering, and appear in the opening inspector.
- **A vehicle gate and the pedestrian gate beside it are two openings, not
  one.** Placing them separately is what lets each carry its own contact
  sensor and report independently, which is the whole point of drawing them.
- **An opening can be bound to a `cover` entity, not only a contact.** A
  contact still wins where both are set — `off` is closed, `on` is open,
  other readings are unknown — but a motorised gate or shutter reports `current_position`, and the
  drawing now follows it: a leaf part-way through its swing, a shutter half
  down, a sectional door partly into the ceiling.
- **An unreadable sensor no longer claims a gate is shut.** `unknown`,
  `unavailable` and a deleted entity all fall back to the type’s drawn
  default and mark the status pip hollow, so a dead battery reads as "nobody
  knows" rather than as a closed gate.
- **An open gate now lets the light through.** Types with an `openTransmission`
  interpolate between their closed and open transmission with the position, so
  an open gate stops shading the drive the way a shut one does.
- **A sliding door ignored its own slide direction, and a folding door its
  hinge.** Both settings existed in the data model and neither reached the
  renderer; the parked leaf always went the same way. Fixed as part of this
  work, which is why an existing sliding door may now park on the other side.
- **A paired swing door hinged from the middle outward instead of from the
  posts.** It now hinges at both outer jambs, with a first-leaf share slider
  for the unequal vehicle/pedestrian pair every real driveway gate has.
- **An outward-opening gate at the edge of the site is no longer clipped.**
  The scene reserves the full travel envelope of every gate once, at both
  extremes of its travel, so the canvas does not resize when a sensor changes
  state.
- **The help page shows every mechanism open and closed.** The previews are
  drawn by the renderer itself, generated into `docs/walls.html`, so a picture
  of a mechanism cannot disagree with what the plan draws.
### 0.0.1 development baseline

- Reset the development version to `0.0.1` for user testing before the alpha
  release. Keep it fixed until the maintainer explicitly requests a change.
- Consolidated library/rendering improvements, generated help with shared UI
  access instructions, and consistent editor and help-site branding.
- Earlier version entries below are development history, not the current
  release version.

### Room names stop landing on top of ceiling fans

- **A room's name now finds a clear spot instead of always sitting at the
  centre.** The centre is the right answer for an empty room and the wrong one
  for a real house, because a ceiling fan, a pendant or a chandelier is almost
  always hung exactly there — so the label was drawn on top of the fan. On the
  five-floor test house this was **12 of 39 labels**; it is now none.
- The search is a fixed, ordered ladder of offsets — vertical first, since a
  name reads better above or below a marker than beside it, then horizontal,
  then diagonal — and it takes the first position that is both inside the room
  and clear of every marker near it. Fixed and ordered rather than nearest-fit,
  so a plan renders identically every time and an exported SVG matches the
  editor. A room with nowhere clear falls back to the centre, exactly as before.
- **A position set by hand still wins outright.** Nothing second-guesses it.
- **The name's position is editable at last.** `chip_at` has been in the data
  model from the start with no control anywhere in the editor; the room panel
  now has nudge buttons, a readout of where it sits, an **Auto** button to hand
  it back to automatic placement, and a rotation field. Room names themselves
  were always editable — that is the Name box at the top of the same panel.

### Detection cones are off until you ask for them

- **A camera and a PIR no longer draw a coverage wedge by default.** Vision
  sensors cluster at doors and corners, so a handful of them leaves a plan with
  more wedge than plan — the same reasoning that made coverage a per-floor
  setting, applied one level down. On the test house that is 16 markers that
  were each throwing a cone nobody had asked for.
- **Switching the cone on is what makes field of view and range matter**, and
  the panel now reflects that: the two numbers appear only once the cone is on.
  A number that changes nothing you can see reads as a broken control.
- Both values are kept while the cone is off, so turning it back on restores
  what was set rather than starting from the type's default.
- Only those two types changed. A speaker, an AC, a TV, a router — anything
  that declares no default of its own — behaves exactly as it always has, and
  so do `occupancy`, `doorbell` and `fixture.flood`. Per-marker `cone` and the
  house/floor coverage setting are ANDed, so coverage off still drops every
  wedge in one move.

### Floor finishes can be edited

- **There was no way to change what a finish IS.** The room panel chose which
  finish a room had, and that was all: `saveFlooring` had existed in the app's
  own API from the beginning with nothing in the editor ever calling it, so oak
  was whatever oak shipped as and adding the finish your house actually has
  meant hand-editing `flooring.json` inside the container.
- **Room panel → Flooring → “edit finishes”** now opens an editor for the
  registry itself: name, group, pattern, reflection, and the pattern's own
  options. Add a finish, duplicate one as a starting point, or delete an unused
  one. A new finish appears in every room's picker immediately.
- The fields offered per pattern come from `flooring.generatorOptions` in the
  registry rather than a list kept inside the editor, because a second copy of
  that list is the copy that goes stale — and a stale one here means a control
  that no longer matches what draws. Anything a finish carries that the schema
  does not describe is still shown, so a script finish's own options remain
  editable and nothing becomes unreachable.
- A colour is a text box with a picker beside it, not a bare colour input:
  shipped finishes use theme tokens like `@floorWood`, and a colour input
  cannot hold one — handed a token it silently reports black.
- Deleting a finish rooms are standing on is refused, naming how many use it,
  rather than leaving those rooms drawing the fallback while their own stored
  value points at something gone.

### Floors that had quietly stopped reflecting light

- **A saved `flooring.json` written before `reflectance` existed never gained
  it.** The upgrade adds finishes a document has never seen, but the step that
  tops up fields on finishes it already has had only ever run for the device
  library. A real install was carrying 28 finishes with no reflectance at all —
  and a finish that omits it reflects *nothing*, so every room standing on one
  was credited zero floor bounce while the shipped default said 0.35 or 0.65.
  Nothing reported it; the plan just rendered darker than the model intended.
- The upgrade now fills it in, narrowly: only `reflectance`, only where the
  finish has none at all, and only for a finish the shipped defaults still
  carry. A value you set — including a deliberate 0 — is left alone, and a
  finish you invented is never guessed at.

### The editor no longer warns you about your own edits

- **"The plan changed elsewhere" appeared on ordinary local editing**, with no
  second tab and no MCP client involved. Every project write reaches the live
  stream — the editor's own autosave included — and the notification is sent
  before the save's own response, so a tab heard its own write land while it
  still had unsaved keystrokes and reported it as somebody else's change.
- The change event now carries `origin`, an opaque id the editor sends with
  its own save, so a tab drops the echo of its own write and reacts to
  everything else. A writer that names nobody — an MCP tool call — is still
  reported to every open editor, which is the case the stream exists for.
- A second browser tab still gets the notice, since it carries a different id.
  Unsaved local work is untouched either way, as before.
- Fixed alongside it: the browser's request helper replaced the request headers
  wholesale when a caller supplied any, silently dropping the `Content-Type`
  that every JSON body in the editor depends on.

### Plans are imported by uploading them

- **Import… now takes files, not a directory path.** The old box asked for a
  directory on the *app's* filesystem, which under Home Assistant is inside the
  container — so the plans someone actually wanted to import, sitting on the
  computer they were looking at the editor from, could not be reached at all.
  Choose files or drop them on the dialog; the browser reads the bytes and
  posts them.
- The endpoint that read a server-side directory (`/api/import/legacy`) is
  **gone**, not merely unused by the page. It let anything that could reach the
  API read JSON out of any directory the app process could open.
- **Three document shapes are recognised and told apart by shape, not by
  filename**: a plan exported from this editor (`floors[]`), one of its floor
  documents (`items[]` / `openings[]`), and a hand-written spec in the older
  format (`rooms[]` + `extent`). Only the last is converted; the first two are
  already this schema and are passed through untouched. Running them through
  the converter would have swept `items`, `openings` and `boundaries` into
  `_legacy` and quietly flattened a plan the editor itself had written.
- **Uploads are capped at 10 MB and 64 files**, enforced by the server. The
  page checks the same limits before uploading, but that is a courtesy to the
  person, never the limit itself.
- **What the import produced is validated before it is offered.** A file can be
  good JSON of the right general shape and still carry a room with no polygon;
  since an import replaces every floor in the project, discovering that when
  the canvas tries to draw it is far too late. Structural errors refuse the
  import and are listed; warnings travel with it and are shown.
- **Every file that cannot be used says why** — unreadable JSON with the
  parser's own message, an empty file, a non-object, a shape that matches none
  of the three — instead of being dropped from the count. A good file still
  imports alongside a bad one. Two floors claiming one id are both kept and the
  second is renamed, since a duplicate id makes the floor switcher ambiguous
  and gives the generated dashboard two tabs claiming the same plan.
- An exported project describes every floor there is, so uploading one
  alongside anything else is refused rather than merged by a guess.
- Uploaded filenames are reduced to a bare basename with no control characters
  before they reach a DOM node or a log line.
- The section is now headed **Import an exported plan** rather than "Import
  someone else's specs", and it is shown whether or not sample projects are
  present — previously it only appeared alongside them.

### Smaller fan default, more blade designs

- A newly placed ceiling fan now starts at a symbolic 2-foot sweep instead of
  a realistic 4-foot footprint, so it reads clearly without dominating an
  ordinary room. The existing resize handle and 1–8 ft inspector range remain
  available when a true-to-scale footprint is useful.
- Added paddle, swept-scimitar, tropical-leaf and narrow industrial blade
  designs. A custom look reads the existing 2–8 blade-count field, so that
  control now changes the drawing instead of being decorative.
- Saved stock libraries migrate only the exact former 4-foot default and exact
  former look list; user-customised defaults and curated lists are preserved.
- The first real Podman build found that `.dockerignore` excluded the shipped
  MCP `SKILL.md` even though the Dockerfile copies it. The guide is now
  explicitly retained in the build context and the suite guards that contract.

### The working guide reaches the client on its own

- The MCP server now returns `instructions` on `initialize` — a short
  orientation that Claude Code, Cursor, Codex and any other spec-compliant
  client puts into the model's context at connect time, with no tool call and
  no user action. It names the four things that are wrong-by-default if
  guessed (feet, screen-relative walls, kind + type, never invent a key) and
  points at `get_guide` for the rest.
- Added the `resources` and `prompts` capabilities. The guide is served as the
  resource `floorplanstudio://guide` and the prompt `floorplan_studio_guide`,
  so a human can pull it in whichever way their client offers instead of
  hoping the model calls a tool for it.
- All four paths — instructions, resource, prompt, `get_guide` — serve the one
  shipped `SKILL.md`. The suite asserts they stay identical, because the one a
  given client happens to use is the one that would otherwise go stale.

### Balcony railings

- Boundaries gained a **Railings** group of eight: frameless and framed glass,
  vertical metal rods, stainless cable, wrought iron / MS grill, timber, a cast
  stone balustrade, and a parapet with glass above. Transmission runs 0.9 to
  0.4, so the choice moves the daylight model as well as the drawing.
- New `balusters` render style — a top rail plus a fat dot per member. Reusing
  `bars` would have drawn a turned balustrade and a steel rod identically.
- The suite now renders **every** boundary type onto a real edge and asserts
  each draws something and no two draw the same thing. A type whose
  `render.style` the renderer does not know falls through to a plain line,
  which looks like it worked.

### Stairs and lifts as architecture

- `furniture.stairs` gained variants (`straight`, `l_shaped`, `u_switchback`,
  `winder`, `spiral`) drawn from `steps`, `dir` and `axis`, and step lighting
  of its own: `lighting` (`none`/`edge`/`side`/`both`) and `lightEvery`
  (1, 2 or 4 — the cadence it was installed on).
- `sequence` decides what step lighting does when it comes on: `together`,
  the default and what most step lighting is, or `progressive`, which climbs
  the flight the way a motion-triggered stair light does. The two differ only
  in the animation, never in what is lit.
- Stairs are the first **bindable furniture**: `render.bindable` on a library
  type makes the drawer receive on/off state and the lamp colour, and gives it
  an entity picker in the editor.
- `furniture.lift` gained `traction`, `vacuum` (the circular pneumatic shaft),
  `platform` and `dumbwaiter`.

### Templated entity value labels

- Added `device.label`, a plain SVG text marker bound to any Home Assistant
  entity. Its safe template tokens expose the raw state, unit, friendly name,
  entity id, and attributes; `{{ value }} °C` is the room-temperature case.
- Text/background, font size and weight, padding, rotation, and border color,
  width, style, and radius are editable per label. Numeric threshold rows can
  recolor the text, border, or both; the highest matching lower bound wins.
- The label's full rendered rectangle is the hit target. A tap always opens
  Home Assistant more-info, including when the bound entity is normally
  actionable, so a value label can never toggle a light accidentally.
- Template output stays text through the shared scene renderer and is escaped
  on SVG export. Unknown tokens remain visible instead of being evaluated.

### Hosted prototype removed

- Removed the incomplete hosted static build, its browser-only Home Assistant
  client and API adapter, the generated `web/` output, and the `build:web`
  command. The repository now has one supported product boundary: the Home
  Assistant app. A hosted product can be designed afresh later if it becomes a
  real requirement.
- Moved dashboard discovery and project reopening into `ha-write.js`, leaving
  all Home Assistant writes and deployment reads in one auditable module.
- Simplified the card builder and provenance contract to Node/CommonJS now that
  neither needs browser-build injection or UMD wrapping.
- Replaced `serve-branding.js` and `serve-web.js` with one generic read-only
  local server, `tools/serve-static.js`. With no arguments it opens the branding
  exporter; optional port, root, and default-file arguments support other local
  static previews.

### The repository becomes the add-on repository

- **Restructured to the layout `home-assistant/apps-example` documents**:
  `repository.yaml` at the root, the add-on in `floorplan_studio/` beside the
  development material. Home Assistant reads `repository.yaml` first and scans
  the directories next to it for `config.yaml`; the old tree had `config.yaml`
  at its root and no `repository.yaml`, so it could not be added to Home
  Assistant at all — the installable shape existed only in a gitignored `dist/`.
- **The bundler is gone, replaced by `tools/check-repository.js`.**
  `bundle-addon.js` assembled a repository-shaped folder from a tree that was
  not one, which meant the thing users install was generated output: reviewable
  only after the fact, with nothing stopping the committed tree from drifting
  away from it. There is nothing left to assemble, so the useful job is the
  opposite — fail loudly if the committed tree is not installable. It checks
  `repository.yaml`, folder-name-matches-slug, that `config.yaml`'s url points
  into this repository, that every file Supervisor and the store read is
  present, that the notices match their root copies, and that nothing private
  sits inside the installable folder. `test/verify.js` runs it, so a layout
  mistake fails the suite rather than somebody's Supervisor.
- **Privacy is now structural rather than filtered.** `fixtures/` (one real
  household's plan) and `app/data` (runtime state the dev server writes) used to
  be excluded from a generated copy. They now live outside the add-on folder, or
  are excluded from both `.gitignore` and the add-on's `.dockerignore`, and the
  check verifies both gates rather than the file's absence — flagging the
  directory itself would cry wolf on every machine that has ever run the add-on.
- The notices exist twice on purpose: inside the add-on folder, because that is
  the Docker build context and what a user installs, and at the repository root,
  because that is where GitHub and a human look. Two copies drift, so the check
  and the suite compare them.
- `url` in `config.yaml` and `repository.yaml` now name this repository. The
  root `README.md` became a repository README with the one-click
  `my.home-assistant.io` install badge, and the add-on gained its own.
- Added `.gitattributes` normalising to LF. The add-on runs on Linux and its
  image is built from these bytes; a Windows checkout committing CRLF back would
  ship them that way.
- **Not a HACS repository, and cannot be.** HACS distributes integrations,
  dashboard plugins, themes, AppDaemon apps, python scripts and templates — its
  FAQ says plainly that add-ons are not among them. Add-ons are installed by
  adding a repository URL to the Supervisor store. The generated card needs no
  HACS either: the add-on installs it as a Lovelace resource itself.

### A wall switch, 1 to 5 gang, with per-gang state

- **`device.wall_switch`.** The catalog had a smart plug, a switch module, a
  network switch and an extension board, and no light switch — the most common
  controllable object in a house, and the first thing a person points at when
  reading a plan. `device.plug` was standing in for it, drawing a socket where
  a switch is.
- **Ten looks**, in a new `MARKERS.switch` family: `rocker` (default), `toggle`,
  `push`, `square`, `dimmer`, `rotary`, `touch`, `keypad`, `architrave`,
  `industrial`. Each draws the plate and its cells from one shared `plateOf`
  layout, so adding an eleventh means drawing one cell, not re-deriving a plate.
  `dimmer` and `rotary` carry the level in the knob position, `architrave` and
  `keypad` stack their gangs vertically.
- **Gangs are a property, 1 to 5, not five near-duplicate types.** A 1-gang and
  a 4-gang plate are the same object with more of it, the way a fan's blade
  count already works. The plate widens with the count.
- **Each gang reads its own entity.** A 3-gang plate is three Home Assistant
  entities behind one piece of plastic, so this reuses `device.extension`'s
  existing `channels` array rather than inventing a second mechanism — on the
  reasoning that entry already records, that a single disc cannot say WHICH of
  three is on. The fallback is the part that matters: a gang with nothing bound
  follows the marker's own entity, so a switch is useful the moment it is placed
  and gets more truthful as it is wired, instead of refusing to draw until all N
  entities exist.
- `SWITCH_MAX_GANGS` in `shapes.js` is the cap the renderer draws to, and
  `plan-scene.js` clamps to it — a project edited by hand or written by an MCP
  client can ask for 40 gangs and gets a plate, not a smear.
- The channels editor took its words from the code: "Outlets" and "+ outlet"
  under a light switch. The heading and the singular now come from the type's
  own channels prop, so the extension board still says outlets and the switch
  says gangs. Adding a gang also grows `gangs` to match, up to the cap — binding
  a gang the plate does not draw is a trap.
- Nine assertions: ten looks all offered by the library with a real default, the
  cap agreeing between renderer and library, every look drawing 1 through 5
  gangs with each count differing, on differing from off, the clamp holding, and
  three through the real scene builder that per-gang entities actually reach the
  drawing rather than every gang silently taking the marker's own state.
- Fixed while drawing: the `keypad` bars were sized from their own width and
  pushed against the right bezel.

### The icon and logo become editable vector, and get redrawn for small sizes

- **`branding/icon.svg` and `branding/logo.svg` are now the source**; the PNGs
  in the repository root are generated from them. The previous pair were flat
  raster with no source at all, so changing anything meant regenerating the
  whole image and hoping.
- **`tools/export-branding.html` exports PNG at any size**, and adds no
  dependency: rasterising SVG properly means a path rasteriser, bezier
  flattening, anti-aliasing, gradients and text shaping, and every browser
  already has all of it. `tools/serve-static.js` is a small `http` server so
  the page can read the SVGs — a page opened from `file://` cannot read the
  files beside it, and the alternative was a file picker to re-click on every
  tweak. Opened directly, it falls back to that picker and works identically.
- The tool previews each asset **small, and again nearest-neighbour enlarged**.
  Judging an icon at 512 is how you end up with one that is mud in a store card,
  and a 48px cell on a hidpi screen is too small to judge by looking at it.
- Recorded where each file is actually used, because the first pass guessed
  wrong: `icon.png` is the add-on store listing and info page, `logo.png` the
  store header. **Neither is the sidebar icon** — Home Assistant takes that from
  `panel_icon` in `config.yaml`, which is an MDI name and cannot be a PNG.
- **Redrawn to hold up small, which is how the store draws it.** The first vector
  pass reproduced the original faithfully and was unreadable small, so
  door-swing arcs, dining chairs, a dashed measurement line with node handles
  and a second interior wall are gone; walls went to stroke 20, the grid got
  coarser and fainter, the plate grew and the margins shrank. Four shapes
  survive being tiny: plate, plan, pencil, cursor.
- **The wordmark is brand blue, not near-black navy.** The old colour looked
  right on the store's light background and all but vanished on the dark one.
  It now clears 4.5:1 on both. `textLength` pins each line's width so the layout
  holds even where the font stack falls through to Arial.
- **1.5 MB of branding became 73 KB.** `icon.png` was 1254×1254 / 868 KB and is
  now 256×256 / 33 KB; `logo.png` was 1983×793 / 599 KB and is now 500×200 /
  40 KB. Home Assistant renders them at 128 and 250 wide.
- Fixed a real defect found while drawing: the pencil's eraser was landing at
  x≈529 in a 512 viewBox and being clipped against the right edge.
- Six assertions: both PNGs have a vector source, neither PNG exceeds 150 KB,
  no XML comment contains a double hyphen (illegal, silent, and it broke the
  file twice during this work), the two SVGs still agree on the plan geometry
  and on the palette, and the export tool has no `<script src>`.

### Confinement, contribution terms, and a scope fix on "read-only"

- **`apparmor.txt`.** Supervisor confines the add-on only when this file is
  present, and an absent one is silent — it just runs unconfined. The profile is
  much tighter than the template in the Home Assistant documentation, which
  opens with `file,` (every path on the filesystem) and then spends its length
  on s6-overlay, bashio and `/bin/**`. None of that exists in a distroless image
  whose entrypoint is `/nodejs/bin/node`, so every allowed path is named:
  `/nodejs` execute, `/app` and `/fixtures` read, `/data` read-write, `/ssl`
  read. No `capability` rule at all — the server binds 8099/8443, both above
  1024. A closing `deny` block pins the promises the docs make on its behalf.
  **Unverified against Home Assistant OS audit logs**; `DOCS.md` has the
  complain-mode procedure, and the first install is also this profile's first
  test. Promoted from the bundler's optional list to its required one for the
  same reason the licence files were.
- **`CONTRIBUTING.md`.** Contributions are Apache-2.0 §5 with no CLA. The
  zero-dependency rule is stated as an enforced constraint rather than a
  preference, with the reasoning (licence clarity, a shell-free image, supply
  chain) and an explicit "will not be merged". Plus house style, the pre-PR
  checklist, redaction guidance for bug reports, and a support policy that says
  plainly there is no response-time commitment.
- **Scoped the "read-only by construction" claim to the add-on process.** It was
  true and stayed true, but it was stated in four places without saying where its
  boundary is, and a reader could carry it across to the generated dashboard. The
  card does call `hass.callService` — that is what makes a floor plan pressable
  rather than a picture. The distinction is whose credentials do it: the add-on
  holds a Supervisor token and can only GET; the card holds nothing and acts as
  the signed-in viewer, bounded by their permissions and logged under their name.
  Corrected in `README.md` (new "The generated card is not the add-on"),
  `DOCS.md` (new "The dashboard it writes is not the add-on"), `config.yaml`,
  and `server.js`'s module header and startup log.
- Seven assertions added: the profile's name matches the slug, it has no blanket
  `file,` grant and no capabilities, `/data` is its only writable tree, it denies
  `/config`, `/share`, `/addons`, `/backup` and `/media`, and it covers every
  `COPY` destination in the Dockerfile — that last one catches a new COPY landing
  somewhere the profile does not mention. Two more pin the contribution terms.

### Apache-2.0, and the notices that have to travel with it

- Licensed the project under the **Apache License, Version 2.0**. `LICENSE` is
  the canonical text from apache.org verbatim; `NOTICE` carries the §4(d)
  attribution; `THIRD_PARTY_NOTICES.md` is the full inventory. `package.json`
  declares `"license": "Apache-2.0"`.
- The audit behind that choice: there is nothing to be compatible *with*.
  `package.json` declares no dependencies, there is no lockfile, and every
  `require()` in `app/` resolves to a sibling file or a Node.js built-in
  (`fs`/`http`/`https`/`path`). No CDN script, web font, or icon set is loaded —
  the `mdi:` strings are identifiers Home Assistant resolves, and every glyph on
  the plan is original path data in `shapes.js`. `sun.js` is an original
  implementation of the NOAA/Meeus solar algorithm, not a copy of SunCalc or any
  licensed library.
- The licence now ships down all four paths this project distributes itself by,
  because each one is a separate §4(a)/(d) obligation and each fails silently on
  its own: the `Dockerfile` copies `LICENSE`/`NOTICE`/`THIRD_PARTY_NOTICES.md`
  into the image (with `.dockerignore` re-including the last one past its `*.md`
  rule), `bundle-addon.js` promotes them from its optional list to its required
  one so a missing file fails the build, `build-web.js` emits them beside
  `index.html` and refuses to build without them, and the generated Lovelace card
  carries the licence line and SPDX tag in its own banner — the one form that
  ends up in somebody else's dashboard with no file beside it.
- Container base-image licensing is documented rather than assumed: every
  component of `gcr.io/distroless/nodejs24-debian13` keeps its own text inside
  the image (`/nodejs/LICENSE`, `/usr/share/doc/*/copyright`,
  `/usr/share/common-licenses/`), verified by reading the layers. The base is not
  uniformly permissive — glibc is LGPL-2.1+, libgcc/libstdc++ are GPL-3 with the
  GCC Runtime Library Exception, the CA bundle is MPL-2.0 — and
  `THIRD_PARTY_NOTICES.md` records why none of that reaches this project's own
  code or the generated card.
- Added the SPDX/licence banner assertion, six packaging assertions covering the
  four distribution paths, and two that pin the zero-dependency claim itself
  (no `dependencies`/`devDependencies`/lockfile/`node_modules`, and no `require()`
  in `app/` naming anything outside Node and this repository).
- `translations/en.yaml` covered two of the seven configuration options; the
  other five rendered as raw keys in the add-on's configuration screen. All seven
  now have a name and description, plus the two port descriptions, and the test
  that only checked the file's existence now checks that every key in `schema:`
  is translated.
- The generated card's banner interpolates the project name; a name containing a
  comment terminator would have closed the banner early and put the rest of it —
  including the new licence line — into executable position. Sanitised at the one
  place it is built.

### Top-down vehicle and foliage redraw; ceiling-fan arc fix

- Replaced the old `furniture.bike` side-elevation shorthand (two circular
  wheels joined by one line) with three strict overhead bicycle looks: city,
  road and cargo. Split the misleading “Bike / scooter” catalog entry into
  separate Bicycle, Motor scooter / moped and Motorcycle types; scooter and
  motorcycle each have three proportioned plan-view variants with tyre
  capsules, bars/forks, bodywork, saddle and recognisable model-specific
  detail. Furniture Look swatches now preserve the type's real aspect ratio,
  so a 2×6 ft two-wheeler is no longer crushed into a square preview.
- Redrew every plant/tree look as a direct overhead view. Pots are concentric
  rims beneath radial leaves rather than side-view trapezoids; bushes and
  deciduous crowns have smooth irregular outlines and canopy contours; fern,
  succulent, monstera, pine and palm use filled fronds/leaves instead of
  circles or star polygons. Plant now offers six looks and tree four.
- Removed the full-sweep circular `body()` behind ordinary ceiling-fan blades.
  Its exposed rim was the set of unexplained outer arcs visible between the
  blades. Ceiling fans now draw swept airfoil blades plus the real hub only;
  the `caged` exhaust variant deliberately keeps its outer housing and grille.
- Added regression checks for top-view two-wheeler tyres, the exact furniture
  variant/library contract, and the absence of a full-radius rim on every
  non-caged fan look. A visual audit rendered all 96 marker variants plus all
  changed furniture looks.

### Real lamp and plant shapes instead of a generic bulb and a blob

- `chandelier`, `pendant`, `floor_lamp`, `bollard`, and `garden_spike` now
  draw as themselves (a spider of arms and candle bulbs, a domed/drum/globe/
  cluster hanging shade, a pole-and-shade torchiere or swept arc, a squat post,
  a ground spike or flush uplight well) instead of the same generic disc-with-
  a-bulb-icon every fixture used to share. Each is a new `Shapes.MARKERS`
  family (`chandelier`, `pendant`, `floor_lamp`, `bollard`, `garden_spike`),
  wired into `app/defaults/library.json` the same way `device.radiator` was
  earlier: `render: {family, variant}` plus a `variant` "Look" prop, so the
  inspector's swatch-grid picker appears automatically.
- `chandelier.classic`/`.drum` and `pendant.cluster` read the item's own
  `count` for how many arms/bulbs to draw — the same number `lighting.js`
  already summed for the lumens total, so the drawing and the light math can
  never disagree about how many lamps are on one marker. This is the first
  place `Shapes.MARKERS` reads a number off the item (`c.p`) rather than
  picking its look purely by variant name; `FURNITURE` has done this for
  years (chair seats, bookshelf shelves), so the precedent already existed.
- A lit bulb's own opacity now carries the **dimmer level**: `plan-scene.js`
  computes `bright` from the same `Light().lampOutput().brightness` the room
  glow already used, and passes it into the marker context. A dimmer at 20%
  draws visibly dimmer bulbs than one at 100%; a dumb on/off switch — which
  reports no `brightness` attribute at all — draws at full strength, matching
  the lumens model's existing "cannot report → full" rule rather than reading
  as artificially dim. Colour already followed the same precedence (the
  entity's own `color_temp_kelvin`/`rgb_color`/`hs_color` if it reports one,
  else the fixture's configurable `kelvin` prop) from before this change;
  fixture kelvin defaults were left as they were.
- `furniture.plant` and `furniture.tree` no longer share one lobed-blob shape
  (`tree` used to just alias `plant`). Each is now its own drawing function
  with real variants picked the same "Look" way as a device. Furniture has no
  family/variant registry the way markers do — one
  shape name is one function that branches on `c.p.variant` — so the swatch
  grid needed a small furniture-side counterpart:
  `Shapes.furnitureVariantsOf(shape)` plus a second branch in panels.js's
  Look-grid code that draws swatches with `Shapes.furniture` instead of
  `Shapes.marker`.

### Floor switcher is a dropdown, not a scrolling row of pills

- The floor picker (`panels.js`'s `renderFloors()`) now populates a
  `<select id="floorSelect">` instead of a row of pill buttons — a house
  with more floors than the topbar is wide used to scroll that row
  sideways with no visible sign there was more past the edge. A dropdown
  never runs out of room. "+" (add a floor) is now a permanent button next
  to the select, bound once in `main.js`, rather than an option rebuilt
  into the list on every render.

### Multi-select, alignment, and a special-character audit

- Added multi-select: shift-click toggles an item/room in or out of the
  selection; a marquee (rubber-band) drag on empty canvas selects everything
  inside it (items by point, rooms only when fully enclosed). Dragging any
  selected member moves the whole group as one undo entry. `S.multi` sits
  alongside the existing single `S.selection` rather than replacing it, so
  every existing single-selection code path is unchanged.
- The inspector shows a "N selected" panel for a multi-selection, with
  **align** buttons (left/centre/right, top/middle/bottom — a plain
  translation, never a resize) plus Duplicate and Delete. Resize/rotate/
  vertex-drag stay single-selection only — a deliberate scope line, not a gap.
- Added drag-time **alignment guides**: dragging a single item or a group
  snaps its centre within 6 screen px of another item's centre or a room's
  edge/centre, drawing a magenta guide line the length of the plan while
  snapped. Alt suppresses it for the one drag where near-but-not-quite is
  what you want.
- Ctrl/Cmd+D duplicate and arrow-key nudge now also operate on a multi-
  selection, not just a single item/room.
- Fixed a real, pre-existing latent bug found while auditing special-character
  handling: `main.js`'s bootstrap-failure page built its error message via
  `innerHTML` + string interpolation, which would parse `<`/`&` in the error
  text as markup instead of showing it verbatim — switched to `textContent`.
  Also removed an unused `html:` raw-HTML escape hatch from `panels.js`'s
  `h()` helper (nothing in the codebase called it) and made client-side
  `uniqueId()` Unicode-aware (`\p{L}\p{N}` instead of ASCII-only `a-z0-9`), so
  a room named entirely in Chinese, Arabic or Cyrillic keeps its own id
  instead of collapsing to "room"/"room_2". Confirmed already-correct and
  left unchanged: SVG export's attribute/text escaping, and the custom-CSS
  path's `</style>`/`</script>` stripping.

### Editor interaction pass: drag-and-drop, keybindings, and a fixed workflow gap

- Fixed the biggest reported friction: placing an item left it selected but
  unreachable — its resize/rotate handles were drawn regardless of tool, but
  the Place tool's pointer handler stamped a new copy on every click,
  including on the thing you just placed. Grabbing a handle or the body of
  the CURRENTLY SELECTED item/room now moves/resizes/rotates it instead;
  clicking anywhere else while armed still places another one, so placing
  several of the same fixture still needs no trip back to the palette.
- Added drag-and-drop: drag a library button straight onto the plan
  (`canvas.js`'s new `dragover`/`drop` handlers, `application/x-fps-type`).
  Dropping places the item and switches to Select with it ready to adjust.
- Added keybindings: arrow keys nudge the selected item or room a few inches
  (Shift for a foot) — the position counterpart to the existing `[`/`]`
  (rotate) and `-`/`+` (resize); Ctrl/Cmd+D duplicates the selection with a
  small offset.
- Added a `?` keyboard shortcut and a topbar button opening a shortcuts
  reference dialog — every binding in one place instead of scattered across
  tooltips.
- Filled in missing tooltips across the toolbar and status bar (snap, grid,
  zoom, save, import/export, live states, theme).
- Fixed a real, pre-existing crash found while touching this code:
  `nudgeRotation`/`nudgeSize` read `S.selection.kind` with no null check, so
  pressing `[`, `]`, `-`, or `+` with nothing selected threw.

### The library palette now shows what a type actually looks like

- `typeIcon()` in `panels.js` drew one of two boilerplate SVGs for every
  single library entry — a circle for any device or fixture, a rounded
  rectangle for any piece of furniture — regardless of what the type actually
  was. It now calls `Shapes.marker`/`Shapes.furniture`/`Shapes.icon`, the same
  functions the canvas and the per-item "Look" picker already use, with the
  type's own defaults standing in for a real item's state. A fan in the
  palette now looks like a fan; a bed looks like a bed.
- Closed the one real gap this exposed: 11 furniture types had no shape
  defined anywhere, canvas included, and rendered as a plain box —
  `furniture.bike`, `exercise_bike`, `nightstand`, `coffee_table`, `sandpit`,
  `compost`, `clothesline`, `gate_leaf`, `ottoman`, `safe`, `laundry_basket`.
  Each now has a real `shapes.js` drawer. `furniture.rect` is unchanged — it
  is meant to be a plain box.
- Fixed a real, silent misconfiguration found along the way: `device.radiator`
  named the `channelBox` shape (built for multi-socket devices like an
  extension cord), so it rendered as an empty box with its `icon: "flame"`
  field quietly ignored. Moved onto the existing `heat` family's `convector`
  variant, which already draws a proper finned radiator.
- `test/verify.js` gained three checks: no furniture type sits on the generic
  `rect` fallback by accident, every furniture `render.shape` names a real
  drawer, and every device `render.family` names a real `Shapes.MARKERS`
  entry with a resolvable variant — the class of bug this fix closes, pinned.
- Also hardened the MCP test suite's `withServer()` helper (added for the
  work below): a bind failure on a Windows-reserved ephemeral port now
  retries on a fresh port instead of failing the run, and is detected on the
  child's exit instead of waiting out the full timeout.

### MCP server — an AI can draw the plan

- `app/lib/mcp.js`: a Model Context Protocol server, `POST /mcp`, stateless
  JSON-RPC over "Streamable HTTP" (spec 2025-06-18). Nine tools: `get_contract`,
  `get_project`, `get_registry`, `list_library` (reads); `edit_collection` and
  `edit_settings` (the two mutating tools — id-addressed add/update/remove on
  floors/rooms/items/openings, and a dot-path set on everything else); plus
  `validate_project`, `preview_dashboard`, and `install_dashboard`.
  `install_dashboard` is only advertised in `tools/list` when the new add-on
  option `mcp_allow_dashboard_install` is on (default off).
- Every `edit_collection`/`edit_settings` call runs `app/lib/validate-project.js`
  (new) before saving and refuses to write on error — structural checks (unique
  ids, valid shapes, a library type that actually exists, wall/room references)
  the human editor's own drawing code can't violate but raw JSON from an AI can.
- Not served through Ingress: Ingress authenticates by a per-browser-session
  cookie only Home Assistant's frontend can mint, which a generic MCP client
  has no way to obtain. `/mcp` is reachable on the add-on's own published port
  instead (`config.yaml` now declares `ports: 8099/tcp`), outside the
  `allowIngressPeer()` gate every other path still requires.
- Auth needs no new secret: a presented `Authorization: Bearer` token is
  checked by asking Home Assistant's own `GET /api/` whether it is valid
  (over the same Supervisor/dev connection `ha.js` already has), so any long-
  lived access token from the user's own Home Assistant profile works, and
  revoking it there revokes MCP access immediately. Offline dev mode (no
  Home Assistant configured) allows any caller, matching how the entity
  picker already degrades.
- The open editor updates live while an AI (or a second tab) is editing:
  `store.js` gained a tiny pub/sub fired on every `writeProject()` regardless
  of caller, `GET /api/project/stream` turns that into one Server-Sent Event
  per change, and the client refetches and repaints — but only while there
  are no unsaved local edits, so a human mid-edit is never overwritten (they
  get a toast instead).
- `mcp_enabled` (default on) is the full off switch for the feature — set it
  to off and `/mcp` answers 404 everywhere, as if `mcp.js` were never loaded.
- Optional TLS for MCP: `ssl_cert`/`ssl_key` (a file in Home Assistant's
  shared `/ssl` folder, or an absolute path) start a SECOND, dedicated
  `https` listener on `mcp_ssl_port` (default 8443) serving nothing but
  `/mcp` — deliberately not the same listener the Ingress-routed editor uses,
  since Supervisor's ingress proxy speaks plain HTTP to every add-on and has
  no reason to tolerate that backend suddenly requiring TLS. The plain-HTTP
  `/mcp` on the main port keeps working unchanged either way; this is purely
  additive, for anyone who forwards the MCP port past their own LAN.
  `config.yaml` gained a read-only `ssl:ro` map for this.
- Confirmed from Home Assistant Supervisor's own source, rather than assumed:
  Ingress's session cookie can only ever be minted by Home Assistant Core
  itself (`create_session` is gated by `@require_home_assistant`, an
  origin-identity check, not a credential check) — no external caller, with
  any credential, can obtain one. Nabu Casa's remote UI doesn't change this
  either: it tunnels straight into Core's own port and never reaches an
  add-on's separate port at all. Both are documented in `PROGRESS.md` so this
  doesn't need re-deriving next time it comes up.

### Ownership, per-project resources, and reopening a deployed design

- `app/lib/provenance.js` is the app's ownership contract: every save stamps
  the config with generator, schema, `url_path`, a deployment id, and — opt-in
  — the whole project. `saveConfig()` calls `assertOwnedConfig()`, which refuses to overwrite an
  existing dashboard unless its own stamp names the path being written. This
  replaces the previous "documentation correction" note below, which is now
  out of date: ownership enforcement and project-safe resource identity are
  both implemented, not merely planned.
- `installResource()` takes a `resourceKey` (the dashboard's `url_path`) and
  scopes the card resource's marker to it, so two Floorplan Studio dashboards
  on one instance get two independent resources.
- The add-on can now **discover** what it has deployed and **reopen** one:
  `GET /api/dashboard/discover` and `POST /api/dashboard/reopen`, backed by
  `discover()`/`loadProject()` in `ha-write.js`. Import… → *From Home
  Assistant* lists what was found and
  loads one back in place of the current project. `ha-write.js`'s `connect()`
  now optionally accepts an injected `WebSocket`/`url`/`token`, purely so this
  path is exercisable against a fake Home Assistant.

### Add-on bundle preparation

- Added a repository bundler that writes the required `repository.yaml` plus an
  installable `floorplan-studio/` folder under
  `dist/home-assistant-repository/`.
- Replaced the private test-house fixture in production with a synthetic public
  sample containing only `*.demo_*` entity ids. Runtime `app/data`, backups and
  development fixtures are excluded from both the image and bundle.
- Added required Home Assistant image labels, lifecycle metadata, health
  watchdog, option translations and Ingress peer enforcement. Removed the
  unused writable `share` mount.
- Added square `icon.png` and wide `logo.png` presentation assets. The add-on
  remains `experimental` pending real Home Assistant acceptance testing.
- Added bundle, privacy, presentation and metadata verification; the suite now
  reports 359 passing checks plus one opt-in legacy round trip.

### Node.js 24 distroless runtime

- Replaced Alpine 3.19 plus `apk add nodejs` with
  `gcr.io/distroless/nodejs24-debian13`. The image follows the latest maintained
  Node.js 24 LTS and Debian 13 runtime libraries.
- Removed the shell launcher and obsolete per-architecture `build.yaml`.
  Runtime defaults are image environment variables and the distroless Node
  entrypoint launches `app/server.js` directly.
- Added `package.json` with a strict Node.js `24.x` engine contract and no
  third-party dependencies. All application libraries remain repository-owned
  JavaScript or Node built-ins; there are no npm packages to update.
- Included the synthetic `samples/` project in the production image, fixing
  sample-project loading without publishing the private development fixtures.
- Added `.dockerignore`; runtime `app/data` and backups are no longer copied
  into the production image.
- Supports `amd64` and `aarch64`, including 64-bit Home Assistant OS on Raspberry
  Pi 3/4/5 and Zero 2 W. Removed legacy 32-bit `armv7`, which the Node.js 24
  distroless image does not publish and current Home Assistant no longer lists
  among its supported base-image platforms.
- Synchronized `config.yaml`, `package.json`, and the runtime health version at
  the existing development version. `/api/health` now also
  reports the exact Node version.
- Added eight packaging checks for versions, Node runtime, distroless packaging,
  Raspberry Pi architecture support and runtime-data exclusion.

Node.js 24 exposes the global WebSocket client as a stable API, resolving the
packaged writer's Node 20 runtime blocker. Real Supervisor/Ingress and Lovelace
installation acceptance testing is still required.

## 0.10.0 — 2026-08-29

Introduced the backend-free hosted build foundation. It is not yet a complete
hosted editor workflow; see the correction above.

### `node tools/build-web.js`

Emits `web/` — 33 static files, 1.4 MB. The output needs no Node runtime or
Floorplan Studio backend. The browser adapter is designed to get Home Assistant
data using the visitor's own connection and credentials, but the shared UI is
not yet wired into that complete flow.

**The card it deploys is byte-identical to the add-on's** — verified by hash,
not by inspection. The add-on's guarantee was that the card and the editor are
one renderer because `card-build.js` reads the very files the editor paints
with; the hosted build injects the same bytes instead of reading disk, so the
guarantee survives the move. There is still no second renderer.

### Connecting from a browser

`app/lib/ha-browser.js`. Two ways in, both the user's own credentials, neither
leaving the browser:

- a **long-lived token**, pasted in — works against any reachable instance;
- **OAuth2 / IndieAuth**, Home Assistant's own third-party flow, giving a
  short-lived token plus a refresh token so a session survives without holding a
  ten-year credential.

It talks **WebSocket, not REST**, and that is the whole reason a hosted build is
possible. Lovelace has no REST API — dashboards, resources and configs are
WebSocket commands — and a WebSocket handshake is not a CORS request. States are
read over that same socket rather than `GET /api/states` for the same reason:
the REST API needs `cors_allowed_origins` in `configuration.yaml`, and asking
for a YAML edit before the product does anything is a dead funnel.

**The one thing that genuinely does not work** is an https page reaching a
plain-http instance. That is a browser rule and no code can defeat it, so it is
detected up front and reported as itself, with the fix: use your instance's
https address, or run the add-on. The two builds cover each other's gap.

### Discovery and reopen primitives

The browser writer can **stamp** a deployed dashboard and optionally carry the
design in that stamp. `discover()` and `loadProject()` provide the corresponding
library primitives. In 0.10.0 no shared UI invokes this flow, add-on deployments
are not stamped, and hosted embedding defaults on in code rather than being an
explicit opt-in. These primitives therefore do not yet deliver portable reopen
as a user-facing feature.

### Fixed: resource matching was aligned by luck

Both writers identified their own Lovelace resource by looking for the base64 of
`fps-floorplan-card` inside the base64 of the module. Base64 encodes in 3-byte
groups, so a substring's encoding appears in the whole **only when it starts at
an offset divisible by three**. It worked because the card happened to contain
that string at all three alignments, so one landed on zero. Any edit shifting
every occurrence off that alignment would have silently stopped matching — and a
regenerate that cannot find its own resource creates a second one, which means
two definitions of the same custom element and the second throws.

A banner is now prepended at offset 0, making the marker aligned by
construction. Resources written by earlier versions are still recognised, so an
upgrade adopts its own resource rather than deploying a duplicate beside it.

Found by the browser client's tests, whose content was short enough to have only
one occurrence — the case the real card never hit.

### Also

- `card-build.js` is isomorphic: guarded `fs`/`path`, `setSources()` for the
  browser, and no bare `Buffer`.
- `web/` is git-ignored — it is a build artefact.

## 0.9.0 — 2026-08-29

Devices are drawn as the objects they are, you pick which one, and you resize it
by dragging its edge.

### 84 marker variants over 22 families

A disc with a fan icon in it is a *label* for a fan. A hub with three blades
that turn is a fan. On a floor plan that difference is the whole point — you are
meant to recognise the room from across it without reading anything, which is
the argument the furniture shapes have always made for beds having pillows.

So devices now draw themselves from a **marker registry**, organised by family
because that is the grain at which real objects differ:

| Family | Looks |
|---|---|
| fan | 3-blade (the common ceiling fan), 4-blade, 5-blade, slim DC, caged extractor |
| camera | bullet, dome, turret, PTZ, cube |
| screen | flat TV, framed, projector with its beam, set-top box |
| speaker | bookshelf, round, soundbar, horn |
| cool | split, cassette, window, outdoor condenser, portable |
| heat | radiant, convector, oven, boiler, element |
| water | droplet, tank with a live level, tap, pump with a turning impeller, meter |
| motion | ceiling dome, wall PIR, mmWave radar, vibration |
| contact | reed pair, garage door, gate |
| lock | deadbolt, padlock, keypad |
| alarm | bell, siren horn, smoke disc, panic button |
| plug | socket, 3-pin, EV connector |
| power | symbol, breaker, relay module |
| network | router, access point, switch ports, server |
| cover | curtain, roller at its live position, venetian, shutter |
| laundry | front-loader with a turning drum, top-loader, dishwasher |
| robot | round vacuum, dock, handheld, purifier |
| thermostat | dial, wall unit, probe |
| energy | bolt, meter, battery at its live charge, inverter |
| valve | gate, ball, solenoid |
| solar | panel, array |
| sense | disc, tag, square, diamond — the fallback, which still carries its icon |

111 of the 113 device types now name a family. The two that do not — the
extension board and the radiator — keep their own shapes, which draw one socket
per configured channel and could not be expressed as a variant.

Several variants read live state: a tank fills to its level, a battery to its
charge, a roller blind sits at its position, a pump's impeller and a washer's
drum turn only while running.

### Pick the look in the editor

The properties panel gets a **Look** section: a grid of the variants drawn as
themselves, not a dropdown of names, because "bullet" and "turret" mean nothing
until you see them. Each swatch is drawn by the same registry the plan draws
from, so the picker cannot drift from what you get.

Precedence is item → type → family default, so improving a family's default
improves every plan that never expressed a preference and changes nothing for
one that did.

### Resize by dragging an edge

Four handles on the selected marker, on the edge they move, alongside the
rotation ring. `-` and `+` do the same from the keyboard, for the same reason
`[` and `]` exist: a 7px handle is not a target on a phone. One drag is one undo
entry.

**What the drag changes depends on the type**, declared as `render.resize`:

- Things with a real footprint resize **in feet** and stay to scale — a ceiling
  fan's sweep, an AC's width, a washer's. 10 types.
- Everything else resizes its **drawn marker size in px**, because a smoke
  detector at true scale is a four-inch dot nobody can tap.

### Also

- `select` properties rendered as a free-text box in the item panel, which let a
  typo into a field whose whole job is to hold one of a known set. They are a
  dropdown now.

## 0.8.0 — 2026-08-29

A command that never lands now says so, and a master group is no longer assumed
to be the whole room.

### Confirming a command, and retrying one that never lands

Painting a tap immediately fixes how the plan *feels*. It does nothing about a
command that is simply lost — and on a Zigbee or Z-Wave mesh that happens: a
device that has drifted off its router swallows the command while still
reporting as online. The service call succeeds, nothing moves, the optimistic
guess expires, the marker slides back, and **nothing anywhere says it failed**.
It stays invisible until somebody walks into the room.

So a guess can now confirm itself:

- While a command is in flight the marker **pulses** (`.fps-pending`) instead of
  sitting still, so a guess no longer looks identical to a settled state.
- If the entity has not reached what it was asked for when the confirmation
  window closes, the command is **re-sent** — up to `retries` times, `retryMs`
  apart — then dropped so the real state shows.
- A retry re-sends the *original* call narrowed to the one entity that did not
  answer, so a room-wide command does not re-command everything that already
  arrived.
- An **unavailable entity is never guessed at and never retried.** It is known
  to be gone; three more commands would only bury an honest marker.

All of it is configurable, under Appearance → Behaviour:

| Setting | Default | What it does |
|---|---|---|
| `dashboard.optimistic` | `true` | Paint a tap before Home Assistant confirms it |
| `dashboard.optimisticMs` | `1600` | The confirmation window, ms |
| `dashboard.retries` | `0` | Re-sends after that window — **off by default** |
| `dashboard.retryMs` | `1000` | Gap between re-sends, ms |
| `dashboard.pendingStyle` | `true` | Draw in-flight markers as in-flight |

Any of them can also be set on the card config, which wins.

**Retries are off until you turn them on.** How many extra commands a flaky mesh
should get is a judgement about your house, and the framework has no business
making it for you. The mechanism ships; the choice does not.

### A master group is not automatically the whole room

`room.master` is a light group used as the whole-room control, and the card
treated it as covering every lamp in the room. A group does not have to. A
Zigbee2MQTT group can only hold Zigbee2MQTT devices, so a mains-wired relay can
sit inside the room and outside its master at the same time — and **All on
skipped it, silently, forever**. An HA light group can just have been built from
a different list than the plan was.

Now the master still leads — for a Z2M group that is one broadcast instead of N
unicasts — and any member it demonstrably does not reach is added back. A group
that publishes its membership in `attributes.entity_id` is walked; one that
publishes nothing is treated as covering nothing and its members ride along
explicitly. Applies to All on/off and to tapping a ganged room.

### Counts are per entity, not per marker

One switch can drive two fittings — a pair of gate lamps, a row of downlights on
one relay — and each gets its own marker, because that is where they physically
are. Room chips and the room sheet were counting **markers**, so a single relay
read as `2/6` and disagreed with the All on/off beside it.

Counts are now per entity. Lumens are still per fitting: two lamps on one switch
really are two lamps' worth of light in the room. Both numbers were always
right about different things; only one of them belongs on a chip.

## 0.7.0 — 2026-08-22

Light behaves like light, walls can curve, and the cards take your own CSS.

### Light zones, and coverings on every opening

A lamp's glow pool is now **clipped to the room it is in** — light stops at
walls — **plus a patch of spill through every opening**, because light does get
through a window and a plan that stops it dead at the glass is as wrong as one
that ignores walls.

How far it spills is the opening's own transmission, the same single number the
daylight model reads. Which means **coverings**:

- **19 of them** — sheer, drape, blackout, day/night; roller, roman, honeycomb,
  venetian, vertical, bamboo; plantation shutter, rolling shutter, louvred
  panel; awning, adjustable pergola slats; insect mesh, solar film, frosted
  glazing.
- Optional on **every door and window** — an opening without one behaves exactly
  as it did before.
- Each declares what it passes **open** and **closed**; the opening's own
  `position` (0..100, Home Assistant's own cover scale) picks a point between.
- **Bind a cover entity** and the position follows it live — `current_position`
  where the cover reports one, its open/closed state where it does not. An
  unavailable cover falls back to the hand-set position, the same rule the door
  sensors use.

So a blackout blind pulled down stops the spill; a sheer curtain lets most of it
past; and the sun coming in and the lamp going out are the same number.

`project.lighting.zones = { enabled, spillFt }` if you want none of it.

### Curved walls

A room's outline is a list of corners, and **a corner may now carry a radius**
that bows the segment arriving at it into an arc:

```jsonc
"points": [[0,0], [10,0], [10,6, 7], [0,6]]      // the third corner arrives on an r=7 arc
```

The sign picks which way it bows; a radius too small to reach falls back to a
straight edge. It is flattened once in `roomPoints()`, so hit-testing, wall
runs, openings, clip paths and the cove all follow the curve without knowing
anything about arcs.

**The cove traces the room's outline** now rather than a box around it — inset
edge by edge, so an L-shaped room gets an L and a long thin room does not get
squeezed. That was the last of the four gaps in `REPLICATION.md`.

### Your own CSS

**Dashboard… → Appearance & behaviour** takes a stylesheet, appended to the
cards' own inside their shadow root — so it styles these cards and can reach
nothing else on the dashboard. A **frosted-glass preset** is one button, for
anyone replacing a `card_mod` setup.

### Two behaviours, switchable

- **Optimistic taps** (on by default). A tap paints the state it asked for
  immediately rather than waiting 100–300ms for Home Assistant. The guess is
  dropped the moment the entity reports anything different, and expires on its
  own — a failed call leaves the plan telling the truth.
- **Hover tooltips** (on by default). Name, state, brightness, fan speed; for an
  opening, its type, whether it is open, and how far its blind is drawn. Never
  shown on a touch screen, where there is no hover and the tip would sit under
  your thumb.

Both at `project.dashboard`, so they are one setting for the whole dashboard.

## 0.6.0 — 2026-08-22

A much larger inventory, a card that wears your own theme, two overview cards
you can configure, and a plan you can actually use on a phone.

### The inventory

**251 types, up from 124**, across nine categories — 19 fixtures, 113 devices,
110 furniture, 9 logic. Everything a real house has rather than everything a
show flat has: swimming pools, lawns, ponds, gazebos, barbecues, greenhouses,
sheds and trampolines outdoors; borewell, sump, booster and pool pumps, tank
level and water quality sensors, softeners, generators, UPS and compressors in
the motor room; robot and handheld vacuums, treadmills, pool tables, cots, server
racks and safes indoors; heat pumps, boilers, radiators, underfloor heating and
cooker hoods; ovens, kettles, air fryers, freezers and wine coolers.

**47 room types.** Picking one sets the room's flooring and whether it is
outdoors, then gets out of the way — a lawn arrives with grass on it and a motor
room does not arrive carpeted. Lawn, swimming pool, pool deck, motor room, plant
room, server room, workshop and driveway are all in the list, alongside the
bedrooms and bathrooms.

Nine new drawn shapes back them: pool (with ripples and a ladder), lawn, pond,
grill, treadmill, pool table, rack, crib, shed.

### It wears your theme

The card's default theme is now **follow Home Assistant**. It measures the
dashboard's own background to pick a light or dark base — materials have to be
real colours, because a flooring generator shades its base to derive grain and
grout — and then takes chrome and accents from Home Assistant's own CSS
variables: card background, text, dividers, the active colour. Pin it to Frosted
or Blueprint from the Generate dialog if you would rather it did not move.

### Two overview cards, fixed in shape and yours in content

- **`custom:fps-house-card`** — the house's name and its weather are always
  there; everything else is yours. Count chips ("26/101 lights"), live stats
  (power in kW past a thousand, signed, formatted), people chips lit when they
  are home, and the house's own shortcuts as buttons. Seeded from the plan the
  first time so a new project has something on it.
- **`custom:fps-floor-card`** — "14 of 53 active" and a bar per class. The
  classes default to whatever that floor actually has, grouped by library
  category, so adding a heater to the plan adds a heater row.

Both replace the old glance + markdown pair, which was two cards each doing half
a job: the counts could never be tapped and the glance could never count.

### Responsive

Phone, tablet and wide breakpoints. Every control-surface design that assumes
space beside the plan — rail, dock, popover, fullscreen — becomes a bottom sheet
under 600px; tap targets grow; the floor card's rows go to two columns; the
house card's people wrap under the title.

### On the plan

- **Room chips carry their count again** — a pill with the room's name and
  `3/8`, suppressed for a one-lamp room, a ganged room, or any room you name.
- **Ganged rooms act as one.** Tapping either lamp of a shared switch acts on
  both, through the room's master group where it has one.
- **Pinch, wheel and drag** to zoom and pan; double-tap to fit. Done by moving
  the viewBox rather than by CSS transform, so strokes stay 1px and labels stay
  sharp. A drag only becomes a pan once it has moved 8px, so the plan stays
  tappable one-handed.

### Fixed

- `card-build.js` dropped `categories` from the bundled library, so the floor
  card grouped by raw ids.
- A panel could overflow the card on a phone: it was content-box, and the
  runtime's inline width beat every stylesheet rule.

## 0.5.0 — 2026-08-22

Scenes, automations and helpers — the entities that are not *things in a room*.

### Shortcuts

The user's own actions, on the house, a floor or a room. A shortcut is a label
and something to call:

```jsonc
{ "id": "dnd",  "label": "Do not disturb", "entity": "input_boolean.example_room_quiet", "slot": "header" },
{ "id": "fan3", "label": "Fan 3", "service": "script.set_fan_speed", "data": { "speed": 3 } }
```

- Any entity of any domain, or a bare service call with data — which is how a
  script that takes variables gets a button per value.
- `slot: "header"` puts one in the panel's button row; otherwise the sections'
  filters claim it, and `section` pins it to one. An entity with a header button
  is not also given a tile.
- They cascade house → floor → room and **add up**, so a house scene shows in
  every room. A nearer layer repeating an `id` replaces it, or hides it.
- **The framework ships no vocabulary.** It does not know what a
  do-not-disturb, a turbo or a movie scene is — those are labels, and labels
  belong to the house. `verify.js` greps the shipped defaults to keep it that
  way. (The first cut of this shipped a `roles` registry naming six of one
  house's concepts; it was wrong and is gone.)
- **Nothing is created.** A shortcut names an entity or a service that already
  exists. The one module that can write anything can create a Lovelace resource
  and a dashboard, and nothing else.

### Found by name, with no configuration

- A section can search the live entity list: `"match": "@room"` expands to the
  room's own `keys`, or its id and name. One shipped Scenes row serves every
  room, and a scene added next month joins it by itself.
- Word-bounded, because `informal` literally contains `formal`. A key ending in
  `_` stays a prefix test, because entity ids are prefixed (`gr_`, `mb_`).
- `entityPattern` scopes a script namespace; `excludePattern` drops the scenes
  your automations snapshot into.

### On the plan, and in the card

- **Nine `kind: "logic"` library types** — automation, scene, script, toggle,
  button, number, select, timer, counter. Ordinary library entries with drawn
  icons, placed like any other marker, and they join their room's Shortcuts row.
- **`domainActions`** — one registry saying what a tap does and which widget an
  entity gets, across 31 domains. Sliders for numbers, dropdowns for selects,
  buttons for scenes, and a hold that runs the declared alternative (Run now for
  an automation, Cancel for a timer) where there is one.
- `onRule: "momentary"` for the things whose state is the last time they fired,
  so a scene nobody has run yet stops drawing as a dead entity; `offStates` for
  the domains whose off is just a list of words.
- The generated dashboard gains **Scenes & scripts** and **Shortcuts** glance
  rows per floor, derived from the plan like everything else on it.

### Fixed

- A room whose controls named a `preset` got the default sections on the
  dashboard: `card-build.js` was trimming the preset table out of the bundle.
- `card-build.js` was also dropping `offStates`, so an active timer drew as off.

## 0.4.0 — 2026-08-22

The add-on can produce a dashboard now. Until this release it drew a house and
exported a picture of it; installing anything was still a hand job.

### Generate the dashboard

- **▦ Dashboard…** builds and installs a Home Assistant dashboard: one tab per
  floor, the live plan on each, house and floor overview cards either side.
  Named by you, or defaulted from the project name.
- **`custom:fps-floorplan-card`** — the live card. It is the *same* scene
  builder the editor paints with, concatenated verbatim into one Lovelace module
  resource with the project baked in, so there is no second renderer to drift
  from. One resource serves every floor; about 275 KiB for five.
- Tap a light to toggle it, hold for more-info, tap a room for its control
  surface. The seven control designs the editor has always been able to
  configure are finally rendered — brightness slider, per-type group buttons,
  individual lights with live colour swatches, the room's devices.
- Repaints are guarded by a signature over only the entities the floor binds, so
  an unrelated sensor updating constantly costs one string comparison.
- **Overview cards** are derived from the markers already on the plan — no
  hand-maintained entity list anywhere. A tappable `glance` row for the real
  entities, and a `markdown` line for the counts a glance card cannot do.
- **`preview.html`** drives the generated card against a stubbed `hass` built
  from the read-only state snapshot. It loads the exact bytes the installer
  sends, so it is a real check rather than an approximation.
- Home Assistant **writing** is confined to `lib/ha-write.js`: Lovelace
  resources and one dashboard's config, over WebSocket, with a hard refusal of
  any `url_path` but the one named and of the default dashboard outright. It
  cannot call a service — there is no code path that builds one. The previous
  config is backed up before the save, and the save is read back and checked.
  `lib/ha.js` stays read-only by construction.

### Light

- **`lib/lighting.js`** — lamps light rooms the way the sun does. Watts × lamp
  count × efficacy × brightness gives lumens; lumens over floor area gives
  foot-candles; that becomes a per-room wash. Fixture `watt` values were carried
  but unused since 0.1.0.
- Every fixture type ships a real wattage, efficacy, beam and colour
  temperature, and every one is editable per marker. **Lamps here** is the count
  of physical lamps one marker stands for — a spots group is eight downlights on
  one entity and now lights the room like eight.
- A **night scrim** over the whole plate, with lit rooms lifting back through
  it. This is what makes on/off legible at arm's length instead of needing a
  marker inspected.
- Glow pools are sized from each fitting's actual output rather than a fixed
  per-type radius.
- A light that is on but reports no brightness counts as full, not dim.
- House- and floor-scoped config under **◐ Light**, same merge rules as the sun.

### Rotation and coverage

- Every device and every furniture type can be rotated, plus the fixtures that
  have a direction. Three ways: a **drag handle** on the selection ring, **`[`**
  and **`]`** (Shift for 45°), and a compass dial in the inspector.
- **Coverage cones**, drawn from each item's own field of view, range and
  facing: vision wedges for cameras, PIR and mmWave; arcs for speakers and
  sirens; rings for routers; drifting chevrons for airflow; a glass bar for a
  screen. One code path, declared per type in `library.json`.
- The camera's old fixed triangle is gone — it is a real 90° / 22 ft wedge you
  can point at the gate.

### Motion

- Fans draw their real blade count and spin at their real speed. Sensor cones
  pulse, airflow drifts, signal rings breathe. All state-driven, all stopping
  when the state does.
- The keyframes ship as a `<style>` node inside the scene, so the editor, the
  exported SVG and the card get them from one place. Previously `fps-spin` was
  emitted on a field neither backend read and no stylesheet defined — the fan
  blades had never actually turned.
- Honours `prefers-reduced-motion`, and there is an off switch under **Light**.

### Naming and configurability

- **Every library key is now `<kind>.<name>`** — `device.camera`,
  `fixture.spot`, `furniture.bed`. One rule, no exceptions. An `aliases` table
  maps the old bare names back, and a saved `library.json` is migrated in place,
  keeping any edits. Bare names two kinds both claim (`solar`, `water`) are
  deliberately absent from that table.
- No two types share a label any more. `test/verify.js` asserts it.
- **44 of the 50 device types had no configuration at all.** They all do now —
  capacity, throw, field of view, blade count, sweep, gangs, litres, rated load,
  flow, screen diagonal, panels and watts per panel — and every property added
  is read by something that draws.
- **Solar wattage split**: two arrays sharing one inverter sensor each show
  their own share, divided by installed capacity, summing to the meter's
  reading. An explicit share is taken off the top and the rest divide what is
  left.
- `onRule: "numeric"` — a meter's state *is* its reading, so `state === 'on'` is
  never true for one. Solar arrays, energy meters and tank sensors were drawing
  in the off style with their readouts suppressed.

### Doors and openings

- The Opening tool now asks **which** opening before placing one, doors first,
  and drops it at the type's own real width. Previously it always placed a
  2.5 ft door and nothing on screen said the tool could do anything else.
- It refuses a wall shorter than the opening rather than overlapping it.

### Other

- `PlanScene.hitTargets()` — tap targets are shared between the editor and the
  card, so "what is easy to grab while drawing is easy to tap on the dashboard"
  is enforced rather than hoped for.
- The inspector groups properties by what they do — Size, Aim and coverage,
  Light output — and shows what the numbers mean: `covers about 380 sq ft`,
  `2750 lm · 9.1 fc alone in Formal Living`.
- The server honours `PORT` as well as `FPS_PORT`.
- `test/verify.js`: 90 checks → **154**.

## 0.1.0 — 2026-08-21

First build. Not deployed to Home Assistant.

- Multi-floor projects; floors as tabs with their own extent and level height.
- Room drawing: rectangle drag, freehand polygon, vertex editing. A rectangle
  stays a rectangle when its corners are dragged.
- Openings (door / window / opening / grill) placed by clicking the nearest wall.
- Device placement from a configurable library; position and room recorded.
- Device library as data (39 types) — shape, size, tap radius, glyph and
  per-state colours editable in the UI.
- Themes as token maps, editor chrome and drawing restyled together.
  Frosted Glass Light and Blueprint Dark included.
- Entity binding from the live entity list, with manual entry when offline.
- Live-state preview.
- Import of hand-written floor specs, verified non-lossy against five real
  floors; export back to that format plus a rendered SVG per floor.
- Snapshot undo/redo, debounced autosave, 10 rolling project backups.
- Home Assistant access read-only by construction; entity attributes redacted
  by allowlist, location domains dropped entirely.

## 0.2.0 — 2026-08-21

Everything that was hard-coded became a registry.

- **Sun & daylight.** Give the house a GPS location and the plan models
  daylight: NOAA solar position (verified against almanac sunrise/sunset),
  a configurable extinction curve, weather dimming, and optional corroboration
  from a real solar power sensor. Beams are cast through every opening along
  the true azimuth, scaled by that opening's own transmission. A floor may
  override the house setting, so "sun for the whole house" and "sun for just
  this floor" are one mechanism at two scopes. Time scrubber in the status bar.
- **Flooring.** 28 prebuilt surfaces across three generator kinds — tiled
  patterns (planks, herringbone, brick, deck, chequer), continuous fields
  (marble veining, terrazzo, gravel, grass) and **user scripts**. Seeded PRNG,
  so a floor looks identical on every reload and in the export. Per-room angle
  and colour overrides.
- **Boundaries as a registry.** 19 treatments — walls, half walls, glass
  railings, grills, louvres, mesh, fences, hedges, open edges — each with a
  light transmission the daylight model reads directly. Applies to a whole
  edge or any sub-range of one, so a single wall can be part solid and part
  railing.
- **Openings are objects.** 13 types including single/double/sliding/pocket/
  folding doors, bay windows, clerestories and skylights. Each is selectable,
  carries its own transmission and curtain factor, and a door may be bound to a
  contact sensor and drawn open or closed live. Unsensored doors default to
  open, and a dead sensor degrades to open rather than claiming a door is shut.
- **Room popups are configurable.** Header buttons (All on, All off, Details,
  DND, Close) and sections (brightness, groups, individual lights, devices,
  scenes, extra entities) toggle per room, with presets and a full disable.
  Arbitrary entities from the room can be added as buttons. Three layers merge
  — house, floor, room — by section id rather than by array position.
- **115 library types**, up from 39: 50 devices, 11 fixtures, 53 furniture
  plus a generic box. Device icons are drawn paths, never Unicode glyphs.
  Furniture draws as the real object — beds with pillows and a turned-down
  duvet, hobs with four burners, WCs with cisterns, stairs with a direction
  arrow, sofas with arms and seat divisions.
- Room fields for master light group, DND boolean, ganged switching, part_of
  merging and per-device boost switches, all round-tripping to the legacy spec.
- `test/verify.js` — 39 checks, no dependencies.

## 0.2.1 — 2026-08-22

Self-containment. No behaviour change to the editor.

- **`fixtures/`** — a five-floor test house in this builder's own schema,
  bootstrapped once from real specs and then enriched with flooring variety,
  glass railings, a louvre, door variants, opening heights/transmissions and
  per-room popup presets. `_legacy` residue stripped deliberately. Loadable
  from Import… → Sample projects.
- **Nothing outside this directory is read or written.** `dev-server.js` and
  `test/verify.js` no longer resolve parent paths; `.env` is looked for here.
- **The legacy round trip is now opt-in** via `FPS_LEGACY_DIR`. It exists so
  adoption is not a one-way door, not as a dependency.
- `GET /api/fixtures` and `POST /api/fixtures/load`, with path-traversal
  refused.
- `PROGRESS.md` — resume notes, outstanding work, decisions and gotchas.
- Tests: 39 → 54 self-contained checks, plus the opt-in round trip.

## 0.3.0 — 2026-08-22

Room controls become a registry of designs with real filtering, and furniture
becomes properly configurable.

- **Seven control designs** — bottom sheet, side rail, docked panel, popover,
  compact bar, tile grid, full screen. Each declares surface, anchor, size,
  columns and density. A preset can carry a design; an explicit choice beats it;
  `designOverrides` tweaks one property without defining a new design.
- **Section filters.** A section can be pointed at *everything in the room* and
  narrowed by configuration: domains, marker kinds, library types, device
  classes, name match (contains / word / regex), controllable-only,
  hide-unavailable, sort, limit, never-show and force-in. `include` is applied
  last and always wins. A live editor shows what the filter keeps as you type.
- Three new stock sections — sensors, climate, covers — plus *everything here*,
  and section rows now show a live count of what the room would actually
  display.
- `popup.json` → `controls.json`, `popup.js` → `controls.js`. An existing
  `popup.json` is migrated on first read, keeping the user's own labels,
  sections and presets while filling in keys it predates (designs, new stock
  sections, new presets). `PopupConfig` stays as a global alias.
- **Configurable furniture.** Anything countable is now a property that drives
  the drawing: solar panels across × down (defaulting to a single panel), gap
  and cell lines; sofa seats; wardrobe leaves; bookshelf shelves; hob burners
  (1–6); fridge doors and freezer split; dining chairs per side; round-table
  seats; piano keys; bench slats; plant lobes; pergola cross battens; counter
  sink position. Every furniture type exposes width, depth and rotation.
- Tests: 54 → 90 checks, plus the opt-in legacy round trip.
