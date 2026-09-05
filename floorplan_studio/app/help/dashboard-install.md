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
