/**
 * LearningEngine — orchestrates the full session → artifact pipeline.
 *
 * Coordinates SessionAnalyzer, SkillSynthesizer, WorkflowSynthesizer,
 * SkillPackComposer, and ArtifactImprover to produce and maintain
 * skills, workflows, and skill packs from session data.
 *
 * Pipeline:
 *   1. Load session checkpoints from disk
 *   2. Analyze each session (SessionAnalyzer)
 *   3. Detect domain clusters and repeated sequences
 *   4. Synthesize new skills from clusters
 *   5. Improve existing skills based on feedback
 *   6. Synthesize new workflows from sequences
 *   7. Improve existing workflows based on feedback
 *   8. Compose skill packs from co-occurrence
 *   9. Write artifacts to disk (if autoApply)
 *  10. Return learning report
 */
import { promises as fs } from 'fs';
import path from 'path';
import { stringify as stringifyYaml } from 'yaml';
import { loadSkill, listAllSkills, EventStream } from '@chimera/core';
import { CheckpointStore, type SessionCheckpoint } from '@chimera/session';
import { SessionAnalyzer } from './session-analyzer.js';
import { SkillSynthesizer } from './skill-synthesizer.js';
import { WorkflowSynthesizer } from './workflow-synthesizer.js';
import { SkillPackComposer } from './skill-pack-composer.js';
import { ArtifactImprover } from './artifact-improver.js';
import type {
  LearningConfig,
  LearningReport,
  ArtifactInventory,
  SkillSpecialization,
} from './types.js';

// ---------------------------------------------------------------------------
// Skill frontmatter serialization
// ---------------------------------------------------------------------------

function serializeSkillFrontmatter(
  skill: { name: string; description: string; specialization?: SkillSpecialization },
  body: string,
): string {
  const frontmatter: Record<string, unknown> = {
    name: skill.name,
    description: skill.description,
  };

  if (skill.specialization) {
    frontmatter.specialization = {};
    if (skill.specialization.tools) {
      (frontmatter.specialization as Record<string, unknown>).tools = skill.specialization.tools;
    }
    if (skill.specialization.context) {
      (frontmatter.specialization as Record<string, unknown>).context = skill.specialization.context;
    }
    if (skill.specialization.modelTier) {
      (frontmatter.specialization as Record<string, unknown>).modelTier = skill.specialization.modelTier;
    }
    if (skill.specialization.role) {
      (frontmatter.specialization as Record<string, unknown>).role = skill.specialization.role;
    }
    if (skill.specialization.systemPrompt) {
      (frontmatter.specialization as Record<string, unknown>).systemPrompt = skill.specialization.systemPrompt;
    }
  }

  const yamlStr = stringifyYaml(frontmatter).trimEnd();
  return `---\n${yamlStr}\n---\n\n${body}`;
}

function serializeWorkflow(workflow: {
  name: string;
  description: string;
  steps: Array<{ id: string; kind: string; config: Record<string, unknown>; required?: boolean }>;
  tags: string[];
}): string {
  const doc: Record<string, unknown> = {
    name: workflow.name,
    description: workflow.description,
    tags: workflow.tags,
    steps: workflow.steps.map(s => {
      const step: Record<string, unknown> = {
        id: s.id,
        kind: s.kind,
        config: s.config,
      };
      if (s.required !== undefined) step.required = s.required;
      return step;
    }),
  };
  return stringifyYaml(doc).trimEnd();
}

function serializeSkillPack(pack: {
  name: string;
  description: string;
  mode: string;
  skills: string[];
}): string {
  const doc: Record<string, unknown> = {
    name: pack.name,
    description: pack.description,
    mode: pack.mode,
    skills: pack.skills,
  };
  return `---\n${stringifyYaml(doc).trimEnd()}\n---\n`;
}

// ---------------------------------------------------------------------------
// LearningEngine
// ---------------------------------------------------------------------------

export class LearningEngine {
  private config: LearningConfig;
  private analyzer: SessionAnalyzer;
  private skillSynth: SkillSynthesizer;
  private workflowSynth: WorkflowSynthesizer;
  private packComposer: SkillPackComposer;
  private improver: ArtifactImprover;
  private checkpointStore: CheckpointStore;

  constructor(config: LearningConfig) {
    this.config = config;
    this.analyzer = new SessionAnalyzer();
    this.skillSynth = new SkillSynthesizer({ useLLM: false, minSessionsForCreation: config.minSessionsThreshold });
    this.workflowSynth = new WorkflowSynthesizer();
    this.packComposer = new SkillPackComposer({ minCoOccurrence: config.minSessionsThreshold });
    this.improver = new ArtifactImprover();
    this.checkpointStore = new CheckpointStore(config.sessionDir);
  }

  /**
   * Run the full learning pipeline on recent sessions.
   */
  async learn(): Promise<LearningReport> {
    const report: LearningReport = {
      skillsCreated: [],
      skillsUpdated: [],
      workflowsCreated: [],
      workflowsUpdated: [],
      packsCreated: [],
      packsUpdated: [],
      improvementsApplied: [],
      sessionsAnalyzed: 0,
      completedAt: new Date().toISOString(),
    };

    // 1. Load checkpoints
    const summaries = await this.checkpointStore.list();
    const checkpoints: SessionCheckpoint[] = [];
    for (const s of summaries) {
      const cp = await this.checkpointStore.load(s.id);
      if (cp) checkpoints.push(cp);
    }

    if (checkpoints.length === 0) return report;
    report.sessionsAnalyzed = checkpoints.length;

    // 2. Analyze all sessions
    const clustered = this.analyzer.analyzeBatch(checkpoints);

    // 3. Synthesize new skills from domain clusters
    for (const cluster of clustered.domainClusters) {
      if (cluster.sessions.length < this.config.minSessionsThreshold) continue;

      const result = this.skillSynth.synthesizeFromCluster(cluster);

      // Check if a skill with this name already exists
      const existing = loadSkill(result.skill.name, this.config.outputDir, { warnOnLegacy: false });
      if (existing) {
        // Improve existing
        const improved = this.skillSynth.improveExisting(existing, cluster.sessions);
        report.skillsUpdated.push(improved);
      } else {
        report.skillsCreated.push(result);
      }
    }

    // 4. Synthesize new workflows from repeated sequences
    for (const seq of clustered.repeatedSequences) {
      if (seq.frequency < this.config.minSessionsThreshold) continue;
      if (seq.successRate < 0.5) continue; // Don't synthesize from failing patterns

      const result = this.workflowSynth.synthesizeFromSequence(seq);
      report.workflowsCreated.push(result);
    }

    // 5. Synthesize workflows from clusters
    for (const cluster of clustered.domainClusters) {
      if (cluster.sessions.length < this.config.minSessionsThreshold) continue;
      if (cluster.successRate < 0.5) continue;

      const result = this.workflowSynth.synthesizeFromCluster(cluster);
      // Check if workflow already exists
      const existingWorkflow = report.workflowsCreated.find(w => w.workflow.name === result.workflow.name);
      if (!existingWorkflow) {
        report.workflowsCreated.push(result);
      }
    }

    // 6. Compose skill packs
    const skillCoOccurrence = this.buildSkillCoOccurrence(checkpoints);
    const dominantMode = this.getDominantMode(checkpoints);

    const packResult = this.packComposer.composeFromCoOccurrence(skillCoOccurrence, dominantMode);
    if (packResult) {
      report.packsCreated.push(packResult);
    }

    // 7. Compose packs for each domain cluster
    for (const cluster of clustered.domainClusters) {
      if (cluster.sessions.length < this.config.minSessionsThreshold) continue;
      const packResult = this.packComposer.recommendForCluster(cluster);
      const existingPack = report.packsCreated.find(p => p.pack.name === packResult.pack.name);
      if (!existingPack) {
        report.packsCreated.push(packResult);
      }
    }

    // 8. Improve existing skills
    const existingSkills = listAllSkills(this.config.outputDir);
    for (const skill of existingSkills) {
      const skillPatterns = clustered.domainClusters
        .filter(c => skill.content.toLowerCase().includes(c.topic))
        .flatMap(c => c.sessions);

      if (skillPatterns.length < this.config.minSessionsThreshold) continue;

      const signal = this.improver.analyzeSkillEffectiveness(skill, skillPatterns);
      if (signal.issues.length > 0) {
        const improved = this.improver.improveSkill(skill, signal, skillPatterns);
        report.skillsUpdated.push(improved);
        report.improvementsApplied.push(signal);
      }
    }

    // 9. Write artifacts to disk
    if (this.config.autoApply) {
      await this.writeArtifacts(report);
    }

    return report;
  }

  /**
   * Learn from a single completed session.
   *
   * Produces the full artifact triad: skills, workflows, and skill packs.
   * Optionally emits telemetry events via the provided EventStream.
   *
   * Guard rails prevent artifact creation from trivial sessions:
   *   - Minimum 5 events in the session (otherwise too sparse to learn from)
   *   - Minimum 2 turns (single-turn Q&A has no repeatable pattern)
   *   - Minimum 3 distinct tools used (sessions with no tool usage are Q&A only)
   *   - Domain confidence > 0.6 (raised from 0.3 to avoid false positives)
   */
  async learnFromSession(
    checkpoint: SessionCheckpoint,
    eventStream?: EventStream,
  ): Promise<LearningReport> {
    const startedAt = Date.now();
    const report: LearningReport = {
      skillsCreated: [],
      skillsUpdated: [],
      workflowsCreated: [],
      workflowsUpdated: [],
      packsCreated: [],
      packsUpdated: [],
      improvementsApplied: [],
      sessionsAnalyzed: 1,
      completedAt: new Date().toISOString(),
    };

    // ── Guard: session too trivial to learn from ──
    const eventCount = checkpoint.events.length;
    const turnCount = checkpoint.metadata.turnCount;
    if (eventCount < 5 || turnCount < 2) {
      return report;
    }

    const pattern = this.analyzer.analyze(checkpoint);
    const toolCount = pattern.tools.sequence.length;
    const domainConf = pattern.domain.confidence;
    const sessionDone = pattern.quality.status === 'done';

    // 1. Synthesize a skill from this session's domain
    //    Requires: session completed, strong domain signal, meaningful tool usage
    if (sessionDone && domainConf > 0.6 && toolCount >= 3) {
      const result = this.skillSynth.synthesizeFromPattern(pattern);
      const existing = loadSkill(result.skill.name, this.config.outputDir, { warnOnLegacy: false });
      if (existing) {
        const improved = this.skillSynth.improveExisting(existing, [pattern]);
        report.skillsUpdated.push(improved);
        eventStream?.append({
          type: 'skill_synthesized',
          name: improved.skill.name,
          confidence: improved.confidence,
          action: 'updated',
        });
      } else {
        report.skillsCreated.push(result);
        eventStream?.append({
          type: 'skill_synthesized',
          name: result.skill.name,
          confidence: result.confidence,
          action: 'created',
        });
      }
    }

    // 2. Synthesize a workflow from this session's tool sequence
    //    Requires: session completed, ≥10 tools used (real workflow), multi-turn session
    if (sessionDone && toolCount >= 10 && turnCount >= 2) {
      const syntheticSequence: import('./types.js').RepeatedSequence = {
        sequence: pattern.tools.sequence,
        frequency: 1,
        successRate: 1,
        avgCost: pattern.cost.totalUsd,
        domainKeywords: pattern.domain.keywords,
      };

      const result = this.workflowSynth.synthesizeFromSequence(syntheticSequence);
      const alreadyCreated = report.workflowsCreated.find(
        w => w.workflow.name === result.workflow.name,
      );
      if (!alreadyCreated) {
        report.workflowsCreated.push(result);
        eventStream?.append({
          type: 'workflow_synthesized',
          name: result.workflow.name,
          confidence: result.confidence,
          action: 'created',
        });
      }
    }

    // 3. Compose a skill pack from this session's skill usage
    //    Requires: ≥2 different skills loaded, strong domain signal
    const skillCounts = new Map<string, number>();
    for (const e of checkpoint.events) {
      if (e.type === 'skill_loaded') {
        skillCounts.set(e.skillName, (skillCounts.get(e.skillName) ?? 0) + 1);
      }
    }
    if (skillCounts.size >= 2 && domainConf > 0.6) {
      const packResult = this.packComposer.composeFromCoOccurrence(skillCounts, pattern.mode);
      if (packResult) {
        const existingPack = report.packsCreated.find(p => p.pack.name === packResult.pack.name);
        if (!existingPack) {
          report.packsCreated.push(packResult);
        }
      }
    }

    // Also recommend a pack for the detected domain cluster
    //    Requires: ≥2 skills loaded, session completed, strong domain signal
    if (skillCounts.size >= 2 && sessionDone && domainConf > 0.6) {
      const cluster: import('./types.js').DomainCluster = {
        topic: pattern.domain.topic,
        sessions: [pattern],
        keywords: pattern.domain.keywords,
        fileTypes: pattern.domain.fileTypes,
        hotPaths: pattern.domain.hotPaths,
        successRate: 1,
      };
      const clusterPack = this.packComposer.recommendForCluster(cluster);
      const alreadyCreated = report.packsCreated.find(
        p => p.pack.name === clusterPack.pack.name,
      );
      if (!alreadyCreated) {
        report.packsCreated.push(clusterPack);
      }
    }

    // 4. Write artifacts to disk
    if (this.config.autoApply) {
      await this.writeArtifacts(report);
    }

    // 5. Emit learning_completed event
    const durationMs = Date.now() - startedAt;
    eventStream?.append({
      type: 'learning_completed',
      skillsCreated: report.skillsCreated.length,
      skillsUpdated: report.skillsUpdated.length,
      workflowsCreated: report.workflowsCreated.length,
      workflowsUpdated: report.workflowsUpdated.length,
      packsCreated: report.packsCreated.length,
      durationMs,
    });

    return report;
  }

  /**
   * Get the current state of all synthesized artifacts.
   */
  async getArtifactInventory(): Promise<ArtifactInventory> {
    const skills: ArtifactInventory['skills'] = [];
    const workflows: ArtifactInventory['workflows'] = [];
    const skillPacks: ArtifactInventory['skillPacks'] = [];

    // Check skills directory
    const skillsDir = path.join(this.config.outputDir, '.chimera', 'skills');
    try {
      const files = await fs.readdir(skillsDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const stat = await fs.stat(path.join(skillsDir, file));
        skills.push({
          name: file.replace('.md', ''),
          source: 'user', // We can't easily distinguish without more metadata
          lastUpdated: stat.mtime.toISOString(),
        });
      }
    } catch {
      // Directory doesn't exist
    }

    // Check workflows directory
    const workflowsDir = path.join(this.config.outputDir, '.chimera', 'workflows');
    try {
      const files = await fs.readdir(workflowsDir);
      for (const file of files) {
        if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
        const stat = await fs.stat(path.join(workflowsDir, file));
        workflows.push({
          name: file.replace(/\.(yaml|yml)$/, ''),
          source: 'user',
          lastUpdated: stat.mtime.toISOString(),
        });
      }
    } catch {
      // Directory doesn't exist
    }

    // Check skill packs directory
    const packsDir = path.join(this.config.outputDir, '.chimera', 'skill-packs');
    try {
      const files = await fs.readdir(packsDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const stat = await fs.stat(path.join(packsDir, file));
        skillPacks.push({
          name: file.replace('.md', ''),
          source: 'user',
          lastUpdated: stat.mtime.toISOString(),
        });
      }
    } catch {
      // Directory doesn't exist
    }

    return { skills, workflows, skillPacks };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async writeArtifacts(report: LearningReport): Promise<void> {
    // Ensure directories exist
    const skillsDir = path.join(this.config.outputDir, '.chimera', 'skills');
    const workflowsDir = path.join(this.config.outputDir, '.chimera', 'workflows');
    const packsDir = path.join(this.config.outputDir, '.chimera', 'skill-packs');

    await fs.mkdir(skillsDir, { recursive: true });
    await fs.mkdir(workflowsDir, { recursive: true });
    await fs.mkdir(packsDir, { recursive: true });

    // Write new skills
    for (const result of report.skillsCreated) {
      const filePath = path.join(skillsDir, `${result.skill.name}.md`);
      const content = serializeSkillFrontmatter(result.skill, result.skill.content);
      await fs.writeFile(filePath, content, 'utf-8');
    }

    // Write updated skills
    for (const result of report.skillsUpdated) {
      const filePath = path.join(skillsDir, `${result.skill.name}.md`);
      const content = serializeSkillFrontmatter(result.skill, result.skill.content);
      await fs.writeFile(filePath, content, 'utf-8');
    }

    // Write new workflows
    for (const result of report.workflowsCreated) {
      const filePath = path.join(workflowsDir, `${result.workflow.name}.yaml`);
      const content = serializeWorkflow(result.workflow);
      await fs.writeFile(filePath, content, 'utf-8');
    }

    // Write new skill packs
    for (const result of report.packsCreated) {
      const filePath = path.join(packsDir, `${result.pack.mode}.md`);
      const content = serializeSkillPack(result.pack);
      await fs.writeFile(filePath, content, 'utf-8');
    }
  }

  private buildSkillCoOccurrence(checkpoints: SessionCheckpoint[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const cp of checkpoints) {
      const skillEvents = cp.events.filter(e => e.type === 'skill_loaded');
      for (const e of skillEvents) {
        counts.set(e.skillName, (counts.get(e.skillName) ?? 0) + 1);
      }
    }
    return counts;
  }

  private getDominantMode(checkpoints: SessionCheckpoint[]): string {
    const modeCounts: Record<string, number> = {};
    for (const cp of checkpoints) {
      modeCounts[cp.mode] = (modeCounts[cp.mode] ?? 0) + 1;
    }
    return Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'code';
  }
}
