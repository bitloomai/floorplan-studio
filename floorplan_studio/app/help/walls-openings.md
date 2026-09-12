---
id: walls-openings
title: Doors, windows and openings
summary: Holes cut in a wall — where they sit, how wide they are, and what light they let through.
category: walls
tags: opening, door, window, swing, sill, transmission, gate, garage, shutter, folding, sliding, villa
applies: panel:opening, section:opening.mechanism, section:opening.overhead, field:opening.at, field:opening.wall, concept:opening, section:opening.state
see: walls-boundaries, opening-coverings, concept-daylight
order: 35
---

An opening is a hole in one room's wall. Doors, windows, arches, skylights,
grill vents and plain gaps are all the same object with different types.

## Position is measured along the wall, in floor coordinates

`at` is **absolute** — measured in the floor's own coordinates, not from the
corner of the room. On a room whose wall starts at 0 the two are the same, which
is exactly why this is worth saying: get it wrong on one room and it looks
correct, get it wrong on the next and the window floats outside the house.

`w` is the width along the wall. `h` and `sill` are heights, and they feed the
daylight model rather than the drawing.

## Which edge

On a rectangle the wall letter is enough. On a polygon it may not be — a cut
corner can produce two edges the compass calls "east". Name the exact **edge**
when the picker offers it.

## Shared openings

An opening between two rooms is cut from both sides, and light crosses it in
both directions. You do not draw it twice.

## Swing

`in` swings or folds into the owning room; `out` moves away from it. Hinge
selects the stacking/hinged end. On horizontal walls, start is the left jamb;
on vertical walls, start is the top jamb. Paired leaves hinge at opposite ends.

## Compound walls, vehicle gates and pedestrian access

Draw the yard or driveway as outdoor rooms around the building. In the room's
**Walls & railings**, give the outside edges **Compound wall**, and use **Open
(no barrier)** on yard edges that should connect freely. Use the Opening tool,
choose a gate type and click the compound wall. Gates work on any of the four
sides; multiple openings can share a side. Keep each opening within its wall.

Use separate adjacent openings for a sliding vehicle gate and a swinging
pedestrian gate, or other mixed mechanisms. Each can have its own sensor and
state. A paired swing gate can also have unequal leaves using First leaf share;
both leaves then share one state. Folding gates support inside/outside folding
and one or two stacking banks. Leave physical room for the leaf, stack or
sliding run-back. The drawing does not check clearance against parked cars.

## Leave the swing clear — nothing checks it for you

A hinged leaf sweeps a quarter circle of its own width into the room it opens
into, and **nothing refuses to draw furniture in that quarter circle.** The arc
is drawn over the top of whatever is there, neatly, so the plan does not look
broken — it looks like a bathroom whose door opens onto the side of the bath,
which is the kind of wrong a reader feels without being able to name.

The rule of thumb is the door's own width: a 2 ft 6 in door needs 2 ft 6 in of
clear floor across the full width of the opening. When something has to go
there, move the opening rather than the furniture — a door 6 in further along a
wall is invisible, and a bath pushed 6 in off its plumbing is not.

`tools/audit-plan.js` reports furniture sitting **in** an opening, which is the
more obvious mistake. It does not report the arc. If you are generating plans
rather than drawing them, `tools/make-showcase.js --test` has a worked check
for this you can lift: the swept box is the opening's run by its own width,
deep into the room, which is the arc's bounding box whichever jamb it turns on.

## Sensors, motors and a drawing without sensors

Select the opening → **Opening mechanism**. Contact sensor is optional:
`binary_sensor` off means closed and on means open. A contact takes priority
when both bindings are filled. Motor / cover entity reads a `cover` entity's
current position (0 closed, 100 open), or its open/closed state when no position
is supplied. Opening and closing states remain visible in the dashboard tooltip.
Enable **Live states** in the editor's top bar to preview those readings on the
canvas. The dashboard follows Home Assistant live automatically.

Without either binding, **State on the plan** sets the drawing: Shut, Part open,
Open, or Follow the type. This is stored on the opening, not a preview — it is
what the exported plate and the generated dashboard card both draw, so a front
door you want shown closed stays closed everywhere. Part open reveals a slider
for how far. Binding a sensor or a motor replaces the setting with the live
reading rather than blending with it.

An opening only offers the setting when it has a state to be in. A type has one
if it draws a moving leaf, or if it declares `openTransmission` and so lets
different amounts of light through as it travels. A fixed pane, a cased opening
and an arch do neither, and say so instead of offering a control that would
change nothing.

A missing, unknown or unavailable bound entity uses the type's default drawing
with a hollow status pip and an unknown tooltip; it does not confirm that a gate
is closed. A solid pip indicates a known reading. Tapping a bound opening opens
Home Assistant's more-info dialog; tapping the plan does not operate the motor.

## Garage doors in plan view

Rolling shutters retract vertically into the lintel barrel. Sectional doors
and tilt-up doors park overhead; dashed panels show that overhead footprint,
not a leaf lying on the garage floor. Side-sliding sections park along the
inside side wall. Parking depth controls the depicted clearance. Partial
positions are schematic; for a rolling shutter the threshold bar thins as it
opens because a top-down view cannot show vertical travel directly.

## Transmission

Every opening type passes a share of the daylight that reaches it. Clear glass
passes most; a grill vent passes some; a solid closed gate passes almost none.
Gate and garage types interpolate from their closed transmission to full
transmission as they open. Existing indoor types retain their configured
transmission. Bind a sensor or cover entity to follow a gate's state.

## Overhead openings (Advanced)

A skylight, a light well or a double-height void is a hole in the **ceiling**,
not a gap in a wall. Marking an opening **overhead** stops it cutting a gap in
the wall it names and stops it being offered to the room next door, while its
area and transmission still count toward daylight.
