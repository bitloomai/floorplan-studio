---
id: start-here
title: What this app is
summary: Draw your home once, and get a Home Assistant dashboard that looks like your home.
category: start
tags: overview, orientation
applies: topbar, concept:overview
see: concept-units, canvas-tools, dashboard-install
order: 1
---

Floorplan Studio turns a drawing of your house into a **live Lovelace
dashboard**. You draw rooms, put lamps and devices where they really are, and
the generated card shows their state in place — a lamp that is on glows on the
floor it lights, a fan's blades turn while it runs, a door reads open.

The drawing is not decoration. Everything you place feeds a model:

- **Where a lamp is** and how many watts it draws decides how bright its room
  reads at night.
- **What a wall is made of** decides how much daylight crosses it.
- **Which way a camera points** decides what its coverage wedge covers.

So a plan that is roughly right looks roughly right, and one that is measured
looks like your house.

## The shape of the work

1. **Draw the floors.** One floor at a time, rooms first.
2. **Cut the openings.** Doors, windows, and the gaps between rooms.
3. **Place the things.** Lamps, switches, sensors, furniture.
4. **Bind the entities.** An item with no entity still draws; it just cannot
   report anything.
5. **Generate the dashboard.** One tab per floor.

You can stop after step 1 and still have something worth looking at, and you
can come back to step 4 for years.

## Two things that surprise people

**Nothing is saved to Home Assistant until you install the dashboard.** Editing
here changes a project file, not your house.

**The editor and this app's MCP server share one project.** If an assistant is
editing alongside you, its changes appear on your canvas as they happen. There
is no separate draft.
