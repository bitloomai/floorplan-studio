---
id: walls-boundaries
title: What a wall is made of
summary: Every run of wall can be glass, a railing, a louvre or a jali — and each passes a different amount of light.
category: walls
tags: wall, boundary, glass, railing, transmission, daylight
applies: section:room.walls, registry:boundaries, concept:boundary
see: concept-daylight, walls-curved, walls-openings
order: 30
---

By default every edge of a room is a wall. A **boundary** overrides a run of one
edge with something else: `glass_full`, `louvre`, `metal_railing`, `jali`,
`parapet_glass`, `open_edge` and about thirty others.

This is not styling. Each treatment carries a **transmission** — the fraction of
daylight it passes — so replacing a solid wall with glass genuinely lights the
room behind it, and a jali passes about half.

## Per edge, not per letter

A boundary applies to an **edge**, not to every wall sharing a compass letter.
An L-shaped room can easily have two edges the compass calls "east"; the picker
offers one row per real edge so you can say which.

You can also cover **part** of an edge by giving a range along it. The rest stays
an ordinary wall. That is how you get a glazed section in the middle of a
masonry wall without splitting the room.

## Things that catch people

**A fully-open edge has no wall run left to restyle.** If a treatment seems to do
nothing, check whether an opening already spans the whole edge — there is no wall
there to change.

**A curved wall counts as one row**, labelled `· curved`, even though it is drawn
as a dozen short segments. You cannot apply a treatment to part of a curve,
because there is no straight axis to measure the range along.

**`open_edge` is not a door.** It says there is no wall at all — the boundary
between a car port and its drive, or between two halves of one space. Openings
are for holes cut in a wall that exists.
