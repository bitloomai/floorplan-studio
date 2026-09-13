# Third-party notices

Floorplan Studio itself is licensed under the Apache License, Version 2.0 — see
`LICENSE` and `NOTICE`.

This file records everything else that travels with a Floorplan Studio
distribution, and what each item obliges the distributor to do. It is
maintained by hand because there is no dependency manifest to generate it from:
there are no dependencies.

Last verified 2026-08-30 against app version 0.10.0.

## 1. Source code: nothing third-party is vendored

`package.json` declares no `dependencies` and no `devDependencies`, and there is
no lockfile and no `node_modules`. Every `require()` in `floorplan_studio/app/`
resolves either to a sibling file in this repository or to a Node.js built-in
module (`fs`, `path`, `http`, `https`). Browser-facing app pages load only
scripts from this repository — no CDN, no external stylesheet, no web font, no
bundled icon set.

Consequences:

- No third-party copyright notice has to be reproduced in the source tree.
- The generated Lovelace card (`floorplan_studio/app/lib/card-build.js`)
  contains only Apache-2.0 code from this repository.

Re-verify with:

```bash
grep -rhoE "require\(['\"][^.'\"][^'\"]*['\"]\)" floorplan_studio/app/ | sort -u
```

Everything it prints must be a Node.js built-in.

## 2. Algorithms implemented from public specifications

`floorplan_studio/app/lib/sun.js` implements the NOAA solar-position algorithm, itself derived
from Jean Meeus, *Astronomical Algorithms*. The code is an original
implementation written for this project; only the published astronomical
constants and equations are shared with other implementations, and those are
facts and mathematics rather than copyrightable expression. NOAA's own reference
implementation is a work of the U.S. federal government and is not subject to
copyright in the United States. No licence obligation attaches, and no code was
copied from SunCalc or any similarly licensed library.

## 3. Home Assistant interfaces

The app talks to Home Assistant through its published REST, WebSocket,
Supervisor and Lovelace custom-card interfaces. Interface names used as data —
`custom:` card types, entity ids, domains, `device_class` values, and the eight
`mdi:` icon *names* in `config.yaml`, `app/lib/dashboard.js` and
`app/public/js/main.js` — are identifiers passed to Home Assistant for it to
resolve. (Those three paths are relative to the app folder,
`floorplan_studio/`.) No Home Assistant source, no Home Assistant frontend
component, and no Material Design Icons asset (font, SVG, or path data) is
copied into this repository. Every glyph the plan draws is original path data in
`app/lib/shapes.js`.

"Home Assistant" is a trademark of the Open Home Foundation. This project is
independent and unaffiliated; the name is used descriptively, which Apache-2.0
§6 permits and does not itself license.

## 4. Container image contents

The published app image is built `FROM gcr.io/distroless/nodejs24-debian13`.
That base contributes a Node.js runtime and a minimal Debian 13 userland. Those
components are redistributed unmodified as part of the image.

Every one of them ships its own licence and copyright text **inside the image**,
in the layers inherited from the base, so the attribution obligations are
already satisfied by distributing the image intact:

| Component | Licence | Where the text lives in the image |
|---|---|---|
| Node.js 24 (with its bundled V8, libuv, OpenSSL, ICU, zlib, brotli, c-ares, llhttp, nghttp2, simdjson) | MIT, plus the bundled-dependency licences enumerated in Node's own combined licence file | `/nodejs/LICENSE` |
| glibc (`libc6`) | LGPL-2.1-or-later, with BSD/ISC/MIT-licensed components | `/usr/share/doc/libc6/copyright` |
| OpenSSL (`libssl3t64`) | Apache-2.0 | `/usr/share/doc/libssl3t64/copyright` |
| `libgcc_s`, `libstdc++`, `libgomp`, `gcc-14-base` | GPL-3.0-or-later **with the GCC Runtime Library Exception** | `/usr/share/doc/gcc-14-base/copyright` and siblings |
| `zlib1g` | Zlib | `/usr/share/doc/zlib1g/copyright` |
| `libzstd1` | BSD-3-Clause / GPL-2.0 dual | `/usr/share/doc/libzstd1/copyright` |
| `ca-certificates` (Mozilla CA bundle) | MPL-2.0 | `/usr/share/doc/ca-certificates/copyright` |
| `tzdata`, `tzdata-legacy` | Public domain | `/usr/share/doc/tzdata/copyright` |
| `base-files`, `netbase`, `media-types` | GPL-2.0 / permissive, per file | `/usr/share/doc/<pkg>/copyright` |
| Full texts of the common Debian licences | — | `/usr/share/common-licenses/` |
| Distroless build tooling (not shipped in the image) | Apache-2.0 | https://github.com/GoogleContainerTools/distroless |

### What this means for the "permissive only" goal

The code Floorplan Studio *writes* is 100% Apache-2.0 with no third-party
source. The base image is not uniformly permissive, and cannot be — every Linux
container has a C library:

- **glibc is LGPL-2.1+.** It is dynamically linked and shipped unmodified.
  LGPL §6 is satisfied by dynamic linking against an unmodified library, and
  Debian's source is publicly available. It places no condition on Floorplan
  Studio's own licence.
- **libgcc/libstdc++/libgomp are GPL-3 but carry the GCC Runtime Library
  Exception**, which exists precisely so that linking them does not impose GPL
  terms on the linking program. No copyleft reaches this project's code.
- **The Mozilla CA bundle is MPL-2.0**, a file-level copyleft. It is shipped
  unmodified, so the only obligation is to keep its notice — which is in the
  image.

None of these reach across into the app's own source or the generated
dashboard card. If a strictly permissive-only image is ever a hard requirement,
the option is a musl-based runtime (Alpine, or a distroless variant built on
musl), not a change to anything in this repository.

### Obligations that fall on this project

1. Do not strip `/nodejs/LICENSE`, `/usr/share/doc/*/copyright`, or
   `/usr/share/common-licenses/` from the image. Nothing in the `Dockerfile`
   removes files, so this holds by construction — there is no `RUN` step and no
   shell in the final image to run one with.
2. Keep the base image pinned to a real upstream tag and rebuild it for security
   updates, so recipients get the licence texts matching the binaries.
3. Ship `LICENSE` and `NOTICE` with the image and with every other form of
   distribution. The `Dockerfile` copies them to `/`; they are committed inside
   the app folder, which is what a user installs; and
   `tools/check-repository.js` fails if the app's copies drift from the ones at
   the repository root.

## 5. Obligations on people who redistribute Floorplan Studio

Apache-2.0 §4 applies to anyone shipping this project or a modified version:

- **§4(a)** include a copy of `LICENSE`;
- **§4(b)** mark any files you changed as changed;
- **§4(c)** keep the existing copyright, patent, trademark and attribution
  notices in source form;
- **§4(d)** reproduce the contents of `NOTICE`.

The generated Lovelace card is a distribution of this project's code in object
form. Its banner therefore carries the SPDX identifier and a pointer to the
licence, so a card lifted out of somebody's dashboard still says what it is.
