# syntax=docker/dockerfile:1.7
# FootieBitz hosted headless worker — verify|render (same immutable image).
# Image class: deployable_worker (locally packaged). See BUILD_INFO.json.
# No credentials in layers. No source assets/artifacts baked in.
# Uses system Chromium + native FFmpeg with puppeteer-core (no browser download).
#
# BUILD CONTEXT: repository root (footiebitz/). Never build with context
# deploy/headless-worker/ — that loses access to dist/headless-worker/.
#
#   npm run build:headless-worker
#   docker build -f deploy/headless-worker/Dockerfile .
#
# Debian package versions come from the distro channel at image-build time —
# they are NOT digest-pinned. Chromium/FFmpeg/ffprobe version + codec presence
# remain runtime preflight authority inside the Node entrypoint.
# Chromium setuid sandbox: Debian's `chromium` Recommends `chromium-sandbox`, which
# is omitted by --no-install-recommends. Install it explicitly so non-root
# Chromium can use /usr/lib/chromium/chrome-sandbox with the secure setuid helper.
# Hosted 4K readiness: NOT YET PROVEN. Fly deployment: DO NOT RUN from this phase.

ARG NODE_MAJOR=24
FROM node:${NODE_MAJOR}-bookworm-slim AS base

# Re-declare after FROM so RUN can enforce the major (EOL overrides fail closed).
ARG NODE_MAJOR=24
RUN test "$NODE_MAJOR" = "24" \
  || (echo "HOSTED_WORKER_REQUIRES_NODE_24" >&2; exit 1)

# tini for PID 1 reaping; chromium + chromium-sandbox + ffmpeg/ffprobe + fonts
# (distro packages — not fully version-pinned; see comment above).
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    chromium \
    chromium-sandbox \
    ffmpeg \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-core \
    ca-certificates \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxshmfence1 \
  && test -e /usr/lib/chromium/chrome-sandbox \
  && test "$(stat -c '%u:%g' /usr/lib/chromium/chrome-sandbox)" = "0:0" \
  && test -x /usr/lib/chromium/chrome-sandbox \
  && test -u /usr/lib/chromium/chrome-sandbox \
  && test "$(dpkg-query -W -f='${Version}' chromium)" = "$(dpkg-query -W -f='${Version}' chromium-sandbox)" \
  && test -x /usr/bin/chromium \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HEADLESS_CHROME_PATH=/usr/bin/chromium \
    HEADLESS_FFMPEG_PATH=/usr/bin/ffmpeg \
    HEADLESS_FFPROBE_PATH=/usr/bin/ffprobe \
    HEADLESS_WORKER_WORKSPACE_ROOT=/tmp/footiebitz-headless-worker \
    HEADLESS_HOSTED_IMAGE_CLASS=deployable_worker \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Paths relative to repository-root build context.
COPY dist/headless-worker/hosted-worker.js /app/hosted-worker.js
COPY dist/headless-worker/page-render.iife.js /app/page-render.iife.js
COPY dist/headless-worker/BUILD_INFO.json /app/BUILD_INFO.json
COPY deploy/headless-worker/docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod 755 /app/docker-entrypoint.sh \
  && useradd --create-home --uid 10001 --shell /usr/sbin/nologin worker \
  && mkdir -p /tmp/footiebitz-headless-worker \
  && chown -R worker:worker /tmp/footiebitz-headless-worker /app \
  && grep -q '"imageClass": "deployable_worker"' /app/BUILD_INFO.json \
  && grep -q '"deployable": true' /app/BUILD_INFO.json \
  && grep -q '"canStartConsumerLoop": true' /app/BUILD_INFO.json \
  && grep -q '"target": "node24"' /app/BUILD_INFO.json \
  && grep -q '"nodeMajor": 24' /app/BUILD_INFO.json

USER worker

# No public service port. deployable_worker means packaging is complete locally —
# not hosted operational acceptance, remote migration readiness, or 4K capacity.

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker-entrypoint.sh"]
# Fly process groups supersede CMD; default is render for local smoke.
CMD ["render"]
