import { z } from 'zod';
import { SessionAnalyzer } from './session-analyzer.js';
import { SkillSynthesizer } from './skill-synthesizer.js';
export declare const AutoSkillConfigSchema: z.ZodObject<{
    minPatternCount: z.ZodDefault<z.ZodNumber>;
    minConfidence: z.ZodDefault<z.ZodNumber>;
    skillsDir: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    minPatternCount: number;
    minConfidence: number;
    skillsDir: string;
}, {
    minPatternCount?: number | undefined;
    minConfidence?: number | undefined;
    skillsDir?: string | undefined;
}>;
export type AutoSkillConfig = z.infer<typeof AutoSkillConfigSchema>;
export interface AutoSkillResult {
    created: string[];
    updated: string[];
}
/**
 * Detects repeated tool patterns across sessions and synthesizes
 * reusable skill files in `.chimera/skills/`.
 */
export declare class AutoSkillService {
    private analyzer;
    private skillSynth;
    private config;
    private workspaceRoot;
    constructor(analyzer: SessionAnalyzer, skillSynth: SkillSynthesizer, config: Partial<AutoSkillConfig>, workspaceRoot: string);
    detectAndSynthesize(checkpoints: Array<{
        events: unknown[];
        messages: unknown[];
    }>): Promise<AutoSkillResult>;
    private findRepeatedPatterns;
}
//# sourceMappingURL=auto-skill-service.d.ts.map