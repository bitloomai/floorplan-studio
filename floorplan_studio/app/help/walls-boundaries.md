---
id: walls-boundaries
title: What a wall is made of
summary: Every run of wall can be glass, a railing, a louvre or a jali — and each passes a different amount of light.
category: walls
tags: wall, boundary, glass, railing, transmission, daylight
applies: section:room.walls, registry:boundaries, dialog:boundaries, concept:boundary, field:boundary.thicknessFt, field:boundary.topFinish
see: concept-daylight, walls-curved, walls-openings
order: 30
---

By default every edge of a room is a wall. A **boundary** overrides a run of one
edge with something else — glass, a louvre, a metal railing, a jali, a glazed
parapet, or simply nothing at all. The full list, with what each one passes and
how thick it is drawn, is the catalogue at the foot of this page; it is built
from the registry, so it is whatever your install actually has.

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

## Editing a treatment

**Room → Walls & railings → edit treatments…** opens what a treatment *is*, as
opposed to which one a run has: its name, its group, and the daylight it passes.
Under **Advanced** it also carries how thick and how high it is drawn, and its
**tint** — the colour light takes on crossing it, which is what makes bronze
glazing and a green polycarbonate sheet different from clear glass rather than
merely differently labelled.

The same dialog holds the opening types and the coverings, on their own tabs. An
opening carries two figures rather than one: what it passes shut, and what it
passes open. That is the whole point of a door.

Changes apply everywhere that type is used, on every floor, and are saved as you
make them.

## How wide is a wall, and what is its top made of?

After choosing a treatment for an edge, an enclosing wall offers **Wall top width
(ft)** and **Wall top finish**. Clear the width to follow the treatment's default.
The type editor's Advanced **Thickness (ft)** changes the default everywhere that
type is used. An open edge or threshold has no horizontal wall top.

Choose any floor finish for the wall top; its generator options affect this run
only. Reset the options to use the material's own look, or clear the finish to
restore the treatment colour. Partial runs stop at their endpoints, and curved
walls use the same flattened boundary geometry as their outlines. Materials cover
the band seen from above, not a wall elevation.

Wall runs store overrides in `props`: `thicknessFt`, `topFinish` (a flooring
key), and `topFinishOptions` (generator options). These override the type's
`render` values and survive project export and dashboard generation. A material
is generated over the floor extent and clipped to the wall bands, preserving its
physical scale. Overlapping bands using the same material share one paint pass.

On an exterior edge, width grows inward: the room edge remains the wall's outer
face, including at corners. A wall shared by two indoor rooms remains centred on
their common edge.
