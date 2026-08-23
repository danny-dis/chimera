#!/usr/bin/env bash
# Run all chaos tests sequentially with configurable settle time between each.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTLE_TIME="${SETTLE_TIME:-30}"
LOG_PREFIX="[chaos-runner]"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

echo "$LOG_PREFIX [$(ts)] === Chaos Test Suite Starting ==="
echo "$LOG_PREFIX [$(ts)] Settle time between tests: ${SETTLE_TIME}s"
echo ""

FAILED=0
TOTAL=0
RESULTS=""

run_test() {
    local script="$1"
    local name="$2"
    TOTAL=$((TOTAL + 1))

    echo "$LOG_PREFIX [$(ts)] --- Running: $name ---"
    if "$script"; then
        RESULTS="${RESULTS}  PASS  ${name}\n"
        echo "$LOG_PREFIX [$(ts)] --- PASSED: $name ---"
    else
        RESULTS="${RESULTS}  FAIL  ${name}\n"
        FAILED=$((FAILED + 1))
        echo "$LOG_PREFIX [$(ts)] --- FAILED: $name ---"
    fi

    echo "$LOG_PREFIX [$(ts)] Settling for ${SETTLE_TIME}s before next test..."
    sleep "$SETTLE_TIME"
    echo ""
}

# Run tests
if [ -f "$SCRIPT_DIR/redis-kill.sh" ]; then
    run_test "$SCRIPT_DIR/redis-kill.sh" "redis-kill"
fi

if [ -f "$SCRIPT_DIR/postgres-kill.sh" ]; then
    run_test "$SCRIPT_DIR/postgres-kill.sh" "postgres-kill"
fi

if [ -f "$SCRIPT_DIR/adapter-flood.sh" ]; then
    run_test "$SCRIPT_DIR/adapter-flood.sh" "adapter-flood"
fi

echo "$LOG_PREFIX [$(ts)] === Chaos Test Suite Complete ==="
echo "$LOG_PREFIX [$(ts)] Results:"
echo -e "$RESULTS"
echo "$LOG_PREFIX [$(ts)] Total: $TOTAL, Passed: $((TOTAL - FAILED)), Failed: $FAILED"

if [ "$FAILED" -gt 0 ]; then
    exit 1
else
    exit 0
fi