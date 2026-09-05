---
id: item-aim
title: Which way a device faces
summary: Rotation, field of view and range — and why the coverage wedge is off until you ask for it.
category: library
tags: rotation, facing, cone, camera, pir, ac, coverage
applies: section:item.aim, field:item.rot, field:item.cone, field:item.fov, field:item.range
see: concept-units, panel-item
order: 50
---

Anything directional — a camera, a motion sensor, an air conditioner, a TV, a
speaker — carries a **rotation**, and it decides which way the thing points.

Rotation is in **screen degrees**: `0` points up the page, and the number
increases clockwise. Like wall letters, this is the drawing's frame, not your
compass.

## The wedge is opt-in

A device that *can* draw a coverage wedge does not draw one until you tick
**Detection cone**. That is deliberate: on a real plan with sixteen sensors, the
wedges bury the rooms they are drawn on and the plan stops being readable.

Turning it on is also what makes **field of view** and **range** matter. Until
then they are numbers nothing consumes.

## The mistake to check for

A type that ships a default rotation gives the **same** facing to every item that
never set one. An air conditioner defaulting to 270 is correct in every room
where the unit sits on an east wall and blows into the plaster in every room
where it sits on a west one.

Nothing about that looks wrong. The unit draws, the entity binds, the state
reads — only the air goes into the wall.

> The plan audit (`node tools/audit-plan.js`) checks this by measuring how far
> each cone's centreline gets into its room before leaving it. A camera on an
> outside wall watching the street is doing its job; one buried in brickwork is
> not, and the difference is a measurement rather than an opinion.

## Line fixtures are different

For a tubelight or a cove strip, `rot` is the **axis it runs along**, not a
direction it points. The same field means two different things depending on the
type.
