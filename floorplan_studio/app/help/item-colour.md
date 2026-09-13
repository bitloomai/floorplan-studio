---
id: item-colour
title: Colour schemes — what a thing is made of
summary: Painting a fan matte black or a sideboard teak, and making colour schemes of your own that travel with the plan.
category: library
tags: colour, color, scheme, finish, material, paint, wood, upholstery, export
applies: section:item.colour, dialog:schemes, field:item.scheme, registry:schemes
see: panel-item, data-import-export
order: 48
---

A plan drawn entirely in one grey says where everything is and nothing about
what any of it is. **Colour** is the third question the item panel asks, after
what shape it is (**Look**) and what it is doing (its entity): a ceiling fan is
matte black or ivory, a sideboard is teak or walnut, a tap is chrome.

Every item starts on **plain**, which is the theme's own furniture grey — so
nothing you have already drawn changes until you say so.

## Four colours, and what each one paints

| | |
|---|---|
| **Body** | the object itself — a marker's disc, the whole footprint of a piece of furniture |
| **Trim** | its outline, and everything drawn on it in outline: cushions, arms, shelf edges |
| **Detail** | the strokes inside a marker at rest — a fan's blades, an icon |
| **When live** | what it turns when it is on: an LED ring, a lit downlight, a status light |

## Light beats paint

Two things are never painted over, because both of them are the plan telling you
something you need more than you need the colour:

- **A lit lamp** draws in the colour it is emitting, whatever its body is made
  of. Paint a downlight matte black and it is still warm white when it is on.
- **An unavailable entity** keeps its dead-entity styling. A device you cannot
  reach has to look like one.

The same reasoning is why **when live** is not decoration. A running marker's
rim takes it, so it is what says *this is on* from across a room. Choose one
that is clearly different from the trim; a scheme whose accent matches its trim
falls back to the theme's own live colour rather than draw ON and OFF the same.

## Making your own

**edit colours…** opens a small editor of its own. The schemes that ship with
the app cannot be changed there — **duplicate** one instead, which is also the
quickest route to a colour that works, since every default is taken off a real
fitting or real timber.

## Where a scheme lives, and why it matters

| | |
|---|---|
| **Shipped schemes** | part of the app, not part of your plan. Identical on every install, never written into your file. |
| **Your own schemes** | part of the **project**. Saved with it, undoable, carried in its export, and baked into the dashboard card. |

So a plan you send somebody arrives in its own colours, with no registry to
install alongside it and nothing to reconnect. Import an exported project and
its schemes come back with it.

If a scheme you made shares its name with one the app ships, **yours wins** —
for good. A future version of this app adding a default called `teak` can never
silently repaint a plan you already drew.

## Deleting one

An item painted in a scheme that no longer exists would quietly fall back to the
theme while still naming the missing scheme, so a scheme still in use is not
deleted — the editor says how many items are wearing it. Repaint those first.
