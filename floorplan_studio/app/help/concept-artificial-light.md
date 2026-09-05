---
id: concept-artificial-light
title: Lamps, lumens and how bright a room reads
summary: Watts become lumens become a foot-candle level — which is why a lamp's wattage is worth filling in.
category: light
tags: light, lumens, watt, kelvin, scrim, brightness
applies: concept:lighting, dialog:lighting, section:item.lamp, field:item.watt, field:item.kelvin
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
