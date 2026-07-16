import type { LLMProvider, LongTermMemory, Mode, DeliberationMode, OrchestratorResult, SessionOrchestrator } from '@chimera/core';
import { SchedulerManager } from '@chimera/core';
import type { ModelProvider } from '@chimera/providers';
import type { CheckpointStore } from '@chimera/session';
import type { UserSkillModel } from '@chimera/learning';
/**
 * Lightweight handle to the live REPL state. The router constructs one of
 * these per session and hands it to `printHelp` / `runSlashCommand`. We
 * use closures instead of a class so callers don't need to know which
 * fields are mutable — they just call the accessors.
 */
export interface LoopState {
    kind: 'loop' | 'goal';
    task: string;
    maxIterations: number;
    currentIteration: number;
    status: 'running' | 'completed' | 'failed';
    startedAt: number;
}
export interface ReplContext {
    /** Current orchestrator mode (ask/plan/code/...). */
    getMode(): Mode;
    setMode(m: Mode): void;
    /** Current deliberation preset (auto/solo/duo/trio/...). */
    getPreset(): DeliberationMode;
    setPreset(p: DeliberationMode): void;
    /** Session id assigned by the checkpoint store. */
    sessionId: string;
    /** Full history of user inputs in this session. */
    history: string[];
    /** Behavior-derived skill model; drives explanation depth across the REPL. */
    skillModel?: UserSkillModel;
    /** Result from the most recent task; used by /cost and /status. */
    latestReplResult: OrchestratorResult | null;
    setLatestReplResult(r: OrchestratorResult | null): void;
    /** Live orchestrator (lazily initialized on first task). */
    currentOrchestrator: SessionOrchestrator | null;
    setCurrentOrchestrator(o: SessionOrchestrator | null): void;
    /** Current loop/goal state for /status display. */
    getLoopState(): LoopState | null;
    setLoopState(s: LoopState | null): void;
    /** Scheduler for /schedule (add/list/remove). Null if not wired. */
    getScheduler(): SchedulerManager | null;
    /** Long-term memory store used to seed context on each turn. */
    memory: LongTermMemory;
    /** Bridge from `ModelProvider` (chimera/providers) to `LLMProvider`. */
    adaptProvider(p: ModelProvider): LLMProvider;
    /** Returns the env-derived provider list, falling back to a mock. */
    getProviders(): Promise<ModelProvider[]>;
    /** Save/load checkpoints. */
    getSessionStore(): CheckpointStore;
    /** Pretty-print an orchestrator result to the terminal. */
    printResult(r: OrchestratorResult): void;
    /** Build a fresh orchestrator (used by task processing). */
    initOrchestrator(): Promise<SessionOrchestrator>;
}
export type ReplExitSignal = 'continue' | 'exit';
/**
 * Print the slash-command help. Reads the user-visible command table
 * below and prepends any custom commands from
 * `.chimera/commands/*.md` / `~/.chimera/commands/*.md`.
 */
export declare function printHelp(_ctx: ReplContext): Promise<void>;
/**
 * Dispatch a single slash command. The router calls this from inside its
 * `rl.on('line')` handler; returning `'exit'` tells the caller to
 * close the readline interface.
 */
export declare function runSlashCommand(cmd: string, args: string[], ctx: ReplContext): Promise<ReplExitSignal>;
//# sourceMappingURL=registry.d.ts.map