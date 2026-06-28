# Harness Determinism Improvement Plan

## Goal

Make the Chimera harness 90% deterministic (model-agnostic) and 10% model-dependent by:
1. Making workflow execution deterministic regardless of model choice
2. Adding schema-enforced structured output at every step
3. Making quality gates deterministic (no LLM judge for duo/trio)
4. Adding defense layers that compensate for model capability gaps

## Current State Analysis (from codebase)

### Non-deterministic Elements (Model-dependent)

| Component | File:line | Issue |
|---|---|---|
| FusionExecutor | `fusion-executor.ts:63` | Unguarded `JSON.parse` - throws on malformed judge output |
| ResponseSynthesizer | `response-synthesizer.ts:39-63` | Jaccard + sentiment analysis is deterministic, but lacks validation |
| AgentMesh.executeQualityGate | `agent-mesh.ts:71-83` | **STUB** - returns empty result without calling any LLM |
| Loop node reasks | `dag-executor.ts:1200-1300` | Model-dependent reask prompt, no schema re-validation |
| Provider resolution | Mixed patterns | No unified factory - some code passes providers directly |
| Cost tracking | Missing in 4/5 consensus systems | Only fusion has cost guards |
| Event emission | `types/events.ts` | Fusion emits `fusion_provider_error` which doesn't exist in schema |

### Deterministic Elements (Already working)

| Component | File:line | Why it works |
|---|---|---|
| DAG execution | `dag-executor.ts` | Pure function with topological ordering |
| Cycle detection | `loader.ts:139-187` | Kahn's algorithm - deterministic |
| Node scheduling | `dag-executor.ts` | Topological layer parallelization |
| Tool output formatting | `tool-formatter.ts` | Schema-based, not model-based |
| Variable substitution | `variable-substitution.ts` | String replacement, deterministic |

## Research Findings (from blueprint and comparisons)

1. **Research #1**: Diverse model teams outperform homogeneous by 9-11% (RECONCILE, ACL 2024)
2. **Research #2**: Voting > debate for reasoning tasks (Debate-or-Vote, 2025)
3. **Research #3**: Execution-grounded verification = +28 pts on SWE-bench (AgentForge)
4. **Research #4**: Role-specific model allocation = 72.4% on SWE-bench 500 (Agyn)

The blueprint states (line 72-73): *"The moat is orchestration methodology, not model capability — as models commoditize, the winner orchestrates them best."*

## Proposed Improvements

### Phase 1: Deterministic Foundation Layer

**Task 1.1: Add Structured Output Validation Everywhere**
- Every node with `output_format` gets schema validation
- On validation failure: reask up to N times (configurable)
- On exhaustion: return `degraded: true` with error details
- **File**: `packages/workflows/src/dag-executor.ts:2550-2580`

**Task 1.2: Guard All JSON Parsing**
- Wrap `JSON.parse` in try/catch with graceful fallback
- Return structured error instead of throwing
- **File**: `fusion-executor.ts:72`, `result-aggregator.ts:81-90`

**Task 1.3: Add Defensive Usage Access**
- `result.usage?.inputTokens ?? 0` everywhere
- Prevent crashes on missing token data
- **All LLM result handlers**

### Phase 2: Deterministic Synthesis Layer (Replace LLM Judges)

**Task 2.1: Deterministic Duo Synthesis**
- Keep Jaccard + `hasOppositeSentiment` from `ResponseSynthesizer`
- Add conflict categorization: contradiction, overlap, gap, preference
- Add confidence scoring based on agreement weight
- **File**: `packages/workflows/src/schemas/dag-node.ts:360-399`

**Task 2.2: Deterministic Trio Synthesis**
- Implement `AgentMesh.executeQualityGate` properly
- Weight: challenger(0.4) + reviewer(0.6) + writer(0.2) by default
- Configurable via `WorkflowConfig.roleAuthority`
- **File**: `agent-mesh.ts:71-83` becomes real implementation

**Task 2.3: 5-Field Analysis Structure**
```typescript
interface DeterministicAnalysis {
  consensus: string[];      // Points both models agree on
  conflicts: Conflict[];    // Categorized disagreements
  uniqueInsights: string[]; // What only one model said
  blindSpots: string[];     // What no model addressed
  finalResponse: string;    // Synthesized output
}
```

### Phase 3: Provider Factory Layer

**Task 3.1: Unified Provider Resolution**
```typescript
// NEW: packages/workflows/src/provider-factory.ts
interface ProviderFactory {
  (modelId: string): LLMProvider | undefined;
}

interface ModelCapabilities {
  json: boolean;      // Supports JSON schema output
  tools: boolean;     // Supports tool calling
  streaming: boolean; // Supports streaming
  reasoning: boolean; // Supports reasoning tokens
  sessionResume: boolean; // Can resume sessions
}
```

**Task 3.2: Capability-Based Routing**
- If model lacks JSON support → use prompt augmentation + validation
- If model lacks tools → use reask on function call failure
- Map `provider.model` strings through registry at load time

### Phase 4: Defense Layer for "Cheap" Models

**Task 4.1: Confidence Calibration**
- Small models get lower base confidence (0.3-0.5)
- Validation passes increase confidence (+0.1 per check)
- Multi-model agreement multiplies confidence (x1.2)
- **Formula**: `final = base * (1 + validations) * agreement_boost`

**Task 4.2: Iterative Refinement Protocol**
- Every output gets: type-check → lint → test feedback loop
- Small model can self-correct through tool use
- Loop continues until no actionable feedback or max iterations

**Task 4.3: Evidence Requirements**
- Model must cite file:line for technical claims
- Tool outputs stored as artifacts, not just echoed
- Reviewer can re-run tools to verify

### Phase 5: Event Schema Alignment

**Task 5.1: Add Missing Event Types**
```typescript
// packages/workflows/src/schemas/events.ts additions
fusion_provider_error: { provider, error, modelId }
fusion_judge_error: { error, judgeOutput }
fusion_recursion_blocked: { depth, maxDepth }
fusion_config_invalid: { field, value, expected }
```

**Task 5.2: Safe Event Emission**
- Wrap all `eventStream.append` in try/catch
- Log but don't throw on unknown event types
- **Pattern**: `safeEmit(event, data)` function

### Phase 6: Handover Protocol (Agent Relay Racing)

**Task 6.1: Compact Handoff Documents**
Already designed in `chimera-agent-blueprint.md:639-701`:
- Key-value format (80-90% fewer tokens)
- File paths + line ranges instead of inline content
- Structured decisions with confidence scores

**Task 6.2: Handoff Validation**
- AgentAsk protocol prevents 75% of cascading errors
- Checklist: dataComplete, referencesGrounded, claimsVerified, capabilityMatch
- Fresh agent spawns with handoff at context START (primacy bias)

## Mix-and-Match Patterns for Deterministic Execution

### Pattern A: Validation-Driven Small Model
```yaml
nodes:
  - id: draft
    model: small-model
    output_format: { type: "object", properties: { code: { type: "string" } } }
    # Structured output enforced by harness, not model
  - id: verify
    model: medium-model
    depends_on: [draft]
    # Deterministic synthesis with confidence scoring
```

### Pattern B: Multi-Model Voting
```yaml
nodes:
  - id: explore-claude
    provider: claude
    output_format: { /* schema */ }
  - id: explore-openai  
    provider: openai
    output_format: { /* schema */ }
  - id: synthesize
    depends_on: [explore-claude, explore-openai]
    # Deterministic: Jaccard similarity + conflict categorization
    # No LLM judge - pure text analysis
```

### Pattern C: Loop with Fresh Context
```yaml
nodes:
  - id: implement
    loop:
      prompt: |
        Implement ONE task from plan.md.
        Validate: type-check && lint && test
        Report: { changed_files, passed_checks, iteration_complete }
      until: ALL_TASKS_COMPLETE
      max_iterations: 15
      fresh_context: true  # Each iteration gets clean context
    output_format: { /* structured progress */ }
```

## Validation Plan

1. **Unit tests** for each deterministic component
2. **Benchmark matrix** comparing frontier vs cheap models on:
   - Type-check pass rate
   - Lint compliance
   - Test coverage
   - Final task completion rate
3. **A/B testing** in real repos with same tasks
4. **Cost comparison** - target 40-60% savings with equivalent quality

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Deterministic synthesis misses nuance | Confidence scores flag low-agreement outputs |
| Structured output too restrictive | Prompt augmentation for best-effort providers |
| Loop reask tokens > frontier cost | Max iterations hard limit, early exit on degradation |
| Provider factory complexity | Start with existing ModelRegistry, extend minimally |

## Definition of Done

- [ ] FusionExecutor wrapped in deterministic engine
- [ ] ResponseSynthesizer handles all 5 consensus systems
- [ ] AgentMesh.executeQualityGate is fully implemented
- [ ] All JSON.parse guarded with try/catch
- [ ] All event types validated against Zod schema
- [ ] Provider factory resolves models at runtime
- [ ] Benchmark shows equivalent quality frontier vs cheap
- [ ] Cost savings 40-60% in benchmark scenarios

## Anti-Laziness Strategies (Preventing Abbreviated/Skipped Responses)

### Method 1: Explicit Process Templates
Every prompt node includes structured step templates that models cannot skip:

```
## Your Process (MUST complete ALL steps):
1. ANALYZE: Read all referenced files, list them with file:line citations
2. PLAN: Write structured plan with explicit substeps before ANY code changes
3. EXECUTE: Complete steps in order, running validation after each
4. VERIFY: Run type-check && lint && test, report each with status
5. REPORT: Return JSON with { completed_steps: string[], skipped_steps: [], errors: [] }

SKIP NONE - each step is required for task completion.
```

### Method 2: Schema-Broken-Step Detection
- `output_format` schema includes mandatory arrays: `files_read`, `commands_run`, `decisions_made`
- If arrays empty or missing → model skipped work, reask with explicit "You omitted step X"
- Structured output validation catches lazy completions before they propagate

### Method 3: Tool-Usage Mandates
- PreToolUse hooks fire on every tool call, building step audit trail
- PostToolUse hooks force immediate validation: model must process tool output
- "Cannot claim task complete without running tool verification"

### Method 4: Multi-Model Redundancy
- Lazy model output → detect empty/abbreviated fields
- Parallel verification model re-does work independently
- Jaccard similarity flags when outputs differ significantly
- Conflicts: { type: "abbreviated_response", original_output, expected_fields }

### Method 5: Fresh Context Reset Strategy
- `fresh_context: true` in loops prevents:
  - Context exhaustion shortcuts ("I'm running out of context, ending early")
  - Cumulative laziness ("Previous iterations were lazy so I will be too")
  - Primacy bias ("First response was incomplete, subsequent ignore it")
- Each iteration sees clean context + explicit process prompt

### Method 6: Evidence Requirements Enforcement
- Every technical claim must cite: `file:line` or command output
- "No speculation without evidence" - model cannot skip tool use
- Handoff validation checks: dataComplete, referencesGrounded, claimsVerified

### Method 7: Iterative Refinement with Explicit Feedback
```
Iteration N: Type-check FAIL → inject error into next prompt
Iteration N+1: Model sees "ERROR: Your code failed type-check. Fix specific line X."
Iteration N+2: Lint FAIL → specific warning fed back
Iteration N+3: Test PASS → accept and continue
```
Laziness corrected through targeted reasks, not vague "try again".