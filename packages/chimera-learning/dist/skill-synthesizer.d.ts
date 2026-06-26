/**
 * SkillSynthesizer — generates and updates skill files from session patterns.
 *
 * Takes SessionPattern data (from SessionAnalyzer) and produces skill files
 * with YAML frontmatter + Markdown content. Skills include specialization
 * directives that control tool filtering, context scoping, and model tier.
 *
 * Two modes:
 *   1. Template-based (default) — fills a Markdown template with observed patterns
 *   2. LLM-based — sends cluster data to an LLM for prose generation
 */
import type { SessionPattern, DomainCluster, SkillSpecialization, SkillSynthesisResult } from './types.js';
import type { LoadedSkill } from '@chimera/core';
export interface SkillSynthesizerConfig {
    /** Whether to use LLM for content generation. Default: false (template). */
    useLLM: boolean;
    /** Minimum sessions to create a new skill. Default: 2. */
    minSessionsForCreation: number;
}
export declare class SkillSynthesizer {
    constructor(_config?: Partial<SkillSynthesizerConfig>);
    /**
     * Synthesize a skill from a domain cluster.
     */
    synthesizeFromCluster(cluster: DomainCluster): SkillSynthesisResult;
    /**
     * Synthesize a skill from a single session pattern.
     */
    synthesizeFromPattern(pattern: SessionPattern): SkillSynthesisResult;
    /**
     * Improve an existing skill based on new session data.
     */
    improveExisting(existing: LoadedSkill, patterns: SessionPattern[]): SkillSynthesisResult;
    /**
     * Build specialization directives from observed patterns.
     */
    buildSpecialization(patterns: SessionPattern[]): SkillSpecialization;
}
//# sourceMappingURL=skill-synthesizer.d.ts.map