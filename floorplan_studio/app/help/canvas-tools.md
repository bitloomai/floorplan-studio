---
id: canvas-tools
title: Drawing and moving things
summary: The five tools, what each is for, and where every key and gesture is listed.
category: plan
tags: canvas, tools, draw, select, pan, zoom, shortcuts
applies: canvas, tool:select, tool:rect, tool:poly, tool:opening, tool:pan, dialog:notes
see: input-devices, concept-units, library-palette, panel-room, agent-review
order: 12
---

Five tools, and each one only does its own job:

- **Select** picks things up. It is also the only tool that moves, resizes,
  turns and deletes what is already there, so it is where you spend most of
  your time.
- **Room** drags out a rectangle and turns it into a room.
- **Shape** takes a room corner by corner, for an L, a bay or anything else a
  rectangle cannot say. Finish it to close the outline.
- **Opening** puts a door, window, gate or shutter *on a wall* — it has to sit
  on one, so click near the wall you mean rather than in the middle of the room.
- **Pan** drags the plan around without touching anything on it.

**Esc** always backs out: it stops placing, drops the selection, and closes a
dialog.

Every key, button and gesture — including what to do on a tablet with no
keyboard — is in **Mouse, trackpad and touch**, linked below, and in the editor
under **⌨** in the top bar or by pressing **`?`**. That list is generated from
what the editor actually binds, so it is the one to trust.

## Zoom

Zooming moves the view, it does not scale the drawing. That is why a 1px wall
stays a 1px wall at any zoom and the labels stay crisp — a CSS-scaled plan turns
walls into fat bands and text into blurred stamps.

It also keeps whatever you are pointing at where it is, so zooming in on a
corner of the house does not send that corner off the edge of the window.

## Selecting a room

Click inside it, away from anything placed on top. Items sit above rooms, so
clicking a sofa selects the sofa — which is usually what you meant.

On a touch screen, tap it: a plain drag moves the plan rather than the room, and
only something already selected can be dragged. A press counts as a tap until it
has travelled about nine pixels, so an unsteady finger never nudges what it
meant to pick.

## The menu under the pointer

Right-click anything — or, on a touch screen, hold a finger still for half a
second — for what you can do to the thing you are pointing at: its properties,
duplicate, delete, turn it, bring it forward, add a note. **Select behind**
reaches whatever is underneath when things overlap.

Moving, or adding a second finger, cancels the hold, so a pan is never mistaken
for a long press. Right-click still finishes a polygon while you are drawing one.

## Review notes

**Notes** (N) lists this floor's feedback, open or done. Add one from that list,
from **Add note** in the inspector, or with **Add note here** in the menu above.
Notes appear as numbered pins above the plan; click one to edit it, drag it or
use the arrow keys to move the pin.

What they attach to, what happens when you move or delete that, and what an AI
assistant sees when it reads them, is in *Review notes* under **Working with an
AI** — linked below.
