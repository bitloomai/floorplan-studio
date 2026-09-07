---
id: dashboard-install
title: Generating the dashboard
summary: What gets written to Home Assistant, what never does, and how to preview before you commit.
category: dashboard
tags: dashboard, lovelace, install, preview, card, provenance
applies: panel:dashboard, dialog:dashboard, dialog:house-card, dialog:floor-cards, dialog:appearance, concept:install
see: start-here, room-controls, data-import-export
order: 60
---

Installing builds a Lovelace dashboard from your project: **one tab per floor**,
with the plan in the middle and summary cards either side.

## What is written, and what is not

This app writes **Lovelace configuration only** — the dashboard's views and one
resource file holding the generated card. It never touches your entities, your
automations or anything else in Home Assistant.

Everything it creates carries an ownership stamp, so a later install knows what
it may replace and what somebody else put there.

## Preview first

The preview runs the same bytes the installer would send, against stub states.
It is a real check rather than an approximation — if it looks right there, it
will look right on the dashboard.

## The card is self-contained

Your project, the library, the themes and the finishes are baked into one file.
That is why the dashboard keeps working when this editor is not running, and why
a change here needs a re-install to appear there.

Help text is deliberately **not** baked in. A Lovelace card is not a place
anybody reads documentation, and it would be dead weight on every load.

## If a floor is missing

Check it has rooms. A floor with none is skipped rather than shipped as an empty
tab.

## Opening and closing a room's popup

Under **Appearance & behaviour**, and worth knowing about because the defaults
suit a phone rather than every screen.

A room's **name** and the **floor around it** are separate tap targets, and each
can be switched off on its own. Turning the floor off suits a plan you mostly
pan around, where a stray thumb should not open a sheet; turning the name off
suits a wall tablet where the whole room is the button. Leave at least one on,
or nothing opens the popup at all.

A **long press** on a room can turn everything on without going through the
sheet. A long press on a **marker** opens its Home Assistant dialog, opens its
room's popup, or does nothing — the last of which is what a wall-mounted tablet
wants, so a resting hand does not open dialogs.

**Closing it** has four independent ways in: tapping the same room again,
tapping outside it, Escape, and the sheet's own handle — plus a Close button in
the header. Switch off the ones that get in your way, and keep at least one.

These cascade house → floor → room like everything else in the control model,
so one room can behave differently from the rest of the house.

## How a surface arrives and how tight it sits

Each **design** carries its own density and its own entry animation — a bottom
sheet rises, a side rail slides in from its edge, a modal fades, a docked panel
does neither because it never went anywhere. A viewer whose system asks for
reduced motion gets none of it, the same rule the plan's own animations follow.
