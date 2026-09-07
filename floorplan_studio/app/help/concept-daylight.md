---
id: concept-daylight
title: Daylight
summary: Where the sun is, how much of it reaches each room, and what the plan needs from you to know.
category: light
tags: sun, daylight, daylight, transmission, weather, solar
applies: concept:daylight, dialog:sun, section:floor.sun, section:sun.model, section:room.daylight
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

## Per-room glazing (Advanced)

"Enough glass" is a judgement about a room, not about a house: a stairwell and a
living room with identical glazed-to-floor ratios are not equally well lit in
practice. A room can carry its own **fully-daylit glazing ratio**; left blank it
inherits the house's.

An outdoor room ignores it entirely — it is lit from above and takes the
open-sky share instead.

## The daylight model (Advanced)

The constants the model runs on, none of which a house needs to touch:

- **the ambient wash** — the darkest a lit room gets at night, the brightest by
  day, the share a room with no glazing of its own still receives, and how much
  sky an outdoor room takes.
- **the sky curve** — how sky strength follows the sun's elevation. It peaks
  well before the zenith on purpose: a plan cares how much light gets *through*
  a window, and a high sun enters a vertical opening at a poor angle.
- **sun patches** — the geometry of the beam a window throws on the floor.

They are behind **Advanced** because "never needs to" is not "cannot".

## What the weather does to the sky (Advanced)

With a weather entity set, each condition it can report carries a multiplier:
1 is a clear sky at full strength, and a third of that is heavy overcast. They
are listed in the Sun dialog under Advanced, one row per condition the model
knows, and only a changed one is stored — so the rest keep tracking the shipped
values as those improve.

With no weather entity, none of them apply and the single fallback beside the
entity picker is used for everything.
