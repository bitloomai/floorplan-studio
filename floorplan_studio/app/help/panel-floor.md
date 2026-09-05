---
id: panel-floor
title: The floor panel
summary: A floor's size, its level in the house, and the sun settings it can override.
category: plan
tags: floor, extent, level, grid, icon
applies: panel:floor, field:floor.extent, field:floor.level, field:floor.grid
see: concept-units, concept-daylight, canvas-tools
order: 14
---

Shown when nothing is selected. A floor is a drawing surface plus a place in the
stack.

## Extent

The floor's width and height in feet. This is the **viewBox** — anything drawn
beyond it is clipped away silently.

That last part is worth remembering when a balcony or a porch projects past the
building line: grow the extent with it, or the projecting part simply will not
appear and the plan will look exactly as it did before your change.

## Level

The height of this floor above the ground, in feet. Nothing on the plan uses it;
the house overview stacks floors by it, and the dashboard orders its tabs by it.

## Grid and snap

The grid is a drawing aid. Snapping to a half foot is a good default — a plan
looks wrong long before a reader can say why, and the reason is almost always a
0.3 ft gap behind a sofa.

## Sun override

A floor can override the house's sun settings, including switching daylight off
entirely. A basement or a plant room is the case this exists for.
