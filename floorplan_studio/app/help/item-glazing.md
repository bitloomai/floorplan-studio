---
id: item-glazing
title: Skylights and glazed panels
summary: One whole aperture, cut plain or patterned — and why the cut is drawn rather than modelled.
category: library
tags: skylight, glazing, roof light, jaali, cnc, pattern, glass
applies: type:furniture.glazing, shape:glazing
see: concept-daylight, item-colour, walls-openings
---

A glazed panel is **one aperture**, not a fitting. It is drawn as a single pane
with a frame around it — no bar across the middle, nothing that could be
mistaken for a light on the ceiling below it.

## Two different things are both called a skylight

They are not interchangeable, and picking the wrong one is the usual confusion
here:

- **Glazing / skylight** — this item. A piece of furniture you place anywhere,
  at any size and angle. Use it for a roof light over a room, a glazed strip in
  a corridor ceiling, a canopy over a courtyard.
- **The `skylight` opening type** — a hole in the *ceiling*, placed on a room
  the way a window is placed on a wall, and marked **Overhead** so it never cuts
  a gap in the wall it names.

Both feed daylight. Place the item when you are drawing a panel; place the
opening when you are describing a hole the daylight model should account for.

## The cut

**Cut** says what the panel is made of. Plain is glass. The rest are the
CNC-cut patterns a roof light is usually specified with:

| Cut | What it draws |
| --- | --- |
| Plain | Glass. Frame and pane, nothing else. |
| Grid | Orthogonal glazing bars. |
| Diagonal | A diamond lattice at 45°. |
| Chevron | Nested V bands. |
| Hexagon | Honeycomb. |
| Arabesque | Interlocking circles — the commonest jaali lattice. |
| Floral | A repeating four-petal motif. |
| Starburst | Radial spokes and two rings, centred. Drawn once, not tiled. |

**Pattern size is in feet**, so enlarging the panel gives you *more* of the
pattern rather than a magnified copy of it. That is the point: a pattern that
stretches with its panel is a picture of a pattern, not a pattern. A cut is laid
inside a small margin and only whole repeats are drawn, which is also what a
real cut panel looks like — a pattern inside a frame.

## The cut is drawn, not modelled

A dense jaali blocks a great deal of light and an open grid blocks very little,
and **the renderer does not infer that**. Set **Light transmission** yourself to
say how much gets through. Two panels with the same transmission and different
cuts light the room identically — the cut is what you are looking at, the
transmission is what the daylight model reads.

## Colour

A glazed panel takes a **colour scheme** like any other piece of furniture, and
its scheme colours the glass and the frame together — tinted glass, a bronze
frame, a dark stone-coloured louvre. Left alone it draws in the plan's own
glazing colour, which is what it has always done.
