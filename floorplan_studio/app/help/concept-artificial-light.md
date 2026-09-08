---
id: concept-artificial-light
title: Lamps, lumens and how bright a room reads
summary: Watts become lumens become a foot-candle level — which is why a lamp's wattage is worth filling in.
category: light
tags: light, lumens, watt, kelvin, scrim, brightness
applies: concept:lighting, dialog:lighting, section:lighting.model, section:item.lamp, field:item.watt, field:item.kelvin
see: room-flooring, concept-daylight
order: 45
---

At night the plan darkens under a **scrim**, and each lit room is cut back out of
it. How far back depends on a real calculation rather than a fixed opacity.

## The chain

```
watts  ->  lumens  ->  spread over the room's area
       ->  multiplied by the floor's reflectance
       ->  a foot-candle level  ->  how much scrim lifts
```

Two consequences worth holding on to:

**A lamp with no wattage contributes a default, not nothing.** If a house's
lamps all lack wattage, the model still runs — it is just fiction. Filling in
even approximate figures makes the difference between rooms meaningful.

**The floor matters.** The same lamps over dark carpet and over polished marble
give genuinely different levels, because reflectance is in the chain.

## Colour

`kelvin` sets the lamp's colour temperature, warm to cool. When an entity reports
its own colour, that wins — the number here is what to assume when it does not.

## Brightness follows the entity

A dimmable light's brightness attribute scales its contribution live. You do not
need to model dim levels; bind the entity and the plan follows it.

## Cove and strip lighting

A cove is a **line**, not a point, and it washes the surface it is set into. Its
length is part of its output, and its `rot` is the **axis it runs along** — not a
direction it points. A strip drawn across its wall instead of along it is a
common and completely silent mistake.

The **perimeter cove** is the other kind: rather than a straight run you place,
it traces the room's own outline, inset by whatever you set. An L-shaped room, a
room with a bowed wall and a plain rectangle are all one problem, so the run
follows the plan when you reshape the room.

Its **Look** says what the run is made of — the same length of light, six
products:

| Look | What it is |
| --- | --- |
| Cove | Recessed indirect light. The default. |
| LED strip | A bare strip: a bright core with its spill either side. |
| Channel | A strip in an aluminium profile, drawn as its two edges. |
| Plaster-in slot | A continuous line broken by its fixings. |
| Rope light | Beaded rather than continuous. |
| Wall wash | Aimed down the wall, so the spill sits on the wall side. |

**Repeat spacing** is in feet, not pixels, so a slot's fixings and a rope's
beads stay the same real size as you zoom. The looks that draw a continuous run
ignore it.

**A perimeter cove is selected by its strip**, not by a dot in the middle of the
room — click the line where it is drawn. Clicking inside the room selects the
room, or whatever else is standing there.

**A cove may sit outside the room it lights.** Set the room explicitly and the
run traces that room, wherever the marker itself is parked — a pillar-mounted
run, or a strip whose marker you moved somewhere you can reach it.

## The light model (Advanced)

Settings both light models read that a plan needs none of to look right:

- **light zones** — clip a lamp's glow to its room and let it out through each
  opening by that opening's own transmission, so a blackout blind stops the
  spill and a sheer curtain does not. Off, every lamp draws a plain circle that
  washes straight through walls.
- **floor bounce** — how much of a flooring's own reflectance counts. 0 is
  arithmetically the model as it was before floors had a say.
- **the glow pool** — how a lamp's pool of light grows with its output. It grows
  slowly on purpose: a 20 W tube is not four times the radius of a 5 W spot.
- **a fitting that says nothing** — what a lamp marker counts as when its type
  carries no figure. Raising these brightens every unspecified fitting at once.
- **room name chips** — whether the name is drawn, whether it carries a live
  count, and the room size below which the count is not worth saying.
