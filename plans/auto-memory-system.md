# Auto-Memory System & Context Engine Wiring — Implementation Plan

## Dependency Graph

```
MemoryPersistence ──► LongTermMemory (existing)
       │
AutoExtractService ──► LongTermMemory + sideQuery (existing)
       │
AutoDreamService ──► LongTermMemory + sideQuery (existing)
       │
RecallService ──► LongTermMemory (existing)
       │
SessionOrchestrator ──► all of the above (DI constructors)
       │
AutoSkillService (chimera-learning) ──► SessionAnalyzer + SkillSynthesizer (existing)
```

Constraint: chimera-core → chimera-context dependency is EXISTING (SessionOrchestrator already imports RelayRacing/HandoffProtocol from @chimera/context). No new cross-package imports needed for core.

## Implementation Order

### Phase 1 — Wiring Fixes (no new files, surgical edits)

| Step | File | Change |
|------|------|--------|
| 1A | `chimera-core/src/session-orchestrator.ts:473-477` | Make maskObservations unconditional |
| 1B | `chimera-core/src/session-orchestrator.ts:479-506` | Serialize + inject handoff doc |
| 1C | `chimera-core/src/memory/memory-persistence.ts` (NEW) | Compute storagePath, auto-init LTM |
| 1D | `chimera-core/src/session-orchestrator.ts:170-202` | Accept MemoryPersistence via DI |

### Phase 2 — AutoExtractService

| Step | File | Purpose |
|------|------|---------|
| 2A | `chimera-core/src/memory/auto-extract.ts` (NEW) | Turn-level extraction via sideQuery |
| 2B | `chimera-core/src/memory/auto-extract.test.ts` (NEW) | Unit tests |
| 2C | `chimera-core/src/session-orchestrator.ts` | Hook extraction after each task completion |

### Phase 3 — RecallService

| Step | File | Purpose |
|------|------|---------|
| 3A | `chimera-core/src/memory/recall-service.ts` (NEW) | Token scoring, top-5 injection |
| 3B | `chimera-core/src/memory/recall-service.test.ts` (NEW) | Unit tests |
| 3C | `chimera-core/src/session-orchestrator.ts:328-379` | Replace ad-hoc memory retrieval with RecallService |

### Phase 4 — AutoDreamService

| Step | File | Purpose |
|------|------|---------|
| 4A | `chimera-core/src/memory/auto-dream.ts` (NEW) | 4-phase consolidation |
| 4B | `chimera-core/src/memory/auto-dream.test.ts` (NEW) | Unit tests |
| 4C | `chimera-core/src/memory/index.ts` | Re-export new classes |

### Phase 5 — AutoSkillService (chimera-learning)

| Step | File | Purpose |
|------|------|---------|
| 5A | `chimera-learning/src/auto-skill-service.ts` (NEW) | Detect repeated tool patterns |
| 5B | `chimera-learning/src/auto-skill-service.test.ts` (NEW) | Unit tests |
| 5C | `chimera-core/src/session-orchestrator.ts` | Emit events that Learning consumes |

---

## Phase 1 Detail: Wiring Fixes

### 1A. Unconditional maskObservations

Location: `chimera-core/src/session-orchestrator.ts:473-477`

Current code checks `if (threshold.recommendedAction === 'mask')` before calling maskObservations. The method already short-circuits internally when masking is not needed. Change to always call it, and only track the masked observation when the output differs from input.

### 1B. Handoff End-to-End

Location: `chimera-core/src/session-orchestrator.ts:479-506`

After handoff validation, serialize the document and push it as a system message into writerMessages so the next writer iteration receives the compacted context.

### 1C. MemoryPersistence Class

Path: `chimera-core/src/memory/memory-persistence.ts` (~120 LOC)

```typescript
export const MemoryPersistenceConfigSchema = z.object({
  workspaceRoot: z.string(),
  memoryDir: z.string().optional().default('.chimera/memory'),
  decayHalfLifeDays: z.number().positive().optional().default(30),
  maxMemories: z.number().positive().optional().default(10_000),
});
export type MemoryPersistenceConfig = z.infer<typeof MemoryPersistenceConfigSchema>;

export class MemoryPersistence {
  private memory: LongTermMemory;
  private storagePath: string;

  constructor(config: MemoryPersistenceConfig);
  getMemory(): LongTermMemory;
  getStoragePath(): string;
  forget(id: string): boolean;
  forgetByTopic(topic: string): number;
}
```

Computes `storagePath` as `<workspaceRoot>/<memoryDir>/long-term.json`, creates the directory, and initializes LongTermMemory with that path. Delegates forget/forgetByTopic to LTM.

### 1D. DI Integration

Add optional `memoryPersistence` to SessionOrchestrator constructor options. When present, extract `.getMemory()` and pass as the existing `memory` param.

---

## Phase 2 Detail: AutoExtractService

Path: `chimera-core/src/memory/auto-extract.ts` (~280 LOC)

### Schemas

```typescript
export const ExtractionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().optional(),
  maxTokens: z.number().positive().optional().default(512),
  timeoutMs: z.number().positive().optional().default(15_000),
  minImportance: z.number().min(0).max(1).optional().default(0.3),
});

export const ExtractedFactSchema = z.object({
  facts: z.array(z.object({
    content: z.string(),
    type: z.enum(['user', 'feedback', 'project', 'reference']),
    importance: z.number().min(0).max(1),
    tags: z.array(z.string()).default([]),
  })),
});
```

### Class

```typescript
export class AutoExtractService {
  constructor(
    private memory: LongTermMemory,
    private config: ExtractionConfig,
  ) {}

  async extract(input: {
    messages: Array<{ role: string; content: string }>;
    sessionId: string;
    cursor: number;
  }): Promise<number>;

  buildExtractionPrompt(messages: string): string;
}
```

**Flow:**
1. Slice messages from `cursor` onward
2. Format into a prompt asking the LLM to extract facts
3. Call `sideQuery` with `ExtractedFactSchema`
4. For each extracted fact with `importance >= minImportance`, write to LTM via `memory.write()`
5. Return new cursor position

Uses the module-level `sideQuery` function (which delegates to the configured SideQueryChannel). The provider must be set at app startup via `setSideQueryChannel()`. When no provider is available, extraction is a no-op (logs warning, returns unchanged cursor).

---

## Phase 3 Detail: RecallService

Path: `chimera-core/src/memory/recall-service.ts` (~200 LOC)

### Schemas

```typescript
export const RecallConfigSchema = z.object({
  maxMemories: z.number().positive().optional().default(5),
  maxTokens: z.number().positive().optional().default(2000),
  minScore: z.number().min(0).max(1).optional().default(0.15),
  boostAccessedRecently: z.number().min(0).max(2).optional().default(1.2),
  boostHighImportance: z.number().min(0).max(2).optional().default(1.3),
});
```

### Class

```typescript
export class RecallService {
  constructor(
    private memory: LongTermMemory,
    private config: RecallConfig,
  ) {}

  async recall(params: {
    query: string;
    sessionId?: string;
    topicFilter?: string;
  }): Promise<string>;
}
```

**Flow:**
1. Call `memory.retrieve({ text: query, topK: maxMemories * 2 })` to over-fetch
2. Score each result: `finalScore = similarityScore * recencyBoost * importanceBoost`
   - Recency: `boostAccessedRecently` if `lastAccessedAt` within 1h
   - Importance: `boostHighImportance` if `importance > 0.7`
3. Sort by `finalScore`, take top `maxMemories`
4. Filter by `minScore`
5. Build formatted string: `- [topic] content (score: X.XX)`
6. Truncate total output to `maxTokens` estimate (~4 chars/token)

---

## Phase 4 Detail: AutoDreamService

Path: `chimera-core/src/memory/auto-dream.ts` (~290 LOC)

### Schemas

```typescript
export const DreamConfigSchema = z.object({
  enabled: z.boolean().default(true),
  minSessionGap: z.number().positive().optional().default(5),
  minTimeGapMs: z.number().positive().optional().default(86_400_000), // 24h
  lockfilePath: z.string().optional(),
  model: z.string().optional(),
  maxTokens: z.number().positive().optional().default(1024),
  maxMemoriesPerConsolidation: z.number().positive().optional().default(20),
});

export const DreamStateSchema = z.object({
  lastDreamAt: z.number(),
  sessionsSinceLastDream: z.number(),
  totalDreams: z.number(),
});
export type DreamState = z.infer<typeof DreamStateSchema>;
```

### Class

```typescript
export class AutoDreamService {
  private state: DreamState;
  private lockfilePath: string;

  constructor(
    private memory: LongTermMemory,
    private config: DreamConfig,
  ) {}

  async shouldDream(sessionId: string): Promise<boolean>;
  async dream(): Promise<DreamResult>;
  getState(): DreamState;

  private async acquirePidLock(): Promise<boolean>;
  private releasePidLock(): void;
  private async orient(): Promise<MemoryItem[]>;
  private async gather(items: MemoryItem[]): Promise<MemoryItem[]>;
  private async consolidate(items: MemoryItem[]): Promise<void>;
  private async prune(): Promise<number>;
}
```

**4-Phase Consolidation:**

1. **Orient**: Query LTM for recent memories (since last dream), return candidates
2. **Gather**: Filter to `maxMemoriesPerConsolidation`, group by topic similarity
3. **Consolidate**: For each group, call `sideQuery` to generate a summary, then `memory.summarize()` to replace the group with a single high-importance memory
4. **Prune**: Call `memory.decay()` then `memory.prune()` to remove low-importance items

**Gate logic (shouldDream):**
- Return true only if `sessionsSinceLastDream >= minSessionGap` AND time since `lastDreamAt >= minTimeGapMs`
- Called once per session start; increments `sessionsSinceLastDream`

**PID Lockfile (Windows-safe):**
- Write `<PID>` to lockfile at `.chimera/memory/.dream.lock`
- Stale detection: if lockfile mtime > 5 minutes ago, reclaim
- Release: delete lockfile on success, or leave for stale reclaim on failure
- Uses `writeFileSync`/`existsSync`/`unlinkSync` from `fs` (same pattern as side-query.ts)

---

## Phase 5 Detail: AutoSkillService

Path: `chimera-learning/src/auto-skill-service.ts` (~250 LOC)

### Schemas

```typescript
export const AutoSkillConfigSchema = z.object({
  minPatternCount: z.number().positive().optional().default(3),
  minConfidence: z.number().min(0).max(1).optional().default(0.6),
  skillsDir: z.string().optional().default('.chimera/skills'),
});
```

### Class

```typescript
export class AutoSkillService {
  constructor(
    private analyzer: SessionAnalyzer,
    private skillSynth: SkillSynthesizer,
    private config: AutoSkillConfig,
    private workspaceRoot: string,
  ) {}

  async detectAndSynthesize(
    checkpoints: SessionCheckpoint[],
  ): Promise<AutoSkillResult>;

  private findRepeatedPatterns(
    checkpoints: SessionCheckpoint[],
  ): RepeatedSequence[];
}
```

**Flow:**
1. Run `SessionAnalyzer.analyzeBatch(checkpoints)` to get `ClusteredPatterns`
2. Filter clusters where `repeatedSequences.length >= minPatternCount`
3. For each qualifying cluster, call `SkillSynthesizer.synthesizeFromCluster()`
4. Write resulting skill files to `<workspaceRoot>/<skillsDir>/`
5. Return summary of created/updated skills

---

## Updated File: memory/index.ts

Add re-exports for all new classes and schemas:

```typescript
export { MemoryPersistence } from './memory-persistence.js';
export type { MemoryPersistenceConfig } from './memory-persistence.js';
export { AutoExtractService } from './auto-extract.js';
export type { ExtractionConfig } from './auto-extract.js';
export { RecallService } from './recall-service.js';
export type { RecallConfig } from './recall-service.js';
export { AutoDreamService } from './auto-dream.js';
export type { DreamConfig, DreamState } from './auto-dream.js';
```

---

## Updated File: chimera-core/src/index.ts

Add exports for the new memory subsystem:
```typescript
export { MemoryPersistence } from './memory/index.js';
export { AutoExtractService } from './memory/index.js';
export { RecallService } from './memory/index.js';
export { AutoDreamService } from './memory/index.js';
```

---

## SessionOrchestrator Constructor Changes

```typescript
constructor(
  eventStream?: EventStream,
  tools?: { registry: ToolRegistryInterface; executor: ToolExecutorInterface },
  workspaceRoot?: string,
  memory?: LongTermMemory,
  options?: {
    contextEngine?: ContextEngine;
    budgetEnforcer?: BudgetEnforcer;
    rateLimiter?: RateLimiter;
    auditLog?: AuditLog;
    registry?: ModelRegistry;
    memoryPersistence?: MemoryPersistence;    // NEW
    autoExtract?: AutoExtractService;         // NEW
    recallService?: RecallService;            // NEW
    autoDream?: AutoDreamService;             // NEW
  },
)
```

Internal wiring:
```typescript
this.memory = options?.memoryPersistence?.getMemory() ?? memory ?? null;
this.autoExtract = options?.autoExtract ?? null;
this.recallService = options?.recallService ?? null;
this.autoDream = options?.autoDream ?? null;
```

### Integration Points in execute()

1. **Session start** (~line 291): call `autoDream?.shouldDream()` then `autoDream?.dream()`
2. **Context retrieval** (~line 328-379): replace the ad-hoc memory retrieve block with `recallService?.recall({ query: task, sessionId })`
3. **Post-completion** (~line 779-792 and 840-854): call `autoExtract?.extract({ messages, sessionId, cursor })`, persist new cursor
4. **Tool loop** (~line 473): unconditional maskObservations
5. **Handoff block** (~line 479-506): serialize + inject handoff doc

---

## Test Strategy

Each new file gets a co-located `__tests__` Vitest file. All tests use mock providers:

| Test file | Key tests |
|-----------|-----------|
| `auto-extract.test.ts` | Extracts facts from messages, respects cursor, handles sideQuery failure gracefully, respects minImportance |
| `recall-service.test.ts` | Scores and ranks memories, respects maxTokens budget, filters by minScore, boost logic works |
| `auto-dream.test.ts` | Gate logic (time + session count), PID lock acquisition/release, consolidation reduces memory count, prune removes low-importance |
| `auto-skill-service.test.ts` | Detects repeated patterns, synthesizes skills, respects minPatternCount |
| `memory-persistence.test.ts` | Creates storage directory, initializes LTM with path, persistence across instances |

All test files follow the existing pattern in `chimera-core/src/memory/__tests__/long-term-memory.test.ts` (vitest imports, `beforeEach` setup, no real filesystem in unit tests — use `tmpdir` or mock).

---

## LOC Budget Compliance

| File | Estimated LOC | Budget |
|------|---------------|--------|
| `memory-persistence.ts` | ~120 | 300 |
| `auto-extract.ts` | ~280 | 300 |
| `recall-service.ts` | ~200 | 300 |
| `auto-dream.ts` | ~290 | 300 |
| `auto-skill-service.ts` | ~250 | 300 |
| session-orchestrator.ts edits | net +60 | — |
| memory/index.ts additions | net +20 | — |
| **Total new code** | **~960** | — |

All within budget. No file exceeds 300 LOC.
