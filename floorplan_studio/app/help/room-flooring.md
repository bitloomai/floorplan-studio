---
id: room-flooring
title: Floor finish
summary: What the floor is made of, and how much light it throws back into the room.
category: rooms
tags: room, flooring, finish, light, reflectance
applies: field:room.flooring, registry:flooring, section:room.flooring
see: concept-artificial-light, panel-room
order: 20
---

The finish decides two separate things, and the second one is easy to miss.

**How the floor is drawn.** Each finish generates its own surface — grain
direction for wood, grout lines for tile, a speckle for terrazzo, a scatter for
gravel. They are generated rather than tiled images, so they scale cleanly at
any zoom and cost nothing to load.

**How much light the floor gives back.** Every finish carries a
**reflectance** — the fraction of light that bounces off it. Polished marble
returns far more than a dark carpet, and in a room lit to the same wattage that
is a visible difference in how bright the plan reads.

> A finish with no reflectance reflects **nothing**. If a room renders darker
> than you expect and the lamps are right, check the finish first.

## Choosing one

Finishes are grouped — Basic, Wood, Stone, India, Outdoor — because a flat list
of 65 is a list nobody reads to the end. The India group exists because red
oxide, athangudi, kota and cuddapah are ordinary floors in a great many houses
and absent from every stock library.

## Making your own

You can add a finish: give it a base colour and pick the generator that matches
its character. The generator shades the base colour to derive its own grain and
grout, which is why a finish takes a real colour rather than a theme token — a
generator cannot shade a variable it has never resolved.
