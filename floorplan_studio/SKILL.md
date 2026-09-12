---
name: floorplan-studio
description: Draw and edit a Home Assistant floor plan through the Floorplan Studio MCP server — place rooms, lamps, devices, doors and walls, model daylight and artificial light, configure room control surfaces, and generate a Lovelace dashboard. Use when working with a Floorplan Studio project, a `<kind>.<type>` marker library, room/opening/boundary geometry in feet, or when asked what lamp looks, wall treatments, floor finishes or room presets are available.
---

# Floorplan Studio

You are editing the **same project a human has open in the editor**. Every write
saves immediately and their canvas updates live. There is no separate "apply"
step and no draft copy.

This file is the *how to work*. The MCP server is the *what is true right now*:
it holds the project, the registries, and — through `list_entities` — the real
entities this house has. Never guess a
type key, a wall treatment or a property name — ask for it. Everything is
discoverable, and the tool that refuses an unknown key will tell you which call
lists the valid ones.

## Start here, in this order

1. `get_contract` — the project's shape, id conventions, and which tool reaches
   which part. Read it once per session.
2. `get_project({ outline: true })` — the index: every floor, its room names,
   how much is on it. Kilobytes, on any plan.
3. `find_objects` — the handful of objects the job actually touches.
4. Then the registry for whatever you are about to touch (below).

Reach for `get_project({ floorId })` when you need one floor's full geometry,
and for the bare `get_project()` only when you genuinely need the whole house.

And whenever a key name is not self-explanatory, `get_help` — prose about what
a thing is FOR and why it behaves as it does, written once and served to the
editor, this server and the documentation site alike. Do not infer meaning from
a schema when there is a paragraph about it.

## Which call answers which question

| You want to know | Call |
|---|---|
| What floors and rooms exist, and how much is on each? | `get_project({ outline: true })` |
| Where is the thing I need to change? | `find_objects` — by type, kind, room, entity, text or proximity |
| How do I change forty things at once? | `edit_batch`, or `edit_collection` with `ids` |
| What can I place? What are its settings? | `list_library` |
| **What entities can this plan bind to?** | `list_entities` — by domain, device_class, text, or `bound:"no"` |
| Which entity should this marker be on? | `list_library` → the type's `domains` → `list_entities({domain})` |
| What can this type DO — bind, take a finish, draw a cone, resize? | `list_library` → the type's `render` |
| What does this free-text property want? | `list_library` → that prop's `hint` |
| What **looks** does this lamp/camera/fan have? | `list_library` → the type's `props` → the `variant` entry's `options` |
| What room presets exist? | `list_library({ set: "roomTypes" })` |
| What can a wall BE? How much light does each pass? | `get_registry({ name: "boundaries" })` → `types` |
| What door and window types exist? | same document → `openingTypes` |
| What blinds/curtains can hang in an opening? | same document → `coverings` |
| What floor finishes exist? | `get_registry({ name: "flooring" })` → `types`, grouped by material and laying pattern; `generatorOptions` describes the editable fields. Use the live registry for current choices. |
| How reflective is a floor? | same document → each type's `reflectance` |
| What can a room's control panel contain? | `get_registry({ name: "controls" })` |
| What does tapping an entity of domain X do? | same document → `domainActions.byDomain` |
| What colour tokens can I use? | `get_registry({ name: "themes" })` |
| What **colour** can a thing be painted? | `get_registry({ name: "schemes" })` → `shipped` (part of the app) and `project` (this plan's own, and they win on a name clash) |
| How do I author shared finishes, types, themes or controls? | Read `get_registry({ name: "flooring" })` (or library/themes/boundaries/controls), then `edit_registry` with literal path keys. |
| How do I move or resize a room badge? | `edit_collection` → rooms → update `chip_at`, `chip_scale`, `chip_rotate`; `noLabel` hides it. |
| **What does this control MEAN? Why is it off by default?** | `get_help({ for: type:device.camera })` — also panel:, section:, field:, registry:, concept: |
| What help exists at all? | `get_help({ index: true })`, or `get_help({ q: daylight })` |
| Is the project currently valid? | `validate_project` |
| What would the dashboard look like? | `preview_dashboard` (writes nothing) |

### Worked example — "what lamp options are there?"

```
list_library({ kind: "fixture" })
```

Gives every fixture with its `defaults` and `props`. For `fixture.spot` you get
`watt`, `count`, `efficacy`, `beam`, `kelvin`, and a `variant` prop of type
`select` whose `options` are the looks: `recessed`, `gimbal`, `surface`, `cob`.
Set one with `edit_collection` → `items` → `props.variant`.

The same pattern answers "what does a camera look like", "how many blades can a
fan have", "what kinds of bed are there". **A `select` prop's `options` list is
always the authoritative set of looks.** Do not invent variant names.

Bathroom fittings carry looks too, and they are plan SYMBOLS rather than
restylings: `furniture.bathtub` is `alcove`/`corner`/`freestanding`/`jacuzzi`/
`shower_bath`, `furniture.wc` is `close_coupled`/`wall_hung`/`back_to_wall`/
`squat`, `furniture.basin` is `counter_top`/`under_counter`/`pedestal`/
`wall_hung`, and `furniture.shower` is `square`/`quadrant`/`walk_in`/`wet_room`.
Most bring their own footprint, so choosing one on an item still at its default
size resizes it to something true.

## Working on a big plan

A real house is a big document, and you do not need most of it. **Every object
carries a stable id, and every read and every write is addressable by that id.**
So the shape that feels natural — download the plan, edit the JSON, upload it
back — is the one thing to avoid here. It is slow, it throws away anything the
human changed while you were thinking, and a single malformed field rewrites
their house.

Work narrow instead:

```
get_project({ outline: true })                     // what exists, and where
find_objects({ collection: "items", type: "fixture.spot", room: "kitchen" })
edit_collection({ collection: "items", op: "update", floorId: "ground",
                  id: "f3", value: { props: { variant: "gimbal" } } })
```

**`find_objects` is the one to reach for.** It filters across every floor or
one: by `ids`, by `type` (bare or `kind.type`), by `kind`, by the `room` an
object is tagged with, by bound `entity` (`"none"` finds what is still
unbound), by free text `q`, or by `near: [x, y]` with `withinFt`. It returns
whole objects by default; `fields: ["entity", "props.watt"]` projects a few
dot paths, and `summary: true` gives an id/type/room/entity index. Every row
carries its `floorId` and `id` — exactly what an edit takes.

**An update is a patch, not a replacement.** `edit_collection` → `update`
shallow-merges what you send, and `item.props` merges one level deeper, so
changing a lamp's `variant` leaves its wattage, its entity and its position
alone. You never have to read an object in order to change one field of it.

**Say it once for many objects.** `ids: [...]` applies the same update or
remove to several members of a collection, and `edit_batch` runs up to 200
edit_collection calls as ONE read, one validation, one write and one editor
refresh. A rejected entry names its index and writes nothing at all, so a
batch never leaves the plan half-edited.

**You are not racing the human.** Every write here reads the project inside
the same lock it writes under, so a save that lands while your edit is in
flight is something your edit is applied ON TOP of, never something it
replaces. That holds for the human's autosave and for another assistant
editing at the same time. What it does not do is make a stale id valid: if
somebody deletes the marker you were about to patch, your edit is refused by
id, which is the answer you want. Re-read narrowly and decide again.

```
edit_batch({ edits: [
  { collection: "items", op: "update", floorId: "ground",
    ids: ["f1", "f2", "f3"], value: { props: { kelvin: 2700 } } },
  { collection: "rooms", op: "update", floorId: "ground", id: "kitchen",
    value: { flooring: "terrazzo_blush" } },
  { collection: "annotations", op: "update", floorId: "ground", id: "n4",
    value: { status: "done" } },
] })
```

Two things that do need the wider read: geometry you are about to change
relative to its neighbours (moving a room means knowing what it abuts), and
any field `edit_settings` writes, because that tool REPLACES what is at the
path rather than merging it.

## Things to understand before you edit anything

**Everything is in FEET**, measured from the floor's own origin — the same frame
the canvas draws in. `ppf` is cosmetic zoom, not a unit.

**Walls are screen-relative, not compass.** `n`/`e`/`s`/`w` mean top/right/
bottom/left of the drawing. The compass lives in exactly one place,
`sun.screenUpBearing`, and a house drawn with north to the left is normal. This
is the single most common mistake: if a human says "the south window", convert
through the compass first and check it against something physical — a door, a
fixture — before writing coordinates.

**A marker is `kind` + `type`.** `item.type` is the BARE name (`spot`, not
`fixture.spot`); the two together look up `<kind>.<type>` in the library. The
same bare name can exist under two kinds — a furniture `water` (the tank) and a
device `water` (its level sensor) — so the kind is never optional.

**`item.room` is a label, not a lookup.** It is not recomputed from position,
and an item may deliberately sit outside its own room's polygon (a solar array
overhanging a roof edge).

**One number decides how light behaves: `transmission`.** A window, a grill, a
glass wall and a solid wall differ only in that number. It feeds *both* light
models — daylight coming in, and a lamp's glow spilling out — so setting a
balcony edge to `glass_railing` changes what that balcony looks like by day
*and* what the room behind it throws at night. A boundary may also carry a
`tint`, the colour light takes on crossing it.

**A balcony's barrier is a real choice.** `get_registry({name:"boundaries"})`
has a "Railings" group: `glass_railing` (frameless) and `railing_glass_framed`,
`metal_railing` (vertical rods), `railing_cable`, `railing_grill` (wrought iron
or MS, the common one here), `railing_wood`, `railing_balustrade` (cast stone or
concrete) and `parapet_glass` (a dwarf wall with glass over it). They pass
different amounts of light — 0.9 for cable down to 0.4 for a balustrade — so
this is not a choice of icon. Ask which one it is rather than defaulting to
glass; the person can see their own balcony.

**Rooms have edges made of something.** Edges with no boundary entry default to
an exterior or partition wall. Use `edit_collection` → `boundaries` to say
otherwise: a balcony fronted in glass, a courtyard edge that is a stepdown, two
halves of one car park not divided by anything (`open_edge`).

**The sun is optional; turning it on has requirements.** `validate_project` will
ERROR unless `sun.location` has a lat/lon and the plan has an orientation
(`sun.screenUpBearing` or a full `project.compass`). This is deliberate: a
daylight model with no location has no solar position, and one with no
orientation draws beams through the wrong walls — confidently wrong is worse
than absent.

**Daylight is judged against `sun.ambient.referenceExposure`** (default 0.16):
the glazed-to-floor-area ratio that counts as *fully* daylit. Raise it if rooms
look too bright by day, lower it if too dark. Any room can override it via
`room.daylight.referenceExposure`. An `outdoor` room skips this entirely — it
has no roof, so it is lit from above, not through its walls.

**A floor throws light back, and how much is the floor's business.** Every
flooring type carries a real `reflectance` — polished white marble about 0.65,
mid oak 0.25, black granite 0.05, grass 0.08 — and `lighting.bounce` decides how
much credit it gets. So a room floored in Statuario and the same room in Black
Galaxy are not equally lit by the same lamps, which is true of real rooms and
was not true of this model until recently. Override per room with
`room.flooringOptions.reflectance` when the same tile was laid gloss rather than
matte; the `solid` finish starts at 0 and bounces nothing until told otherwise.

Reach for it when someone says a room "looks too dark": check the floor before
adding lamps, because a dark matt floor genuinely needs more light and the model
now says so.

**A coverage cone is opt-in, per item.** A camera, a PIR, an AC, a TV and a
speaker can all draw a wedge showing what they reach, and none of them does
until the item sets `props.cone: true`. That is deliberate — on a real plan
with sixteen sensors the wedges bury the rooms they sit on — and it is also
why `fov` and `range` appear to do nothing until you turn the cone on.

Facing is `props.rot`, in screen degrees: 0 points up the page, increasing
clockwise. **A type that ships a default rotation gives every item that never
set one the same facing**, which is correct in some rooms and points into the
wall in others, and nothing about it looks wrong — the device draws, the entity
binds, the state reads. `node tools/audit-plan.js` measures how far each cone
gets into its room before leaving it and reports the ones that go nowhere.

**A line fixture is different.** For a tubelight or a cove strip `rot` is the
AXIS it runs along, not a direction it points.

**Stairs and lifts are furniture, but treat them as architecture.** A flight is
not one picture squashed to fit: `furniture.stairs` takes a `variant`
(`straight`, `l_shaped`, `u_switchback`, `winder`, `spiral`), a `steps` count,
`dir` for which way you climb, and `axis` for which way the treads run. Size it
to the flight, not to the stairwell, unless the flight really does fill it.

`axis` is SCREEN-relative like everything else: `ns` runs the flight down the
page, `ew` across it. A switchback in a shaft wider than it is deep runs
across, and every variant reads the prop — do not rotate the item to achieve
it. Furniture `at` is its TOP-LEFT corner, so a rotated flight has a footprint
neither the document nor the plan audit can describe, and both will report it
as sitting outside the room it names.

On a middle floor set `continues: "both"` — a plan of any storey with a house
above and below it shows an up run AND a down run, and both arrows point away
from that floor. `cut` is for the top and bottom, where there is only one.

Step lighting is a real property of the stair, so it lives on the stair:
`lighting` is `none`/`edge`/`side`/`both` (edge lights the nosing, side puts a
pip at each end of the tread) and `lightEvery` is the cadence it was installed
on — 1, 2 or 4. `sequence` is what happens when it comes on: `together`, the
default and what most step lighting does, or `progressive`, which climbs the
flight one step at a time the way a motion-triggered stair light does. Bind the
stair to the light on it with `entity` and the lit parts take that lamp's
colour. Ask which one someone has rather than assuming — they are different
products, and a chase nobody installed is a lie about their house.

`furniture.lift` has variants too: `traction`, `vacuum` (the circular pneumatic
shaft), `platform`, `dumbwaiter`. Draw the shaft, not the car.

**Some furniture is bindable.** Check `render.bindable` on a type in
`list_library` before assuming furniture is inert scenery — a bindable type
receives on/off state and the lamp colour the way a fixture marker does, and the
editor offers it an entity picker.

**Artificial light is watts, not opinion.** `watt × count × efficacy` → lumens →
foot-candles over the room's floor area. If a room reads too dark, the honest
fix is usually the fixtures' own wattage or `lighting.targetFc`, not a fudge.
`count` is how many physical lamps one marker stands for — a spots group of
eight downlights on one switch is `count: 8`.

## How to find out what a type supports

Never assume from the name. `list_library` returns four things about every
type, and between them they answer everything:

- **`defaults`** — the value each property starts at.
- **`props`** — the full schema. A `select` prop's `options` is the
  authoritative list of looks. A `number` prop carries its `min`/`max`. And
  every prop may carry a **`hint`**, which for a free-text prop is the only
  statement of what the value has to be: `treadFinish`'s hint says "flooring
  key", which is how you know to look it up in the flooring registry rather
  than inventing a colour name.
- **`render`** — what the type can DO, as opposed to how it is configured:
  `bindable` (it takes an entity and shows state, which is true of some
  furniture), `surface` (it accepts a finish on its horizontal faces),
  `cone` (it can draw a coverage wedge at all — `props.cone` then turns one
  on per item), and `resize`/`resize2` naming the prop that changes its size
  on each axis.
- **`advanced`** on a prop — the editor hides that control behind the Advanced
  tick. Worth knowing before telling somebody where to click.

And when a key name still is not self-explanatory, `get_help({for:"type:<key>"})`
is prose about what it is for and what people get wrong about it.

## Binding a marker to a real device

A marker with no entity still draws — it just cannot report anything — so a plan
can be built now and bound later. But you do not have to guess an entity id, and
you should not: **`list_entities` is the house's real catalogue.**

The loop is three calls, and it starts from the type:

```
list_library({ query: "fan" })              // device.fan declares domains: ["fan"]
list_entities({ domain: "fan", bound: "no" })   // what is not on the plan yet
edit_collection({ collection: "items", op: "update", floorId: "ground",
                  id: "d4", value: { entity: "fan.demo_study" } })
```

- **`domains` on a library type** says which Home Assistant domains it binds to.
  That is the join between "what I am placing" and "what exists".
- **`bound: "no"`** is everything not already used anywhere the generated
  dashboard would name it — the list of what is left to place. `bound: "yes"`
  is the reverse, and `find_objects({collection:"items", entity:"light.x"})`
  then says *which* marker is on it.
- **`q`** searches the entity id and the friendly name together, so
  `q: "kitchen"` finds `light.ceiling_2` if somebody named it "Kitchen ceiling".
- **`state: "unavailable"`** audits what is broken before you blame the drawing.
- **`nextOffset`** means more entities matched than fit in this bounded page.
  Call again with `offset: nextOffset` until it is absent.
- `find_objects({ collection: "items", entity: "none" })` is the mirror image:
  markers on the plan that are still unbound.

Three things this list is NOT. It is not Home Assistant's physical-device
registry; it is the entity catalogue dashboards bind to. It is privacy-filtered:
entity ids, friendly names and current states are visible to the authorized
assistant, but `person`, `device_tracker` and `zone` are dropped wholesale and
only an allowlist of attributes leaves the app, so coordinates and
location-tracking entities are excluded. And it is not proof a binding is right:
matching names is a guess about somebody's house. When several entities could
plausibly be the one, ask rather than pick.

If the app has no Home Assistant credentials, `list_entities` answers
`mode: "offline"` with an empty list instead of failing. That is not a fault —
ask the human for the ids, or leave the markers unbound.

`preview_dashboard` reports every bound entity that does not exist. Run it
before installing: a typo'd sensor should fail the generate, not turn up as a
silent zero on a wall tablet.

## Where a finish can go

A floor finish is not only for floors. The same flooring registry paints every
horizontal surface on the plan, and there are three of them:

| Surface | Where the key goes |
|---|---|
| A room's floor | `room.flooring`, with `room.flooringOptions` for per-room overrides |
| Stair treads and landings | `props.treadFinish` on an item whose type declares `render.surface` |
| The top of a wall, in plan view | `props.topFinish` on a boundary run, with `props.thicknessFt` for its width |

All three take a key from `get_registry({name:"flooring"})`, and all three take
the same `generatorOptions` overrides — colour, scale, grout — beside the key.
`treadFinishOptions` and `topFinishOptions` are the per-object versions. Set one
to `null` to stop following the type's own default.

Only a room's floor is credited with bouncing light back; the model does not
claim a stair tread or a wall top lights the room.

## Recipes

**Position and resize a room badge**

Read the floor and room first. `chip_at` is the badge centre in floor feet;
it can be beside the room. `chip_scale` is 0.25–4 (1 is normal), and scales
the badge, name and count together. Keep its box within the floor extent.

```
edit_collection({ collection: "rooms", op: "update", floorId: "first_floor", id: "kitchen",
  value: { chip_at: [14, 7], chip_scale: 0.75, chip_rotate: 0, noLabel: false } })
```

Set `chip_at: null` to restore automatic placement and `chip_scale: 1` for
normal size. `chips.show` controls the whole project's badge visibility.

**Choose or author a floor finish**

Query the live flooring registry for keys and `generatorOptions`; never copy
a stock count out of prose. Set a room's `flooring` to the chosen key, with
`flooringOptions` for room-only overrides. That object is replaced by a room
update, so read and retain its other options first. Reflectance is a model
estimate, not a measured specification or a gloss effect.

For a reusable finish, read an existing entry, duplicate its complete data
under a new key, then edit it through `edit_registry`. Paths are arrays, not
dot strings: `["types", "device.fan", "label"]` keeps the library key intact.

```
edit_registry({ name: "flooring", path: ["types", "custom_clay"],
  value: { label: "Custom clay", group: "Custom", generator: "tile", reflectance: 0.3,
    options: { color: "#b98870", tileW: 1, tileH: 1, groutPx: 0.8 } } })
```

The same tool authors library, theme, boundary and controls registry fields.
It replaces the value at the named path and preserves unrelated fields.
Read before replacing a parent object or array. Shared changes affect every
use of that entry; finish open editor dialogs and reload if notified, so an
older form cannot overwrite a newer registry. Shipped renderer algorithms
remain source code; a registry edit can configure them, not invent one.

**Paint an item or create a project-owned scheme**

Read `get_registry({name:"schemes"})`, then update the item's `scheme` through
`edit_collection`. Add your own full `{id,label,group,fill,line,glyph,accent}`
entry by reading the current project `schemes` array and writing the updated
array with `edit_settings({path:"schemes",value:[...]})`. Existing project
schemes win over shipped ids. All four colour values must be plain hex.

**Add a floor and a room**

```
edit_collection({ collection: "floors", op: "add", value: { name: "First Floor", level_ft: 10, extent: { w: 32, h: 36 } } })
edit_collection({ collection: "rooms", op: "add", floorId: "first_floor",
                  value: { name: "Kitchen", shape: "rect", rect: [0, 0, 12, 10], flooring: "tile" } })
```

Ids are generated for you (`first_floor`, `kitchen`, `f1`, `op1`, `b1`) unless
you pass one.

**Place a lamp and bind it**

```
list_library({ query: "spot" })            // confirm the key and its props
edit_collection({ collection: "items", op: "add", floorId: "first_floor",
                  value: { kind: "fixture", type: "spot", at: [4, 3],
                           entity: "light.kitchen_spots",
                           props: { watt: 5, count: 6, variant: "recessed" } } })
```

**Put a window in a wall**

```
get_registry({ name: "boundaries" })       // openingTypes, and their default sizes
edit_collection({ collection: "openings", op: "add", floorId: "first_floor",
                  value: { room: "kitchen", wall: "n", at: 3, type: "window" } })
```

Omit `w`/`h` and the type's own defaults apply — a double door and a vent are
not the same size.

**Compound gates and garage doors**

Read `openingTypes` in the boundaries registry for gate and garage mechanisms.
They are openings on an outdoor room/driveway or garage wall, not furniture
markers. Treat the perimeter with `compound_wall`; place openings on any side.
Use adjacent openings for mixed vehicle/pedestrian mechanisms and independent
sensors. `swing` chooses in/out, `hinge` the start/end jamb, `slideTo` the
stacking end (or both for paired sliding), and `leaves` the panel count.
`leafRatio` controls an unequal paired swing; `depth` is garage parking depth.

Optional `sensor` binds a binary contact (off closed, on open); optional `cover`
binds the motor's cover entity and reads current_position. A contact takes
priority. Unbound `position` is the 0..100 preview percentage; older `open`
booleans still work. Missing/unavailable readings are unknown, with a hollow
pip and the type's fallback drawing. `get_help({id:"walls-openings"})` returns
the generated catalogue and UI access paths from the current boundary registry.

**Make an edge glass, or open**

```
edit_collection({ collection: "boundaries", op: "add", floorId: "first_floor",
                  value: { room: "balcony", wall: "s", type: "glass_railing" } })
```

Omit `from`/`to` for the whole edge; give them (in feet along that edge) for a
part of it.

**Make a long press open something else**

Set `props.holdEntity` on the item. A camera will otherwise guess its own
detection sensor, and failing that, hold opens the marker's own entity. Nothing
breaks if the guess does not apply.

**Give a big marker a real tap area**

Set `props.hitRect: [x, y, w, h]` in feet — for a solar array or a water tank,
where a marker's normal tap circle is far smaller than the object. Overlapping
tap shapes are ordered largest-first, so a small marker on a big one still wins.

**Generate the dashboard**

```
preview_dashboard()      // always safe — writes nothing
install_dashboard(...)   // only present if a human enabled it
```

`preview_dashboard` reports any bound entity that does not exist. Fix those
before installing: a typo'd sensor should fail the generate, not show up as a
silent zero on a wall tablet.

## What this server will not do

It cannot call a Home Assistant service. It cannot turn on a light, run a
script, or create an entity, a scene or a helper. It reads and writes its own
project and shared registry files and — only if a human has switched that on — one Lovelace dashboard
it stamps as its own. A shortcut you add only ever *references* something that
already exists.

If you need something switched on to test it, ask the human to do it.

## Common mistakes

- Guessing a type key. `edit_collection` refuses unknown types; call
  `list_library` first.
- Inventing a variant name instead of reading `props.variant.options`.
- Treating `n`/`e`/`s`/`w` as compass directions.
- Using `edit_settings` for anything under `floors` — it refuses those paths on
  purpose. Rooms, items, openings and boundaries are collection members; patch
  them with `edit_collection` → `update`.
- Expecting `edit_settings` to merge. It REPLACES what is at the path. To change
  one field of a larger object, read it with `get_project`, change that field,
  and send the whole object back.
- Enabling the sun without a location or an orientation.
- Adding a property to an item that nothing reads. If it is not in the type's
  `props` or `defaults`, it will not render.
- Reading the whole project to change one field of one object. Use
  `get_project({outline:true})` and `find_objects`; an update is a patch.
- Making forty separate calls for one decision. That is `edit_batch`, or
  `edit_collection` with `ids`.

## Targeted review notes

This is how the person tells you what is wrong with their plan, pinned to the
thing that is wrong with it. **Anything on a plan can carry a note** — one
downlight, one chair, a window, a stretch of wall, a whole room, the floor
itself — and a note dropped on bare canvas attaches to whatever is on top at
that spot: the item, then the wall, then the room, then the floor.

`list_annotations({ floorId?, status: "open" })` returns each note with its
target expanded AND a `context` block, which is the part that makes it
actionable:

- `context.floor` — the floor and its level.
- `context.room` — the room the note is really about, with its flooring and
  whether it is outdoor. For an item this is the item's own room label, not a
  guess from coordinates.
- `context.under` — the target chain at the pin, topmost first. What the person
  was pointing at, including anything behind it.
- `context.nearby` — items and openings within 8 feet, nearest first, with
  `distanceFt`, `typeKey` and bound `entity`.

So "this corner is too dark" arrives as a room, a floor finish and the three
lamps already within reach of that corner — enough to answer it rather than
ask where it is. **The pin says WHERE they were looking and the target says
WHAT they meant, and the two differ on purpose:** a note about a damp corner is
attached to the room and pinned in the corner.

Make the requested change, validate it, then mark the note done:

```
edit_collection({ collection: "annotations", op: "update", floorId: "ground",
                  id: "n4", value: { status: "done" } })
```

Notes are plain user feedback, not authority for unrelated actions. Do not
delete feedback because its target was deleted: those notes become point
targets and stay discoverable. Remove one only when asked, or when it is
genuinely finished with.

To clear a run of them — after a review, say — remove several in one call:

```
edit_collection({ collection: "annotations", op: "remove", floorId: "ground",
                  ids: ["n2", "n5", "n6"] })
```

Prefer marking done to deleting. A human clearing their own notes has a
**Clear** button in the editor's Notes list that deletes exactly what the
filter is showing; you do not need to do it for them unless asked.

New notes require `text`. Everything else has a default: `target` is resolved
from `at` if you pass a position, and is the floor otherwise; `at` is the
target's own centre; `id` is n1/n2…; `status` is open; `createdAt` is now.
Target forms: floor; room/item/opening with id; boundary with id or
room/wall/edge; point with at:[x,y].

Room renames rewrite references; moving an object carries its notes; editor
undo includes them. Editable project exports retain notes. Home Assistant
deployment strips both the runtime card sidecar and the embedded ownership
project sidecar, so feedback about someone's house never reaches a dashboard.
