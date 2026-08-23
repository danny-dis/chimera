#!/usr/bin/env bash
# Chaos test: Flood argus:events:raw with 1000 events via redis-cli LPUSH.
# Measures throughput (events/second).
set -euo pipefail

CONTAINER="${REDIS_CONTAINER:-redis}"
STREAM_KEY="${ARGUS_STREAM_KEY:-argus:events:raw}"
NUM_EVENTS="${CHAOS_EVENTS:-1000}"
BATCH_SIZE="${BATCH_SIZE:-100}"
LOG_PREFIX="[adapter-flood]"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

echo "$LOG_PREFIX [$(ts)] Starting adapter flood test"
echo "$LOG_PREFIX [$(ts)] Target: $STREAM_KEY, Events: $NUM_EVENTS, Batch: $BATCH_SIZE"

# Check Redis is reachable
if ! docker exec "$CONTAINER" redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo "$LOG_PREFIX [$(ts)] ERROR: Redis not reachable. Aborting."
    exit 1
fi

# Record initial length
INITIAL_LEN=$(docker exec "$CONTAINER" redis-cli LLEN "$STREAM_KEY" 2>/dev/null || echo "0")
echo "$LOG_PREFIX [$(ts)] Initial stream length: $INITIAL_LEN"

# Generate and send events
echo "$LOG_PREFIX [$(ts)] Sending $NUM_EVENTS events..."
START_TS=$(date +%s%N)

SENT=0
while [ "$SENT" -lt "$NUM_EVENTS" ]; do
    REMAINING=$((NUM_EVENTS - SENT))
    if [ "$REMAINING" -gt "$BATCH_SIZE" ]; then
        CURRENT_BATCH=$BATCH_SIZE
    else
        CURRENT_BATCH=$REMAINING
    fi

    # Build LPUSH command with batch payload
    PAYLOAD=""
    for j in $(seq 1 "$CURRENT_BATCH"); do
        EVENT_ID=$(printf '%04d' "$SENT")
        EVENT_BODY="{\"id\":\"chaos-flood-${EVENT_ID}\",\"source\":\"chaos-test\",\"timestamp\":$(date +%s%N),\"payload\":\"chaos-flood-test-event-number-${EVENT_ID}\"}"
        PAYLOAD="$PAYLOAD $EVENT_BODY"
    done

    # Use docker exec to push
    docker exec "$CONTAINER" redis-cli LPUSH "$STREAM_KEY" $PAYLOAD >/dev/null 2>&1

    SENT=$((SENT + CURRENT_BATCH))
    echo "$LOG_PREFIX [$(ts)] Sent $SENT / $NUM_EVENTS events"
done

END_TS=$(date +%s%N)
ELAPSED_NS=$((END_TS - START_TS))
ELAPSED_SECS=$((ELAPSED_NS / 1000000000))
if [ "$ELAPSED_SECS" -eq 0 ]; then
    ELAPSED_SECS=1
fi
THROUGHPUT=$((NUM_EVENTS / ELAPSED_SECS))

# Verify final length
FINAL_LEN=$(docker exec "$CONTAINER" redis-cli LLEN "$STREAM_KEY" 2>/dev/null || echo "0")
EXPECTED_LEN=$((INITIAL_LEN + NUM_EVENTS))

echo "$LOG_PREFIX [$(ts)] Final stream length: $FINAL_LEN"
echo "$LOG_PREFIX [$(ts)] Expected length: $EXPECTED_LEN"

if [ "$FINAL_LEN" -ge "$EXPECTED_LEN" ]; then
    echo "$LOG_PREFIX [$(ts)] SUCCESS: All $NUM_EVENTS events sent in ${ELAPSED_SECS}s"
    echo "$LOG_PREFIX [$(ts)] Throughput: ${THROUGHPUT} events/sec"
    exit 0
else
    echo "$LOG_PREFIX [$(ts)] FAILURE: Stream length mismatch (got $FINAL_LEN, expected >= $EXPECTED_LEN)"
    exit 1
fi