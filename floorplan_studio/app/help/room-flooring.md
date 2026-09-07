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
