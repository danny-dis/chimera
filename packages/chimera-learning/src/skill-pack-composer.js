"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillPackComposer = void 0;
const DEFAULT_CONFIG = {
    minCoOccurrence: 2,
};
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
class SkillPackComposer {
    config;
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Analyze which skills were loaded together across sessions
     * and compose a skill pack for a given mode.
     */
    composeFromCoOccurrence(skillCoOccurrence, mode) {
        // Filter to skills that meet the co-occurrence threshold
        const qualifiedSkills = [...skillCoOccurrence.entries()]
            .filter(([, count]) => count >= this.config.minCoOccurrence)
            .sort((a, b) => b[1] - a[1])
            .map(([skill]) => skill);
        if (qualifiedSkills.length === 0)
            return null;
        // Determine pack name from mode + dominant skill
        const dominantSkill = qualifiedSkills[0];
        const packName = `${mode}-${dominantSkill}-pack`;
        return {
            pack: {
                name: packName,
                description: `Auto-generated skill pack for ${mode} mode, centered on ${dominantSkill}`,
                mode,
                skills: qualifiedSkills,
            },
            action: 'create',
            confidence: Math.min(qualifiedSkills.length / 3, 1),
        };
    }
    /**
     * Recommend a skill pack for a domain cluster.
     * Maps the cluster's domain to likely skills and bundles them.
     */
    recommendForCluster(cluster) {
        // Infer which skills would be useful for this domain
        const skills = this.inferSkillsForDomain(cluster.topic, cluster.keywords);
        const packName = `${cluster.topic}-pack`;
        return {
            pack: {
                name: packName,
                description: `Auto-generated pack for ${cluster.topic} tasks (${cluster.sessions.length} sessions, ${Math.round(cluster.successRate * 100)}% success)`,
                mode: 'code', // default to code mode
                skills,
            },
            action: 'create',
            confidence: cluster.successRate * Math.min(cluster.sessions.length / 3, 1),
        };
    }
    /**
     * Update an existing skill pack based on new session data.
     * Adds skills that are frequently used alongside existing pack members.
     */
    improveExisting(existingPack, patterns) {
        // Count which skills appear in sessions alongside existing pack skills
        const coOccurrence = new Map();
        for (const skill of existingPack.skills) {
            coOccurrence.set(skill, (coOccurrence.get(skill) ?? 0) + 1);
        }
        // Analyze skill_loaded events from sessions
        for (const p of patterns) {
            // Patterns don't directly carry skill_loaded events, but we can infer
            // from domain keywords which skills might be relevant
            const inferredSkills = this.inferSkillsForDomain(p.domain.topic, p.domain.keywords);
            for (const skill of inferredSkills) {
                if (!existingPack.skills.includes(skill)) {
                    coOccurrence.set(skill, (coOccurrence.get(skill) ?? 0) + 1);
                }
            }
        }
        // Add skills that co-occur frequently
        const newSkills = [...coOccurrence.entries()]
            .filter(([skill, count]) => !existingPack.skills.includes(skill) && count >= this.config.minCoOccurrence)
            .sort((a, b) => b[1] - a[1])
            .map(([skill]) => skill);
        const allSkills = [...existingPack.skills, ...newSkills];
        return {
            pack: {
                name: existingPack.name,
                description: existingPack.description
                    ? `${existingPack.description} (updated with ${newSkills.length} new skills)`
                    : `Updated pack with ${newSkills.length} new skills`,
                mode: existingPack.mode,
                skills: allSkills,
            },
            action: 'update',
            confidence: Math.min(newSkills.length / 2, 1),
        };
    }
    /**
     * Infer which skills are relevant for a domain based on keywords.
     */
    inferSkillsForDomain(topic, keywords) {
        const skills = [];
        // Domain → skill mapping (built-in chimera skills)
        const DOMAIN_SKILLS = {
            security: ['chimera-safety'],
            testing: ['chimera-tool-loop'],
            deployment: ['chimera-cli'],
            architecture: ['chimera-workflows'],
            debugging: ['chimera-tool-loop', 'chimera-telemetry'],
        };
        // Add domain-specific skills
        const domainSkills = DOMAIN_SKILLS[topic];
        if (domainSkills) {
            skills.push(...domainSkills);
        }
        // Always include chimera-modes as base
        if (!skills.includes('chimera-modes')) {
            skills.push('chimera-modes');
        }
        // Keyword-based skill inference
        if (keywords.some(kw => ['test', 'spec', 'assert'].includes(kw))) {
            if (!skills.includes('chimera-tool-loop'))
                skills.push('chimera-tool-loop');
        }
        if (keywords.some(kw => ['deploy', 'ci', 'cd', 'pipeline'].includes(kw))) {
            if (!skills.includes('chimera-cli'))
                skills.push('chimera-cli');
        }
        if (keywords.some(kw => ['cost', 'budget', 'price'].includes(kw))) {
            if (!skills.includes('chimera-cost-control'))
                skills.push('chimera-cost-control');
        }
        return skills;
    }
}
exports.SkillPackComposer = SkillPackComposer;
//# sourceMappingURL=skill-pack-composer.js.map