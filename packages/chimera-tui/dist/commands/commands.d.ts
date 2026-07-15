import type { Mode, DeliberationMode } from '@chimera/core';
import type { CostData, SkillModelView } from '../types.js';
export interface CommandResult {
    /** Lines of output rendered as system messages in the chat. */
    output: string[];
    /** Signal the TUI to switch to a specific overlay or view. */
    viewHint?: 'sessions' | 'diff' | 'agents' | 'events' | null;
    /** Signal the TUI to clear the message list. */
    clearMessages?: boolean;
    /** Signal the TUI to exit. */
    exit?: boolean;
}
export interface SessionSummary {
    id: string;
    mode: string;
    status: string;
    task: string;
}
export interface CommandContext {
    getMode(): Mode;
    setMode(m: Mode): void;
    getPreset(): DeliberationMode;
    setPreset(p: DeliberationMode): void;
    getCostData(): CostData;
    getHistory(): string[];
    sessionId: string;
    /** Aggregate cost from orchestrator cost tracker ($). */
    getAggregateCost?: () => number;
    /** Per-role spend from orchestrator cost tracker. */
    getRoleSpend?: (role: string) => number;
    /** Token usage by role. */
    getTokenUsage?: () => Array<{
        role: string;
        spend: number;
    }>;
    /** Loop/goal state for /status display. */
    getLoopState?: () => {
        kind: 'loop' | 'goal';
        task: string;
        maxIterations: number;
        currentIteration: number;
        status: 'running' | 'completed' | 'failed';
        startedAt: number;
    } | null;
    /** List saved sessions. */
    listSessions?: () => Promise<SessionSummary[]>;
    /** Load a single session by id. */
    loadSession?: (id: string) => Promise<{
        task: string;
        mode: string;
    } | null>;
    /** Read memory entries. */
    getMemoryEntries?: () => Array<{
        content: string;
        metadata?: {
            topic?: string;
        };
    }>;
    /** Memory entry count. */
    getMemorySize?: () => number;
    /** Session store count. */
    getSessionCount?: () => Promise<number>;
    /** Provider list for /model, /doctor. */
    getProviders?: () => Promise<Array<{
        getModel(): {
            provider: string;
            name: string;
            id: string;
            contextWindow: number;
        };
    }>>;
    /** Orchestrator active? */
    hasOrchestrator?: () => boolean;
    /** Event stream for /tasks, /agents. */
    getEventStream?: () => {
        getAll: () => Array<{
            type: string;
            [key: string]: unknown;
        }>;
    } | null;
    /** Init AGENTS.md. */
    initAgentsMd?: (cwd: string, opts?: {
        force?: boolean;
    }) => Promise<{
        bytesWritten: number;
    }>;
    /** Run health checks. */
    runDoctor?: () => Promise<string[]>;
    /** Read resolved config. */
    readConfig?: () => Promise<Record<string, unknown> | null>;
    /** Optional per-session skill model for tiered (adaptive) help copy. */
    skillModel?: SkillModelView;
}
export declare const HELP_TEXT: string[];
export declare const HELP_TEXT_BEGINNER: string[];
export declare const HELP_TEXT_ADVANCED: string[];
/** Select help text by skill tier; defaults to the intermediate full list. */
export declare function getHelpText(model?: SkillModelView): string[];
export declare function runCommand(input: string, ctx: CommandContext): CommandResult;
/**
 * Given a partial input like "/co" return matching command names.
 */
export declare function autocompleteCommand(partial: string): string[];
//# sourceMappingURL=commands.d.ts.map