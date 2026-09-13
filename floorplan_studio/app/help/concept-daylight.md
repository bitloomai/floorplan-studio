---
id: concept-daylight
title: Daylight
summary: Where the sun is, how much of it reaches each room, and what the plan needs from you to know.
category: light
tags: sun, daylight, daylight, transmission, weather, solar, car port, covered, compound wall
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

Three things, and only one of them is even:

- **Open sky.** An outdoor room under open sky is lit from above, evenly.
- **What comes in from the side.** A window, a glass door or an open side lets
  daylight in *from that edge*, brightest where it enters and fading with depth
  — so a room lit from one wall is bright by the window and dim at the back, and
  the light carries on across an open edge into the rest of the same space. How
  much gets in is the opening's transmission, which is why boundaries and opening
  types matter: a wall of `glass_full` and a wall of masonry are different rooms
  to this model.
- **A little scatter** that every room gets, round corners and through doors.

Only an aperture that looks at the **sky** brings daylight in. A door into
another roofed room does not — that room's own light already reaches across.
What stands outside counts too: an open side facing a compound wall a few feet
away sees much less sky than one facing an open yard, and the plan works that
out from the wall's own **Height**.

Where two rooms are drawn overlapping, the overlap is lit once, not twice.

## Covered outdoor spaces

A car port, a porch or a verandah under the floor above is **outdoor and
roofed**. Mark the room outdoor and set its **Open to the sky above** to 0 in its
panel (Advanced): it is then lit only through its open sides — bright at the
edge, fading towards the house — instead of like an open yard. Anything between
0 and 1 is a space partly open above, such as a pergola.

## Weather and solar

You can bind a **weather entity**, and an overcast sky will dim the whole model.
You can also bind a **solar production sensor** — but note it can only ever pull
the estimate *down*. A quiet inverter is evidence of cloud; a busy one is not
evidence of extra sun, and letting it brighten things would make the plan lie on
a cold clear morning.

Night gathers **through dusk**, not in proportion to the sky: an overcast noon
is still broad daylight indoors, so the plan only really darkens as the sun
goes down.

## Per-room settings (Advanced)

"Enough glass" is a judgement about a room, not about a house: a stairwell and a
living room with identical glazed-to-floor ratios are not equally well lit in
practice. A room can carry its own **fully-daylit glazing ratio** — the share
that makes light at its windows as strong as the sky — and, if it is outdoor,
its own **open to the sky above**. Left blank, both inherit the house's.

## The daylight model (Advanced)

The constants the model runs on, none of which a house needs to touch:

- **the ambient wash** — the darkest a lit room gets at night, the brightest by
  day, the share a room with no glazing of its own still receives, how much sky
  an outdoor room takes, and **how deep side light reaches** into a roofed
  space, as a multiple of the opening's height.
- **the sky curve** — how sky strength follows the sun's elevation. It peaks
  well before the zenith on purpose: a plan cares how much light gets *through*
  a window, and a high sun enters a vertical opening at a poor angle.
- **sun patches** — the geometry of the beam a window throws on the floor.

They are behind **Advanced** because "never needs to" is not "cannot".

## The hour you pick changes the drawing more than any setting

Worth knowing before you conclude that daylight is not working. The beams are
longest when the sun is **just above** the minimum elevation the model draws at,
and they shorten fast as it climbs:

| Sun elevation | What the floor looks like |
|---|---|
| below ~4° | no beams; the sun is too low to model a patch honestly |
| 5–10° | long raking beams reaching well into the room — the best light |
| 25–35° | a short stub of light inside each window |
| near the zenith | almost nothing; a vertical window is a poor aperture for it |

So a plan that looks flat and evenly lit is usually a plan set at the wrong
hour, not a plan with the model switched off. Scrub the time to an hour or so
before sunset and the same house reads completely differently. This is the
single biggest lever on whether a plan looks like a drawing or a photograph, and
it is why the generated showcase picture is taken at 17:20 rather than midday.

The **night scrim** is the other half of it, and it only applies once the sun is
low — so raising it darkens the evening without touching the midday view.

## What the weather does to the sky (Advanced)

With a weather entity set, each condition it can report carries a multiplier:
1 is a clear sky at full strength, and a third of that is heavy overcast. They
are listed in the Sun dialog under Advanced, one row per condition the model
knows, and only a changed one is stored — so the rest keep tracking the shipped
values as those improve.

With no weather entity, none of them apply and the single fallback beside the
entity picker is used for everything.
