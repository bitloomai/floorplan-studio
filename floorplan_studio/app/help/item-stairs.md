---
id: item-stairs
title: Stairs and lifts
summary: A stair on a plan is a stair CUT — which is why it has an up run, a down run and a break line.
category: library
tags: stairs, lift, circulation, steps, cut
applies: type:furniture.stairs, type:furniture.lift, shape:stairs, section:item.stairs
see: item-aim, concept-units
order: 52
---

Stairs and lifts are **architecture rather than kit**, so they take building
properties — how many steps, which way you climb, how the flight turns — instead
of a size and a picture.

## Five arrangements

`straight`, `l_shaped`, `u_switchback`, `winder`, `spiral`. A U-switchback is the
dog-leg almost every stairwell actually is, and a spiral is a genuinely different
object rather than a squashed straight run.

**`axis` is which way the flight runs** — `ns` down the page, `ew` across it. A
switchback in a shaft that is wider than it is deep runs across, and drawing it
the other way turns a real staircase through ninety degrees.

Do not rotate the item to achieve this. Furniture is anchored at its **top-left
corner**, so a rotated flight's real footprint is a box neither the document nor
the plan audit can describe.

## The floor line

A plan is a horizontal slice about four feet above the floor, so the treads above
that height belong to the storey above. `continues` says what to draw:

| | |
|---|---|
| `none` | one whole flight — a stoop, a stage step |
| `cut` | what is past the break goes to the next storey, drawn faint |
| `both` | an up run **and** a down run, which is what a plan of any middle floor of a house shows |

`cutAt` is how far along the break falls, because that depends on the riser
height — a flight of six deep treads is cut much later than a flight of eighteen.

Under `both`, both arrows point the **same** way: they are two runs that each
leave this floor, not two halves of one climb.

## Step lighting

A stair can be bound to an entity like any fixture. `lighting` puts light on the
treads themselves — a pip each side, a lit nosing, or both — and `lightEvery` is
the cadence an electrician actually installs. `sequence: progressive` makes the
flight climb one tread at a time when it comes on, which is what a
motion-triggered stair light does.
