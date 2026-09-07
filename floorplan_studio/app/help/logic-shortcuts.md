---
id: logic-shortcuts
title: Shortcuts, scenes and automations
summary: One list of every scene, script, helper and automation the plan binds, and where each one was written.
category: controls
tags: logic, shortcuts, scenes, scripts, automations, helpers, inheritance
applies: dialog:logic
see: room-controls, panel-room
order: 58
---

A **shortcut** is one of your own actions: a label plus something to do —
activate a scene, run a script, flip a helper, pause an automation, switch
anything at all. The builder has no idea what any of them mean, and that is the
point. "Do not disturb" and "Turbo" are your words, not its.

None of them is created here. Each one names something that already exists in
Home Assistant.

## They cascade

Shortcuts inherit house → floor → room, like every other layered setting. A room
sees the house's alongside its own, and can override an inherited one by reusing
its id.

## Why the list is worth opening

The top half of this dialog edits the **house's** shortcuts. The bottom half
lists **every shortcut bound anywhere in the plan**, with the layer each one was
written on.

That list is the reason this dialog exists. A scene bound twice, or bound to the
wrong room, is invisible while you are looking at one room's panel and obvious
the moment all of them are in one column. It deliberately shows the raw layers
rather than the resolved result — resolving would collapse an override into a
single line, hiding exactly the duplicate you opened this to find.

Markers placed with a `logic` kind appear here too, listed against the floor
they stand on.

## Where they come out

Every shortcut reaches the generated dashboard. One with a **header** slot sits
in the popup's top row rather than in its body, which is the right place for a
do-not-disturb toggle you want without scrolling.
