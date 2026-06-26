/**
 * SkillPackComposer — bundles frequently-used skills into mode-specific packs.
 *
 * Analyzes skill co-occurrence across sessions and composes skill packs
 * that group skills that are commonly used together.
 *
 * A skill pack is a .md file at .chimera/skill-packs/<mode>.md with:
 *   ---
 *   name: <pack-name>
 *   description: "..."
 *   mode: <mode>
 *   skills:
 *     - skill-1
 *     - skill-2
 *   ---
 */
import type { SessionPattern, DomainCluster, SkillPackSynthesisResult } from './types.js';
export interface SkillPackComposerConfig {
    /** Minimum co-occurrence count to bundle skills together. Default: 2. */
    minCoOccurrence: number;
}
export declare class SkillPackComposer {
    private config;
    constructor(config?: Partial<SkillPackComposerConfig>);
    /**
     * Analyze which skills were loaded together across sessions
     * and compose a skill pack for a given mode.
     */
    composeFromCoOccurrence(skillCoOccurrence: Map<string, number>, mode: string): SkillPackSynthesisResult | null;
    /**
     * Recommend a skill pack for a domain cluster.
     * Maps the cluster's domain to likely skills and bundles them.
     */
    recommendForCluster(cluster: DomainCluster): SkillPackSynthesisResult;
    /**
     * Update an existing skill pack based on new session data.
     * Adds skills that are frequently used alongside existing pack members.
     */
    improveExisting(existingPack: {
        name: string;
        description?: string;
        mode: string;
        skills: string[];
    }, patterns: SessionPattern[]): SkillPackSynthesisResult;
    /**
     * Infer which skills are relevant for a domain based on keywords.
     */
    private inferSkillsForDomain;
}
//# sourceMappingURL=skill-pack-composer.d.ts.map