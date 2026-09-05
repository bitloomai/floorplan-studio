---
id: library-palette
title: The library
summary: Everything you can place, why it is grouped the way it is, and how to add your own.
category: library
tags: library, palette, types, place, fixtures, devices, furniture
applies: panel:library, tool:place, registry:library, dialog:library
see: panel-item, item-aim
order: 46
---

The palette holds every **type** you can place, keyed `<kind>.<name>` — for
example `device.camera`, `fixture.spot`, `furniture.bathtub`.

Four kinds, and the distinction is about what a thing *does*, not what it looks
like:

| kind | what it is |
|---|---|
| `fixture` | something that emits light |
| `device` | something with a state worth showing |
| `furniture` | something that occupies space |
| `logic` | a scene, an automation, a helper — pinned to a place |

## Placing

Click a palette item, then click the plan — it stays armed, so ten downlights do
not need ten trips back to the palette. Or drag a palette item straight onto the
plan to place it there directly. **Esc** disarms.

While armed you can still grab and adjust the item you just placed; clicking
anywhere else places another.

## Groups

Types are grouped by where they belong in a house rather than alphabetically,
because "what goes in a bathroom" is the question people actually have.

## Adding your own

The library editor lets you add a type or change one. Two things to know:

**Editing the shipped defaults does not change a project already running.** Your
copy of the library is materialised on first run, and updates only fill in
fields that are genuinely absent — which is what stops an app update from
clobbering something you deliberately set.

**A type is only as good as its properties.** A look you add is not offered
until it appears in the type's `variant` options, and a property nothing draws
is a control that does nothing. The suite checks both directions.
