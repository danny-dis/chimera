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
import type {
  SessionPattern,
  DomainCluster,
  SkillSpecialization,
  SkillSynthesisResult,
} from './types.js';
import type { LoadedSkill } from '@chimera/core';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SkillSynthesizerConfig {
  /** Whether to use LLM for content generation. Default: false (template). */
  useLLM: boolean;
  /** Minimum sessions to create a new skill. Default: 2. */
  minSessionsForCreation: number;
}

// ---------------------------------------------------------------------------
// Tool category inference from patterns
// ---------------------------------------------------------------------------

function inferToolSpecialization(patterns: SessionPattern[]): SkillSpecialization['tools'] {
  // Merge all tool frequencies across patterns
  const mergedFreq: Record<string, number> = {};
  for (const p of patterns) {
    for (const [tool, count] of Object.entries(p.tools.frequency)) {
      mergedFreq[tool] = (mergedFreq[tool] ?? 0) + count;
    }
  }

  // Categories used
  const allCategories = new Set<string>();
  for (const p of patterns) {
    for (const cat of p.tools.categories) {
      allCategories.add(cat);
    }
  }

  // Top tools (include)
  const topTools = Object.entries(mergedFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tool]) => tool);

  // Friction tools (exclude)
  const frictionTools = [...new Set(patterns.flatMap(p => p.tools.friction))];

  return {
    categories: [...allCategories],
    include: topTools,
    exclude: frictionTools,
  };
}

function inferContextSpecialization(patterns: SessionPattern[]): SkillSpecialization['context'] {
  // Merge file types
  const allFileTypes = [...new Set(patterns.flatMap(p => p.domain.fileTypes))];

  // Merge hot paths
  const allHotPaths = [...new Set(patterns.flatMap(p => p.domain.hotPaths))];

  // Build include patterns from file types + hot paths
  const include: string[] = [];
  for (const ft of allFileTypes) {
    include.push(`*${ft}`);
  }
  for (const hp of allHotPaths) {
    include.push(`${hp}/**`);
  }

  return {
    include: include.length > 0 ? include : undefined,
    exclude: ['node_modules/**', 'dist/**', '*.min.js'],
  };
}

function inferModelTier(patterns: SessionPattern[]): SkillSpecialization['modelTier'] {
  const avgCost = patterns.reduce((sum, p) => sum + p.cost.totalUsd, 0) / patterns.length;
  if (avgCost < 0.05) return 'cheap';
  if (avgCost < 0.50) return 'mid';
  return 'frontier';
}

function inferRole(patterns: SessionPattern[]): SkillSpecialization['role'] {
  // Count which roles succeeded most
  const roleSuccess: Record<string, number> = {};
  const roleCount: Record<string, number> = {};

  for (const p of patterns) {
    for (const role of p.agents.roles) {
      roleCount[role] = (roleCount[role] ?? 0) + 1;
      if (p.quality.status === 'done') {
        roleSuccess[role] = (roleSuccess[role] ?? 0) + 1;
      }
    }
  }

  // Find role with best success rate
  let bestRole = 'writer';
  let bestRate = 0;
  for (const [role, count] of Object.entries(roleCount)) {
    const rate = (roleSuccess[role] ?? 0) / count;
    if (rate > bestRate) {
      bestRate = rate;
      bestRole = role;
    }
  }

  return bestRole as SkillSpecialization['role'];
}

// ---------------------------------------------------------------------------
// Skill content generation
// ---------------------------------------------------------------------------

function generateSkillName(topic: string, patterns: SessionPattern[]): string {
  // Derive name from topic + keywords
  const allKeywords = patterns.flatMap(p => p.domain.keywords);
  const keywordCounts: Record<string, number> = {};
  for (const kw of allKeywords) {
    keywordCounts[kw] = (keywordCounts[kw] ?? 0) + 1;
  }
  const topKeywords = Object.entries(keywordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([kw]) => kw);

  const slug = [topic, ...topKeywords].join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return slug.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function generateSkillDescription(topic: string, patterns: SessionPattern[]): string {
  const avgCost = patterns.reduce((sum, p) => sum + p.cost.totalUsd, 0) / patterns.length;
  const successRate = patterns.filter(p => p.quality.status === 'done').length / patterns.length;
  const toolCount = new Set(patterns.flatMap(p => Object.keys(p.tools.frequency))).size;

  return (
    `${topic.charAt(0).toUpperCase() + topic.slice(1)} implementation and review patterns. ` +
    `Observed across ${patterns.length} sessions with ${Math.round(successRate * 100)}% success rate. ` +
    `Involves ${toolCount} distinct tools, avg cost $${avgCost.toFixed(2)}.`
  );
}

function generateSkillContent(
  topic: string,
  _cluster: DomainCluster | null,
  patterns: SessionPattern[],
): string {
  // Collect observed patterns
  const commonTools = mergeToolFrequency(patterns);
  const hotPaths = [...new Set(patterns.flatMap(p => p.domain.hotPaths))];
  const keywords = [...new Set(patterns.flatMap(p => p.domain.keywords))];
  const failures = patterns.flatMap(p => p.quality.failures);

  const lines: string[] = [];

  lines.push(`# ${topic.charAt(0).toUpperCase() + topic.slice(1)} Patterns`);
  lines.push('');
  lines.push(`Auto-generated from ${patterns.length} session(s).`);
  lines.push('');

  // Observed tool patterns
  lines.push('## Observed Tool Patterns');
  lines.push('');
  if (commonTools.length > 0) {
    lines.push('Most frequently used tools:');
    lines.push('');
    for (const [tool, count] of commonTools.slice(0, 8)) {
      lines.push(`- **${tool}**: used ${count} time(s)`);
    }
    lines.push('');
  }

  // Common file paths
  if (hotPaths.length > 0) {
    lines.push('## Common File Paths');
    lines.push('');
    for (const hp of hotPaths.slice(0, 5)) {
      lines.push(`- \`${hp}/\``);
    }
    lines.push('');
  }

  // Keywords
  if (keywords.length > 0) {
    lines.push('## Domain Keywords');
    lines.push('');
    lines.push(keywords.slice(0, 10).join(', '));
    lines.push('');
  }

  // Recommended approach (from successful patterns)
  const successfulPatterns = patterns.filter(p => p.quality.status === 'done');
  if (successfulPatterns.length > 0) {
    lines.push('## Recommended Approach');
    lines.push('');
    const bestSequence = mergeSequences(successfulPatterns.map(p => p.tools.sequence));
    lines.push('Typical tool sequence for successful sessions:');
    lines.push('');
    lines.push('```');
    lines.push(bestSequence.join(' → '));
    lines.push('```');
    lines.push('');
  }

  // Common pitfalls (from failures)
  if (failures.length > 0) {
    lines.push('## Common Pitfalls');
    lines.push('');
    const uniqueFailures = [...new Set(failures.map(f => f.reason))].slice(0, 5);
    for (const reason of uniqueFailures) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class SkillSynthesizer {
  constructor(_config?: Partial<SkillSynthesizerConfig>) {
  }

  /**
   * Synthesize a skill from a domain cluster.
   */
  synthesizeFromCluster(cluster: DomainCluster): SkillSynthesisResult {
    const name = generateSkillName(cluster.topic, cluster.sessions);
    const description = generateSkillDescription(cluster.topic, cluster.sessions);
    const content = generateSkillContent(cluster.topic, cluster, cluster.sessions);
    const specialization = this.buildSpecialization(cluster.sessions);

    return {
      skill: { name, description, content, specialization },
      action: 'create',
      confidence: cluster.successRate * Math.min(cluster.sessions.length / 3, 1),
      sourceSessionIds: cluster.sessions.map(s => s.sessionId),
    };
  }

  /**
   * Synthesize a skill from a single session pattern.
   */
  synthesizeFromPattern(pattern: SessionPattern): SkillSynthesisResult {
    const name = generateSkillName(pattern.domain.topic, [pattern]);
    const description = generateSkillDescription(pattern.domain.topic, [pattern]);
    const content = generateSkillContent(pattern.domain.topic, null, [pattern]);
    const specialization = this.buildSpecialization([pattern]);

    return {
      skill: { name, description, content, specialization },
      action: 'create',
      confidence: pattern.quality.status === 'done' ? 0.6 : 0.3,
      sourceSessionIds: [pattern.sessionId],
    };
  }

  /**
   * Improve an existing skill based on new session data.
   */
  improveExisting(
    existing: LoadedSkill,
    patterns: SessionPattern[],
  ): SkillSynthesisResult {
    const name = existing.name;
    const description = generateSkillDescription(name, patterns);
    const content = generateSkillContent(name, null, patterns);
    const specialization = this.buildSpecialization(patterns);

    return {
      skill: { name, description, content, specialization },
      action: 'update',
      confidence: Math.min(patterns.length / 5, 1),
      sourceSessionIds: patterns.map(s => s.sessionId),
    };
  }

  /**
   * Build specialization directives from observed patterns.
   */
  buildSpecialization(patterns: SessionPattern[]): SkillSpecialization {
    return {
      tools: inferToolSpecialization(patterns),
      context: inferContextSpecialization(patterns),
      modelTier: inferModelTier(patterns),
      role: inferRole(patterns),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeToolFrequency(patterns: SessionPattern[]): Array<[string, number]> {
  const merged: Record<string, number> = {};
  for (const p of patterns) {
    for (const [tool, count] of Object.entries(p.tools.frequency)) {
      merged[tool] = (merged[tool] ?? 0) + count;
    }
  }
  return Object.entries(merged).sort((a, b) => b[1] - a[1]);
}

function mergeSequences(sequences: string[][]): string[] {
  // Simple majority-vote merge: pick the most common next tool at each position
  if (sequences.length === 0) return [];
  if (sequences.length === 1) return sequences[0];

  const maxLen = Math.max(...sequences.map(s => s.length));
  const merged: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const candidates = sequences
      .map(s => s[i])
      .filter((t): t is string => t !== undefined);

    if (candidates.length === 0) break;

    // Pick most frequent
    const counts: Record<string, number> = {};
    for (const c of candidates) {
      counts[c] = (counts[c] ?? 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

    // Dedupe consecutive
    if (merged.length === 0 || merged[merged.length - 1] !== best) {
      merged.push(best);
    }
  }

  return merged;
}
