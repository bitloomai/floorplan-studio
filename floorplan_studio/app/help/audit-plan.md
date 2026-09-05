---
id: audit-plan
title: Checking the plan is a building
summary: A separate audit that looks for the mistakes which still render perfectly.
category: reference
tags: audit, validate, geometry, mistakes, tools
applies: concept:audit, panel:project
see: walls-openings, item-aim, data-import-export
order: 75
---

Two different checks exist, and they answer different questions.

**Validation** asks *is this document sound* — does every room have a shape, does
every item name a type that exists. It gates every write and it has to be fast
and certain.

**The audit** asks *is this a building*. A sofa half inside a wall, a wardrobe
across a door, two rooms claiming the same floor, a window drawn clear of the
house, a camera aimed into the brickwork — every one of those is a perfectly
valid document that draws a wrong picture.

```
node tools/audit-plan.js                     your project
node tools/audit-plan.js path/to.project.json
```

## It reports and never edits

Almost every finding is a judgement call about a real house that only the person
living in it can make. A bed overlapping a rug is furniture on a rug; a bed
overlapping a wardrobe is a mistake. The audit cannot tell, so it says what it
sees and stops.

## What it is careful about

An audit that cries wolf is worse than none, so several rules exist purely to
keep the noise down:

- Only openings you **walk through** can be blocked — a counter under a kitchen
  window is a sink.
- Stairs and lifts are architecture; a staircase inside its own stairwell
  necessarily covers the way in.
- Containment is judged by geometry rather than by a list of names, so a basin
  fitted into a counter is not a collision and neither is anything else fitted
  into anything else.
- A device standing free in the middle of a room may point anywhere. Only ones
  mounted on a wall are judged on their facing.
- Aiming **out** of the building is a warning for a camera and an error for
  everything else, because every house has a camera watching the street.
