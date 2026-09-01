# Security policy

Floorplan Studio is an unreleased development project. No version is currently
supported for production use, and the `experimental` Home Assistant stage is
intentional.

## Reporting a vulnerability

Report security issues privately through GitHub's private vulnerability
reporting for the Floorplan Studio repository. If that facility is not yet
enabled, contact the maintainer privately before publishing details; do not open
a public issue containing an exploit, access token, dashboard configuration or
household data.

Include the affected commit or app version, Home Assistant version and
architecture, reproduction steps, and the smallest redacted log needed to show
the problem. Remove tokens, OAuth codes, URLs containing credentials, location
coordinates, person/device-tracker state, and identifying entity ids.

Security reports take priority over everything else in the queue. The wider
support policy — no response-time commitment, latest version only, no support
for repackaged builds — is in [CONTRIBUTING.md](CONTRIBUTING.md#support-policy).
Response targets and a supported-version window will be documented before the
first stable release. Until then, reports are handled on a best-effort basis.

## Hardening that is already in place

- The image is distroless: no shell, no package manager, no third-party npm
  module, nothing to `npm install` at build time.
- `apparmor.txt` names every path the process may touch and grants no
  capabilities. It is **not yet verified against Home Assistant OS audit logs**
  — see `DOCS.md` → "The AppArmor profile".
- The app's Home Assistant state client can only issue GET. The one write
  path is `app/lib/ha-write.js`, and the dashboard card it generates calls
  services in the *viewer's* browser under the viewer's own session, never with
  the app's token.
