---
id: walls-openings
title: Doors, windows and openings
summary: Holes cut in a wall — where they sit, how wide they are, and what light they let through.
category: walls
tags: opening, door, window, swing, sill, transmission
applies: panel:opening, field:opening.at, field:opening.wall, concept:opening
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

`swing` is geometry, not vocabulary. `in` bulges toward the room's own `+x`/`+y`
side, and which side of the doorway that lands on depends on whether the door
sits on a low or high edge of the room. If the arc comes out on the wrong side,
flip it and look — that is faster than reasoning about it.

## Transmission

Every opening type passes a share of the daylight that reaches it. Clear glass
passes most; a grill vent passes some; a solid door passes almost none, and a
door that is **open** passes all of it. Bind a contact sensor and the plan will
know which it is.
