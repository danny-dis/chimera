/**
 * Eval runner — bridges EvalHarness to the CLI.
 *
 * Phase 0.5 deliverable: takes a task reference (file path, fixture id, or
 * inline JSON), constructs an EvalHarness, records a synthetic trajectory
 * (or a real orchestrator run when one is wired in), and returns an
 * EvalReport. LLM judge integration will land in Phase 1C alongside
 * sideQuery consumers (see DOCS/port-plan.md).
 */
import type { Mode } from '@chimera/core';
import type { ModelProvider } from '@chimera/providers';
import type { EvalReport, TaskSpec, Trajectory } from '@chimera/eval';
/**
 * Real trajectory recorder — executes a task through the SessionOrchestrator
 * and captures the event stream to build a Trajectory.
 */
export declare class RealTrajectoryRecorder {
    private providers;
    private workspaceRoot;
    constructor(providers: {
        writer: ModelProvider;
        reviewer: ModelProvider;
    }, workspaceRoot: string);
    record(task: TaskSpec, mode: Mode): Promise<Trajectory>;
    private buildTrajectory;
    private eventToStep;
    private calculateTokens;
}
/**
 * Load a TaskSpec from a path, fixture id, or inline JSON.
 *
 * Resolution order:
 *  1. If `taskRef` parses as JSON, treat as inline TaskSpec.
 *  2. If `taskRef` is a path to an existing file, read and parse it (JSON or YAML-ish).
 *  3. Else look in `<fixturesDir>/<taskRef>.json` (or `.yaml`).
 *  4. Else error.
 */
export declare function loadTaskSpec(taskRef: string, fixturesDir: string): TaskSpec;
/**
 * Build a synthetic trajectory for the eval. A future iteration will replay
 * real orchestrator runs; for now we record a deterministic pass-through so
 * the CLI surface is end-to-end testable.
 */
export declare function buildSyntheticTrajectory(task: TaskSpec, mode: Mode): Trajectory;
/**
 * End-to-end: load the spec, build a synthetic trajectory, score via the
 * heuristic `EvalHarness.scoreTask`, and return the aggregated report.
 *
 * LLM-judge integration is deferred to Phase 1C (sideQuery consumers).
 */
export declare function runEval(taskRef: string, options: {
    fixturesDir: string;
    mode: Mode;
    real?: boolean;
    providers?: {
        writer: ModelProvider;
        reviewer: ModelProvider;
    };
    workspaceRoot?: string;
}): Promise<EvalReport>;
/**
 * Render an EvalReport as a Markdown summary for `--format markdown`.
 */
export declare function formatEvalMarkdown(report: EvalReport): string;
//# sourceMappingURL=eval-runner.d.ts.map