---
id: input-devices
title: Mouse, trackpad and touch
summary: How to move around the plan on each kind of device, and where a tablet with no keyboard finds the shortcuts.
category: plan
tags: touch, tablet, trackpad, mouse, keyboard, pinch, zoom, pan, gestures, shortcuts, ipad
applies: canvas, topbar, concept:input, tool:select, tool:pan, dialog:shortcuts, dialog:more, field:ui.quickbar, field:ui.multiSelect
see: canvas-tools, topbar-advanced, start-here
order: 13
---

The editor is meant to be equally usable with a mouse and keyboard, with a
trackpad, and with a finger on a tablet. Those are three genuinely different
machines, so a few things deliberately behave differently on each. The table
below is generated from what the editor actually binds, so it cannot promise a
gesture that is not there.

## Zooming, and moving around a zoomed-in plan

Zoom always keeps the point you are pointing at where it is. Scroll-wheel zoom
holds the spot under the pointer, a pinch holds the spot between your fingers,
and the status bar's **−** and **+** hold the middle of the view. Nothing walks
off screen while you are looking at it, which is what makes zooming in twice and
carrying on a reasonable thing to do.

Once the plan is bigger than the window, moving around it is:

- **Mouse** — drag with the middle button, or hold **Space** and drag with the
  left one. The wheel scrolls, and the pane has ordinary scrollbars.
- **Trackpad** — two-finger scroll in any direction. Pinch to zoom.
- **Touch** — one finger dragged across empty floor moves the plan; two fingers
  move and zoom it together, from anywhere, including over a room.

## Why one finger does not drag a room

On a touch screen a plain drag moves the *plan*, not what is under your finger —
unless what is under your finger is already selected. Tap something to pick it
up first, then drag it.

A mouse can hover, so it can see what it is about to grab. A finger cannot, and
a drawn plan is edge-to-edge grabbable things. With "drag whatever you touch" as
the rule, every attempt to look at the other end of the house moved a room a few
inches instead — silently, because your hand is on top of the evidence.

A tap is still a tap until it has travelled about nine pixels, so an unsteady
finger selects rather than nudges.

## Selecting several things without a Shift key

Shift-click adds and removes on a mouse, and a drag across empty floor draws a
selection box. Neither is available to a finger, so the shortcut bar has a
**Multi** button that latches the same behaviour: every tap adds to the
selection, and a drag on empty floor draws the box instead of moving the plan.
Turn it off to go back to one-at-a-time.

## The shortcut bar — **S** in the top bar

Every command in this editor has a key. A tablet has no keys, so the same
commands are buttons: undo and redo, duplicate and delete, turn left and right,
bigger and smaller, nudge in four directions, the five tools, finish an outline,
and Esc.

It is off by default where there is a keyboard, on by default where the pointer
is coarse, and remembered per browser either way. Press **S**, or use the button
in the top bar.

Buttons go dim when they would do nothing — Undo with nothing to undo, Delete
with nothing selected — so the bar always says what is available rather than
leaving you to find out by pressing.

## On a narrow screen

Below about 900 pixels the tool rail and the properties inspector stop being
columns and become drawers, so the plan gets the whole window:

- **☰** opens the tools and the device library. Choosing either closes it.
- **▤** opens the inspector for what is selected. Double-tapping something on
  the plan opens it too.
- **⋯** holds the rest of the top bar — Sun, Light, Logic, Dashboard, Import,
  Export, the shortcut list, the theme, Live states and Advanced. They are the
  same controls, moved rather than duplicated.

Those three buttons only exist at that width, and between them they stand in for
two whole columns and nine buttons: a narrow screen ends up with *less* chrome
around the plan than a wide one, not more.

**Esc** closes whichever of those is open before it starts dropping selections.

## Handles are sized for whatever you last touched

The resize squares and the rotation knob are drawn larger after a touch and
smaller after a mouse, on the same machine, switching as you switch. A tablet
with a keyboard and trackpad case is two devices depending on the minute, and a
media query answered once when the page loaded cannot tell them apart.

If a handle is still fiddly, the arrow, turn and resize buttons do the same job
exactly: a quarter-foot, 15°, or 15% a press.
