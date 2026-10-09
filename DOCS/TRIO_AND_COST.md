# Trio Mode and Cost-per-Success

## Why Trio exists

Three models are useful only when their work is complementary. Trio is not "ask three models the same question and vote". It is a coordinated execution pattern designed to improve verified coding outcomes while controlling cost and latency.

## Trio contract

The default Trio shape is:

```text
                 Task
                  |
                Planner
                  |
        +---------+---------+
        |                   |
   Worker A             Worker B
 independent            independent
 implementation         alternative
        |                   |
        +---------+---------+
                  |
              Reviewer
                  |
          tests / evidence
                  |
            repair if needed
                  |
               result
```

Roles may be remapped dynamically. The important constraint is **diversity of responsibility**, not three identical calls.

## Trio profiles

### Trio Cheap
- inexpensive/local planner or explorer;
- cost-efficient implementer;
- inexpensive independent reviewer;
- deterministic tests as the primary quality gate.

Use for medium complexity work where additional independent reasoning has good expected value.

### Trio Balanced
- capable planner;
- strong cost/performance implementer;
- stronger reviewer or debugger.

This is the preferred high-quality general-purpose profile when `auto` decides that three workers are justified.

### Trio Pro
- frontier reasoning where planning is genuinely difficult;
- one or more strong implementers;
- strong independent reviewer/adjudicator.

Reserve for high-risk or unusually difficult tasks.

## Adaptive cardinality

Chimera should not force Trio on every task.

```text
low complexity       -> 1 worker
medium               -> 2 workers when useful
high                 -> Trio
critical/high-risk   -> Trio + escalation or larger graph
```

The controller can also start small and expand. For example, begin with a capable cheap worker, inspect evidence, then add a reviewer only when uncertainty remains.

## Cost-per-success objective

The optimization target is:

> minimize expected cost and latency subject to a required probability of producing a correct, verified result.

Useful metrics include:

- verified success rate;
- cost per verified success;
- wall-clock time per verified success;
- retry rate;
- regression rate;
- verification pass rate;
- escalation rate;
- token usage;
- provider failure rate.

A cheap run that fails twice is not cheaper than a slightly more expensive run that succeeds once.

## Strategy selection

The strategy engine should estimate expected utility from:

```text
quality expectation
+ verification strength
+ task risk
+ model reliability
+ provider health
- expected cost
- expected latency
```

Hard constraints always win: budget, permissions, availability, deadlines and required verification.

## Portfolio selection

For each role, choose from eligible models using:

1. required capabilities;
2. current provider health and quota;
3. task complexity/risk;
4. expected quality;
5. historical task-class success;
6. price;
7. latency;
8. context and tool compatibility.

Do not assume the globally strongest model is the best model for every role.

## Diversity

Parallel workers should differ where independence matters. Diversity can be created through:

- different providers/models;
- different role prompts;
- independent repository exploration;
- different implementation strategies;
- separate worktrees.

Do not reward superficial disagreement. Evidence and tests outrank majority vote.

## Early stopping

Trio should stop unnecessary work when the result reaches the configured evidence threshold. Examples:

- implementation passes required tests and independent review finds no material issue;
- one branch is clearly superior and alternatives add no information;
- a deterministic failure makes remaining model calls unnecessary.

Early stopping is one of the main mechanisms for keeping Trio cheaper than blindly running three full agents.

## Escalation

A failed or uncertain cheap strategy should escalate deliberately:

```text
solo cheap
   -> Duo
   -> Trio Cheap
   -> Trio Balanced
   -> frontier review/repair
   -> larger strategy only if justified
```

The exact ladder is policy-driven. Never escalate merely because a model disagreed; escalate because evidence indicates unresolved risk.

## Context and workspaces

Workers receive focused context packs rather than the whole repository. Mutating workers use isolated worktrees. Reviewers receive the patch, relevant context and actual verification results.

## Learning loop

Evaluation data should be aggregated by task class, not just globally. Chimera should learn that, for example, one model may be excellent at TypeScript implementation but poor at security review, while another has the opposite profile.

Learning changes recommendations and routing scores; it must not bypass deterministic safety or verification rules.

## Evaluation matrix

Every strategy should be benchmarked against relevant baselines:

| Strategy | Verified success | Cost | Latency | Cost / success |
|---|---:|---:|---:|---:|
| Solo | measure | measure | measure | measure |
| Duo | measure | measure | measure | measure |
| Trio Cheap | measure | measure | measure | measure |
| Trio Balanced | measure | measure | measure | measure |
| Trio Pro | measure | measure | measure | measure |
| Frontier-only | measure | measure | measure | measure |

These are measurements, not hard-coded claims. The benchmark harness must populate them from real runs.
