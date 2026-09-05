---
id: concept-daylight
title: Daylight
summary: Where the sun is, how much of it reaches each room, and what the plan needs from you to know.
category: light
tags: sun, daylight, daylight, transmission, weather, solar
applies: concept:daylight, dialog:sun, section:floor.sun
see: concept-units, walls-boundaries, concept-artificial-light
order: 40
---

The plan computes the sun's real position for your **location and the current
time**, then works out how much of it reaches each room.

## What it needs

**A latitude and longitude.** Without them there is no sun at all — the model
refuses to guess rather than lighting your house as though it were somewhere
else. This is the single most common reason daylight appears to do nothing.

**A compass.** The sun arrives on a real bearing; the plan is drawn on a screen.
The compass is what connects them, and getting it wrong lights the wrong side of
the house at the wrong time of day.

## How a room gets lit

Roughly: how much glass the room has, relative to its floor area, weighted by how
much light each piece of glass passes. That is why boundaries and opening types
matter — a wall of `glass_full` and a wall of masonry are different rooms to this
model.

An **outdoor** room is exempt. It is lit from above, and the glass-to-area
question is meaningless for a terrace.

## Weather and solar

You can bind a **weather entity**, and an overcast sky will dim the whole model.
You can also bind a **solar production sensor** — but note it can only ever pull
the estimate *down*. A quiet inverter is evidence of cloud; a busy one is not
evidence of extra sun, and letting it brighten things would make the plan lie on
a cold clear morning.
