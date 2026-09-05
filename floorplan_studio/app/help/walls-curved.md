---
id: walls-curved
title: Curved walls
summary: How to bow a wall, why the number to give is the bulge rather than a radius, and what still does not work on one.
category: walls
tags: wall, curve, radius, bow, polygon
applies: section:room.curved, field:room.curve, concept:curve
see: walls-boundaries, panel-room
order: 38
---

A polygon room can have one or more of its edges **bowed** outward or inward.

## Give the bulge, not the radius

The stored number is a radius, and a radius is a terrible thing to ask a person
for: the useful question is "how far does the middle of this wall bow out from
straight" — the sagitta — and that is what the control asks for. It converts.

This matters because a radius **below half the edge length does nothing at all**,
silently. A plausible-looking small number leaves the wall dead straight and
reports no error, which is a frustrating half hour if you do not know.

## What a curve costs

Bowing a wall flattens it into a dozen short diagonal segments. Almost
everything copes:

- It keeps its compass name, so a bowed east wall still answers to "east".
- It can carry a **boundary treatment**, and the picker offers it once, labelled
  `· curved`, rather than a dozen times.
- Openings and edges resolve normally.

Two things do not, and are worth knowing before you rely on them:

- **A curved glass wall passes no daylight yet.** The daylight model skips
  diagonals.
- **An opening on a curved wall resolves to the first segment** rather than to a
  position along the curve.

If either matters for a particular wall, leave it straight.
