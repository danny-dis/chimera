# CHIMERA — Mining Open Research, OR-Agent and HEC Open Research

CHIMERA already has parallel agents, provider pairing, quality gates, isolation and learning. The mining upgrades the learning loop.

## Strategy portfolio

Instead of hard-coding one cheap/frontier flow, retain candidate coordination strategies:
~~~text
cheap → frontier
frontier → challenger
parallel → synthesize
specialist → verifier
parallel debate → judge
incremental relay → verifier
~~~

Each strategy is benchmarked on a stable task suite.

## Adopt from Open Research

Use relevance/context scaffolding: cursor/symbol context, relevant references, recent changes, tests, task history and prior verified lessons.

Then let workers request deeper context instead of receiving everything.

## Adopt from OR-Agent

Use strategy branches, strategy islands for task diversity, candidate lineage, dynamic experiment allocation, stagnation detection and hierarchical reflection.

A strategy that repeatedly fails should be replaced, not endlessly retried.

## Adopt from HEC

Keep session/run events durable and replayable. Model/provider failure must not destroy the task's experiment history.

## Evaluation

Measure quality, correctness, cost, latency, reliability, context efficiency and human intervention.

No single model/provider is permanently privileged. DMR-X should own actual model/provider selection where enabled.

## Implementation target

Extend chimera-learning/eval with StrategyCandidate, BenchmarkScenario, EvaluationVector, StrategyRun and Lesson records. Promote a learned strategy only after independent benchmark and regression checks.