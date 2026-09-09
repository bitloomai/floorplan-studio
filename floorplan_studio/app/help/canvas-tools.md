---
id: canvas-tools
title: Drawing and moving things
summary: The five tools, what each is for, and where every key and gesture is listed.
category: plan
tags: canvas, tools, draw, select, pan, zoom, shortcuts
applies: canvas, tool:select, tool:rect, tool:poly, tool:opening, tool:pan
see: input-devices, concept-units, library-palette, panel-room
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

## Review notes

Use **Notes** (N) to list this floor’s open or completed feedback. Add a floor note there, use the inspector’s **Add note**, or right-click an object or wall and choose **Add note here**. On touch screens, hold still for half a second. **Select behind** in the same menu reaches overlapping objects. Moving or adding a second finger cancels the hold. Right-click still finishes a polygon while drawing.

Notes appear as numbered pins above the plan. Click a pin to edit, save, delete or cancel; Escape cancels. Drag a pin or use the arrow keys to move it without changing its target. Moving an object carries its notes, and deleting it leaves them at their last position as point notes. Room renames preserve attachments. Undo and redo include notes. Use Mark done after addressing feedback; completed notes remain available in the Done filter.

Editable project exports keep feedback. HA deployment strips notes from both card data and the embedded project copy; exported SVG drawings also omit pins. Agents can read expanded targets using list_annotations and manage notes through edit_collection.
