import { z } from 'zod';
import type { LongTermMemory } from './long-term-memory.js';
export declare const DreamConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    minSessionGap: z.ZodDefault<z.ZodNumber>;
    minTimeGapMs: z.ZodDefault<z.ZodNumber>;
    lockfileDir: z.ZodOptional<z.ZodString>;
    maxMemoriesPerConsolidation: z.ZodDefault<z.ZodNumber>;
    model: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    model?: string;
    enabled?: boolean;
    minSessionGap?: number;
    minTimeGapMs?: number;
    lockfileDir?: string;
    maxMemoriesPerConsolidation?: number;
}, {
    model?: string;
    enabled?: boolean;
    minSessionGap?: number;
    minTimeGapMs?: number;
    lockfileDir?: string;
    maxMemoriesPerConsolidation?: number;
}>;
export type DreamConfig = z.infer<typeof DreamConfigSchema>;
export interface DreamState {
    lastDreamAt: number;
    sessionsSinceDream: number;
    totalDreams: number;
}
/**
 * 4-phase periodic memory consolidation:
 *   Orient → Gather → Consolidate → Prune
 *
 * Gated by session count and time since last dream.
 * Uses PID lockfile (mtime-based stale detection) for process safety.
 */
export declare class AutoDreamService {
    private memory;
    private config;
    private state;
    private lockfilePath;
    private statePath;
    constructor(memory: LongTermMemory, config?: Partial<DreamConfig>);
    shouldDream(): Promise<boolean>;
    dream(): Promise<{
        consolidated: number;
        pruned: number;
    }>;
    getState(): DreamState;
    private orient;
    private gather;
    private consolidate;
    private prune;
    private acquirePidLock;
    private releasePidLock;
    private loadState;
    private saveState;
}
//# sourceMappingURL=auto-dream.d.ts.map