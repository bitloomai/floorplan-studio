FROM gcr.io/distroless/nodejs24-debian13:latest

ARG BUILD_VERSION=0.10.0
ARG BUILD_ARCH=amd64

LABEL \
    io.hass.version="${BUILD_VERSION}" \
    io.hass.type="app" \
    io.hass.arch="${BUILD_ARCH}" \
    org.opencontainers.image.title="Floorplan Studio" \
    org.opencontainers.image.licenses="Apache-2.0" \
    org.opencontainers.image.source="https://github.com/bitloomai/floorplan-studio"

# Runtime defaults live in the image so the final stage needs no shell, package
# manager, or OS utilities.
ENV FPS_OPTIONS_FILE=/data/options.json \
    FPS_DATA_DIR=/data \
    FPS_FIXTURES_DIR=/fixtures \
    FPS_PORT=8099 \
    NODE_ENV=production

COPY app /app
COPY samples /fixtures

# The MCP working guide. `mcp.js`'s get_guide reads it from one directory above
# /app, so it has to land at the root here to match the layout it has in the
# source tree — otherwise the tool silently degrades to a pointer inside the
# image while working fine in development, which is the worst of both.
COPY SKILL.md /SKILL.md

# Apache-2.0 s4(a) and s4(d): a recipient of this image is a recipient of the
# Work, so the licence and the attribution notice travel inside it. The base
# image's own licence texts (/nodejs/LICENSE, /usr/share/doc/*/copyright,
# /usr/share/common-licenses) are inherited untouched -- there is no RUN step
# and no shell here that could remove them.
COPY LICENSE /LICENSE
COPY NOTICE /NOTICE
COPY THIRD_PARTY_NOTICES.md /THIRD_PARTY_NOTICES.md

WORKDIR /app

# The distroless Node image already has `node` as its entrypoint.
CMD ["/app/server.js"]
