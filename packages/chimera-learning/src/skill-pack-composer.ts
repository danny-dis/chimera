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
import type {
  SessionPattern,
  DomainCluster,
  SkillPackSynthesisResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SkillPackComposerConfig {
  /** Minimum co-occurrence count to bundle skills together. Default: 2. */
  minCoOccurrence: number;
}

const DEFAULT_CONFIG: SkillPackComposerConfig = {
  minCoOccurrence: 2,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class SkillPackComposer {
  private config: SkillPackComposerConfig;

  constructor(config?: Partial<SkillPackComposerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze which skills were loaded together across sessions
   * and compose a skill pack for a given mode.
   */
  composeFromCoOccurrence(
    skillCoOccurrence: Map<string, number>,
    mode: string,
  ): SkillPackSynthesisResult | null {
    // Filter to skills that meet the co-occurrence threshold
    const qualifiedSkills = [...skillCoOccurrence.entries()]
      .filter(([, count]) => count >= this.config.minCoOccurrence)
      .sort((a, b) => b[1] - a[1])
      .map(([skill]) => skill);

    if (qualifiedSkills.length === 0) return null;

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
  recommendForCluster(cluster: DomainCluster): SkillPackSynthesisResult {
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
  improveExisting(
    existingPack: { name: string; description?: string; mode: string; skills: string[] },
    patterns: SessionPattern[],
  ): SkillPackSynthesisResult {
    // Count which skills appear in sessions alongside existing pack skills
    const coOccurrence = new Map<string, number>();
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
  private inferSkillsForDomain(topic: string, keywords: string[]): string[] {
    const skills: string[] = [];

    // Domain → skill mapping (built-in chimera skills)
    const DOMAIN_SKILLS: Record<string, string[]> = {
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
      if (!skills.includes('chimera-tool-loop')) skills.push('chimera-tool-loop');
    }
    if (keywords.some(kw => ['deploy', 'ci', 'cd', 'pipeline'].includes(kw))) {
      if (!skills.includes('chimera-cli')) skills.push('chimera-cli');
    }
    if (keywords.some(kw => ['cost', 'budget', 'price'].includes(kw))) {
      if (!skills.includes('chimera-cost-control')) skills.push('chimera-cost-control');
    }

    return skills;
  }
}
