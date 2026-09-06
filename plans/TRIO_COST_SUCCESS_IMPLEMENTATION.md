# Trio and Cost-per-Success Implementation Plan

## Objective

Make multi-model execution economically rational rather than mechanically parallel. Chimera should dynamically choose one, two, three, or more workers and optimize for verified success per unit cost and latency.

## 1. First-class strategy contract

Add a strategy interface with:

- required capabilities;
- minimum/maximum worker count;
- role graph;
- budget envelope;
- latency envelope;
- verification requirement;
- escalation policy;
- early-stop policy.

Implement `solo`, `duo`, `trio`, `pipeline`, `parallel`, `debate`, `repair` and `escalate` as strategies using the same execution contract.

## 2. Trio executor

Implement a dedicated Trio graph:

```text
planner -> worker A ----+
                        +-> reviewer -> evidence -> repair/verify
planner -> worker B ----+
```

A and B must have isolated mutation state. The reviewer sees their outputs, patch/diff, relevant context and deterministic verification results.

## 3. Profiles

Ship policy profiles rather than hard-coded models:

- `trio-cheap`: cost-efficient workers, local/free inference where viable;
- `trio-balanced`: stronger planner/implementer/reviewer portfolio;
- `trio-pro`: frontier-capable roles for high-risk work.

Provider/model identity belongs in configuration and runtime selection, never in the strategy implementation.

## 4. Adaptive cardinality

Start with the smallest useful graph. Expand only when complexity, uncertainty, failure or risk justifies it.

Example policy:

```text
simple       -> solo
moderate     -> solo/duo
complex      -> trio
high-risk    -> trio + stronger verification
critical     -> trio + escalation / human approval
```

The policy must be configurable and learned from evaluation data.

## 5. Portfolio selector

For each role calculate an eligibility set from capabilities, context/tool compatibility, availability and policy. Score candidates using:

- expected task-class success;
- verification history;
- current provider health;
- price;
- latency;
- rate-limit headroom;
- context requirements;
- user constraints.

Persist selection telemetry so recommendations can improve over time.

## 6. Cost accounting

Track cost at session, run, strategy, agent, role, model, provider and tool levels.

Add:

- estimated pre-run cost;
- actual cost;
- reserved budget;
- remaining budget;
- cost of retries/escalations;
- cost per verified success.

Never treat a failed cheap run as a successful cheap outcome.

## 7. Early stopping

Terminate redundant workers when evidence is sufficient. Required signals can include tests, typecheck, lint, build, security checks and reviewer disposition.

Early stopping must be deterministic/policy-driven and recorded in the event log.

## 8. Escalation ladder

A suggested policy is:

```text
solo cheap
  -> duo
  -> trio-cheap
  -> trio-balanced
  -> frontier review/repair
  -> larger run only if unresolved
```

Do not escalate solely because two models disagree. Escalate because the required confidence/evidence threshold is unmet.

## 9. Diversity controls

For independent workers, prevent accidental duplication by varying model/provider, role prompt, exploration path or implementation approach. Diversity is useful only when it increases information.

## 10. Verification gate

A model's assertion is not proof. The final strategy gate should combine:

- repository diff validity;
- build/typecheck/lint;
- targeted tests;
- relevant integration tests;
- security checks where applicable;
- reviewer findings;
- unresolved-risk list.

## 11. Evaluation

Build task suites covering:

- bug fixes;
- feature work;
- refactors;
- dependency upgrades;
- tests;
- performance work;
- security-sensitive changes;
- large-repository navigation.

Compare Solo, Duo, Trio Cheap, Trio Balanced, Trio Pro and frontier-only baselines. Record verified success, cost, latency, retries, regressions and cost per successful task.

## 12. UX

Normal UX remains one agent. Advanced inspection can expose:

```text
Strategy: Trio Balanced
Workers: 3
Estimated cost: ...
Actual cost: ...
Verification: 18 tests passed
Escalations: 0
```

Users can explicitly request Trio, but `auto` remains the recommended default.

## Acceptance criteria

- Trio is a real execution graph, not three duplicate prompts;
- workers can use different models/providers;
- workers are isolated where they mutate files;
- reviewer receives actual evidence;
- budget is enforced before model calls;
- early stopping works and is observable;
- escalation is evidence-driven;
- evaluation reports cost-per-success;
- no external project is required.
