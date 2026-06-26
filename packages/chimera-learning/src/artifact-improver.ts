/**
 * ArtifactImprover — analyzes existing skills and workflows for improvement.
 *
 * Compares what artifacts say vs what agents actually did in sessions,
 * detects misalignments, and generates improvement signals.
 *
 * Improvement types:
 *   - skill-not-followed: agent ignored skill instructions
 *   - workflow-deviation: agent reordered/skipped workflow steps
 *   - tool-friction: recommended tools were denied/asked
 *   - cost-inefficient: forced model tier doesn't match actual complexity
 *   - quality-failure: artifact-related quality issues
 */
import type {
  SessionPattern,
  ImprovementSignal,
  ImprovementIssue,
  SkillSynthesisResult,
  WorkflowSynthesisResult,
  SynthesizedWorkflow,
} from './types.js';
import type { LoadedSkill } from '@chimera/core';

// ---------------------------------------------------------------------------
// Skill effectiveness analysis
// ---------------------------------------------------------------------------

function detectSkillToolMisalignment(
  skill: LoadedSkill,
  patterns: SessionPattern[],
): ImprovementIssue[] {
  const issues: ImprovementIssue[] = [];

  // Extract what tools were actually used
  const actualTools: Record<string, number> = {};
  for (const p of patterns) {
    for (const [tool, count] of Object.entries(p.tools.frequency)) {
      actualTools[tool] = (actualTools[tool] ?? 0) + count;
    }
  }

  // Check for friction (tools that were denied/asked)
  const frictionTools = [...new Set(patterns.flatMap(p => p.tools.friction))];
  if (frictionTools.length > 0) {
    issues.push({
      type: 'tool-friction',
      description: `Recommended tools have permission friction: ${frictionTools.join(', ')}`,
      evidence: `Denied/asked ${frictionTools.length} time(s) across ${patterns.length} session(s)`,
      severity: 'medium',
    });
  }

  // Check if skill mentions specific tools that weren't used
  const skillMentionsTool = (tool: string): boolean =>
    skill.content.toLowerCase().includes(tool.toLowerCase());

  const mentionedTools = ['read_file', 'edit_file', 'run_shell_command', 'search_files', 'git'];
  for (const tool of mentionedTools) {
    if (skillMentionsTool(tool) && !actualTools[tool]) {
      issues.push({
        type: 'skill-not-followed',
        description: `Skill references ${tool} but it was never used`,
        evidence: `No ${tool} calls in ${patterns.length} session(s)`,
        severity: 'low',
      });
    }
  }

  return issues;
}

function detectSkillCostMisalignment(
  skill: LoadedSkill,
  patterns: SessionPattern[],
): ImprovementIssue[] {
  const issues: ImprovementIssue[] = [];

  // Check if skill forces a model tier that doesn't match actual complexity
  const avgCost = patterns.reduce((sum, p) => sum + p.cost.totalUsd, 0) / patterns.length;
  const hasFrontierHint = skill.content.toLowerCase().includes('frontier') ||
    skill.content.toLowerCase().includes('opus') ||
    skill.content.toLowerCase().includes('gpt-4');

  if (hasFrontierHint && avgCost < 0.05) {
    issues.push({
      type: 'cost-inefficient',
      description: 'Skill suggests frontier model but tasks are low-complexity',
      evidence: `Average cost $${avgCost.toFixed(3)} suggests mid/cheap tier is sufficient`,
      severity: 'medium',
    });
  }

  return issues;
}

function detectSkillQualityIssues(
  _skill: LoadedSkill,
  patterns: SessionPattern[],
): ImprovementIssue[] {
  const issues: ImprovementIssue[] = [];

  const failedSessions = patterns.filter(p => p.quality.status !== 'done');
  if (failedSessions.length > 0 && failedSessions.length === patterns.length) {
    issues.push({
      type: 'quality-failure',
      description: 'All sessions using this skill failed',
      evidence: `${failedSessions.length}/${patterns.length} sessions failed`,
      severity: 'high',
    });
  }

  const revisionHeavy = patterns.filter(p => p.quality.revisionCycles > 2);
  if (revisionHeavy.length > patterns.length * 0.5) {
    issues.push({
      type: 'quality-failure',
      description: 'Majority of sessions required heavy revision',
      evidence: `${revisionHeavy.length}/${patterns.length} sessions had >2 revision cycles`,
      severity: 'medium',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Workflow effectiveness analysis
// ---------------------------------------------------------------------------

function detectWorkflowDeviations(
  workflow: { steps: Array<{ id: string; kind: string; config: Record<string, unknown> }> },
  patterns: SessionPattern[],
): ImprovementIssue[] {
  const issues: ImprovementIssue[] = [];

  // Extract expected tool sequence from workflow steps
  const expectedTools: string[] = [];
  for (const step of workflow.steps) {
    if (step.kind === 'tool' && typeof step.config.name === 'string') {
      expectedTools.push(step.config.name);
    }
  }

  if (expectedTools.length === 0) return issues;

  // Compare with actual tool sequences
  const actualSequences = patterns.map(p => p.tools.sequence);

  // Check if actual sequences skip or reorder expected tools
  for (const actual of actualSequences) {
    const missingTools = expectedTools.filter(t => !actual.includes(t));
    if (missingTools.length > 0) {
      issues.push({
        type: 'workflow-deviation',
        description: `Sessions skip expected tools: ${missingTools.join(', ')}`,
        evidence: `Expected ${expectedTools.join('→')}, got ${actual.join('→')}`,
        severity: 'medium',
      });
      break; // One issue is enough
    }

    // Check order preservation
    let lastIdx = -1;
    let outOfOrder = false;
    for (const tool of expectedTools) {
      const idx = actual.indexOf(tool);
      if (idx !== -1) {
        if (idx < lastIdx) {
          outOfOrder = true;
          break;
        }
        lastIdx = idx;
      }
    }

    if (outOfOrder) {
      issues.push({
        type: 'workflow-deviation',
        description: 'Sessions reorder workflow steps',
        evidence: `Expected order ${expectedTools.join('→')}, actual ${actual.join('→')}`,
        severity: 'low',
      });
      break;
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class ArtifactImprover {
  /**
   * Analyze a skill's effectiveness.
   */
  analyzeSkillEffectiveness(
    skill: LoadedSkill,
    patterns: SessionPattern[],
  ): ImprovementSignal {
    const issues: ImprovementIssue[] = [
      ...detectSkillToolMisalignment(skill, patterns),
      ...detectSkillCostMisalignment(skill, patterns),
      ...detectSkillQualityIssues(skill, patterns),
    ];

    return {
      artifact: { type: 'skill', name: skill.name },
      sessions: patterns,
      issues,
    };
  }

  /**
   * Analyze a workflow's effectiveness.
   */
  analyzeWorkflowEffectiveness(
    workflow: { name: string; steps: Array<{ id: string; kind: string; config: Record<string, unknown> }> },
    patterns: SessionPattern[],
  ): ImprovementSignal {
    const issues: ImprovementIssue[] = [
      ...detectWorkflowDeviations(workflow, patterns),
    ];

    return {
      artifact: { type: 'workflow', name: workflow.name },
      sessions: patterns,
      issues,
    };
  }

  /**
   * Generate an improved skill from improvement signals.
   */
  improveSkill(
    skill: LoadedSkill,
    signal: ImprovementSignal,
    patterns: SessionPattern[],
  ): SkillSynthesisResult {
    const issues = signal.issues;
    let content = skill.content;

    // Apply improvements based on issues
    for (const issue of issues) {
      switch (issue.type) {
        case 'tool-friction':
          // Add a note about tool alternatives
          content += `\n\n## Tool Alternatives\n\nIf tools are unavailable, try alternative approaches.`;
          break;

        case 'skill-not-followed':
          // Make instructions more concise and actionable
          content = makeMoreActionable(content);
          break;

        case 'cost-inefficient':
          // Add a note about cost optimization
          content += `\n\n## Cost Optimization\n\nFor simple tasks, prefer cheaper models.`;
          break;

        case 'quality-failure':
          // Add verification steps
          content += `\n\n## Verification\n\nAlways verify changes before committing.`;
          break;
      }
    }

    return {
      skill: {
        name: skill.name,
        description: skill.description,
        content,
      },
      action: 'update',
      confidence: Math.min(patterns.length / 3, 1),
      sourceSessionIds: patterns.map(p => p.sessionId),
    };
  }

  /**
   * Generate an improved workflow from improvement signals.
   */
  improveWorkflow(
    workflow: { name: string; description?: string; steps: Array<{ id: string; kind: string; config: Record<string, unknown> }> },
    signal: ImprovementSignal,
    patterns: SessionPattern[],
  ): WorkflowSynthesisResult {
    const issues = signal.issues;
    const steps = [...workflow.steps];

    for (const issue of issues) {
      if (issue.type === 'workflow-deviation') {
        // Reorder steps based on successful patterns
        const successfulPatterns = patterns.filter(p => p.quality.status === 'done');
        if (successfulPatterns.length > 0) {
          const mergedSequence = mergeSequences(successfulPatterns.map(p => p.tools.sequence));
          // Rebuild steps from merged sequence
          const newSteps = rebuildStepsFromSequence(mergedSequence, steps);
          steps.length = 0;
          steps.push(...newSteps);
        }
      }
    }

    return {
      workflow: {
        name: workflow.name,
        description: workflow.description
          ? `${workflow.description} (improved)`
          : 'Improved workflow',
        steps: steps as SynthesizedWorkflow['steps'],
        tags: ['auto-generated', 'improved'],
      },
      action: 'update',
      confidence: Math.min(patterns.length / 3, 1),
      sourceSessionIds: patterns.map(p => p.sessionId),
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMoreActionable(content: string): string {
  // Simple heuristic: shorten paragraphs, add more bullet points
  return content
    .replace(/\n\n(?!##)/g, '\n\n> ')
    .replace(/You should/g, 'Do')
    .replace(/You can/g, 'Use')
    .replace(/It is recommended/g, 'Required');
}

function mergeSequences(sequences: string[][]): string[] {
  if (sequences.length === 0) return [];
  if (sequences.length === 1) return sequences[0];

  const maxLen = Math.max(...sequences.map(s => s.length));
  const merged: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const candidates = sequences
      .map(s => s[i])
      .filter((t): t is string => t !== undefined);

    if (candidates.length === 0) break;

    const counts: Record<string, number> = {};
    for (const c of candidates) {
      counts[c] = (counts[c] ?? 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

    if (merged.length === 0 || merged[merged.length - 1] !== best) {
      merged.push(best);
    }
  }

  return merged;
}

function rebuildStepsFromSequence(
  sequence: string[],
  existingSteps: Array<{ id: string; kind: string; config: Record<string, unknown> }>,
): Array<{ id: string; kind: string; config: Record<string, unknown> }> {
  const steps: Array<{ id: string; kind: string; config: Record<string, unknown> }> = [];
  let counter = 0;

  for (const tool of sequence) {
    const existing = existingSteps.find(s =>
      s.kind === 'tool' && s.config.name === tool
    );

    if (existing) {
      steps.push({ ...existing });
    } else {
      steps.push({
        id: `step-${counter++}`,
        kind: 'tool',
        config: { name: tool, args: {} },
      });
    }
  }

  return steps;
}
