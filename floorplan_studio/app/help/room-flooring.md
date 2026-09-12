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
direction for wood, grout lines for tile, chips for terrazzo, a packed bed of
stones for gravel, clods and grit for bare earth. They are generated rather
than tiled images, so they scale cleanly at any zoom and cost nothing to load.

> **Density**, on the loose materials and the fine-grained ones, is a multiple
> of what that finish normally is, not a number of specks: 2× the shipped
> figure is twice as busy. **Stone size** on a gravel bed is the difference
> between pea shingle and cobbles.

**How much light the floor gives back.** Every finish carries a
**reflectance** — the fraction of light that bounces off it. Polished marble
returns far more than a dark carpet, and in a room lit to the same wattage that
is a visible difference in how bright the plan reads.

> A finish with no reflectance reflects **nothing**. If a room renders darker
> than you expect and the lamps are right, check the finish first.

## Choosing one

Finishes are grouped, because a flat list of them all is a list nobody reads to
the end. The catalogue at the foot of this page has every one, in those groups,
with what it is drawn by and what it reflects.

The India group exists because red oxide, athangudi, kota, cuddapah and the
marble-look vitrified tile most new bedrooms are floored in are ordinary floors
in a great many houses and absent from every stock library.

## Two kinds of pattern, and why one of them looks subtle

How a finish is drawn decides how it behaves across a plan, and the difference
is worth knowing because one of them is easy to mistake for a finish that is
not working.

**Tiled** finishes — plank, herringbone, chevron, hexagon, brick, basketweave,
checker, encaustic — are a repeating unit laid out from the room's own origin.
They read immediately, and two rooms sharing a tiled finish set out
identically, so an open-plan living and dining room drawn in one chevron reads
as one floor rather than two.

**Field** finishes — marble, travertine, terrazzo, grass, gravel, soil — are
drawn **across the whole floor and clipped to each room**, not tiled. That is
what makes a marble vein run on through a doorway instead of stopping dead at
the threshold, and it is the right model for anything whose figure is
continuous in life.

The consequence: marble veining is **deliberately faint**, because real veining
is, and at the scale a whole house is drawn at a slab reads as a pale field
with a few lines through it rather than the dramatic figure of a close-up
sample. That is not a missing pattern. If you want it to carry from across the
room — a printed marble-look tile does, because the pattern is inked onto every
tile and reads from the doorway — raise **Vein strength (×)** and **Vein weight
(×)** on the finish, and set **Tile width (ft)** above 0 so it is laid out as a
tile as well as veined. *Marble-look tile 4×2* in the India group is exactly
that combination if you want to copy one that works.

Sharing one field finish between adjoining rooms is the cheapest way to make a
plan look like one house: an entrance and the hallway it runs into should
almost always be the same stone.

## Making your own

Select a room, open **Flooring**, and change **Colour** to tint just that room.
Soil, gravel, cobblestone, grass and the fine-grained finishes all derive their
light and dark texture from this colour; it is not fixed. **Reset to the type’s own look**
returns the room to its material defaults. Edit the flooring registry to change
a material's defaults for every room that uses it without an override.
Grass starts with a natural green base and soft tonal variation, independent
of the theme's outdoor background colour.

Choose the **material and laying pattern** together. Straight planks,
right-angled herringbone, mitred chevron and basket parquet have different
joints; rotating one does not turn it into another. Herringbone snaps the
board length to a whole multiple of its width to keep its repeat seamless.
Hexagonal tiles, floral cement tiles, woven fibres and studded rubber also
have their own generators. Tile variation changes individual tile shades;
terrazzo exposes chip size, density, colours and angular or rounded chips.

Stock palettes cover timber, ceramic and porcelain, marble, natural stone,
terrazzo, patterned cement, woven carpet and plant fibres, concrete and oxide,
resilient floors and outdoor surfaces. They are stylised plan appearances,
not product photographs. **Reflectance is an approximate model default**;
use a known material's value when you have it. It does not simulate gloss,
surface roughness or a manufacturer's finish specification.

You can add a finish: give it a base colour and pick the generator that matches
its character. The generator shades the base colour to derive its own grain and
grout. A registry colour may also use an `@themeToken`; the renderer resolves
the token before deriving the shades.

For a scripted surface, `samples/flooring-script-examples.json` contains worked
tatami and radial-inlay examples. Copy the chosen entry into your flooring
registry's `types` to make it selectable; examples are not stock finishes.
