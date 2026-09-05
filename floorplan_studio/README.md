# Floorplan Studio

Draw your home's floor plan in the browser, bind rooms and devices to Home
Assistant entities, and generate a live Lovelace dashboard from the same
renderer that drew the plan.

> **Development snapshot, version 0.0.1.** This app has not yet been
> installed against a real Home Assistant Supervisor. Its stage is
> `experimental` on purpose. See the repository root for what is and is not
> release-ready.

## What it does

- Multi-floor plans with rectangular and polygonal rooms, doors,
  windows, openings, walls and railings.
- A 258-entry library of devices, fixtures and furniture, each drawn as the
  object it is rather than as a labelled dot.
- Entity binding, with live state drawn on the plan — including templated value
  labels, per-gang wall switches, daylight and artificial-light modelling.
- One-press generation of a Lovelace dashboard, one view per floor.
- An MCP endpoint, so an AI can draw the plan instead of you dragging shapes.

## Installing

The app is reached from the Home Assistant sidebar through Ingress — there is
no separate login and no port to open for the editor itself.

1. Open **Settings → Apps → Install app**, then add this repository from
   **⋮ → Repositories**.
2. Install **Floorplan Studio**.
3. Start it, then open **Floorplan** in the sidebar.

## Configuration

| Option | Default | What it does |
|---|---|---|
| `log_level` | `info` | How much the app writes to its log. |
| `entity_refresh_seconds` | `60` | How long the entity catalogue and state snapshot are cached. |
| `mcp_enabled` | `true` | Serves `/mcp` for AI clients. Off means the path answers 404. |
| `mcp_allow_dashboard_install` | `false` | Lets an MCP client write a dashboard. Off, the tool is not even listed. |
| `ssl_cert`, `ssl_key` | empty | Name a cert/key in Home Assistant's shared `ssl` folder to also serve MCP over HTTPS. |
| `mcp_ssl_port` | `8443` | Port for that HTTPS listener. Only used when both of the above are set. |

Full documentation is in [DOCS.md](DOCS.md), which Home Assistant also shows in
the app's **Documentation** tab.

## What it can and cannot touch

The app's access to Home Assistant state is read-only by construction: one
request function, and it can only issue a GET. The single thing it writes is a
Lovelace dashboard, only when you press **Generate dashboard**, only to the path
you name, and only after backing up whatever was there.

The dashboard it generates is a different matter and is meant to be pressable —
tapping a light on the finished plan turns that light on, in your browser, under
your own Home Assistant session. `DOCS.md` explains where that line falls.

## Licence

Apache-2.0. See [LICENSE](LICENSE), [NOTICE](NOTICE), and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — the last of which records
that this app bundles no third-party source code at all.
