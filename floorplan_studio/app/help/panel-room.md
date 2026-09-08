---
id: panel-room
title: The room panel
summary: Everything a room is — its shape, its floor, its walls, and what its popup offers.
category: rooms
tags: room, panel, inspector
applies: panel:room, section:room.label
see: room-flooring, room-lighting, room-controls, walls-boundaries
order: 10
---

Select a room and this panel edits it. A room is the unit almost everything else
hangs off: light is computed per room, the dashboard's popup is per room, and
daylight is worked out from the openings in **that room's** walls.

## Shape

A room is either a **rectangle** or a **polygon**, and those are the only two.
An L-shaped room, a room with a cut corner, a room with one bowed wall — all of
them are polygons.

Draw a rectangle with **R** and an outline with **P**. You can convert later; you
cannot invent a third shape.

## Name and label

New rooms derive their id from the name until the project is deployed or the id
is edited manually. Existing rooms keep their ids. Unicode names retain their
script, and a collision gets `_2`, `_3`, and so on.

Edit **id** or choose **Match the name** to change it explicitly. Items, openings,
wall overrides and merged-room references on this floor update in one undo step.
Other floors, Home Assistant entity ids and existing dashboard links stay as they
are; regenerate the dashboard after an explicit id change. Deployment history
survives undo, so undoing dashboard settings cannot enable automatic id changes.

The name is what the dashboard shows. **Hiding the label** is worth doing for
small service rooms — a 3 ft cupboard with its name across it reads as clutter,
not information.

In **Select** mode, drag the name badge to put it anywhere on the floor,
including just outside its room. This moves the badge, not the room. Its
corner handles resize it, and the name and on/total count shrink or grow with
it. The badge stays associated with its original room on the dashboard.

With a badge selected, arrow keys move it, **+ / −** resize it, **[ / ]** rotate
it and **Delete** hides it. Dragging or resizing makes one undo step. Enable
the room's label again in its inspector if you hide it.

## Part of another room

`part_of` says "this rectangle is a piece of that room, drawn separately".
Use it when one space is easier to draw as two boxes than as one polygon. Rooms
joined this way are expected to touch, and the plan audit will not report them
as overlapping.

## Outdoor

An outdoor room is lit **from above** rather than through its walls. This matters
more than it sounds: the daylight model asks "how much glass does this room
have, relative to its area", which is the right question for a bedroom and a
meaningless one for a terrace. Without this flag, the largest open space in a
house can come out darker than its own stairwell.

## Name position (Advanced)

Left alone, the label finds its own clear spot — the room's centre when nothing
is there, and the nearest clear place when something is, which is usually the
ceiling fan sitting exactly where the centre is.

Nudging it writes a position, and a position set by hand is a decision: nothing
second-guesses it afterwards. **Auto** hands the choice back. The name can also
be rotated, which is what a long, narrow corridor usually wants.

The numeric **Badge size (%)**, rotation, nudges and **Reset badge position and
size** controls live under **Advanced → Name position**. Size ranges from 25%
to 400%. Direct dragging and resizing do not require Advanced.
