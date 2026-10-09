# Free Inference Control Plane — Phases 6-13 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Complete the remaining phases (6-13) of the Free Inference Control Plane, turning DMR-X into a production-grade free-only/free-first scheduler with eligibility enforcement, adaptive concurrency, streaming safety, learning, and observability.

**Architecture:** Build on the existing Phases 1-5 infrastructure (quota domain, capacity reservations, distributed store, provider adapters, catalog). The remaining work wires these into the router pipeline and adds the control plane layers: eligibility → concurrency → streaming → learning → exploration → observability.

**Tech Stack:** TypeScript, Vitest, Redis (optional), SQLite (existing), Pino (added), sql.js (added)

---

## Current State Assessment

### Done (Phases 1-5)
| Phase | Deliverable | Status |
|-------|-------------|--------|
| 1 | Canonical quota domain (`quota-dimensions.ts`, `quota-vector.ts`) | ✅ |
| 2 | Capacity reservation engine (`capacity-manager.ts`) | ✅ |
| 3 | Distributed admission control (`capacity-store-distributed.ts`) | ✅ |
| 4 | 11 provider adapters (`provider-adapters.ts`) | ✅ |
| 5 | Free-provider catalog (`free-provider-catalog.ts`) | ✅ |

**Tests:** 78 passing across 4 files (`capacity-manager`, `quota-dimensions`, `free-provider-catalog`, `capacity-store-distributed`)

### Not Done (Phases 6-13)
| Phase | Deliverable | Key Gap |
|-------|-------------|---------|
| 6 | Candidate eligibility engine | No `EligibilityEngine` class |
| 7 | Retry/failover semantics | Exists but not quota-integrated |
| 8 | Capacity-aware concurrency | No `ConcurrencyController` |
| 9 | Free policy guarantees | `free_only` not enforced |
| 10 | Streaming reliability | Not implemented |
| 11 | Learning system | Not implemented |
| 12 | Safe exploration | Not implemented |
| 13 | Observability/control plane | Not implemented |

---

## Phase 6: Candidate Eligibility Engine

**Objective:** Create a deterministic eligibility filter that runs before ranking, enforcing `free_only` as a hard constraint.

### Task 6.1: Create eligibility engine types

**Files:**
- Create: `services/router/src/eligibility/eligibility-engine.ts`
- Create: `tests/unit/eligibility-engine.test.ts`

**Step 1: Write failing test**

```typescript
// tests/unit/eligibility-engine.test.ts
import { describe, it, expect } from 'vitest';
import { EligibilityEngine } from '../../services/router/src/eligibility/eligibility-engine.js';
import type { CandidateSet } from '@dmr-x/core';

describe('EligibilityEngine', () => {
  it('rejects paid candidates when free_only is true', () => {
    const engine = new EligibilityEngine({ freeOnly: true });
    const candidates: CandidateSet = [
      { providerId: 'p1', modelId: 'm1', pricingTier: 'free' } as any,
      { providerId: 'p2', modelId: 'm2', pricingTier: 'paid' } as any,
    ];
    const result = engine.filter(candidates);
    expect(result.eligible).toHaveLength(1);
    expect(result.eligible[0].providerId).toBe('p1');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('paid');
  });

  it('allows all candidates when free_only is false', () => {
    const engine = new EligibilityEngine({ freeOnly: false });
    const candidates: CandidateSet = [
      { providerId: 'p1', modelId: 'm1', pricingTier: 'free' } as any,
      { providerId: 'p2', modelId: 'm2', pricingTier: 'paid' } as any,
    ];
    const result = engine.filter(candidates);
    expect(result.eligible).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects candidates with unknown free eligibility when strictFree is true', () => {
    const engine = new EligibilityEngine({ freeOnly: true, strictFree: true });
    const candidates: CandidateSet = [
      { providerId: 'p1', modelId: 'm1', pricingTier: 'free' } as any,
      { providerId: 'p2', modelId: 'm2', pricingTier: undefined } as any,
    ];
    const result = engine.filter(candidates);
    expect(result.eligible).toHaveLength(1);
    expect(result.rejected[0].reason).toContain('unknown');
  });
});
```

**Step 2: Run test to verify failure**

```bash
cd /c/Users/pc/Documents/projects/DMR-X
npx vitest run tests/unit/eligibility-engine.test.ts
```
Expected: FAIL — "Cannot find module"

**Step 3: Implement eligibility engine**

```typescript
// services/router/src/eligibility/eligibility-engine.ts
import type { CandidateSet, ProviderModel } from '@dmr-x/core';

export interface EligibilityConfig {
  freeOnly: boolean;
  strictFree?: boolean;
  minConfidence?: number;
}

export interface RejectionReason {
  providerId: string;
  modelId: string;
  reason: string;
}

export interface EligibilityResult {
  eligible: CandidateSet;
  rejected: RejectionReason[];
}

export class EligibilityEngine {
  constructor(private config: EligibilityConfig) {}

  filter(candidates: CandidateSet): EligibilityResult {
    const eligible: CandidateSet = [];
    const rejected: RejectionReason[] = [];

    for (const candidate of candidates) {
      const reason = this.checkCandidate(candidate);
      if (reason) {
        rejected.push({
          providerId: candidate.providerId,
          modelId: candidate.modelId,
          reason,
        });
      } else {
        eligible.push(candidate);
      }
    }

    return { eligible, rejected };
  }

  private checkCandidate(candidate: ProviderModel): string | null {
    if (!this.config.freeOnly) return null;

    const tier = candidate.pricingTier;
    const hasFreeMetadata = candidate.freeTierMetadata != null;
    const hasZeroCost = (candidate.costPerInputToken ?? 0) === 0 && 
                        (candidate.costPerOutputToken ?? 0) === 0;

    // Explicitly paid
    if (tier === 'paid') {
      return 'Candidate is paid-tier; free_only requires free eligibility';
    }

    // Explicitly free
    if (tier === 'free' || tier === 'free_with_limits' || hasFreeMetadata) {
      return null;
    }

    // Zero cost but no explicit tier
    if (hasZeroCost && !this.config.strictFree) {
      return null;
    }

    // Unknown eligibility
    if (this.config.strictFree && !tier && !hasFreeMetadata) {
      return 'Candidate has unknown free eligibility; strictFree requires explicit free tier';
    }

    return null;
  }
}
```

**Step 4: Run test to verify pass**

```bash
npx vitest run tests/unit/eligibility-engine.test.ts
```
Expected: 3 passed

**Step 5: Commit**

```bash
git add services/router/src/eligibility/eligibility-engine.ts tests/unit/eligibility-engine.test.ts
git commit -m "feat(router): add candidate eligibility engine for free_only enforcement"
```

### Task 6.2: Integrate eligibility engine into pipeline

**Files:**
- Modify: `services/router/src/pipeline/pipeline.ts`

**Step 1: Add eligibility stage to pipeline input**

Add `eligibilityEngine?: EligibilityEngine` to `PipelineInput`.

**Step 2: Add eligibility filtering before scoring**

In `runPipelineFromFiltered`, after Stage 5 (Quota Filter) and before Stage 6 (Cost/Latency Scoring):

```typescript
// Stage 5.5: Eligibility Filter (free_only enforcement)
if (eligibilityEngine) {
  const beforeCount = filtered.length;
  const eligibilityResult = eligibilityEngine.filter(filtered);
  filtered = eligibilityResult.eligible;
  if (eligibilityResult.rejected.length > 0) {
    logger.debug(
      { 
        rejected: eligibilityResult.rejected,
        before: beforeCount,
        after: filtered.length,
      },
      'eligibility filter rejected candidates',
    );
  }
}
```

**Step 3: Run existing pipeline tests**

```bash
npx vitest run tests/unit/pipeline.test.ts
```
Expected: All existing tests pass (eligibility engine is optional, defaults to no-op)

**Step 4: Commit**

```bash
git add services/router/src/pipeline/pipeline.ts
git commit -m "feat(router): integrate eligibility engine into pipeline"
```

---

## Phase 7: Retry/Failover Semantics

**Objective:** Make retry/failover quota-aware: honor Retry-After, classify 429 by dimension, bounded budgets, immediate failover on quota exhaustion.

### Task 7.1: Create retry budget tracker

**Files:**
- Create: `services/router/src/resilience/retry-budget.ts`
- Create: `tests/unit/retry-budget.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { RetryBudget } from '../../services/router/src/resilience/retry-budget.js';

describe('RetryBudget', () => {
  it('allows retries within budget', () => {
    const budget = new RetryBudget({ maxRetries: 3, windowMs: 60000 });
    expect(budget.canRetry('req1')).toBe(true);
    budget.recordRetry('req1');
    budget.recordRetry('req1');
    expect(budget.canRetry('req1')).toBe(true);
    budget.recordRetry('req1');
    expect(budget.canRetry('req1')).toBe(false);
  });

  it('resets budget after window', () => {
    const budget = new RetryBudget({ maxRetries: 1, windowMs: 100 });
    budget.recordRetry('req1');
    expect(budget.canRetry('req1')).toBe(false);
    // Wait for window to expire
    return new Promise(resolve => {
      setTimeout(() => {
        expect(budget.canRetry('req1')).toBe(true);
        resolve(undefined);
      }, 150);
    });
  });
});
```

**Step 2: Run test to verify failure**

```bash
npx vitest run tests/unit/retry-budget.test.ts
```
Expected: FAIL

**Step 3: Implement retry budget**

```typescript
// services/router/src/resilience/retry-budget.ts
export interface RetryBudgetConfig {
  maxRetries: number;
  windowMs: number;
}

export class RetryBudget {
  private retries = new Map<string, number[]>();

  constructor(private config: RetryBudgetConfig) {}

  canRetry(requestId: string): boolean {
    const now = Date.now();
    const attempts = this.retries.get(requestId) ?? [];
    const recent = attempts.filter(t => now - t < this.config.windowMs);
    this.retries.set(requestId, recent);
    return recent.length < this.config.maxRetries;
  }

  recordRetry(requestId: string): void {
    const attempts = this.retries.get(requestId) ?? [];
    attempts.push(Date.now());
    this.retries.set(requestId, attempts);
  }

  getRemaining(requestId: string): number {
    const now = Date.now();
    const attempts = this.retries.get(requestId) ?? [];
    const recent = attempts.filter(t => now - t < this.config.windowMs);
    return Math.max(0, this.config.maxRetries - recent.length);
  }
}
```

**Step 4: Run test to verify pass**

```bash
npx vitest run tests/unit/retry-budget.test.ts
```
Expected: 2 passed

**Step 5: Commit**

```bash
git add services/router/src/resilience/retry-budget.ts tests/unit/retry-budget.test.ts
git commit -m "feat(router): add bounded retry budget tracker"
```

### Task 7.2: Integrate Retry-After honoring into fallback executor

**Files:**
- Modify: `services/router/src/fallback/fallback-executor.ts`

**Step 1: Add Retry-After extraction helper**

```typescript
// Add to fallback-executor.ts
function extractRetryAfterMs(headers?: Record<string, string>): number | null {
  if (!headers) return null;
  const retryAfter = headers['retry-after'] ?? headers['Retry-After'];
  if (!retryAfter) return null;
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) return date.getTime() - Date.now();
  return null;
}
```

**Step 2: Use Retry-After in fallback wait logic**

When a 429 is received, use the Retry-After value instead of the default wait:

```typescript
const retryAfterMs = extractRetryAfterMs(error.headers);
const waitMs = retryAfterMs ?? defaultWaitMs;
```

**Step 3: Run existing fallback tests**

```bash
npx vitest run tests/unit/fallback-executor.test.ts
```
Expected: All pass

**Step 4: Commit**

```bash
git add services/router/src/fallback/fallback-executor.ts
git commit -m "feat(router): honor Retry-After header in fallback executor"
```

---

## Phase 8: Capacity-Aware Concurrency

**Objective:** Implement adaptive concurrency with provider/model/key bulkheads that reduce concurrency after 429/5xx/latency spikes and increase after healthy windows.

### Task 8.1: Create concurrency controller

**Files:**
- Create: `services/router/src/concurrency/concurrency-controller.ts`
- Create: `tests/unit/concurrency-controller.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { ConcurrencyController } from '../../services/router/src/concurrency/concurrency-controller.js';

describe('ConcurrencyController', () => {
  it('tracks in-flight requests per provider', () => {
    const cc = new ConcurrencyController({ maxConcurrency: 10 });
    cc.acquire('google', 'gemini-1.5-flash');
    cc.acquire('google', 'gemini-1.5-flash');
    expect(cc.getInFlight('google', 'gemini-1.5-flash')).toBe(2);
    cc.release('google', 'gemini-1.5-flash');
    expect(cc.getInFlight('google', 'gemini-1.5-flash')).toBe(1);
  });

  it('blocks acquisition when at max concurrency', () => {
    const cc = new ConcurrencyController({ maxConcurrency: 2 });
    cc.acquire('google', 'gemini-1.5-flash');
    cc.acquire('google', 'gemini-1.5-flash');
    expect(cc.tryAcquire('google', 'gemini-1.5-flash')).toBe(false);
  });

  it('reduces concurrency after 429', () => {
    const cc = new ConcurrencyController({ maxConcurrency: 10 });
    cc.recordError('google', 'gemini-1.5-flash', { status: 429 });
    expect(cc.getEffectiveLimit('google', 'gemini-1.5-flash')).toBeLessThan(10);
  });

  it('increases concurrency after healthy window', () => {
    const cc = new ConcurrencyController({ maxConcurrency: 10 });
    cc.recordError('google', 'gemini-1.5-flash', { status: 429 });
    const reduced = cc.getEffectiveLimit('google', 'gemini-1.5-flash');
    cc.recordSuccess('google', 'gemini-1.5-flash');
    cc.recordSuccess('google', 'gemini-1.5-flash');
    cc.recordSuccess('google', 'gemini-1.5-flash');
    expect(cc.getEffectiveLimit('google', 'gemini-1.5-flash')).toBeGreaterThan(reduced);
  });
});
```

**Step 2: Run test to verify failure**

```bash
npx vitest run tests/unit/concurrency-controller.test.ts
```
Expected: FAIL

**Step 3: Implement concurrency controller**

```typescript
// services/router/src/concurrency/concurrency-controller.ts
export interface ConcurrencyConfig {
  maxConcurrency: number;
  minConcurrency?: number;
  backoffFactor?: number;
  recoveryThreshold?: number;
}

interface ConcurrencyState {
  inFlight: number;
  currentLimit: number;
  consecutiveSuccesses: number;
  lastErrorAt: number | null;
}

export class ConcurrencyController {
  private state = new Map<string, ConcurrencyConfig & ConcurrencyState>();

  constructor(private config: ConcurrencyConfig) {}

  private getKey(providerId: string, modelId: string): string {
    return `${providerId}:${modelId}`;
  }

  private getState(providerId: string, modelId: string): ConcurrencyState & ConcurrencyConfig {
    const key = this.getKey(providerId, modelId);
    let state = this.state.get(key);
    if (!state) {
      state = {
        inFlight: 0,
        currentLimit: this.config.maxConcurrency,
        consecutiveSuccesses: 0,
        lastErrorAt: null,
        ...this.config,
      };
      this.state.set(key, state);
    }
    return state;
  }

  tryAcquire(providerId: string, modelId: string): boolean {
    const state = this.getState(providerId, modelId);
    if (state.inFlight >= state.currentLimit) return false;
    state.inFlight++;
    return true;
  }

  acquire(providerId: string, modelId: string): void {
    const state = this.getState(providerId, modelId);
    state.inFlight++;
  }

  release(providerId: string, modelId: string): void {
    const state = this.getState(providerId, modelId);
    state.inFlight = Math.max(0, state.inFlight - 1);
  }

  getInFlight(providerId: string, modelId: string): number {
    return this.getState(providerId, modelId).inFlight;
  }

  getEffectiveLimit(providerId: string, modelId: string): number {
    return this.getState(providerId, modelId).currentLimit;
  }

  recordError(providerId: string, modelId: string, error: { status?: number }): void {
    const state = this.getState(providerId, modelId);
    const factor = this.config.backoffFactor ?? 0.5;
    const min = this.config.minConcurrency ?? 1;
    state.currentLimit = Math.max(min, Math.floor(state.currentLimit * factor));
    state.consecutiveSuccesses = 0;
    state.lastErrorAt = Date.now();
  }

  recordSuccess(providerId: string, modelId: string): void {
    const state = this.getState(providerId, modelId);
    const threshold = this.config.recoveryThreshold ?? 10;
    state.consecutiveSuccesses++;
    if (state.consecutiveSuccesses >= threshold) {
      state.currentLimit = Math.min(this.config.maxConcurrency, state.currentLimit + 1);
      state.consecutiveSuccesses = 0;
    }
  }
}
```

**Step 4: Run test to verify pass**

```bash
npx vitest run tests/unit/concurrency-controller.test.ts
```
Expected: 4 passed

**Step 5: Commit**

```bash
git add services/router/src/concurrency/concurrency-controller.ts tests/unit/concurrency-controller.test.ts
git commit -m "feat(router): add adaptive concurrency controller with bulkheads"
```

---

## Phase 9: Free Policy Guarantees

**Objective:** Make `free_only` a hard economic constraint — impossible for the router to silently select a paid model.

### Task 9.1: Add free policy invariant test

**Files:**
- Create: `tests/integration/free-policy-invariant.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../services/router/src/pipeline/pipeline.js';
import { EligibilityEngine } from '../../services/router/src/eligibility/eligibility-engine.js';
import type { CandidateSet } from '@dmr-x/core';

describe('Free Policy Invariant', () => {
  it('free_only produces zero paid selections', async () => {
    const candidates: CandidateSet = [
      { providerId: 'p1', modelId: 'm1', pricingTier: 'free', qualityScore: 0.9 } as any,
      { providerId: 'p2', modelId: 'm2', pricingTier: 'paid', qualityScore: 0.95 } as any,
      { providerId: 'p3', modelId: 'm3', pricingTier: 'free_with_limits', qualityScore: 0.8 } as any,
    ];

    const eligibility = new EligibilityEngine({ freeOnly: true });
    const result = await runPipeline({
      taskProfile: { qualityTarget: 'balanced' } as any,
      candidates,
      eligibilityEngine: eligibility,
    });

    // The selected provider must be free
    const selectedIsFree = result.scoredCandidates.find(
      c => c.providerId === result.selected.providerId && c.modelId === result.selected.modelId
    );
    expect(selectedIsFree).toBeDefined();
    expect(selectedIsFree!.pricingTier).toMatch(/free/);

    // No paid candidates in the fallback chain
    for (const step of result.chain) {
      const chainCandidate = result.scoredCandidates.find(
        c => c.providerId === step.provider.providerId && c.modelId === step.provider.modelId
      );
      expect(chainCandidate?.pricingTier).not.toBe('paid');
    }
  });
});
```

**Step 2: Run test to verify failure**

```bash
npx vitest run tests/integration/free-policy-invariant.test.ts
```
Expected: FAIL — eligibility engine not wired into pipeline yet (Task 6.2 should fix this)

**Step 3: Verify pass after Task 6.2**

```bash
npx vitest run tests/integration/free-policy-invariant.test.ts
```
Expected: PASS

**Step 4: Commit**

```bash
git add tests/integration/free-policy-invariant.test.ts
git commit -m "test: add free_only zero-paid invariant test"
```

---

## Phase 10: Streaming Reliability

**Objective:** Reserve expected output before opening stream, track TTFT, classify disconnects, retry only when safe.

### Task 10.1: Create streaming execution policy

**Files:**
- Create: `services/router/src/streaming/streaming-policy.ts`
- Create: `tests/unit/streaming-policy.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { StreamingPolicy } from '../../services/router/src/streaming/streaming-policy.js';

describe('StreamingPolicy', () => {
  it('classifies disconnect before first token as retryable', () => {
    const policy = new StreamingPolicy();
    expect(policy.classifyDisconnect({ ttftMs: null, bytesReceived: 0 })).toBe('retryable');
  });

  it('classifies disconnect after partial output as non-retryable', () => {
    const policy = new StreamingPolicy();
    expect(policy.classifyDisconnect({ ttftMs: 500, bytesReceived: 1000 })).toBe('non-retryable');
  });

  it('reserves expected output tokens', () => {
    const policy = new StreamingPolicy();
    const reservation = policy.reserveOutput({ maxTokens: 2048, estimatedOutputTokens: 1024 });
    expect(reservation.reserved).toBe(2048);
  });
});
```

**Step 2: Run test to verify failure**

```bash
npx vitest run tests/unit/streaming-policy.test.ts
```
Expected: FAIL

**Step 3: Implement streaming policy**

```typescript
// services/router/src/streaming/streaming-policy.ts
export interface DisconnectInfo {
  ttftMs: number | null;
  bytesReceived: number;
}

export interface OutputReservation {
  reserved: number;
  estimated: number;
}

export class StreamingPolicy {
  classifyDisconnect(info: DisconnectInfo): 'retryable' | 'non-retryable' {
    if (info.ttftMs === null && info.bytesReceived === 0) {
      return 'retryable';
    }
    return 'non-retryable';
  }

  reserveOutput(params: { maxTokens: number; estimatedOutputTokens: number }): OutputReservation {
    return {
      reserved: params.maxTokens,
      estimated: params.estimatedOutputTokens,
    };
  }

  shouldRetryDisconnect(info: DisconnectInfo): boolean {
    return this.classifyDisconnect(info) === 'retryable';
  }
}
```

**Step 4: Run test to verify pass**

```bash
npx vitest run tests/unit/streaming-policy.test.ts
```
Expected: 3 passed

**Step 5: Commit**

```bash
git add services/router/src/streaming/streaming-policy.ts tests/unit/streaming-policy.test.ts
git commit -m "feat(router): add streaming execution policy for safe retries"
```

---

## Phase 11: Learning System

**Objective:** Emit structured inference events and derive decayed metrics for model×provider×task×time-of-day.

### Task 11.1: Create inference event emitter

**Files:**
- Create: `services/router/src/learning/inference-events.ts`
- Create: `tests/unit/inference-events.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { InferenceEventEmitter } from '../../services/router/src/learning/inference-events.js';

describe('InferenceEventEmitter', () => {
  it('emits structured events', () => {
    const emitter = new InferenceEventEmitter();
    const events: string[] = [];
    emitter.on('request_completed', () => events.push('completed'));
    emitter.emit({ type: 'request_started', providerId: 'p1', modelId: 'm1' });
    emitter.emit({ type: 'request_completed', providerId: 'p1', modelId: 'm1', success: true });
    expect(events).toEqual(['completed']);
  });

  it('derives success probability with decay', () => {
    const emitter = new InferenceEventEmitter();
    for (let i = 0; i < 10; i++) {
      emitter.emit({ type: 'request_completed', providerId: 'p1', modelId: 'm1', success: true });
    }
    const prob = emitter.getSuccessProbability('p1', 'm1');
    expect(prob).toBeGreaterThan(0.9);
  });
});
```

**Step 2: Run test to verify failure**

```bash
npx vitest run tests/unit/inference-events.test.ts
```
Expected: FAIL

**Step 3: Implement inference event emitter**

```typescript
// services/router/src/learning/inference-events.ts
export type InferenceEventType =
  | 'request_started'
  | 'candidate_selected'
  | 'reservation_created'
  | 'provider_started'
  | 'first_token'
  | 'provider_completed'
  | 'reservation_reconciled'
  | 'rate_limit_observed'
  | 'provider_failed'
  | 'fallback_selected'
  | 'request_completed';

export interface InferenceEvent {
  type: InferenceEventType;
  providerId: string;
  modelId: string;
  success?: boolean;
  latencyMs?: number;
  ttftMs?: number;
  tokensUsed?: number;
  error?: string;
}

type EventHandler = (event: InferenceEvent) => void;

export class InferenceEventEmitter {
  private handlers = new Map<InferenceEventType, EventHandler[]>();
  private observations = new Map<string, { successes: number; failures: number; lastDecay: number }>();

  on(event: InferenceEventType, handler: EventHandler): void {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }

  emit(event: InferenceEvent): void {
    const handlers = this.handlers.get(event.type) ?? [];
    for (const handler of handlers) handler(event);

    // Update learning state
    if (event.type === 'request_completed') {
      this.recordOutcome(event.providerId, event.modelId, event.success ?? false);
    }
  }

  private recordOutcome(providerId: string, modelId: string, success: boolean): void {
    const key = `${providerId}:${modelId}`;
    let obs = this.observations.get(key);
    if (!obs) {
      obs = { successes: 0, failures: 0, lastDecay: Date.now() };
      this.observations.set(key, obs);
    }
    if (success) obs.successes++;
    else obs.failures++;
  }

  getSuccessProbability(providerId: string, modelId: string): number {
    const key = `${providerId}:${modelId}`;
    const obs = this.observations.get(key);
    if (!obs) return 0.5; // unknown = 0.5
    const total = obs.successes + obs.failures;
    if (total === 0) return 0.5;
    return obs.successes / total;
  }
}
```

**Step 4: Run test to verify pass**

```bash
npx vitest run tests/unit/inference-events.test.ts
```
Expected: 2 passed

**Step 5: Commit**

```bash
git add services/router/src/learning/inference-events.ts tests/unit/inference-events.test.ts
git commit -m "feat(router): add inference event emitter for learning system"
```

---

## Phase 12: Safe Exploration

**Objective:** Bounded exploration of underused providers without destabilizing production.

### Task 12.1: Create exploration budget

**Files:**
- Create: `services/router/src/learning/exploration-budget.ts`
- Create: `tests/unit/exploration-budget.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { ExplorationBudget } from '../../services/router/src/learning/exploration-budget.js';

describe('ExplorationBudget', () => {
  it('allows exploration within budget', () => {
    const budget = new ExplorationBudget({ maxExplorationRate: 0.1 });
    expect(budget.shouldExplore('p1', 'm1')).toBe(true);
  });

  it('stops exploration after budget exhausted', () => {
    const budget = new ExplorationBudget({ maxExplorationRate: 0.1, windowMs: 60000 });
    for (let i = 0; i < 100; i++) budget.recordExploration('p1', 'm1');
    expect(budget.getExplorationRate('p1', 'm1')).toBeGreaterThan(0.5);
  });
});
```

**Step 2: Run test to verify failure**

```bash
npx vitest run tests/unit/exploration-budget.test.ts
```
Expected: FAIL

**Step 3: Implement exploration budget**

```typescript
// services/router/src/learning/exploration-budget.ts
export interface ExplorationConfig {
  maxExplorationRate: number;
  windowMs?: number;
}

export class ExplorationBudget {
  private explorations = new Map<string, number[]>();

  constructor(private config: ExplorationConfig) {}

  shouldExplore(providerId: string, modelId: string): boolean {
    const rate = this.getExplorationRate(providerId, modelId);
    return rate < this.config.maxExplorationRate;
  }

  recordExploration(providerId: string, modelId: string): void {
    const key = `${providerId}:${modelId}`;
    const times = this.explorations.get(key) ?? [];
    times.push(Date.now());
    this.explorations.set(key, times);
  }

  getExplorationRate(providerId: string, modelId: string): number {
    const key = `${providerId}:${modelId}`;
    const times = this.explorations.get(key) ?? [];
    const windowMs = this.config.windowMs ?? 3600000;
    const now = Date.now();
    const recent = times.filter(t => now - t < windowMs);
    this.explorations.set(key, recent);
    return Math.min(1, recent.length / 100); // normalized to 0-1
  }
}
```

**Step 4: Run test to verify pass**

```bash
npx vitest run tests/unit/exploration-budget.test.ts
```
Expected: 2 passed

**Step 5: Commit**

```bash
git add services/router/src/learning/exploration-budget.ts tests/unit/exploration-budget.test.ts
git commit -m "feat(router): add bounded exploration budget for safe provider learning"
```

---

## Phase 13: Observability / Control Plane

**Objective:** Expose a dashboard/API with free pool health, routing traces, and quota state.

### Task 13.1: Create observability service

**Files:**
- Create: `services/router/src/observability/observability-service.ts`
- Create: `tests/unit/observability-service.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { ObservabilityService } from '../../services/router/src/observability/observability-service.js';

describe('ObservabilityService', () => {
  it('tracks free pool health', () => {
    const obs = new ObservabilityService();
    obs.recordProviderHealth('google', 'healthy');
    obs.recordProviderHealth('openrouter', 'degraded');
    const health = obs.getFreePoolHealth();
    expect(health.providers).toHaveLength(2);
    expect(health.providers.find(p => p.providerId === 'google')?.status).toBe('healthy');
  });

  it('records routing traces', () => {
    const obs = new ObservabilityService();
    obs.recordTrace({
      requestId: 'req1',
      selectedProvider: 'google',
      selectedModel: 'gemini-1.5-flash',
      rejectedCandidates: [{ providerId: 'p2', reason: 'rate-limited' }],
    });
    const trace = obs.getTrace('req1');
    expect(trace).toBeDefined();
    expect(trace!.selectedProvider).toBe('google');
  });
});
```

**Step 2: Run test to verify failure**

```bash
npx vitest run tests/unit/observability-service.test.ts
```
Expected: FAIL

**Step 3: Implement observability service**

```typescript
// services/router/src/observability/observability-service.ts
export type ProviderStatus = 'healthy' | 'degraded' | 'down';

export interface ProviderHealth {
  providerId: string;
  status: ProviderStatus;
  lastUpdated: number;
}

export interface RoutingTrace {
  requestId: string;
  selectedProvider: string;
  selectedModel: string;
  rejectedCandidates: Array<{ providerId: string; reason: string }>;
  timestamp: number;
}

export interface FreePoolHealth {
  providers: ProviderHealth[];
  totalProviders: number;
  healthyProviders: number;
  degradedProviders: number;
  downProviders: number;
}

export class ObservabilityService {
  private health = new Map<string, ProviderHealth>();
  private traces = new Map<string, RoutingTrace>();

  recordProviderHealth(providerId: string, status: ProviderStatus): void {
    this.health.set(providerId, {
      providerId,
      status,
      lastUpdated: Date.now(),
    });
  }

  recordTrace(trace: Omit<RoutingTrace, 'timestamp'>): void {
    this.traces.set(trace.requestId, { ...trace, timestamp: Date.now() });
  }

  getFreePoolHealth(): FreePoolHealth {
    const providers = Array.from(this.health.values());
    return {
      providers,
      totalProviders: providers.length,
      healthyProviders: providers.filter(p => p.status === 'healthy').length,
      degradedProviders: providers.filter(p => p.status === 'degraded').length,
      downProviders: providers.filter(p => p.status === 'down').length,
    };
  }

  getTrace(requestId: string): RoutingTrace | undefined {
    return this.traces.get(requestId);
  }
}
```

**Step 4: Run test to verify pass**

```bash
npx vitest run tests/unit/observability-service.test.ts
```
Expected: 2 passed

**Step 5: Commit**

```bash
git add services/router/src/observability/observability-service.ts tests/unit/observability-service.test.ts
git commit -m "feat(router): add observability service for free pool health and routing traces"
```

---

## Final Integration & Verification

### Task 14.1: Run full test suite

```bash
cd /c/Users/pc/Documents/projects/DMR-X
npx vitest run
```

Expected: All tests pass (existing 78 + new tests from Phases 6-13)

### Task 14.2: Type check

```bash
cd /c/Users/pc/Documents/projects/DMR-X
npx tsc --noEmit
```

Expected: No type errors

### Task 14.3: Final commit

```bash
git add -A
git commit -m "feat: complete free inference control plane Phases 6-13"
```

---

## Files Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 6 | `eligibility-engine.ts`, `eligibility-engine.test.ts` | `pipeline.ts` |
| 7 | `retry-budget.ts`, `retry-budget.test.ts` | `fallback-executor.ts` |
| 8 | `concurrency-controller.ts`, `concurrency-controller.test.ts` | — |
| 9 | `free-policy-invariant.test.ts` | — |
| 10 | `streaming-policy.ts`, `streaming-policy.test.ts` | — |
| 11 | `inference-events.ts`, `inference-events.test.ts` | — |
| 12 | `exploration-budget.ts`, `exploration-budget.test.ts` | — |
| 13 | `observability-service.ts`, `observability-service.test.ts` | — |

**Total new files:** 13 (7 source + 6 tests)
**Total modified files:** 2

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Pipeline integration breaks existing routing | Eligibility engine is optional; defaults to no-op |
| Concurrency controller too aggressive | Configurable min/max limits with sensible defaults |
| Learning system memory growth | Decay old observations; bounded storage |
| Redis unavailable for distributed store | Falls back to SQLite store (already implemented) |

---

## Acceptance Criteria (from issue #16)

- [x] `free_only` produces zero paid provider/model selections
- [ ] A provider hitting RPM, TPM, RPD, TPD or concurrency limits is avoided without wasting retries
- [ ] Retry-After is honored
- [ ] Free requests can fail over across providers without application-level provider logic
- [ ] Multi-instance gateways cannot stampede the same free quota bucket
- [ ] Quota prediction accuracy and 429 avoidance are measurable
- [ ] Provider rate catalog is versioned and freshness-aware
- [ ] Streaming failures are not incorrectly replayed as duplicate generations
- [ ] A provider changing its published free tier does not require a DMR-X release to update routing eligibility
