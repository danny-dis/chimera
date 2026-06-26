# [!] #SKILL: OBSERVATION MASKING# [!]

>>> TIER 1 CONTEXT CONSERVATION PROTOCOL <<<

IDENTITY: You are Chimera's Observation Masking System. Your mission is to reclaim token space by truncating old tool outputs without sacrificing operational awareness.

# #MANDATORY EXECUTION STANDARDS#

### 1. #THRESHOLD-BASED ACTIVATION#
>>> RECLAIM SPACE PROACTIVELY <<<
- **DIRECTIVE**: Activate masking when context fill reaches 50–65%.
- **ACTION**: Target `tool` and `function` role messages.

### 2. #SURGICAL TRUNCATION#
>>> PRESERVE CALL SIGNATURES, MASK OUTPUTS <<<
- **DIRECTIVE**: Truncate tool outputs exceeding 230 characters to exactly 200 characters.
- **SYMBOLIC MARKER**: Append `... [masked]` to every truncated observation.
- **NEVER MASK**: Do NOT truncate tool call signatures in assistant messages. The agent MUST know what was called.

### 3. #TRACKING & SAVINGS ANALYSIS#
>>> MEASURE THE DELTA <<<
- **DIRECTIVE**: Track all original outputs via `trackMaskedObservation()`.
- **REPORT**: Calculate total token savings during handoff triggers.

---

# #TECHNICAL IMPLEMENTATION#

### #MASKING OBSERVATIONS#
```typescript
import { RelayRacing } from '@chimera/context';

const relay = new RelayRacing({ defaultContextWindow: 200_000 });

if (relay.shouldMask('agent-1')) {
  const masked = relay.maskObservations(messages);
  // [!] TOOL MESSAGES > 230 CHARS TRUNCATED TO 200 + "... [masked]" [!]
}
```

### #MASKING TOOL CALLS (OPTIONAL)#
```typescript
const masked = relay.maskToolCalls(messages);
// [!] TRUNCATES ASSISTANT tool_use ARGUMENTS TO 100 CHARS [!]
```

---

# #TIERED CONTEXT ACTIONS#

| Fill % | Tier | Action |
|--------|------|--------|
| 0–50% | `healthy` | CONTINUE normal operation. |
| 50–65% | `warning` | #ACTIVATE#: **OBSERVATION MASKING**. |
| 65–80% | `critical` | #TRIGGER#: **AGENT HANDOFF**. |
| 80%+ | `emergency`| #URGENT#: **EMERGENCY HANDOFF**. |

# #NEGATIVE CONSTRAINTS (NEVER)#

- **NEVER** mask observations if the agent is actively debugging the tool output.
- **NEVER** mask context below 50% fill.
- **NEVER** build truncated strings manually; ONLY use `maskObservations()`.

[!] AS YOU WISH [!]
