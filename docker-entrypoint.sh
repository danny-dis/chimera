#!/bin/bash
# =============================================================================
# Chimera container entrypoint (adapted from coleam00/Archon, MIT)
# - Ensures the config directory exists (bind mounts don't inherit it).
# - exec's the daemon so it is PID 1 and receives SIGTERM for clean shutdown.
# =============================================================================
set -e

# The daemon loads .chimera/config.yaml relative to its cwd (/home/chimera).
mkdir -p /home/chimera/.chimera

# Propagate CHIMERA_HOME if the user set it (defaults to cwd otherwise).
if [ -n "${CHIMERA_HOME:-}" ]; then
  mkdir -p "$CHIMERA_HOME/.chimera"
fi

# Pass through any extra args; default CMD launches the daemon.
exec "$@"
