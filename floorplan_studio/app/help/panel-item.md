---
id: panel-item
title: The item panel
summary: Everything one placed thing is — its look, its size, its entity and what it reports.
category: library
tags: item, panel, inspector, entity, variant
applies: panel:item, field:item.entity, field:item.variant, section:item.look, section:item.size, section:item.properties, section:item.entity, section:item.tap, section:item.channels
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
