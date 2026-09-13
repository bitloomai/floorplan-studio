---
id: agent-review
title: Review notes — telling an assistant what to fix
summary: Pin a note to anything on the plan, and an assistant reads it back with the room, the wall and the lamps around it.
category: agent
tags: notes, review, feedback, annotation, pin, mcp, ai
applies: dialog:notes, concept:review
see: agent-mcp, canvas-tools, data-import-export
order: 20
---

"The lamp over the island is in the wrong place" is a sentence somebody has to
translate into a coordinate. A note pinned to that lamp is not.

Review notes are short pieces of feedback attached to a **specific thing on the
plan**, kept with the project, read back by an assistant with everything around
them already worked out. They are how you do a walkthrough of your own house
and hand the list to someone — or something — that can act on it.

## Attaching one

Right-click anything on the canvas — on a touch screen, hold a finger still for
half a second — and choose **Add note here**. Or select something and use **Add
note** in the inspector. Or press **N** for this floor's list and add one there.

**Anything can carry a note.** One downlight, one chair, a window, a stretch of
wall, a whole room, or the floor itself. A note dropped on bare canvas attaches
to whatever is on top at that spot: the item, then the wall, then the room, then
the floor. If you meant the thing behind, **Select behind** in the same menu
reaches it.

The pin is where you were *looking*; the attachment is what the note is
*about*, and they are allowed to differ. A note about a damp corner belongs to
the room and sits in the corner — so drag the pin, or nudge it with the arrow
keys, without breaking what it is attached to.

## What happens to them

- **They follow.** Move a sofa and its notes move with it. Rename a room and
  the attachments are rewritten.
- **They survive.** Delete the thing a note was on and the note stays where it
  was, as a plain pin, rather than vanishing with the evidence.
- **They undo.** Adding, editing and resolving notes are part of the normal
  undo history.
- **Done is not gone.** **Mark done** when something is dealt with; completed
  notes stay in the Done filter, so a review you did last month is still
  readable.

## Clearing them out

The Notes list has a **Clear** button, and it deletes exactly what the list is
showing — so it follows the filter. With **Done notes** selected it clears the
finished ones and leaves the rest; with **All notes** it clears the floor. The
button says which and how many before you press it, and it asks once more after
that.

Opened from an object's inspector, the same list is that object's notes only,
and **Clear** is scoped to them.

It is one undo. Ctrl/Cmd+Z brings the whole lot back.

## What an assistant sees

Not just your words. Asked for the open notes, it gets each one with the floor,
**the room the note is really about**, what else sits under its pin, and the
items and openings within about eight feet — with their distances, their types
and the entities they are bound to.

That is the difference between "this corner is too dark" and *this corner of
the kitchen, floored in mid oak, with three downlights in reach and a window on
the north wall*. It can answer the note instead of asking you where it is.

## Where they do and do not go

Notes live in the editor. They are kept in your project file and in an editable
project export, so a plan you send to someone else carries the review with it.

They are **stripped from anything that reaches Home Assistant** — the generated
dashboard card, the project embedded in it, and exported SVG drawings all come
out with no pins and no note text. Feedback about someone's house is not
something to leave on a wall tablet.
