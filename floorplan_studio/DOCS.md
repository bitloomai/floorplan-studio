# Floorplan Studio — usage

## Current support boundary

This manual describes the Floorplan Studio editor and its intended deployment
workflow. It does not document or version the separate hand-generated floor-plan
dashboard in the parent workspace.

The editor, local persistence, generated card and local preview work in
development, and the app is **currently being tested in detail in Home
Assistant** — Supervisor, Ingress and dashboard installation included. It runs
on Node.js 24 distroless, which provides the stable WebSocket client its
Lovelace writer needs. Ownership-enforced writes, per-project card resources,
app discovery and reopen of its own deployments (see below), and the MCP server
that lets an AI drive the editor are all implemented and verified locally;
confirming each of them against a real instance is what that testing is for.
Sections describing deployment below are therefore the intended user
experience, and not yet a claim of release readiness.

## Tools

| Key | Tool | What it does |
|---|---|---|
| `V` | Select | Click to select. Drag a room or marker to move it. Drag a vertex handle to reshape a room. |
| `R` | Room | Drag a rectangle. |
| `P` | Shape | Click each corner; `Enter`, double-click or right-click closes the outline. `Esc` cancels. |
| `A` | Opening | Pick a door or window type, then click near a wall. The nearest room edge is highlighted as you hover. |
| `H` | Pan | Drag the canvas. Also middle-drag, or hold `Space`, from any tool. `Alt`-drag pans from empty floor only — over an object `Alt` means "ignore the alignment guides", and a pan that started before the target was looked at made that unreachable. |

`Ctrl`+wheel zooms. `Ctrl`/`Cmd`+`Z` undoes, `Shift` too redoes,
`Ctrl`/`Cmd`+`S` saves, `Delete` removes the selection, `Esc` clears the
selection or disarms the palette. `[` and `]` rotate the selected item — hold
`Shift` for 45° steps. `N` opens this floor's review notes.

**Right-click the plan** for a context menu: the objects under the pointer,
turn, stacking order, copy/paste, the wall's own controls, and adding a note.
On touch, hold one finger or a pen still for half a second. While the Shape
tool is drawing, right-click still closes the outline.

## Mouse, trackpad and touch

Press **`?`** in the editor for the whole list; it is generated from what the
editor actually binds, so it cannot promise a key that is not there.

| | Mouse | Trackpad | Touch |
|---|---|---|---|
| **Move around a zoomed-in plan** | middle-drag, or hold `Space` and drag | two-finger scroll | one finger on empty floor, or two fingers anywhere |
| **Zoom** | `Ctrl`/`Cmd`+wheel | pinch | pinch |
| **Move something** | drag it | drag it | tap to select it, then drag it |
| **Select several** | `Shift`-click, or drag a box | `Shift`-click, or drag a box | turn on **Multi**, then tap each |
| **Drag or extend in a straight line** | keep going the way you started | keep going the way you started | keep going the way you started |
| **Object actions and notes** | right-click | secondary-click | hold still for half a second |

Dragging a room, a marker, a group or a corner **latches to an axis** once it
has travelled far enough to have a direction, and a dashed hairline shows which
one. A 45° drag latches to the diagonal instead, so "bigger, keeping the shape"
is a gesture rather than a held key. Move well off the line to let go. `Shift`
latches immediately and `Alt` switches it off — a tablet has neither, which is
why the latch is automatic: extending a room upward means dragging a corner
straight up, and the sideways slip otherwise lands as a real change to the
other dimension, under the hand that is hiding it.

Zoom holds whatever you were pointing at — the pointer, the middle of a pinch,
or the middle of the view for the `−`/`+` buttons — so zooming in does not send
what you were looking at off the edge.

On a touch screen a plain drag moves the *plan*, not what is under your finger,
unless that thing is already selected. A finger cannot hover to see what it is
about to grab, and a drawn plan is edge-to-edge grabbable things: with "drag
whatever you touch" as the rule, looking at the far end of the house moves a
room instead, under the hand that is hiding it.

### Without a keyboard

**S** in the top bar opens a row of buttons carrying the commands that
otherwise need keys — undo, redo, duplicate, delete, turn, resize, nudge, the
five tools and finishing an outline. It is on by default on a touch device and
off where there is a keyboard, remembered per browser. Buttons dim when they
would do nothing.

### On a narrow screen

Below about 900 px the tool rail and the inspector become drawers so the plan
gets the whole window: **☰** for tools and the library, **▤** for the
properties of what is selected (or double-tap it), and **⋯** for the rest of
the top bar. `Esc` closes whichever is open.

## Adding a door

1. Press **`A`** (or click **Opening** in the tool rail).
2. Choose the type from the **Place** dropdown that appears — `Door` is the
   default; `Double door`, `Sliding`, `Pocket` and `Bi-fold` are there too, as
   are the windows, arches, cased openings, skylights and vents.
3. **Click near a wall.** An opening has to sit on one, so a click in open floor
   is refused. The door arrives at its type's own real width.
4. The inspector opens on it. Set **Along wall / Width / Height / Sill**, then
   **Swing** (in / out), **Hinge** (start / end) and **Leaves**.
5. Optionally bind a **contact sensor** and it draws open and closed live.

An opening also removes that stretch of wall, so the daylight model starts
letting light through it immediately — see *Openings and doors* below.

## Rotating things

Every device and every furniture item has a facing. Fixtures have one when it
means something — a tubelight runs along an axis, a floodlight throws a beam;
a ceiling downlight is a disc pointing at the floor and does not.

Three ways, because a bearing is not something you can read off a drawing:

- **Drag the handle** on the selection ring. Hold `Shift` to snap to 15°.
- **`[` and `]`**, 15° at a time, or 45° with `Shift`.
- The **compass dial** and number box under *Aim* in the inspector.

0° points **up the screen** and it turns clockwise. That is screen-relative like
everything else; the compass mapping lives in the Sun dialog.

The rule is that a type offers **Facing** when its drawing can be turned. A
bollard light, a wall-mounted heater and a projector all have a front and now
say so; a ceiling downlight, a smoke detector and the round face of a socket are
discs with no deducible front, and look identical at every angle whether or not
the control is there. The suite asserts the direction that matters: a marker
family that *can* be turned, used by a type offering no way to turn it, is a bug.

For anything with a **field of view** — cameras, motion and mmWave sensors,
doorbells, speakers, sirens, ACs, TVs, routers — the plan draws the actual
coverage wedge from its `Field of view` and `Range`, and the inspector tells you
the area it covers. Point a camera at the gate by dragging its handle until the
wedge lands on the gate.

## Placing devices

Click a type in the Device library, then click the plan. The palette **stays
armed** so you can place a run of spots in one pass; `Esc` or the Select tool
disarms it.

Each marker records its `[x, y]` in feet and the room it landed in. Moving it
to another room updates that. The room is stored, not re-derived on export —
so a marker that deliberately sits outside every room (a pillar-mounted solar
array overhanging a slab) keeps the room you gave it.

## Binding entities

Select a marker → Home Assistant → Pick…. The list is filtered to the domains
that type declares. If Home Assistant is not reachable, type the entity id into
the box at the bottom of the picker and press Enter.

Multi-outlet devices (an extension board) get an **Outlets** section: each
channel is its own entity and label, and the marker draws one socket per
channel, coloured by that channel's own state.

### Entity value labels

Place **Entity value label** from the Device library and bind any Home Assistant
entity. It draws plain text rather than an icon. Tapping the label always opens
that entity's Home Assistant more-info dialog; it never toggles a light or
switch merely because one is bound.

The default template is `{{ value }}`. Templates are safe text interpolation,
not executable JavaScript or full Home Assistant/Jinja templates:

| Token | Value |
|---|---|
| `{{ value }}` or `{{ state }}` | raw entity state |
| `{{ unit }}` | `unit_of_measurement` |
| `{{ name }}` | friendly name, then the marker/entity name |
| `{{ entity }}` | entity id |
| `{{ attr.x }}` | an attribute, including nested paths such as `{{ attr.forecast.temperature }}` |

For a room temperature label, use `{{ value }} °C`, or `{{ value }}{{ unit }}`
to follow the entity's own unit. Text, background, font size/weight, padding,
rotation, and border color/width/style/radius are configurable. Add value/color
threshold rows to override the text color, border color, or both. At runtime the
highest threshold less than or equal to the numeric state wins.

## Customising how things draw

`edit` next to Device library opens the library table: shape, size, tap radius
and the "on" colour per type. Colours may be:

- `@token` — resolved against the active theme, so it follows theming;
- a literal like `#ff8800` — fixed regardless of theme.

Deeper changes (new types, extra properties, per-state glyphs) are a small edit
to `library.json`. A type needs `label`, `category`, `kind`
(`fixture` / `device` / `furniture`) and a `render.shape`.

Marker shapes are `disc`, `label`, `line`, `fan`, `channelBox`, `camera` and
`perimeter`; furniture has one drawer per object it can be. The full list, with
every type drawn as itself, is the generated
[library catalogue](https://bitloomai.github.io/floorplan-studio/library.html) —
it comes off the registry, so it cannot disagree with what the app ships.

## Sun & daylight

**☀ Sun** in the toolbar. Give the house a latitude and longitude, say which
compass bearing points up the screen, and daylight turns on. Optionally point it
at a weather entity (dims the sky) and a solar power sensor (corroborates the
almanac — it only ever pulls the estimate *down* toward what is really
happening, and is ignored below 12° elevation where a low sun makes almost no
power even on a clear day).

Any floor can override the house setting from the same dialog. A basement or an
interior floor with no glazing is worth turning off.

The status bar gains a **time scrubber** once daylight is on. Daylight is the
one thing you cannot check by waiting, so drag it to any hour and the plan
repaints; **Now** returns to real time.

How much light a room gets is the sum of its openings' area × transmission over
its floor area. A beam is drawn from any opening the sun is actually facing,
reaching `head height / tan(elevation)` feet, capped. That is why a near-zenith
noon casts shorter beams than a low morning sun.

## Walls, railings and grills

Select a room. **Walls & railings** lists its four edges; each defaults to a
wall and can become any of **31 treatments** — glass railings framed and
frameless, metal, cable, timber and stone balustrades, grills, louvres and
jaali screens, half walls and parapets, tinted, frosted and structural glazing,
mesh, fences, hedges, gates, compound walls, thresholds, steps, voids and open
edges. The full table, with what each one passes, is generated from the registry
itself on the
[walls page](https://bitloomai.github.io/floorplan-studio/walls.html) and in the
editor's own **?**. The transmission shown beside each is exactly what the
daylight model reads — that is why changing a balcony edge to glass railing
brightens the room with no other setting.

To restyle only *part* of an edge, add `from` and `to` to the boundary entry in
`project.json`; the edge splits into runs and each draws its own type.

An enclosing treatment also offers **Wall top width (ft)** and **Wall top
finish** — the band you see from above is a horizontal surface like any other,
so it takes the same 178 floor materials and the same generator options. Clear
the width to follow the treatment's own default, which the type editor's
Advanced **Thickness (ft)** sets for every use of that type. In a project file
these are `props.thicknessFt`, `props.topFinish` and `props.topFinishOptions` on
the boundary run. An open edge or a threshold has no wall top and offers
neither. A material is generated once over the floor extent and clipped to the
bands, so its physical scale is continuous across the house and a wall two rooms
both name is painted once rather than twice.

## Openings and doors

The Opening tool (`A`) places one on the nearest wall. Select it to change type,
size, position, and its two daylight numbers:

- **Transmission** — how much light the opening itself passes.
- **Curtain / blind** — a second multiplier for a covering.

The panel shows the effective product, which is the single number the sun model
uses.

**State on the plan** — Shut, Part open, Open, or Follow the type — is stored on
the opening rather than being a preview, so a front door you want drawn closed
is closed in the editor, in the exported plate and on the generated dashboard
alike. Part open reveals a slider for how far. Binding a contact sensor or a
cover replaces the setting with the live reading rather than blending with it.
The control only appears when the type has a state to be in: one that draws a
moving leaf, or one that declares `openTransmission` and so passes different
amounts of light as it travels. A fixed pane, an arch and a cased opening say so
instead of offering a control that would change nothing.

### Blinds, drapes and shutters

Any door or window can have a **covering** — it is optional, and an opening
without one behaves exactly as it always did. Nineteen ship: sheer, curtain,
blackout and day/night pairs; roller, roman, honeycomb, venetian, vertical and
bamboo blinds; plantation shutters, rolling shutters and louvred panels;
awnings and adjustable pergola slats; insect mesh, solar film and frosted
glazing.

Each declares what it lets through **wide open** and **fully shut**. The
opening's own **Open %** picks a point between the two — 0 is shut, 100 is open,
the same scale Home Assistant's covers use.

Two ways to say where it is, and they are a fallback chain rather than
alternatives:

- **Bind a cover entity** and the position follows it live — `current_position`
  where the cover reports one, its open/closed state where it does not.
- **Set it by hand** with the slider.
- A bound cover that has gone unavailable falls back to the hand-set position,
  because that is the last thing anybody actually said about it.

The result is one number, and **both light models read it**: how much sun gets
in, and how far a lamp inside spills out through the same window. Pull a
blackout blind down and the room stops leaking light onto the balcony.

**A covering also draws.** This is a top-down plan, not an elevation, so what
you see is the footprint a covering actually occupies: drapes gather into
stacks at the ends and close across the opening, a roller's head cassette stays
put while the fabric darkens as it comes down, venetian and vertical slats turn
on their own axis, mesh reads as a fine screen, and an **awning** is the one
that projects — it reaches out from the wall by its own `projectFt` and the
plan's bounds make room for it. Vertical travel becomes ink density rather than
a picture of a blind seen from the front, because from above there is nothing
else it could honestly be. A covering with no plan look draws nothing and only
changes the light.

### Curved walls

A room's outline is a list of corners, and a corner can carry a **radius** that
bows the wall arriving at it into an arc:

```jsonc
"shape": "poly",
"points": [[0,0], [10,0], [10,6, 7], [0,6]]
```

The third corner arrives on an arc of radius 7. The sign of the radius picks
which way it bows; a radius too small to span the gap falls back to a straight
edge rather than drawing nonsense.

Everything follows the curve — the wall, the clip path, hit-testing, a cove
running around the room, and where an opening sits.

A door can be bound to a **contact sensor** and will then draw open or closed
live. `'off'` is closed; everything else — unavailable, unknown, a flat battery,
a deleted entity — draws **open**, because a dead sensor should degrade to the
default rather than claim a door is shut when nothing knows. An unsensored door
draws open unless you set it otherwise.

Swing is drawn from geometry, not from the word: `in` bulges toward the room's
+x/+y side, so which side that lands on depends on whether the door sits on a
min or max edge. Read the arc.

## Light

Lamps light rooms the same way the sun does, and the two meet as one number.
Each fitting carries its own watts; the model turns that into how bright the
room reads.

Select a fixture → **Light output**:

| Field | Means |
|---|---|
| **Watts each** | One lamp's real wattage. |
| **Lamps here** | How many physical lamps this one marker stands for. A spots group is often eight downlights on one entity — say 8 and the room is as bright as eight. |
| **Efficacy** | Lumens per watt. ~90 for LED, ~15 for halogen. |
| **Colour** | What colour to draw it when the entity cannot report one — so a 2200 K festoon and a 4000 K tube still look different. |
| **Pool spread** | How wide its glow pool is drawn. |

The panel shows the result: `2750 lm · 9.1 fc alone in Formal Living`. Add up
the fittings in a room and you have how lit it is.

The house-wide constants are under **◐ Light** in the toolbar:

- **Darkness with no daylight** — how far the whole plan dims at night. This is
  what makes on/off legible from across the room.
- **Most a lit room can lift** — how far a lit room climbs back out. Leaving
  headroom is deliberate; a lit room at night should still read as night.
- **Fully lit at** — the foot-candles that count as properly lit. 18 is a normal
  living room. Everything scales off it.
- **Response curve** and **Light reaching the floor** — the two fudge factors,
  both honest: perceived brightness is a power law, and not all of a lamp's
  output lands on its own floor.
- **Animate…** — fans spin at their real speed, sirens pulse, airflow drifts,
  coverage cones breathe. All of it is state-driven and stops when the state
  does. Anyone whose system asks for reduced motion gets none of it regardless.

A light that is on but reports no brightness counts as **full**, not dim — it is
a lamp that cannot report, not a dimmed one.

### Cove and perimeter runs

A perimeter fitting is a **run around the room's outline**, inset by its own
`inset`, rather than a dot in the middle of it — an L-shaped room, a room with a
curved wall and a plain rectangle are one polygon problem, so all three work. It
draws six ways: `cove` (the default), a bare `strip` with its spill either side,
a `channel` extrusion drawn as its profile and diffuser, a plaster-in
`perimeter_slot` broken by its own fixings, a dashed `rope`, and a `wall_wash`
whose spill sits on the wall side of the run. `pitch` and `beam` are in feet, so
a slot's ticks and a rope's dashes stay the same physical size as you zoom.

Selecting one means clicking **the line you can see**. Its hit target traces the
run itself, ranked by the length of the run rather than the area it encloses, so
a cove around a large room still loses to a lamp standing inside it. A marker
that names a room with `item.room` lights *and* draws that room's outline even
when the marker itself sits outside the slab — a pillar-mounted run, a strip
parked in a corridor.

## Generating the dashboard

**Current status:** the app development UI can build and preview the generated
card. Treat installation as unverified until the packaged writer has been
exercised on a real Home Assistant.

The intended **▦ Dashboard…** workflow builds a Home Assistant dashboard from
the plan: one tab per floor, the live plan on each, and overview cards either
side of it.

1. Name it. The URL path follows the name until you edit it yourself.
2. Choose whether to include the **house overview** (repeated on every tab) and
   the **floor overview** (per tab).
3. The dialog tells you what it would install — the tabs, the card size, and
   whether every entity it references actually exists. A typo'd sensor is
   reported here rather than showing up as a silent zero later.
4. **Preview the card ↗** opens the generated card driven by live states,
   without touching the dashboard. It is the exact bytes that get installed.
5. **Generate dashboard** installs it.

What it writes, and nothing else:

- one Lovelace **resource** — the card module, as a `data:` URL, so nothing is
  copied into your config folder and nothing is fetched from the internet;
- one **dashboard**, at the path you selected. The default dashboard is refused.

Whatever config was on that dashboard before is copied into the app's
`backups/` folder first. The **first** write to an existing non-default path
still succeeds after that backup — there is nothing to check yet — but every
write after that is checked: it is refused unless the dashboard's own
ownership stamp names that same path, so a later Generate cannot silently take
over a dashboard something else created in the meantime.

Re-running updates the same dashboard in place — the name is remembered on the
project, so a second Generate does not leave a second dashboard beside the
first.

Each generated dashboard gets its own card resource, scoped to its own URL
path, so deploying a second Floorplan Studio project does not change the card
used by an earlier one.

### Reopening a deployed dashboard (app)

Import… → **From Home Assistant** lists every dashboard this app has
deployed, found by reading each one's own ownership stamp back — not from
anything kept on disk here, so a design deployed by a different install of
this app, or a rebuilt one, is still found. One deployed with "keep the
editable project in Home Assistant" turned on can be loaded straight back into
the editor, replacing the current project; one deployed without it is listed
so you know it exists, with an explanation that it can only be redeployed over,
not reopened.

### On the dashboard

| Target | Tap | Hold |
|---|---|---|
| A light or switch marker | toggles it | more-info |
| A sensor marker | more-info | more-info |
| A door | more-info on its contact sensor | — |
| A room | opens its control surface | all on, if the room is configured that way |

Both halves of that first row are settable per house, under **Room controls →
edit the house defaults…**. **Holding a marker** opens the entity's dialog,
opens the room's popup, or does nothing — that last one is for a wall tablet,
where a resting hand must not open dialogs. **Tapping a marker** defaults to
`auto`, which runs the domain action but opens the dialog when holding is set to
do nothing, because with no hold there would otherwise be no way into an entity
at all. `action`, `moreInfo`, `controls` and `none` name the behaviour outright.
A library type declaring `render.tapAction: "moreInfo"` still beats both, which
is what stops a text label bound to a light switching the light when you only
wanted to read it.

The control surface is whichever design that room resolves to, with its
brightness slider, per-type group buttons (`Spots 2/6`), individual lights with
live colour swatches, and its devices.

### The overview cards

Both are built from markers already on the plan, so adding a camera puts it in
the counts and deleting one takes it out. There is no list to maintain.

- The **glance** row is tappable and shows real entities — the house one picks
  up energy meters, solar, inverters, batteries, tanks, pumps and EV chargers;
  the floor one picks up ACs, geysers, appliances, cameras and locks.
- The **summary** line underneath does the counting: `3 of 34 lights on
  (2 unavailable) · 1 of 8 fans running · partlycloudy, sun 29°`. It is plain
  text on purpose — Home Assistant strips every attribute from a markdown card,
  so nothing in that line could be made tappable even if it looked it. That is
  why the things worth opening are in the glance above it.

## Review notes

Feedback on a plan is worth nothing if you cannot say *where*. **Notes** (`N`)
lists this floor's open and completed notes; the canvas context menu adds one
against whatever you right-clicked, and the inspector has **Add note** for
whatever is selected. A note can be attached to the floor, a room, an item, an
opening, a wall — including a default wall that has no override of its own — or
to a bare point on the plan.

Notes draw as numbered pins, a constant size on screen at any zoom. Click one to
edit it, drag it or use the arrow keys to move the pin without changing what it
is attached to. Moving an object carries its notes with it at their own offset;
deleting an object leaves its notes where they were as point notes, so feedback
is never silently discarded — the context menu's **Delete object and its notes**
is the explicit way to discard both at once. Renaming a room rewrites the
attachments. Undo and redo cover all of it.

**Clear** in the Notes list deletes exactly what the list is showing. It follows
the filter, so **Done notes** → **Clear done** finishes off a review and leaves
the open ones; **All notes** clears the floor. Opened from an object's inspector
the list is that object's notes, and Clear is scoped to them. It asks first, and
it is a single undo.

**Notes never reach Home Assistant.** They are stripped from the dashboard
card's data *and* from the editable project copy embedded in the deployment's
ownership stamp, and the exported SVG never draws pins. An exported project file
keeps them, because that is the copy you would hand to somebody to review.

A note dropped on bare canvas is not left as a bare coordinate: it attaches to
whatever is on top at that spot — the item, then the wall, then the room, then
the floor — and **Select behind** in the same menu reaches what is underneath.
The pin records where you were pointing, the attachment records what you meant,
and the two are allowed to differ: a note about a damp corner belongs to the
room and sits in the corner.

An assistant reads them with `list_annotations`, which expands each target into
the object it names *and* returns a `context` block: the floor, the room the
note is really about, the target chain under the pin, and the items and openings
within eight feet with their distances, type keys and bound entities. That is
what lets "this corner is too dark" be answered rather than queried. Notes are
managed through `edit_collection` with `collection: "annotations"`. Mark one
**done** once its request is addressed; done notes stay in the list under their
own filter rather than disappearing.

## Driving the editor with an AI (MCP)

Everything above this line describes doing it by hand. The app also runs
a [Model Context Protocol](https://modelcontextprotocol.io) server so an AI
can draw and edit the plan instead — add rooms, place devices, wire up the
dashboard — while this editor, if you have it open, updates live as it
happens.

**Connect an MCP client** (Claude Code shown; any Streamable HTTP MCP client
works the same way) to `http://homeassistant.local:8099/mcp` — not through
the Ingress URL in your browser's address bar, a plain address on your own
network, because Ingress can only authenticate Home Assistant's own frontend,
not a generic client:

```bash
claude mcp add --transport http floorplan-studio \
  http://homeassistant.local:8099/mcp \
  --header "Authorization: Bearer <a Home Assistant long-lived access token>"
```

Create that token from your own Home Assistant profile (Settings → your
profile → Security → Long-lived access tokens). Nothing app-specific is
generated — the token is checked by asking Home Assistant itself whether it
is still valid, so revoking it there revokes the AI's access immediately too.

Once connected, an AI has ten tools. Two of them orient it: **`get_guide`** is
the working guide — which call answers which question, the concepts to grasp
before editing (everything is in feet, walls are screen-relative, one
`transmission` number drives both light models), worked recipes and the common
mistakes — and **`get_contract`** is the reference for the project's shape.
You should not have to ask for the guide. It arrives four ways, all the same
bytes from the one `SKILL.md` that ships beside this file:

- **On connect.** The server returns MCP `instructions` — a short orientation
  every spec-compliant client (Claude Code, Cursor, Codex) puts into the
  model's context automatically. It says what this server is, the four things
  that are wrong-by-default if guessed, and to read `get_guide` first.
- **As a resource.** `floorplanstudio://guide`, so clients that let you attach
  context can pull the whole guide in by hand.
- **As a prompt.** `floorplan_studio_guide`, which clients that surface MCP
  prompts offer as a command.
- **As a tool.** `get_guide`, for a model that went looking on its own.

A client that reads the filesystem can also load `SKILL.md` as an ordinary
skill — it carries the usual frontmatter for that.

That split matters in practice: the contract tells an AI what a fixture *is*,
the guide tells it that a lamp's available looks live in that type's `variant`
property options and are to be read rather than guessed.

The rest: ones to **read** the current plan and what can be placed on it
(`get_project`, `find_objects`, `get_registry`, `list_library`, `get_help`, and
`list_annotations` for your review notes with their targets and surroundings
expanded), tools to **change** it (`edit_collection` for rooms/items/openings/
boundaries/floors and the notes themselves, `edit_batch` for many of those in
one write, `edit_settings` for everything else — dashboard settings, lighting,
sun, coverage, a room's own controls), `edit_registry` to author shared library
types, flooring, themes, boundaries and controls using arrays of literal path
keys, `validate_project` to check the result on demand, `preview_dashboard` to
see what Generate would produce, and `install_dashboard` — the one tool that
actually writes to Home Assistant, which is **not offered at all** unless you
turn on the app option `mcp_allow_dashboard_install`. Until you do, an AI can
build and rework the whole plan freely but cannot put anything on your actual
dashboard.

### Why it does not download your house

A plan of a real home is a large document, and an assistant that reads all of
it to change one lamp is slow *and* dangerous: it works from a copy, so anything
you changed while it was thinking is quietly overwritten when it writes back.

Nothing here works that way. Every floor, room, item, opening, boundary and note
carries a stable id, and both halves of the server are built on addressing them:

- `get_project({outline:true})` is the index — every floor with its extent, its
  counts, its room names and a census of the item types on it. Kilobytes, on any
  plan.
- `find_objects` returns only what matched a filter: by id, library type, kind,
  the room something is tagged with, its bound entity, free text, or distance
  from a point. `fields` projects a few dot paths; `summary` returns an index
  row. Every result carries the `floorId` and `id` an edit takes.
- an `edit_collection` update is a **patch**, shallow-merged, with `item.props`
  merged a level deeper — so changing one property changes one property.
- `list_library` says what a type can DO as well as how it is configured: its
  `render` reports `bindable`, `surface`, `cone` and which prop resizes it on
  which axis, and each prop carries its `hint` — which for a free-text prop like
  `treadFinish` is the only statement that the value must be a flooring key.
- `ids` applies one update to several objects, and `edit_batch` applies up to
  200 edits as a single validation, a single write and a single editor refresh.
  A rejected entry names its index and writes nothing at all, so the plan is
  never left half-edited.

The practical effect is that an assistant restyling forty downlights makes one
read and one write, and touches nothing else in the house.

Shared registry edits refresh an idle editor. Finish any open settings dialog
or unsaved local edit, then reload to use external registry changes.

## The headless API (`/app-api/v1`)

A second, separate surface for a client that is **not a browser inside
Ingress** — a native or remote app, mostly. Ingress authenticates with a
per-browser-session cookie only Home Assistant's own frontend can mint, so a
phone has no way to complete that handshake; it presents a Home Assistant token
instead, exactly as `/mcp` does and through the same door.

Turn it on with the app option **`headless_endpoints_enabled`**, default off.
When it is off those paths answer 404 on every port, as though the module were
not loaded. It is deliberately **not** tied to `mcp_enabled`: an AI client and a
phone are two different callers that merely happen to share a listener, so
turning one off must never silently turn the other off. It is served on the same
ports as MCP, so `ssl_cert`/`ssl_key` cover it too — worth setting before
exposing either beyond the LAN, because a Bearer token in cleartext is a
credential on the wire.

**It is not a Home Assistant proxy.** It answers one question — what does the
plan look like — and never lends the app's supervisor credential to a caller.
The client holds its own authenticated Home Assistant connection for live state
and for calling services, as itself. So nothing here can turn a light on, and
nothing here can show a caller an entity Home Assistant would not show them:
the read-only claim above is as true for a phone as it is for the editor. Every
request needs a token Home Assistant itself confirms, and a write additionally
requires that token to belong to an **admin**.

Routes address a **house** (`/houses/{houseId}/…`) because a client may talk to
more than one Floorplan Studio and has to cache them apart. Storage is still one
project, so exactly one house is exposed and its id is stable; the route shape is
the contract from day one, so real multi-house storage later is a storage change
rather than a protocol break. Cacheable responses carry a `revision` and an
`etag` and honour `If-None-Match` with a 304 — and the revision changes when the
*configuration* changes, never when a light turns on, because live state does not
come from here at all.

While it works, this editor (if open) reflects each project change within about a
second — no reload — as long as you don't have unsaved edits of your own in
progress; if you do, you get a toast instead of having your in-progress edit
overwritten.

Turn the whole feature off with the app option `mcp_enabled` (default on)
— `/mcp` then answers 404 everywhere. If you plan to reach MCP from outside
your own network (e.g. by forwarding the port on your router), set `ssl_cert`
and `ssl_key` to a certificate already in Home Assistant's shared `/ssl`
folder: Floorplan Studio then also serves MCP over HTTPS on a second,
dedicated port (`mcp_ssl_port`, default 8443) that serves nothing else. The
plain-HTTP port keeps working unchanged — this is an addition, not a
replacement.

## Room controls

Select a room → **Room controls**. Three separate questions:

### 1. Which design

Seven surfaces ship, each suited to a different situation:

| Design | Where it sits | Good for |
|---|---|---|
| **Bottom sheet** | slides up over the plan | the default — reachable one-handed, never covers the room you tapped |
| **Side rail** | drawer down one edge | a tablet in landscape, where a bottom sheet wastes the short axis |
| **Docked panel** | *beside* the plan, not over it | wide screens — uses the space either side of a square plan, and the plan stays live |
| **Popover** | anchored at the room | least disruptive; only fits a few controls, so pair it with a tight filter |
| **Compact bar** | one strip along the bottom | rooms where you only ever hit All on / All off |
| **Tile grid** | modal, equal tiles, no headings | reads like a dashboard page — best with the *Everything here* section |
| **Full screen** | the whole viewport | a busy room, or a wall-mounted tablet |

A preset can carry a design (*Compact bar* selects the bar), and an explicit
design choice beats whatever the preset came with. `designOverrides` on a room
tweaks one property — column count, width — without defining a new design.

### 2. Which sections

Toggle any of: brightness slider, per-type group buttons, lights, devices,
sensors, scenes, automations, shortcuts, climate, covers, **everything here**, and a hand-picked extras
row. Each shows a **live count of what this room would actually display**, so a
section that would come out empty is visible before you ever open the surface.

Header buttons — All on, All off, Details, Close. Those four are all the app
supplies; every other button in that row is a **shortcut** you added (below).

Unticking *Controls enabled* turns the surface off entirely for that room.

### 3. Which entities — the filter

This is the part that matters. A section can be pointed at **everything in the
room** and then narrowed by configuration, rather than hand-listing entities
that rot the moment you add a device.

**edit filter…** on any entity section opens a live editor: set a filter and the
result list updates as you type. Every field is optional and they all apply
together.

| Field | Effect |
|---|---|
| Source | lights / devices / everything in this room / an explicit list |
| Domains, Exclude domains | keep or drop `light`, `switch`, `sensor`, … |
| Marker kinds | `fixture`, `device` |
| Library types | `spot`, `tube`, `extension`, … |
| Name contains | text match, in *contains*, *word* or *regex* mode |
| Controllable only | drops types the library marks read-only |
| Hide unavailable | drops anything with no state |
| Sort, Limit | ordering, and a cap |
| Never show | entity ids dropped outright |
| Force in | entity ids kept **whatever else the filter says** |

*Force in* is applied last and always wins, so one stubborn entity can be kept
without loosening the filter for everything else. It can even name an entity
that has no marker in the room at all.

Use **word** match mode when a room name is a substring of another: "informal"
literally contains "formal", which crossed two rooms' scenes in the older
hand-written dashboard.

> Counts read zero for any section filtering on availability until **Live
> states** is ticked in the toolbar — with no state data, everything is
> unavailable. The editor says so under the section list.

Settings cascade house → floor → room, merged **by section id**, so hiding one
row in one room is one line and inherits the rest.

## Scenes, automations and helpers

These are the things that are not *in* a room — a scene, the automation that
governs it, the boolean that automation checks, a script that sets a fan speed.
Two ways in.

### Shortcuts — your own buttons

**⚡ Logic** in the toolbar, or the *Shortcuts* block on any room or floor panel.
A shortcut is a **label and something to do**:

| You want | Set |
|---|---|
| A do-not-disturb button on the room's panel | label `Do not disturb`, entity `input_boolean.example_room_quiet`, placement **header button row** |
| A mood the whole house shares | label `Goodnight`, entity `scene.example_goodnight`, on the **house** |
| An AC's turbo switch | label `Turbo`, entity `switch.example_ac_turbo` |
| A script that takes a value | label `Fan 3`, service `script.set_fan_speed`, data `{"speed": 3}` |

The app has no idea what any of them mean — "Do not disturb" is your word for
a boolean your automations happen to check, and that is the whole point: your
vocabulary, not the builder's. Pick any entity of any domain; what a tap does
follows from its domain (a scene activates, a boolean toggles, an automation
enables, a number gets a slider, a dropdown gets a dropdown).

Placement is one choice:

- **header button row** — sits beside All on / All off.
- **a named section** — pinned to that row.
- **wherever it fits** (the default) — the Scenes row takes scenes and scripts,
  Automations takes automations, Shortcuts takes the rest.

Shortcuts on the house appear in every room; on a floor, in every room on it. A
room reusing the same **id** replaces the inherited one, or hides it.

> **Nothing is created.** Every shortcut names an entity or a service that
> already exists in Home Assistant. This app generates a dashboard over the
> house you already have — it never adds a helper, a scene or an automation.

### Found by name

The **Scenes** row also finds entities named after the room, with no
configuration at all. A room's *Match keys* say which names count — leave it
blank and the room answers to its own id and name; set it when your entities are
named after something else:

```
Guest Room      →  keys: guest_room, gr_
```

Now `scene.gr_colorful_spots` and `scene.guest_room_ambient` both appear, and
one added next month appears by itself. Matching is word-bounded, so *Informal
Living*'s scenes stay out of *Formal Living* — but a key ending in `_` is a
plain prefix, because entity ids are prefixed that way.

To scope your own script namespace, or to hide the scenes your automations
snapshot into, edit the Scenes section's sources in `controls.json`:

```jsonc
{ "source": "catalogue", "filter": { "domains": ["script"],
    "entityPattern": "^script\\.ak_", "match": "@room", "matchMode": "word" } }
```

### On the plan

Anything that genuinely has a place — the boolean on the bedside wall, the mode
dropdown by the door — goes on the plan as a marker, from the **Automation &
helpers** palette group. Nine types: automation, scene, script, toggle, button,
number, dropdown, timer, counter. They draw, tap and filter like any other
marker, and they join their room's Shortcuts row automatically.

## Room types

Every room has a **type** — living room, kitchen, motor room, swimming pool
area, lawn, server room, driveway. Forty-seven of them, grouped as Indoor, Wet,
Service, Circulation and Outdoor.

Choosing one sets the room's flooring and whether it counts as outdoors, then
gets out of the way: a lawn arrives with grass on it, a motor room does not
arrive carpeted, and both are yours to change immediately afterwards. Leaving
the type unset is fine — nothing depends on it.

Adding one is a JSON entry in `library.json`'s `roomTypes`. Nothing in the
renderer knows the word "kitchen".

### Room ids

A room you have just drawn takes its **id from its name** — "Formal Living"
becomes `formal_living` — and keeps following the name until either you edit the
id yourself or the project is deployed. A collision gets `_2`, `_3`, and a name
in another script keeps that script rather than being transliterated away.

After a deployment the id stops moving on its own, because a dashboard link is
an address somebody may already have bookmarked. Edit **id** directly, or choose
**Match the name**, to change it deliberately; items, openings, wall overrides,
merged-room references and review notes on that floor all follow in one undo
step. Home Assistant entity ids are data rather than references and are left
exactly as they are, so regenerate the dashboard after an explicit change. The
deployment record lives outside the project document and survives undo — undoing
a dashboard setting cannot re-arm automatic renaming for a room that is already
published.

## The house and floor cards

Two cards flank the plan on every tab. Both have a **fixed shape and
configurable contents** — configure them from **▦ Dashboard… → Configure the
house card / the floor cards**.

### The house card

The house's **name and weather are always there**; everything else is yours.

| Row | What it is |
|---|---|
| **People** | `person` entities, shown as chips and lit when they are home. |
| **Counts** | "26/101 lights". Name marker **types** and it follows the plan for ever; name a **domain** and it follows Home Assistant; name **entities** and it follows nothing. `skipGroups` stops a light group being counted alongside its own members. |
| **Stats** | One live number each — power reads in kW past a thousand, `signed` shows a `+` when positive, and `showWhen` makes a chip appear only while something is true (the washing machine that shows up while it runs and goes away when it stops). |
| **Buttons** | The house's own shortcuts. |

The first time you generate a dashboard the counts and stats are **seeded from
the plan** — a chip for every class the house actually has, none for the ones it
does not. After that the card is yours and the seeding never runs again.

### The floor card

Under the plan: **how much of that floor is active**, out of how many, with a
bar per class and unavailable devices called out separately rather than counted
as off.

Left alone, the classes are whatever that floor actually has, grouped by the
library's own categories — so adding a heater to the plan adds a heater row and
there is no list to maintain. Pick a fixed set from the dialog if you would
rather every floor read the same way.

## Dashboard theme

Three ship, and the card's default is **Follow Home Assistant**.

That one measures the dashboard's own background to decide whether to start from
the light or the dark token map — floors and furniture have to be real colours,
because the flooring generators shade their base to derive grain and grout — and
then takes the chrome and accents from Home Assistant's own theme variables:
card background, text, dividers, the active colour. Switch Home Assistant to
dark mode and the plan follows within a couple of minutes.

Pin it to **Frosted Glass Light** or **Blueprint Dark** from the Generate dialog
if you would rather it stayed put. The editor's own theme is a separate choice,
in the toolbar.

## Appearance & behaviour

**▦ Dashboard… → Appearance & behaviour.** Settings for the whole dashboard.

- **Paint a tap immediately.** On by default. A tap shows the state it asked for
  straight away rather than waiting 100–300ms for Home Assistant to confirm. The
  guess is dropped the moment the entity reports anything different, and it
  expires on its own at the end of the confirmation window — so a service call
  that fails leaves the plan telling the truth rather than a lie that sticks.
- **Confirmation window.** 1600ms by default. How long the plan holds the guess
  before deciding the command has not landed.
- **Re-send if unconfirmed.** Zero by default — never. On a Zigbee or Z-Wave
  mesh a device that has drifted off its router can swallow a command outright
  while still reporting as online: the call succeeds, nothing happens, and
  nothing anywhere says so. Set this above zero and the plan re-sends that many
  times, **gap between re-sends** apart, before giving up and showing the real
  state. A retry re-sends only to the entity that did not answer, so a
  room-wide command does not re-command everything that already arrived. An
  `unavailable` entity is never retried — it is known to be gone.

  It is off by default on purpose: how many extra commands a flaky mesh should
  get is a judgement about your house, not one this app should make for you.
- **Show markers as in-flight.** On by default. A marker with an unconfirmed
  command pulses rather than sitting still, so a guess does not look identical
  to a settled state. Turn it off to have a guess paint exactly like confirmed
  state. With motion reduced it becomes a static half-lit dashed marker rather
  than disappearing — in-flight *is* the state here, not decoration over one.
- **Show what a marker is on hover.** On by default. Name, state, brightness,
  fan speed; for a door or window, its type, whether it is open, and how far its
  blind is drawn. Never shown on a touch screen, where there is no hover and the
  tip would sit under your thumb.
- **Your own CSS.** Appended to the cards' own stylesheet, *inside their shadow
  root* — so it styles these cards and can reach nothing else on the dashboard.
  A **frosted-glass preset** is one button, for replacing a `card_mod` setup.

Useful class names: `.fps-card`, `.fps-house`, `.fps-floorcard`, `.fps-chip`,
`.fps-btn`, `.fps-tile`, `.fps-panel`, `.fps-svg`, `.fps-tip`. Check it in the
card preview before you generate.

## Light zones

A lamp lights **its own room**, and spills through the room's openings by
exactly as much as each opening lets through. So light stops at a wall, leaks
through a doorway, pours through an open window and barely creeps past a
blackout blind — all from the one transmission number the sun model already
reads.

Under **◐ Light**: `spillFt` is how far light reaches past a fully open
opening (3.5 ft by default), and the whole thing can be switched off, which puts
the glow pools back to plain circles.

## On a phone

The plan scales to whatever width it has, and the chrome around it re-lays-out
at three widths:

- **Under 600px** every control surface becomes a bottom sheet, whatever design
  the room chose — a rail down one edge or a panel beside the plan both assume
  space that is not there. Tap targets grow.
- **Under 420px** the floor card's classes go to two columns and the house
  card's people wrap under the title.
- **Over 1100px** a docked panel really does sit beside the plan.

**Pinch or scroll to zoom, drag to pan, double-tap to fit.** Zoom moves the
plan's viewBox rather than scaling it with CSS, so walls stay 1px and labels
stay sharp however far in you go. A drag only starts panning once it has moved
8px, so the plan is still tappable one-handed.

## Devices

### How it looks, and how big

Select a device and the properties panel opens with **Look** — a grid of the
ways that kind of thing can be drawn, each swatch drawn as itself rather than
named. A ceiling fan offers 3, 4 and 5 blades, a slim DC fan and a caged
extractor; a camera offers bullet, dome, turret, PTZ and cube. There are 129
looks over 30 families, and every device belongs to one.

The choice is per item, so two cameras in the same house can be the two cameras
you actually own. Leave it alone and you get the family's default, which means a
later release improving that default improves your plan for free.

Some looks read live state on the dashboard: a tank fills to its level, a
battery to its charge, a roller blind sits where it is, and a pump's impeller or
a washer's drum turns only while it is running.

**Resize by dragging an edge.** A selected marker gets four square handles on
its edge, inside the round rotation ring. Drag any of them, or press `-` and `+`.
What that changes depends on what the thing is:

- A device with a **real footprint** — a fan's sweep, an AC's width — resizes in
  **feet** and stays to scale with the room. Zoom in and it stays honest.
- Everything else resizes **how big it is drawn**, in pixels, because a smoke
  detector at true scale is a four-inch dot nobody can tap.

Most markers are round, and one number is the whole answer for them. Some have
a footprint that is not square — a television seen from above is a slim bar, and
so is a soundbar or a split AC — and those get **two axes**: `Marker size` is
the width and **Depth on the plan** is how far it reaches back across its
facing, both under Advanced, or drag either pair of handles. The handles sit on
the object's own axes rather than the
screen's, and each pair drags its own dimension, so a board turned ninety
degrees still has its width dragged by the handle that visibly moves its width.
Hold `Shift` to keep the proportions. `-` and `+` always scale both, so the
bigger button cannot quietly reshape a slim object. A two-axis marker is also
selected by a box that turns with it, rather than by a circle that claimed
several times its own depth.

The panel still shows the number, so you can type it when you know it.

### What colour it is

Under **Look** sits **Colour**, and it answers a different question: not what
shape the thing is, but what it is made of. A ceiling fan is matte black or
ivory, a sideboard is teak or walnut, a tap is chrome, a sofa is navy velvet.
Every item starts on **plain** — the theme's own grey — so nothing you have
already drawn changes until you say so.

Each swatch is the item itself, at its own look and size, painted in that
scheme. Eighty ship with the app, grouped Finish, Wood, Upholstery, Stone,
Paint, Natural fibre and Garden, and their values come off real fittings rather
than a colour wheel.

A scheme is four colours: the **body**, its **trim**, the **detail** strokes
inside a marker at rest, and what it turns **when it is live** — a BLDC fan's
LED ring, the warm disc of an integrated downlight, an appliance's status
light. That last one is not decoration: a running marker's rim takes it, so it
is what says *this is on* from across the room.

**Light beats paint.** A lamp that is on still draws in the colour it is
emitting, and an entity that reports itself unavailable still draws as
unavailable — a plan's first job is to say what is happening, and paint never
gets in the way of that.

**edit colours…** opens a small editor of its own. The shipped schemes cannot
be changed there — they are part of the app rather than part of your plan, and
so are identical on every install — but duplicating one is a click, and is the
quickest route to a colour that works. A scheme you make lives on the
**project**: saved with it, undoable, carried in its export, and baked into the
generated dashboard card, so a plan you send somebody arrives in its own
colours with nothing to install alongside it. If a scheme you made shares its
name with one the app ships, yours wins, permanently.

### What each device configures

Every device exposes a **facing**, and most expose more. A few worth knowing:

| Device | Configurable |
|---|---|
| Camera | field of view, range, facing, person-detection sensor |
| Motion / mmWave | field of view, range, facing — the wedge is the detection area |
| Ceiling fan | blade count, sweep. Blades draw and spin at the real speed. |
| Air conditioner | airflow direction, throw, capacity in tons |
| Solar array | panels across × down, **watts per panel**, share of the sensor, tilt, azimuth |
| Tank level / geyser | capacity in litres |
| TV / projector | screen diagonal, viewing angle and distance, projector throw |
| Speaker / siren | dispersion angle, range, loudness |
| Router / IR hub | coverage range |
| Switch module | gangs |
| Entity value label | safe text template, text/background, font, padding, rotation, border, numeric color thresholds |
| Pump | wattage, flow |
| Blinds, curtains, shutters, garage, gate | width and facing |

### Two arrays, one inverter sensor

Solar is the case that needs saying out loud. Most houses have one inverter
sensor and more than one array, and both markers printing the whole house's
output reads as double the real generation.

Set each array's **Panels across × down** and **Watts per panel** and the
reading is split between them by installed capacity — a 16-panel array and an
8-panel array on one 4 kW sensor read 2.67 kW and 1.33 kW, and they still add up
to 4 kW. Set **Share of the bound sensor** on one to fix it explicitly, and the
rest divide what is left. Set **Show this fraction of the reading** to override
both, for a monitor that genuinely reports per string.

## Furniture

Every furniture item exposes **width, depth and rotation**. Anything countable
is a property rather than something derived from the footprint:

| Item | Configurable |
|---|---|
| Solar array | panels across × down, gap, cell lines per panel |
| Sofa / sectional | seat cushions |
| Wardrobe, dresser, sideboard | door leaves |
| Bookshelf, shoe rack | shelves |
| Dining table | chairs per side — set a side to 0 for a table against a wall |
| Round table | seats |
| Hob | burners (1–6) |
| Fridge | door count, freezer split |
| Stairs | steps, run axis, direction |
| Bed | which wall the headboard is against |
| Pergola | beam spacing, cross battens |
| Counter / island | sink on/off and its position |
| Piano, bench, plant | key divisions, slats, canopy lobes |
| Glazing / skylight | cut (plain, grid, diagonal, chevron, hexagon, arabesque, floral, starburst) and its pitch in feet |

A **glazed panel** is one whole aperture — a single pane with a frame, nothing
across the middle that could read as a light fitting. Its **cut** is what the
panel is made of, and the pattern's pitch is in *feet*, so enlarging the panel
gives more of the pattern rather than a magnified copy of it. The cut is drawn,
not modelled: a dense jaali and an open grid light the room identically unless
you also set the panel's transmission, because guessing that from a drawing
would be a guess wearing a fact's clothes.

**Stair treads** take any floor finish — `Tread finish` in the inspector, and
`props.treadFinish` in a project file, with `props.treadFinishOptions` for the
generator overrides. It paints the horizontal surfaces the stair actually has:
treads, landings and winders, rotated with the stair, leaving the well and the
centre of a spiral bare and staying faint beyond a floor cut. Riser lines,
direction arrows and step lights stay above the material.

The solar array **defaults to a single panel**. Set *Panels across* 2 and
*Panels down* 1 for a 2×1; 1 × 4 gives a single file of four. The panels are laid
out inside the footprint, so resize the item to change panel size and change the
counts to change how many. The older `grid: [cols, rows]` array is still read
if a spec carries one.

## Flooring

Select a room → **Flooring**. 178 surfaces in 14 groups — Basic, Wood, Stone,
India, Outdoor, Parquet, Ceramic & porcelain, Marble & travertine, Natural
stone, Terrazzo & granite, Patterned cement, Textile & natural fibre, Concrete &
oxide, and Resilient & utility — plus per-room **angle** and **colour**
overrides.

Marble, terrazzo, soil, gravel and grass are *field* generators: they draw
across the room and clip to it, so veining runs through a doorway instead of
restarting at the threshold. Everything else is a tiled pattern, which is
cheaper.

Loose ground — soil, gravel, cobble, turf — and the fine-grained finishes
(concrete, carpet, linoleum, microcement) are drawn in two halves. The fine
half goes into one repeated tile, so a 1,400 sq ft yard is as densely grained
as a doormat and costs the same; the big features — stones, clods, tufts and
the tonal drift — are drawn across the room itself, so they never repeat.
**Density** is read as a multiple of what the finish ships with rather than an
absolute count, and `stoneScale` on a gravel bed is what separates pea shingle
from cobbles.

A field generator may also bring its own base, which is how a **marble-look
tile** is drawn: the grid is the tile generator's, the veining is marble's, and
neither half on its own is that floor. `veinColor2` gives it the second vein
system a Statuario or Calacatta tile has — a grey structural one and a sparser,
finer gold — and `veinWidth` / `veinOpacity` set how heavily it is veined,
because a tile printed with a pattern is not as faint as the slab it imitates.

The same 178 finishes paint **every horizontal surface**, not only room floors:
stair treads and landings, and the tops of walls. One registry, one editor and
one set of generator options, because a granite tread and a granite floor are
the same material seen from the same angle.

Custom flooring is a script in `flooring.json`.

## Editor theme

The theme dropdown switches theme; "Edit colours…" opens a swatch editor that
writes into `themes.json` as you drag. `ui` tokens skin the editor, `plan`
tokens skin the drawing.

## Compass

The project carries a `compass` map from screen direction to bearing. It
defaults to the intuitive up = north. If your plans are rotated, set it once
here rather than remembering it — a wall's `n`/`e`/`s`/`w` is always
**screen**-relative, and confusing the two is the classic way to put a window
on the wrong side of a house.

## Saving

Normally you do not press Save: the editor writes a moment after you stop
making changes. The button says which of four things is true — **Save** (changes
not yet written), **Saving…**, **Saved** greyed out because there is nothing to
do, and **Retry save** when the last write failed and your changes are still
only in this tab — with the time of the last successful write beside it. So a
greyed-out button is the answer to "do I need to save?".

`Ctrl`/`Cmd`+`S` writes immediately whenever you want it to. Turning **Autosave**
off in the top bar makes the button the only way to write; that setting belongs
to the house rather than to your browser, so everyone editing the same plan
agrees about whether it is on. Either way, closing the tab with unsaved changes
warns you first.

## Where things are stored

Inside the app, `/data`:

- `project.json` — all floors, plus the sun, lighting and dashboard settings
- `library.json` — device library
- `themes.json` — themes
- `flooring.json`, `boundaries.json`, `controls.json` — the other registries
- `project-deployments.json` — when each project id was first deployed. Kept
  out of the project document deliberately: it is a fact about the world rather
  than part of your design, so undo cannot roll it back and make a published
  room look safe to rename automatically again
- `backups/` — the last 10 project versions, and the last 10 configs of any
  dashboard this app has replaced

Seeded from `app/defaults/` on first run and never overwritten by an update. An
update **fills in** what a saved document does not have yet — new types, new
properties on existing types — without touching anything you changed.

## What the app can and cannot do to Home Assistant

It **reads** entity names and states, so it can offer you a picker and draw
markers live. That access is read-only by construction: there is one request
function in the code and it can only issue a GET. Nothing in the app can turn
a light on, unlock a door or run a script — including the card preview, whose
taps are logged rather than sent.

That sentence is about **the app**. The dashboard it generates is a different
thing and is meant to be pressable: see "The dashboard it writes is not the
app" below.

The intended write scope is limited to a Floorplan Studio Lovelace resource and
one named dashboard config, only after **Generate dashboard**. The default
dashboard is refused and the previous named config is backed up. Choosing an
existing non-default path replaces it the first time, after that backup — there
is nothing to check yet — but every write after the first is checked: it is
refused unless the dashboard's own ownership stamp names that same path, so a
later Generate cannot silently take over a dashboard something else created in
the meantime.

Person, device tracker and zone entities are dropped wholesale rather than
filtered, because `/api/states` carries GPS coordinates on those and a drawing
tool has no business with them.

An AI connected over MCP has exactly the same reach as a human at the
keyboard, no more: it can read states and edit the project freely, and it can
only reach **Generate dashboard**'s write path (`install_dashboard`) if you
have separately turned on `mcp_allow_dashboard_install` — off by default, and
until it's on the tool is not even listed among the ones an MCP client sees.
Nothing about MCP adds a way to call a Home Assistant service; `app/lib/mcp.js`
has no such command, same as every other module the app process loads.

### The dashboard it writes is not the app

Everything above describes the app. The card it generates is an ordinary
Lovelace custom element, and it is supposed to be pressable — tapping a light on
the finished dashboard turns that light on. A floor plan you cannot press is a
picture.

Two files draw the line. `app/lib/ha.js` runs **inside the app**, holds a
Supervisor token, and can only GET with it. `app/lib/card-runtime.js` is never
loaded by the app process at all — it is source text that gets baked into the
generated `.js` resource and runs **in your browser**, where it calls
`hass.callService`, exactly as Home Assistant's own tile and button cards do.

So the card carries no credentials of its own. Home Assistant hands every custom
card a `hass` object belonging to the person already signed in, which means a
tap on the plan:

- acts as that person, not as the app;
- can do only what that person could already do from any other dashboard;
- appears in the logbook under their name;
- and is refused for a user whose permissions would refuse it elsewhere.

The card preview inside the editor is the deliberate exception: it renders the
identical bytes but logs taps instead of sending them, so you can click around a
design without commanding the house.

Put plainly: the app cannot unlock your door. The dashboard it generates can,
for anyone who could already unlock it themselves. Both are intended, and the
second is the reason to generate a dashboard at all.

## Branding

`icon.png` and `logo.png` in the repository root are **generated**. The sources
are `branding/icon.svg` and `branding/logo.svg` — ordinary SVG that opens in
Inkscape, Figma, Illustrator, or a browser tab. Edit those, then re-export at
whatever size you need.

### Where each file actually shows up

Supervisor discovers both by filename, sitting beside `config.yaml`. There is no
key to set and nothing to register; add the repository to Home Assistant and
they appear.

| Surface | What draws it |
|---|---|
| App store listing, app info page | `icon.png`, served by Supervisor at `/addons/<slug>/icon` |
| Store header | `logo.png`, served at `/addons/<slug>/logo` |
| **Sidebar entry for the editor** | **`panel_icon` in `config.yaml`** — currently `mdi:floor-plan` |

That last row is the one worth knowing: the sidebar icon is a
[Material Design Icons](https://pictogrammers.com/library/mdi/) *name*, not an
image. `icon.png` cannot go there, and no app's can — Home Assistant renders
the panel entry from its own icon set. If you want the sidebar to change, change
`panel_icon`, not the artwork.

Supervisor caches app metadata. After changing either PNG in an installed
repository, hit **Reload** in the app store (or `POST /store/reload`) rather
than expecting the new image immediately.

### Re-exporting

```bash
node tools/serve-static.js
```

That prints a URL. Open it, and the page loads both SVGs, previews them at the
sizes Home Assistant actually renders them at, and exports PNG at any size you
ask for. You can also just double-click `tools/export-branding.html` — a page
opened from the filesystem cannot read the files next to it, so it will ask you
to pick the two SVGs, and everything after that is identical.

Nothing is installed and no dependency is added. Rasterising SVG properly means
a path rasteriser, bezier flattening, anti-aliasing, gradients and text shaping;
every browser already has all of that, so the tool uses the one you have.

Drop the exported file over the one in the repository root and run
`node test/verify.js`. The suite checks the icon is square and at least 128px,
the logo is 2.5:1 and at least 250px wide, and that neither has grown past
150 KB.

### What ships now

| File | Size | Notes |
|---|---|---|
| `icon.png` | 256 × 256, ~33 KB | Home Assistant recommends 128; 256 gives hidpi headroom |
| `logo.png` | 500 × 200, ~40 KB | Home Assistant recommends "around 250×100", i.e. 2.5:1 |

The previous pair were 1254 × 1254 (868 KB) and 1983 × 793 (599 KB) — about
1.5 MB of raster for assets that render at 128 and 250 wide.

### Two things to know before editing

**An XML comment may not contain a double hyphen.** It is legal in every other
kind of comment you write all day, and here the file silently stops rendering
everywhere with no error. The export tool names the offending line, and
`test/verify.js` fails on it.

**The mark exists in both files.** `logo.svg` embeds a copy of `icon.svg`'s
drawing rather than referencing it, so that each file opens standalone in an
editor — an SVG that pulls geometry out of a second file stops being something
you can just open and see. Change the mark in one, change it in the other; the
suite checks the two still agree on the plan geometry and the palette.

### Colour and contrast

Home Assistant renders these on a themed surface, and the export tool has a
background switch (transparent, white, HA light, HA dark) so you can check
before shipping. The wordmark is brand blue rather than the near-black navy of
the original artwork specifically because navy looked right on the light store
background and all but disappeared on the dark one.

## The AppArmor profile

`apparmor.txt` ships beside `config.yaml`. Supervisor picks it up by filename —
there is nothing to switch on — and confines the app to five directories:
`/nodejs` (execute), `/app` and `/fixtures` (read), `/data` (the only writable
one), and `/ssl` (read, and only opened when the TLS options are set).

It grants no capabilities at all. The Home Assistant template profile begins
with `file,`, which permits every path on the filesystem, and then spends most
of its length on s6-overlay, bashio and `/bin/**`. This image is distroless: its
entrypoint is `/nodejs/bin/node`, and there is no shell, package manager or init
script for a profile to accommodate. So every allowed path is named
individually, and the closing `deny` block pins the promises made elsewhere in
this document — no writes outside `/data`, no `/config`, `/share`, `/addons`,
`/backup` or `/media`, no host secrets, no shell.

### Verifying it

**The profile is being verified on Home Assistant OS now.** It was derived from
the image's contents and this app's source rather than from audit logs on real
hardware, which is exactly what the current round of testing is checking. A
profile that is too tight stops the app from starting, so treat an install as
that test:

1. Install the app and start it. If it starts and the editor loads through
   the sidebar, the enforced profile is already sufficient for the common path.
2. If it does not start, look for denials on the host:

```bash
dmesg | grep -i apparmor | grep floorplan
```

3. To exercise the rest without fighting a failing start, put the profile in
   complain mode on the host — it then logs what it *would* have blocked
   instead of blocking it:

```bash
aa-complain /etc/apparmor.d/floorplan_studio
```

4. With it complaining, work through everything that touches the filesystem or
   the network: open the editor, save a project, load a sample, run **Generate
   dashboard**, use **Import… → From Home Assistant**, connect an MCP client,
   and — if you use them — set `ssl_cert`/`ssl_key` and connect over TLS.
5. Read the audit lines, add the genuine ones to `apparmor.txt`, and put it back
   into enforce mode:

```bash
aa-enforce /etc/apparmor.d/floorplan_studio
```

Judge each denial before adding it. A denied read of `/proc` or `/sys` is
usually a real gap. A denied **write** to `/app`, or any access to `/config`,
`/share` or `/backup`, is the profile catching something this app should not
be doing — fix the app, not the profile.

## License and attribution

Floorplan Studio is licensed under the **Apache License, Version 2.0**.
Copyright 2026 Karthik Babu. The full text ships as `LICENSE`
beside this file and inside the app container at `/LICENSE`;
it is also at <http://www.apache.org/licenses/LICENSE-2.0>.

You may use, modify, distribute and sell this app, and build products on top
of it. In exchange, Apache-2.0 §4 asks four things of anyone redistributing it
or a modified version: include the `LICENSE`, mark files you changed as changed,
keep the existing copyright and attribution notices in source form, and
reproduce the contents of `NOTICE`.

### What runs alongside your data

Nothing third-party is bundled. `package.json` declares no dependencies, there
is no lockfile, and every `require()` in the app resolves to a file in this
repository or to a Node.js built-in. The editor page loads no CDN script, no web
font and no external icon set — the `mdi:` names in the config are identifiers
Home Assistant resolves on its side, and every glyph drawn on the plan is
original path data in `app/lib/shapes.js`.

The container image adds an unmodified Node.js 24 runtime and a minimal Debian
base. Both keep their own licence and copyright files inside the image
(`/nodejs/LICENSE`, `/usr/share/doc/*/copyright`,
`/usr/share/common-licenses/`), so distributing the image intact already
satisfies their attribution terms. `THIRD_PARTY_NOTICES.md` lists every
component, its licence, and where its text lives — including why the base
image's LGPL glibc and GCC-Runtime-Exception libraries impose no condition on
your own code.

### The generated dashboard card

The card written into your Home Assistant is Floorplan Studio's code, so it
carries the Apache-2.0 banner and SPDX identifier in its own first lines. The
house plan baked into it is your data, not part of the licensed work, and so is
any CSS you added under **Dashboard → Appearance**.

### Trademark

Home Assistant is a trademark of the Open Home Foundation. Floorplan Studio is
an independent project, not affiliated with, endorsed by, or sponsored by the
Home Assistant project. Apache-2.0 §6 grants no trademark rights, and none are
claimed here beyond describing what this app interoperates with.
