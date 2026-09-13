---
id: room-lighting
title: A room's master light, ganging and count chip
summary: Which entity the room answers to, and why the little "2 of 3" chip sometimes does not appear.
category: light
tags: room, master, ganged, chip, count
applies: section:room.lighting, field:room.master, field:room.ganged, field:room.showCount
see: concept-artificial-light, room-controls
order: 56
---

## Master

The room's **master** is the entity a tap on the room toggles. Without one, a tap
opens the popup instead of doing anything.

## Ganged

`ganged` says the room's lamps share one physical switch. They cannot be on
independently, so the plan stops pretending they can.

## The count chip

A room can show a small chip reading how many of its lights are on. It is
suppressed in three cases, and they are three different reasons rather than one
rule:

- **One lamp.** The chip could only ever read `0/1` or `1/1`, which is what the
  room's own colour already says.
- **Ganged.** "1 of 2" is not a state a ganged room can be in.
- **Named off.** Some rooms are ones where the number is only noise, and you say
  so per room.

Do not expect these to behave as a single toggle — merging them would make one of
the three wrong.
