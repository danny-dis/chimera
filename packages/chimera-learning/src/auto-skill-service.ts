import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { z } from 'zod';
import { SessionAnalyzer } from './session-analyzer.js';
import { SkillSynthesizer } from './skill-synthesizer.js';
import type { ClusteredPatterns, RepeatedSequence } from './types.js';

export const AutoSkillConfigSchema = z.object({
  minPatternCount: z.number().positive().default(3),
  minConfidence: z.number().min(0).max(1).default(0.6),
  skillsDir: z.string().default('.chimera/skills'),
});
export type AutoSkillConfig = z.infer<typeof AutoSkillConfigSchema>;

export interface AutoSkillResult {
  created: string[];
  updated: string[];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Detects repeated tool patterns across sessions and synthesizes
 * reusable skill files in `.chimera/skills/`.
 */
export class AutoSkillService {
  private analyzer: SessionAnalyzer;
  private skillSynth: SkillSynthesizer;
  private config: AutoSkillConfig;
  private workspaceRoot: string;

  constructor(
    analyzer: SessionAnalyzer,
    skillSynth: SkillSynthesizer,
    config: Partial<AutoSkillConfig>,
    workspaceRoot: string,
  ) {
    this.analyzer = analyzer;
    this.skillSynth = skillSynth;
    this.config = AutoSkillConfigSchema.parse(config);
    this.workspaceRoot = workspaceRoot;
  }

  async detectAndSynthesize(
    checkpoints: Array<{ events: unknown[]; messages: unknown[] }>,
  ): Promise<AutoSkillResult> {
    const result: AutoSkillResult = { created: [], updated: [] };

    if (checkpoints.length < this.config.minPatternCount) return result;

    const clustered: ClusteredPatterns = this.analyzer.analyzeBatch(checkpoints as never[]);

    for (const cluster of clustered.domainClusters) {
      if (cluster.sessions.length < this.config.minPatternCount) continue;
      if (cluster.successRate < this.config.minConfidence) continue;

      const synthesis = this.skillSynth.synthesizeFromCluster(cluster);
      if (!synthesis?.skill) continue;

      const { name, description, content, specialization } = synthesis.skill;
      const slug = slugify(name);
      const skillPath = path.join(this.workspaceRoot, this.config.skillsDir, `${slug}.md`);

      const dir = path.dirname(skillPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const frontmatter = [
        '---',
        `name: ${name}`,
        `description: ${description}`,
        `specialization: ${JSON.stringify(specialization)}`,
        '---',
        '',
      ].join('\n');

      writeFileSync(skillPath, frontmatter + content, 'utf-8');
      result.created.push(slug);
    }

    for (const seq of this.findRepeatedPatterns(clustered)) {
      if (seq.frequency < this.config.minPatternCount) continue;

      const slug = slugify(`auto-${seq.sequence.slice(0, 3).join('-')}`);
      const skillPath = path.join(this.workspaceRoot, this.config.skillsDir, `${slug}.md`);

      if (existsSync(skillPath)) {
        result.updated.push(slug);
        continue;
      }

      const dir = path.dirname(skillPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      const content = [
        '---',
        `name: ${slug}`,
        `description: Auto-detected pattern: ${seq.sequence.join(' → ')}`,
        '---',
        '',
        `## Observed Pattern`,
        '',
        `Tool sequence: ${seq.sequence.join(' → ')}`,
        `Frequency: ${seq.frequency} sessions`,
        `Success rate: ${(seq.successRate * 100).toFixed(0)}%`,
        `Domain: ${seq.domainKeywords.join(', ')}`,
      ].join('\n');

      writeFileSync(skillPath, content, 'utf-8');
      result.created.push(slug);
    }

    return result;
  }

  private findRepeatedPatterns(clustered: ClusteredPatterns): RepeatedSequence[] {
    return clustered.repeatedSequences.filter(
      (seq) => seq.frequency >= this.config.minPatternCount && seq.successRate >= 0.5,
    );
  }
}
