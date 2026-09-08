---
id: opening-coverings
title: Curtains, blinds and shutters
summary: What hangs in an opening, and how much light it takes away when it is closed.
category: walls
tags: covering, curtain, blind, shutter, cover, transmission
applies: section:opening.covering, field:opening.covering, field:opening.curtain
see: walls-openings, concept-daylight
order: 37
---

An opening can carry a **covering** — a curtain, a roller blind, a venetian, a
shutter. Each takes away a share of the light that would otherwise come through.

## Bound or assumed

Bind a cover entity and the plan follows it: a blind that is open passes its
glass's full transmission, and one that is closed passes only what the covering
allows. Its position scales between the two, so a half-drawn blind is genuinely
half.

With no entity bound, the plan uses the fixed factor you set — which is the right
answer for a curtain nobody automates, and better than pretending the window is
bare.

## How coverings look from above

Coverings draw a narrow footprint beside the opening, on the room side of the
wall. Curtains gather at the jambs when open and meet in the middle when shut.
Mesh stays fixed. Slat ticks turn with the position. A roller keeps its thin
footprint and darkens as it closes: its vertical drop is not floor area.
Film and frosted glazing affect transmission without adding a separate outline.

An awning alone projects outside, shown as its canopy footprint. The canvas
reserves its full travel so live movement cannot resize the plan. The covering
registry can set `projectFt` (default 2 feet); an opening's covering can override
it. Bound entities and the manual position slider drive the same drawing in the
editor, exported SVG and dashboard.

## Choosing a factor by eye

Think about what the room looks like at midday with the covering shut. A sheer
that diffuses light rather than blocking it is high; a blackout roller is close to
nothing. A privacy sticker on fixed glass is high — it scatters light, it does not
stop it.
