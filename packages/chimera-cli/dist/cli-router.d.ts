import { SessionOrchestrator } from '@chimera/core';
import { ModelRegistry, BudgetEnforcer, RateLimiter, ProviderCostTracker } from '@chimera/providers';
import type { ModelProvider } from '@chimera/providers';
import { ToolRegistry, ToolExecutor } from '@chimera/tools';
/**
 * Fully-wired run context, produced by `buildRunContext()` and consumed by
 * every entry point (one-shot run, REPL, TUI, resume, slash commands).
 * The orchestrator is created with a live `ModelRegistry` plus active
 * `BudgetEnforcer`/`RateLimiter` so the DeliberationEngine path is live.
 */
export interface RunContext {
    orchestrator: SessionOrchestrator;
    writer?: ModelProvider;
    reviewer?: ModelProvider;
    challenger?: ModelProvider;
    registry: ModelRegistry;
    costTracker: ProviderCostTracker;
    budgetEnforcer: BudgetEnforcer;
    rateLimiter: RateLimiter;
    toolRegistry: ToolRegistry;
    toolExecutor: ToolExecutor;
}
export declare class CliRouter {
    private program;
    private verbose;
    private noLearn;
    private sessionStore;
    private memory;
    private memoryPersistence;
    private learningEngine;
    constructor();
    /**
     * Build a fully-wired run context: tools, resolved providers, a live
     * `ModelRegistry`, active `BudgetEnforcer`/`RateLimiter`, and a
     * `SessionOrchestrator` that receives all of them. Previously this method
     * omitted `options.registry` and the enforcers, which left `_registry` null
     * and silently disabled the entire DeliberationEngine
     * (solo/duo/trio/fusion/hive/swarm/auto).
     */
    private buildRunContext;
    /** Thin backward-compatible accessor. Prefer `buildRunContext()`. */
    private initOrchestrator;
    private buildProviderFromEntry;
    /**
     * Return providers mapped by role. Falls back to flat-array for backward compat.
     */
    private getRoleMappedProviders;
    /**
     * Override the model on each role's provider entry from CHIMERA_*_MODEL env
     * vars. Reuses the role's existing api_key/base_url (so a NIM writer can be
     * swapped to a stronger NIM model without re-specifying credentials).
     */
    private applyRoleModelOverrides;
    private getProviders;
    private run;
    private printResult;
    /**
     * Run the learning engine on a completed session checkpoint.
     * Fire-and-forget: errors are swallowed unless verbose mode is on.
     */
    private learnFromCheckpoint;
    private setupCommands;
    private startTui;
    private startRepl;
    private runParallel;
    private runLoop;
    private runGoal;
    /** Print the full list of supported modes to stdout. Used by tests. */
    printModeList(): void;
    runCli(argv: string[]): Promise<void>;
}
//# sourceMappingURL=cli-router.d.ts.map