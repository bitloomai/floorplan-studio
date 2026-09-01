---
name: floorplan-studio
description: Draw and edit a Home Assistant floor plan through the Floorplan Studio MCP server — place rooms, lamps, devices, doors and walls, model daylight and artificial light, configure room control surfaces, and generate a Lovelace dashboard. Use when working with a Floorplan Studio project, a `<kind>.<type>` marker library, room/opening/boundary geometry in feet, or when asked what lamp looks, wall treatments, floor finishes or room presets are available.
---

# Floorplan Studio

You are editing the **same project a human has open in the editor**. Every write
saves immediately and their canvas updates live. There is no separate "apply"
step and no draft copy.

This file is the *how to work*. The MCP server is the *what is true right now*:
it holds the project, the registries and the live entity names. Never guess a
type key, a wall treatment or a property name — ask for it. Everything is
discoverable, and the tool that refuses an unknown key will tell you which call
lists the valid ones.

## Start here, in this order

1. `get_contract` — the project's shape, id conventions, and which tool reaches
   which part. Read it once per session.
2. `get_project` — what actually exists. Pass `floorId` to get one floor rather
   than the whole house.
3. Then the registry for whatever you are about to touch (below).

## Which call answers which question

| You want to know | Call |
|---|---|
| What can I place? What are its settings? | `list_library` |
| What **looks** does this lamp/camera/fan have? | `list_library` → the type's `props` → the `variant` entry's `options` |
| What room presets exist? | `list_library({ set: "roomTypes" })` |
| What can a wall BE? How much light does each pass? | `get_registry({ name: "boundaries" })` → `types` |
| What door and window types exist? | same document → `openingTypes` |
| What blinds/curtains can hang in an opening? | same document → `coverings` |
| What floor finishes exist? | `get_registry({ name: "flooring" })` → `types` (65, grouped Basic / Wood / Stone / India / Outdoor) |
| How reflective is a floor? | same document → each type's `reflectance` |
| What can a room's control panel contain? | `get_registry({ name: "controls" })` |
| What does tapping an entity of domain X do? | same document → `domainActions.byDomain` |
| What colour tokens can I use? | `get_registry({ name: "themes" })` |
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

**Stairs and lifts are furniture, but treat them as architecture.** A flight is
not one picture squashed to fit: `furniture.stairs` takes a `variant`
(`straight`, `l_shaped`, `u_switchback`, `winder`, `spiral`), a `steps` count,
`dir` for which way you climb, and `axis` for which way the treads run. Size it
to the flight, not to the stairwell, unless the flight really does fill it.

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

## Recipes

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
project file and — only if a human has switched that on — one Lovelace dashboard
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
