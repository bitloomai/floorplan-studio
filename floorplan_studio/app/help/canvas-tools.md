---
id: canvas-tools
title: Drawing and moving things
summary: The five tools, what each is for, and the keys worth learning first.
category: plan
tags: canvas, tools, draw, select, pan, zoom, shortcuts
applies: canvas, tool:select, tool:rect, tool:poly, tool:opening, tool:pan
see: concept-units, library-palette, panel-room
order: 12
---

| key | tool |
|---|---|
| **V** | Select and move |
| **R** | Draw a rectangular room |
| **P** | Draw a room outline, point by point |
| **A** | Place a door, window or opening |
| **H** | Pan |

**Esc** always backs out — it stops placing, drops the selection, and closes a
dialog.

## With something selected

- **Arrow keys** move it a few inches; hold **Shift** for a foot.
- **`[`** and **`]`** rotate; hold Shift for 45° steps.
- **`−`** and **`+`** resize.
- **Ctrl/Cmd+D** duplicates with a small offset.
- **Delete** removes.

Press **`?`** at any time for the full list.

## Zoom

Zooming moves the view, it does not scale the drawing. That is why a 1px wall
stays a 1px wall at any zoom and the labels stay crisp — a CSS-scaled plan turns
walls into fat bands and text into blurred stamps.

## On a touch screen

A drag is treated as a tap until it has moved about 8 pixels, so trying to pan
does not toggle whatever was under your thumb.

## Selecting a room

Click inside it, away from anything placed on top. Items sit above rooms, so
clicking a sofa selects the sofa — which is usually what you meant.
