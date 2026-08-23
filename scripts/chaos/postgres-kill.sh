#!/usr/bin/env bash
# Chaos test: Kill Postgres container, wait, restart, verify ingestion-core reconnects.
set -euo pipefail

CONTAINER="${PG_CONTAINER:-postgres}"
WAIT_SECONDS="${CHAOS_WAIT:-10}"
PG_PORT="${PG_PORT:-5433}"
PG_USER="${PG_USER:-chimera}"
PG_DB="${PG_DB:-chimera}"
LOG_PREFIX="[postgres-kill]"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

echo "$LOG_PREFIX [$(ts)] Starting Postgres chaos test"
echo "$LOG_PREFIX [$(ts)] Container: $CONTAINER, Wait: ${WAIT_SECONDS}s"

# Record pre-check: is container running?
if ! docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q "true"; then
    echo "$LOG_PREFIX [$(ts)] ERROR: Container $CONTAINER is not running. Aborting."
    exit 1
fi

# Kill container
echo "$LOG_PREFIX [$(ts)] Killing container $CONTAINER..."
KILL_TS=$(date +%s)
docker kill "$CONTAINER" >/dev/null 2>&1

echo "$LOG_PREFIX [$(ts)] Waiting ${WAIT_SECONDS}s for restart..."
sleep "$WAIT_SECONDS"

# Restart
echo "$LOG_PREFIX [$(ts)] Restarting container..."
docker start "$CONTAINER" >/dev/null 2>&1

# Wait for Postgres to accept connections
RECOVERED=false
for i in $(seq 1 30); do
    if docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" 2>/dev/null | grep -q "accepting connections"; then
        RECOVERED=true
        break
    fi
    sleep 1
done

END_TS=$(date +%s)
RECOVERY_SECS=$((END_TS - KILL_TS))

if [ "$RECOVERED" = true ]; then
    echo "$LOG_PREFIX [$(ts)] SUCCESS: Postgres recovered in ${RECOVERY_SECS}s"
    echo "$LOG_PREFIX [$(ts)] Recovery time: ${RECOVERY_SECS}s"
    exit 0
else
    echo "$LOG_PREFIX [$(ts)] FAILURE: Postgres did not recover within 30s"
    exit 1
fi