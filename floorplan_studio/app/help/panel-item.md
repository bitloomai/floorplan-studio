---
id: panel-item
title: The item panel
summary: Everything one placed thing is — its look, its size, its entity and what it reports.
category: library
tags: item, panel, inspector, entity, variant
applies: panel:item, field:item.entity, field:item.variant, section:item.look, section:item.size, section:item.properties, section:item.entity, section:item.tap, section:item.hold, field:item.room, section:item.channels
see: item-aim, library-palette, concept-artificial-light
order: 48
---

Select anything you have placed and this panel edits it. What appears depends
entirely on the **type** — a camera offers a field of view, a bed offers which
wall its pillows sit against, and neither offers the other's settings.

## Look

Most types offer several **looks**, and a look is a different drawing rather than
a restyling. A CRT is not a flat panel squashed; a corner bath is not an alcove
bath rotated.

Several looks bring their own **footprint**, and choosing one on an item still at
its default size resizes it to something true. If you have already set a size by
hand, it is left alone — picking a look never silently undoes a measurement.

## Size and rotation

`w` and `h` are in feet. Furniture is anchored at its **top-left corner**, so the
numbers describe a box starting where you placed it.

Nudge with the arrow keys (Shift for a foot), rotate with `[` and `]`, resize
with `−` and `+`.

## Entity

Binding an entity is what makes an item *report* rather than merely appear. An
unbound item still draws — that is a legitimate state for furniture and for a
fitting nothing automates.

A **read-only** binding shows state without offering to change it, which is the
right setting for a sensor and the wrong one for a lamp.

## When a reading stays blank

Some things ARE their reading — a solar array, an energy meter, a tank level.
For those, `state === 'on'` is never true, so they would sit in the "off" style
forever with the number suppressed. Their type sets a numeric rule instead. If a
readout is mysteriously blank, that is the first thing to check.

## Long press opens (Advanced)

Holding a marker opens more-info for its own entity. That is the wrong answer
for a camera: holding one should show you *who it saw*, and that is a different
entity.

Left blank, the type may still guess — a camera looks for its own detection
sensor — and if neither is available, hold falls back to the marker's own
entity. Setting it here is how you say so outright.

## Room (Advanced)

Which room an item belongs to is worked out from where it stands, and that is
right almost always. Naming a room by hand is for the case geometry cannot
answer: a pillar-mounted array that overhangs its own slab, a sensor on the
boundary between two spaces.

It is data, not a lookup — an item **can** sit outside its own room's outline on
purpose.
