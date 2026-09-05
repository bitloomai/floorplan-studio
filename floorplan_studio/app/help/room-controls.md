---
id: room-controls
title: What a room's popup offers
summary: Tap a room on the dashboard and this is what you get — sections, filters and shortcuts.
category: controls
tags: controls, popup, room, sections, shortcuts, presets
applies: section:room.controls, registry:controls, dialog:room-buttons, field:room.controls
see: panel-room, dashboard-install
order: 55
---

Tapping a room on the generated dashboard opens a popup. This is where you say
what is in it.

## Sections

A section gathers entities by a rule rather than by a list, so a lamp added next
year appears without anybody editing the popup. Sections can draw from the room's
own items, from its shortcuts, or from a filter over domains and kinds.

**A section filtering on availability counts zero until live states arrive.**
That is correct, and it reads exactly like a broken filter for the first second
after a dashboard loads. The editor says so where it happens.

## Presets

A preset is a ready-made popup for a kind of room — the set of sections a
bedroom usually wants differs from a car port's. Start from one and adjust.

## Shortcuts

A shortcut pins a scene, a script or a helper to a place. The house can carry
them and so can each room, and a room inherits the house's alongside its own.

A shortcut can sit in the popup's **header button row** rather than in the body,
which is the right place for a do-not-disturb toggle you want to reach without
scrolling.

## What a tap does

That depends on the entity's domain, and the mapping is a registry rather than a
guess: a light toggles, a cover opens, a sensor opens more-info. You can see the
whole table in the controls registry.
