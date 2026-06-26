# Context Engineering

The art and science of filling the context window with just the right information — not too much, not too little, not too late.

## When to Use

Use context engineering patterns whenever your agent needs to:
- Process tasks that exceed a single context window
- Pass work between agents without losing critical state
- Manage large codebases within token constraints
- Maintain agent performance across long-running sessions

## Core Concept

Context engineering is not prompt engineering. Prompt engineering asks: "what instructions go in the prompt?" Context engineering asks: "what information should the model see, in what form, at what time?"

The model has a fixed context window. Every token spent on irrelevant history is a token stolen from the task at hand. Context engineering is the discipline of maximizing signal-to-noise within that fixed budget.

## The 4 Core Strategies

### 1. Write (Structured Output)

Produce context as first-class data structures, not free-form prose. Chimera's handoff documents are written context — structured, parseable, validated.

```typescript
import { HandoffProtocol } from '@chimera/context';

const protocol = new HandoffProtocol();

// Written context: structured, machine-readable
const handoff = protocol.createCompactingHandoff(events, {
  session: 'sess-abc',
  agent: 'writer-1',
  provider: 'anthropic',
  contextFill: 0.72,
});

// Serialize for transmission
const serialized = protocol.serializeHandoff(handoff);
```

**Chimera implementation:** `HandoffProtocol.createCompactingHandoff()` produces a `HandoffDocument` with goal, status, progress, decisions, next steps, file manifests, and metadata.

### 2. Select (Relevant Subsets)

Choose which information enters the context window. Not everything is relevant to every task.

```typescript
import { ContextEngine } from '@chimera/context';

const engine = new ContextEngine('/path/to/workspace');
await engine.indexRepo();

// Select files relevant to the task, within a token budget
const pack = await engine.buildContextPack({
  task: 'Add OAuth2 authentication to the API',
  maxTokens: 30_000,
  includeFiles: ['src/auth/types.ts'],
  excludePatterns: ['node_modules', '.test.'],
});

// pack.files contains only relevant files, sorted by relevance
console.log(`Packed ${pack.files.length} files, ${pack.totalTokens} tokens`);
```

**Chimera implementation:** `ContextEngine.buildContextPack()` scores files by task keyword matching, symbol relevance, and import centrality, then fills within the token budget.

### 3. Compress (Reduce Token Count)

Shrink context without losing essential information. Observation masking is Chimera's primary compression technique.

```typescript
import { RelayRacing } from '@chimera/context';

const relay = new RelayRacing({ defaultContextWindow: 200_000 });

// Track token usage as the agent works
relay.trackTokens('agent-1', 5000);  // system prompt
relay.trackTokens('agent-1', 15000); // tool results

// At 50% fill, start masking old tool outputs
if (relay.shouldMask('agent-1')) {
  const masked = relay.maskObservations(messages);
  // masked messages have old tool outputs truncated to 200 chars
}
```

**Chimera implementation:** `RelayRacing.maskObservations()` hides old tool outputs while keeping tool calls visible, preserving the agent's understanding of what was attempted.

### 4. Isolate (Separate Context Spaces)

Give different agents different context windows. Each agent sees only what it needs.

```typescript
import { ContextBudget } from '@chimera/context';

const budget = new ContextBudget({
  totalBudget: 200_000,
  layers: [
    { name: 'system', priority: 1, maxTokens: 2000 },
    { name: 'instructions', priority: 2, maxTokens: 4000 },
    { name: 'tools', priority: 3, maxTokens: 6000 },
    { name: 'retrieval', priority: 4, maxTokens: 30_000 },
    { name: 'history', priority: 5, maxTokens: 80_000 },
  ],
});

// Each layer is isolated with its own budget
budget.updateLayer('retrieval', 25_000);
budget.updateLayer('history', 60_000);

const report = budget.getReport();
// report.layers shows per-layer utilization
```

**Chimera implementation:** `ContextBudget` partitions the context window into priority-weighted layers with independent limits and compression triggers.

## Decision Tree

```
Is context growing too large?
├─ No → Continue normally
└─ Yes → Which strategy?
   ├─ Old tool outputs are noise → Mask (compress)
   ├─ Task requires handoff to another agent → Handoff (write + isolate)
   ├─ Too many files in context → Select (rebuild context pack)
   └─ Different layers competing for space → Budget (isolate)
```

## Anti-Patterns

### 1. Context Dump
Putting entire file contents into context when only a function signature is needed. Use `buildContextPack()` with tight token budgets instead.

### 2. Stale Handoffs
Handing off without capturing the latest state. Always call `createCompactingHandoff()` with the full event stream, not a subset.

### 3. Budget Ignorance
Not tracking which layer is consuming tokens. Use `ContextBudget.getReport()` to monitor utilization per layer.

### 4. Premature Compression
Masking observations before the 50% threshold. Early masking loses information the agent still needs. Check `shouldMask()` first.

### 5. Monolithic Context
Using one context window for everything. Isolate system instructions, tool definitions, retrieval results, and conversation history into separate budget layers.

## Quick Reference

| Strategy | Class | Method | When |
|----------|-------|--------|------|
| Write | `HandoffProtocol` | `createCompactingHandoff()` | Agent-to-agent transfer |
| Select | `ContextEngine` | `buildContextPack()` | File selection for task |
| Compress | `RelayRacing` | `maskObservations()` | >50% context fill |
| Isolate | `ContextBudget` | `autoBalance()` | Multi-layer management |
| Select | `ContextEngine` | `getRepoMap()` | Repository overview |
| Compress | `RelayRacing` | `triggerHandoff()` | >65% context fill |
| Isolate | `ContextBudget` | `suggestCompression()` | Over-utilized layers |
