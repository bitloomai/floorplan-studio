---
id: concept-artificial-light
title: Lamps, lumens and how far light carries
summary: Watts become lumens become light on the floor — brightest under the fitting, fading with distance, stopped by walls.
category: light
tags: light, lumens, watt, kelvin, scrim, brightness, pool, glow, tint
applies: concept:lighting, dialog:lighting, section:lighting.model, section:item.lamp, field:item.watt, field:item.kelvin
see: room-flooring, concept-daylight
order: 45
---

At night the plan darkens under a **scrim**, and every lamp that is on takes the
dark away round itself. How much, and how far, is worked out from the lamp —
not a radius somebody picked.

## One lamp

```
watts x lamps x lumens per watt x brightness  ->  lumens
lumens / (pi x throw^2)                        ->  light directly under it
                                                   fading as 1 / (1 + (d / throw)^2)^2
```

That fall-off is how a real fitting lights a floor, and it keeps every lumen:
added up over the floor it is exactly what the lamp puts out. So **wattage
decides both how bright a pool is and how far its light is still visible.** A
5 W downlight is a bright pool under it and a faint glow twenty feet away; a
30 W flood reaches much further. In a large dark space even a small lamp lifts
the whole area a little, most where it stands.

**Pool spread** on a fitting is where the light under it has halved. A wider
spread spreads the same lumens further and dimmer.

**A lamp with no wattage uses its type's.** Every lighting type ships a
wattage, efficacy and colour temperature, so an unconfigured fitting is a
sensible guess rather than nothing. Filling in the real figure makes rooms
differ the way they really do.

## What is drawn

- **The night lifts** round each lit fitting — under it the floor looks as it
  does by day, and further out it fades back to dark. Two lamps side by side are
  brighter than one, but not twice as bright: the eye saturates, and so does the
  plan.
- **The lamp's colour** tints what it lights, strongest under the fitting. Warm
  lamps warm the floor; a coloured lamp colours it.
- **A soft glow** sits on the fitting itself. It is also what shows a lamp is on
  by day, when its light is lost in the sun.
- **A walled room also fills evenly**, because light comes back off its ceiling
  and walls. An outdoor area under open sky has nothing to throw it back and
  gets only a trace; a roofed space open on some sides — a car port — gets a
  share by how much of it is wall.

Light **stops at a wall**, **carries on across an open edge** (the space simply
continues), and **fades out through a window, a doorway or a railing** by that
opening's transmission, onto the rooms either side of it. Nothing ends in a
straight line.

With **Model artificial light** off there is no night to cut, and a lit fitting
simply glows.

## The floor matters

The same lamps over polished marble and over dark granite give different rooms,
because each flooring carries a reflectance that credits the light bounced back
up — see *Credit for a reflective floor* below.

## Colour

`kelvin` sets the lamp's colour temperature, warm to cool. When an entity reports
its own colour, that wins — the number here is what to assume when it does not.

## Brightness follows the entity

A dimmable light's brightness attribute scales its lumens live, so a dimmed lamp
throws a smaller, dimmer pool. Bind the entity and the plan follows it.

## A light built into something else

A ceiling fan with a light in it is **one fitting**. Bind the fan's light on the
fan itself — **Light kit** in the fan's panel — rather than parking a separate
fan-light marker on top of it. The light is then drawn from the fan (a lit fan
shows its diffuser in the lamp's colour even with the motor off), throws its
light round the fan, counts as one of the room's lights in its "2 of 5" chip,
the plan header and the floor card, and appears among the room sheet's lights.
Tapping the fan works the fan; a long press opens its light. **Light kit watts**
is the lamp's wattage; efficacy and colour are under Advanced.

## Cove and strip lighting

A tube or a strip is a **line**, not a point: its lumens are spread along its
length, so its light lies along the run. Its `rot` is the **axis it runs
along** — not a direction it points. A strip drawn across its wall instead of
along it is a common and completely silent mistake.

The **perimeter cove** traces the room's own outline, inset by whatever you set,
and lights the floor along every wall of the room it names. It throws most of
its light at the ceiling first, so its own light on the floor is soft and the
room's even fill does the rest. An L-shaped room, a room with a bowed wall and a
plain rectangle are all one problem, so the run follows the plan when you
reshape the room.

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
run traces that room, wherever the marker itself is parked.

## Tuning it

Start with **Darkness with no daylight** and **Fully lit at**. A darker night
shows further how far each lamp carries; a lower *Fully lit at* makes every lamp
read brighter and reach further. **Response curve** below 1 keeps faint light
visible far from a fitting; above 1 keeps light in tight pools. The dialog says,
as you move them, how far a 5 W downlight's light is still visible.
