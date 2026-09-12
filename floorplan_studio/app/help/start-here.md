---
id: start-here
title: What this app is
summary: Draw your home once, and get a Home Assistant dashboard that looks like your home.
category: start
tags: overview, orientation
applies: topbar, concept:overview
see: concept-units, canvas-tools, dashboard-install, agent-mcp
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

**The editor and this app's MCP server share one project.** If an AI assistant
is editing alongside you, its changes appear on your canvas as they happen.
There is no separate draft, and no "apply" step. You can also hand it the work
from the start — see *Letting an AI draw your plan*.

## Do you have to press Save?

Normally no. The editor writes your changes a moment after you stop making them,
and the Save button says which of four things is true: **Save** means there are
changes not yet written, **Saving…** means it is writing, **Saved** is greyed out
because there is nothing to do, and **Retry save** means the last write failed
and your changes are still only in this tab. Beside it, the time of the last
successful save.

So a greyed-out button is the answer to "do I need to save?" — no. Ctrl/Cmd+S
still writes immediately whenever you want it to.

Turn **Autosave** off in the top bar and the button becomes the only way to
write. That setting belongs to the house rather than to your browser, so
everyone editing the same plan agrees about whether it is on. Either way, closing
the tab with unsaved changes still warns you first.
