---
id: agent-mcp
title: Letting an AI draw your plan
summary: What the built-in MCP server is, how to connect an assistant to it, and what it can and cannot touch.
category: agent
tags: mcp, ai, agent, assistant, claude, automation, token, port, security
applies: concept:mcp, concept:agent
see: agent-review, start-here, data-import-export, dashboard-install
order: 10
---

Drawing a house by hand is a lot of dragging. This app ships a
[Model Context Protocol](https://modelcontextprotocol.io) server, so you can
describe your home to an AI assistant and watch it place the rooms, walls,
doors, lamps and furniture for you — **on the same project you have open**,
with your canvas updating live as it works.

There is no separate copy and no "apply" step. If the editor is open while an
assistant is working, you see each change appear. If you are in the middle of
an edit of your own, the editor tells you there is an update waiting rather
than overwriting what you are doing.

## Connecting an assistant

The server speaks Streamable HTTP, which every current MCP client understands.
Point it at the app's own port — `8099` by default — at the path `/mcp`, with a
Home Assistant **long-lived access token** as a bearer header. With Claude Code
that is one command:

```
claude mcp add --transport http floorplan-studio \
  http://homeassistant.local:8099/mcp \
  --header "Authorization: Bearer <your long-lived access token>"
```

Make the token in Home Assistant, not here: **your profile → Security →
Long-lived access tokens**. This app never creates or stores one. It checks the
token by asking Home Assistant whether it is still valid, so revoking it there
revokes access here in the same moment.

MCP is served on the app's own published port rather than through Ingress,
because Ingress authenticates with a browser-session cookie that only the Home
Assistant frontend can mint and a generic MCP client has no way to produce.
Everything else the app serves still goes through Ingress exactly as before.

**It explains itself.** On connect the server hands the assistant a short
briefing, and the full working guide is available to it four ways — as
instructions, a resource, a prompt and a tool. You should not have to teach
your assistant how to use this app.

## What it can do

Read and write **its own project and shared registries**: floors, rooms, walls
and railings, doors and windows, every placeable type, floor finishes, colour
schemes, room control surfaces, the daylight model, and your review notes. It
can also **read** your Home Assistant entity list, so it can bind what it places
to real devices — see below.

It works on the plan the way you do — by picking things out and changing them,
not by rewriting the file. Every room, item, opening and wall has a stable id,
so an assistant can change one lamp's colour temperature without touching, or
even reading, the rest of the house. On a large plan that is the difference
between a quick answer and a slow one.

## How it binds things to your devices

A marker with no entity still draws — it just cannot report anything — so an
assistant can lay out a floor before anything is bound.

To bind, it asks for your entity list — the identifiers Home Assistant
dashboards bind to, not the physical-device registry. Every type in the library declares which
Home Assistant domains it can bind to, so placing a fan narrows the question to
your `fan.*` entities, and it can filter those by name, by device class, by what
is currently unavailable, or by **what is not already on the plan** — which is
how it works through a house without binding the same lamp twice. Results are
bounded to 500 at a time and can be paged, so a large entity catalogue can still
be read in full.

The list it gets is the same one the editor's own entity picker shows, and it is
privacy-filtered the same way. Entity ids, friendly names and current states are
visible to the authorized assistant; `person`, `device_tracker` and `zone` are
dropped wholesale, and only a short allowlist of attributes ever leaves the
app. Coordinates and location-tracking entities are excluded.

Two things worth knowing. Matching your entity names is a *guess* about your
house — `light.ceiling_2` may or may not be the one over the island — so a good
assistant asks when more than one would fit, and it is worth skimming what it
bound. And before installing a dashboard it can check every binding at once:
anything pointing at an entity you do not have is reported, which is the moment
to catch a typo rather than after it appears as a dead tile on a wall tablet.

If the app has no Home Assistant credentials, the entity list comes back empty
and says so, rather than failing. Give it the ids yourself, or leave things
unbound and come back to them.

## What it cannot do

**It cannot call a Home Assistant service.** It cannot switch on a light, run a
script, or create an entity, a scene or a helper. A shortcut it adds only ever
*references* something you already have. If something needs turning on to test
it, it has to ask you.

The one tool that writes to Home Assistant is dashboard installation, and it is
**not even offered** to an assistant unless you turn on the app option
`mcp_allow_dashboard_install`. Off by default: an AI can draw freely from the
moment it connects and still cannot touch a live dashboard until you say so.

## Turning it off, and reaching it from outside

`mcp_enabled` (on by default) is the whole switch. Off, and `/mcp` answers 404
on every port as though the server were not there.

The published port is plain HTTP, which is fine for a client on your own
network. If you forward it through your router, set the `ssl_cert` and
`ssl_key` options to a certificate and key already in Home Assistant's shared
`/ssl` folder, and the app *also* serves MCP over HTTPS on `mcp_ssl_port`
(`8443` by default) — a dedicated port that serves nothing else. The plain port
keeps working; this only adds an encrypted way in, so your token is not sent in
the clear once it leaves the house.

## Getting a good result

Tell it the things it cannot see. It knows the geometry; it does not know that
the balcony has a wrought-iron grill rather than glass, that the stair lights
come on one step at a time, or which way your house faces. It is written to ask
rather than guess about those, and an answer costs you one sentence and saves a
plan that is confidently wrong.

**Walls are screen directions, not compass directions.** `n`/`e`/`s`/`w` mean
top/right/bottom/left of the drawing. If you say "the south window" and your
house is drawn with north to the left, say so — or set the compass, which is
the one place the plan records which way it is pointing.

And when something comes out wrong, you do not have to describe where it is:
pin a note on it. That is what review notes are for — see below.
