---
id: data-import-export
title: Projects, backups, import and export
summary: Where your project lives, how it is kept safe, and how to get a plan in or out.
category: data
tags: project, backup, import, export, svg, undo
applies: dialog:import, dialog:export, panel:project, concept:project
see: start-here, dashboard-install
order: 70
---

## Where it lives

One project file, saved automatically as you work. Every save writes atomically
and keeps a **backup**, so a bad edit is recoverable and — more usefully —
checkable: you can compare the current project against the last backup to see
exactly what changed.

## Undo

Undo replaces the whole project with a previous snapshot rather than reversing
individual edits. It is reliable for that reason, and it has one consequence
worth knowing if you script against this app: a reference to a room or an item
held across an undo is stale, and writing through it changes nothing visible.

## Import

You can bring in a plan drawn in the older hand-written format. Import is
tolerant on purpose — a good floor still loads alongside a broken one, and you
are told which was skipped and why. Two floors claiming the same id is an error
rather than a merge, because the alternative is a dashboard with two tabs showing
the same plan.

## Export

Export gives you the project document and an **SVG of each floor**. The SVG is
the same drawing the editor shows, produced by the same renderer, so it is a fair
thing to print or drop into a document.

## What is never in your project file

Help text, documentation and the registries' shipped defaults are all part of the
app rather than part of your house. Your project holds your building and your
entity bindings, and nothing else.
