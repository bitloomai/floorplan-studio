---
id: room-controls
title: What a room's popup offers
summary: Tap a room on the dashboard and this is what you get — sections, filters and shortcuts.
category: controls
tags: controls, popup, room, sections, shortcuts, presets
applies: section:room.controls, registry:controls, dialog:controls, dialog:room-buttons, field:room.controls, field:controls.markerTap
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
guess: a light toggles, a cover opens, a sensor opens more-info. The whole table
is at the foot of this page, and in the editor under **Room controls → edit the
house defaults…**.

## Tapping and holding a marker

Both are settable, and they are two halves of one question. **Holding a marker**
opens the entity's Home Assistant dialog, opens its room's popup, or does
nothing — that last one is for a wall tablet, where a resting hand should not
open dialogs.

**Tapping a marker** defaults to *switches it on or off*, and follows the hold
setting: if holding is set to do nothing, a tap opens the dialog instead,
because otherwise nothing on the plan could open one. Choose *Always switches
it on or off* to keep switching even with holding off, or name a tap outright
as opening the dialog, opening the room, or doing nothing.

A library type that declares `tapAction: "moreInfo"` beats both settings. That
is what stops a text label bound to a light switching the light when you only
wanted to read it.

## Editing the defaults

The house-wide starting point every room inherits — the header, which sections
exist, whether a section is read-only — is editable in that same dialog. A room
still overrides any of it in its own panel.
