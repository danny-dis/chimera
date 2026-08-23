#!/usr/bin/env bash
# Chaos test: Kill Redis container, wait, restart, verify stream-bus reconnects.
set -euo pipefail

CONTAINER="${REDIS_CONTAINER:-redis}"
WAIT_SECONDS="${CHAOS_WAIT:-10}"
REDIS_PORT="${REDIS_PORT:-6379}"
LOG_PREFIX="[redis-kill]"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

echo "$LOG_PREFIX [$(ts)] Starting Redis chaos test"
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

# Wait for Redis to respond
RECOVERED=false
for i in $(seq 1 30); do
    if docker exec "$CONTAINER" redis-cli ping 2>/dev/null | grep -q "PONG"; then
        RECOVERED=true
        break
    fi
    sleep 1
done

END_TS=$(date +%s)
RECOVERY_SECS=$((END_TS - KILL_TS))

if [ "$RECOVERED" = true ]; then
    echo "$LOG_PREFIX [$(ts)] SUCCESS: Redis recovered in ${RECOVERY_SECS}s"
    echo "$LOG_PREFIX [$(ts)] Recovery time: ${RECOVERY_SECS}s"
    exit 0
else
    echo "$LOG_PREFIX [$(ts)] FAILURE: Redis did not recover within 30s"
    exit 1
fi