---
id: panel-room
title: The room panel
summary: Everything a room is — its shape, its floor, its walls, and what its popup offers.
category: rooms
tags: room, panel, inspector
applies: panel:room
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

The name is what the dashboard shows. **Hiding the label** is worth doing for
small service rooms — a 3 ft cupboard with its name across it reads as clutter,
not information.

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
