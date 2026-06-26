# Relay Racing

Swap agents before context degradation. Relay racing ensures each agent operates with a fresh context window, preventing quality loss from context bloat.

## When to Use

Use relay racing when:
- A single task requires more context than one agent can handle
- Agent output quality degrades as context fills up
- You need to hand off work mid-session to a fresh agent
- Long-running sessions approach context window limits

## How It Works

Relay racing models agent work like a relay race: each agent runs a leg, then passes the baton (handoff document) to the next runner. The key insight is that context degradation is predictable — you can measure fill percentage and trigger handoffs before quality drops.

## The 4 Context Tiers

| Tier | Fill Range | Action | Description |
|------|-----------|--------|-------------|
| `healthy` | 0–50% | `continue` | Plenty of room. Work normally. |
| `warning` | 50–65% | `mask` | Start hiding old tool outputs. |
| `critical` | 65–80% | `handoff` | Prepare and execute handoff. |
| `emergency` | 80%+ | `emergency_handoff` | Immediate handoff, minimal prep. |

```typescript
import { RelayRacing } from '@chimera/context';

const relay = new RelayRacing({ defaultContextWindow: 200_000 });

// Register agents with their context window sizes
relay.registerAgent('writer', 200_000);
relay.registerAgent('reviewer', 128_000);

// Track token consumption
relay.trackTokens('writer', 2000);   // system prompt
relay.trackTokens('writer', 12000);  // first tool call results

// Check current tier
const threshold = relay.getThreshold('writer');
console.log(threshold.tier);          // 'healthy'
console.log(threshold.fillPercent);   // 0.07
console.log(threshold.recommendedAction); // 'continue'
```

## Observation Masking (Tier 1)

When an agent reaches 50% context fill, old tool outputs become noise. Masking hides the output body while preserving the tool call signature.

```typescript
// Simulate tool outputs accumulating
for (let i = 0; i < 20; i++) {
  relay.trackTokens('writer', 5000);
}

// At 50%+ fill, masking activates
if (relay.shouldMask('writer')) {
  const messages = [
    { role: 'assistant', content: '<tool_use>read_file("src/index.ts")</tool_use>' },
    { role: 'tool', content: 'export function main() {\n  // 500 lines of code\n}' },
    { role: 'assistant', content: 'I see the main function. Let me check...' },
    { role: 'tool', content: 'export function helper() {\n  // 300 lines\n}' },
  ];

  const masked = relay.maskObservations(messages);
  // Tool outputs truncated to 200 chars + "... [masked]"
  // Tool calls remain fully visible
}
```

**What gets masked:**
- Tool/function outputs longer than 230 characters
- Truncated to first 200 characters + `... [masked]`

**What stays visible:**
- All assistant messages (including tool call signatures)
- Short tool outputs (under 230 characters)
- User messages

## Handoff Trigger and Flow (Tier 2–3)

```typescript
// When context reaches 65%+, trigger handoff
if (relay.shouldHandoff('writer')) {
  const result = relay.triggerHandoff({
    agentId: 'writer',
    events: eventStream,        // full event history
    fromAgent: 'writer',
    toAgent: 'writer-2',
  });

  if (result.isValid) {
    // Send result.serialized to the next agent
    console.log(`Handoff saved ${result.tokensSaved} tokens`);
    console.log(result.handoffDocument.goal);
    console.log(result.handoffDocument.next);
  }
}
```

## The Handoff Document

The handoff document is a compact summary passed between agents:

```typescript
const doc = result.handoffDocument;
// {
//   goal: "Add OAuth2 authentication",
//   status: "in_progress",
//   progress: "Requested: Add OAuth2. Modified: src/auth.ts",
//   decisions: [{ decision: "Use JWT tokens", rationale: "...", source: "writer", confidence: "high" }],
//   next: [{ priority: "HIGH", action: "Implement token refresh" }],
//   context: ["User requested: Add OAuth2 authentication"],
//   filesModified: [{ path: "src/auth.ts", status: "modified", lines: 45 }],
//   filesRead: [{ path: "src/types.ts", lines: "1-50", reason: "Context packing" }],
//   errors: [],
//   meta: { session: "sess-abc", agent: "writer", ts: "2026-05-28T...", contextFill: 0.72 }
// }
```

## Complete Relay Flow

```typescript
import { RelayRacing, HandoffProtocol } from '@chimera/context';

// 1. Setup
const relay = new RelayRacing({ defaultContextWindow: 200_000 });
relay.registerAgent('leg-1', 200_000);
relay.registerAgent('leg-2', 200_000);

// 2. Agent works, context grows
relay.trackTokens('leg-1', 120_000);

// 3. Check tier — at 60%, start masking
const t1 = relay.getThreshold('leg-1');
if (t1.recommendedAction === 'mask') {
  maskedMessages = relay.maskObservations(messages);
}

// 4. At 70%, trigger handoff
relay.trackTokens('leg-1', 20_000);
if (relay.shouldHandoff('leg-1')) {
  const handoff = relay.triggerHandoff({
    agentId: 'leg-1',
    events: allEvents,
    fromAgent: 'leg-1',
    toAgent: 'leg-2',
  });

  // 5. New agent starts fresh with handoff document
  relay.trackTokens('leg-2', 2000); // handoff doc itself
  // Continue work in leg-2's clean context
}
```

## Quick Reference

| Method | Purpose |
|--------|---------|
| `registerAgent(id, maxTokens?)` | Register agent with context window size |
| `trackTokens(id, delta)` | Record token consumption, returns current tier |
| `getThreshold(id)` | Get current tier, fill %, and recommended action |
| `shouldMask(id)` | Returns true if fill >= 50% |
| `shouldHandoff(id)` | Returns true if fill >= 65% |
| `maskObservations(messages)` | Truncate old tool outputs to 200 chars |
| `triggerHandoff(params)` | Create validated handoff document |
| `getAgentFill(id)` | Get current fill ratio (0–1) |
| `unregisterAgent(id)` | Remove agent and its masked observations |
