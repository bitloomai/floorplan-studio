---
id: concept-units
title: Feet, and which way is north
summary: Everything is in feet, and n/e/s/w mean up/right/down/left on screen — not on your compass.
category: reference
tags: units, geometry, compass, walls
applies: concept:units, canvas, panel:floor, field:project.compass
see: concept-daylight, walls-openings
order: 5
---

## Everything is feet

Every measurement in a project is in **feet**, including wall runs, item sizes
and opening widths. There is no unit setting to get wrong, and a number that
looks like inches is a number somebody typed wrong.

Coordinates run from the **top-left** of a floor: `x` increases to the right,
`y` increases downward. That is a screen convention, not a mathematical one, and
it is why `y` grows the way it does.

## `n` `e` `s` `w` are SCREEN directions

A wall letter means where it sits **on the drawing**:

| letter | wall |
|---|---|
| `n` | top |
| `e` | right |
| `s` | bottom |
| `w` | left |

They are **not compass bearings.** A room's `w` wall is the one drawn on the
left, whichever way the house actually faces.

Your real orientation lives in exactly one place — the project's **compass**,
which says what screen-up corresponds to. If a plan is drawn with east at the
top, then `n` walls face east in the world, and the sun model knows that because
the compass told it.

> Mixing the two frames is the most expensive mistake available here. It puts
> windows on the wrong side of the house and daylight in the wrong rooms, and
> nothing in the drawing looks wrong. When you talk about a direction, say which
> frame you mean.

## An item's anchor

**Furniture is anchored at its top-left corner.** A marker — a lamp, a sensor, a
switch — is anchored at its **centre**. Placing furniture on a room's centre
point therefore puts it half a width off, which is worth knowing before you nudge
a sofa forty times.
