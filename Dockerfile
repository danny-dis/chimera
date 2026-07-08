# =============================================================================
# Chimera — Docker image (adapted from coleam00/Archon templates, MIT)
# Multi-stage build: deps → build → runtime
#
# Archon uses Bun + a port-3000 HTTP/web service. Chimera is Node 22 + pnpm +
# turbo, and its long-running component (packages/chimera-daemon) is a
# stdio-based JSON-RPC 2.0 server (requests on stdin, responses on stdout) — it
# does NOT open an HTTP port. The container therefore runs the daemon as its
# main process (it stays alive reading stdin). See Caddyfile.example for how to
# front it with Caddy when a stdio→TCP bridge is added.
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies (full, incl. devDeps needed for `turbo build`)
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps

WORKDIR /app

# Enable pnpm (pinned via root package.json "packageManager")
RUN corepack enable

# Copy the whole repo (node_modules/dist are excluded by .dockerignore).
# pnpm resolves the `workspaces` glob (packages/chimera-*) from these files.
COPY . .

# --frozen-lockfile: reproducible install from pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: Build all packages (turbo build → dist/** in each package)
# ---------------------------------------------------------------------------
FROM deps AS build

RUN pnpm build && \
    test -f packages/chimera-daemon/dist/index.js || \
    (echo "ERROR: chimera-daemon build produced no dist/index.js" >&2 && exit 1) && \
    test -f packages/chimera-cli/dist/index.js || \
    (echo "ERROR: chimera-cli build produced no dist/index.js" >&2 && exit 1)

# Drop devDependencies from node_modules (dist is already compiled)
RUN pnpm prune --prod

# ---------------------------------------------------------------------------
# Stage 3: Runtime image
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# OCI Labels
LABEL org.opencontainers.image.source="https://github.com/danny-dis/chimera"
LABEL org.opencontainers.image.description="Terminal-native parallel multi-agent coding platform"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="chimera"

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production

WORKDIR /app

# Enable pnpm (needed if the container ever re-installs; harmless otherwise)
RUN corepack enable && \
    apt-get update && apt-get install -y --no-install-recommends procps && \
    rm -rf /var/lib/apt/lists/*

# Non-root user. The daemon reads .chimera/config.yaml relative to its cwd,
# so we give HOME=/home/chimera and mount the config volume there.
RUN useradd -m -u 1001 -s /bin/bash chimera

# Copy built app + pruned node_modules from the build stage
COPY --from=build /app /app

RUN chown -R chimera:chimera /app

# Minimal entrypoint: ensure config dir exists, then exec the daemon
COPY docker-entrypoint.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

USER chimera
WORKDIR /home/chimera

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "/app/packages/chimera-daemon/dist/index.js"]
