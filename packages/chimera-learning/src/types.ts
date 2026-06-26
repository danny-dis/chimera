/**
 * Shared types for the chimera-learning package.
 *
 * These types bridge the gap between session data (EventStream, Checkpoint)
 * and synthesis outputs (skills, workflows, skill packs).
 */

// ---------------------------------------------------------------------------
// Session Pattern (output of SessionAnalyzer)
// ---------------------------------------------------------------------------

/** Domain signals extracted from a session. */
export interface DomainSignal {
  /** Primary topic (e.g., "security", "database", "api", "testing"). */
  topic: string;
  /** Confidence score 0-1. */
  confidence: number;
  /** Keywords that appeared in task + tool calls + file paths. */
  keywords: string[];
  /** File extensions seen (e.g., [".ts", ".yaml", ".sql"]). */
  fileTypes: string[];
  /** Directories that were heavily accessed. */
  hotPaths: string[];
}

/** Tool usage patterns extracted from a session. */
export interface ToolPattern {
  /** Ordered sequence of unique tool calls (consecutive deduped). */
  sequence: string[];
  /** Which tools were used and how many times. */
  frequency: Record<string, number>;
  /** Tools that were denied/asked (permission friction). */
  friction: string[];
  /** Tool categories used. */
  categories: string[];
}

/** Quality outcomes extracted from a session. */
export interface QualityOutcome {
  /** Final status: done, blocked, needs_user, error. */
  status: string;
  /** Reviewer verdict if available. */
  verdict?: 'PASS' | 'FAIL' | 'NEEDS_REVISION';
  /** Number of revision cycles. */
  revisionCycles: number;
  /** What failed and why. */
  failures: Array<{ stage: string; reason: string }>;
}

/** Cost profile extracted from a session. */
export interface CostProfile {
  totalUsd: number;
  perProvider: Record<string, number>;
  /** Was this task expensive relative to complexity? */
  efficiency: 'cheap' | 'moderate' | 'expensive';
}

/** Agent behavior extracted from a session. */
export interface AgentBehavior {
  /** How many agents were spawned. */
  count: number;
  /** Which roles were used. */
  roles: string[];
  /** Were handoffs triggered? */
  handoffs: number;
}

/** A complete pattern extracted from a single session. */
export interface SessionPattern {
  sessionId: string;
  domain: DomainSignal;
  tools: ToolPattern;
  quality: QualityOutcome;
  cost: CostProfile;
  agents: AgentBehavior;
  mode: string;
  task: string;
}

// ---------------------------------------------------------------------------
// Clustered Patterns (output of SessionAnalyzer.analyzeBatch)
// ---------------------------------------------------------------------------

/** A group of sessions that share domain/tool/sequence patterns. */
export interface DomainCluster {
  /** Detected topic name (e.g., "api-design", "security-audit"). */
  topic: string;
  /** Sessions in this cluster. */
  sessions: SessionPattern[];
  /** Common keywords. */
  keywords: string[];
  /** Common file types. */
  fileTypes: string[];
  /** Common hot paths. */
  hotPaths: string[];
  /** Average success rate. */
  successRate: number;
}

/** A repeated tool sequence across sessions. */
export interface RepeatedSequence {
  /** The tool call sequence. */
  sequence: string[];
  /** How many sessions used this pattern. */
  frequency: number;
  /** Average success rate. */
  successRate: number;
  /** Average cost. */
  avgCost: number;
  /** Associated domain keywords. */
  domainKeywords: string[];
}

/** Batch analysis result. */
export interface ClusteredPatterns {
  byDomain: Map<string, SessionPattern[]>;
  bySequence: Map<string, SessionPattern[]>;
  byOutcome: Map<string, SessionPattern[]>;
  domainClusters: DomainCluster[];
  repeatedSequences: RepeatedSequence[];
}

// ---------------------------------------------------------------------------
// Synthesis Outputs
// ---------------------------------------------------------------------------

/** The shape of a synthesized skill. */
export interface SynthesizedSkill {
  name: string;
  description: string;
  content: string;
  specialization?: SkillSpecialization;
}

/** Specialization directives for a synthesized skill. */
export interface SkillSpecialization {
  tools?: {
    categories?: string[];
    include?: string[];
    exclude?: string[];
  };
  context?: {
    include?: string[];
    exclude?: string[];
  };
  modelTier?: 'cheap' | 'mid' | 'frontier';
  role?: 'writer' | 'reviewer' | 'challenger' | 'synthesizer' | 'planner';
  workflow?: string;
  systemPrompt?: string;
}

/** Whether a synthesis created or updated an artifact. */
export type SynthesisAction = 'create' | 'update';

/** A skill synthesis result. */
export interface SkillSynthesisResult {
  skill: SynthesizedSkill;
  action: SynthesisAction;
  confidence: number;
  sourceSessionIds: string[];
}

/** The shape of a synthesized workflow. */
export interface SynthesizedWorkflow {
  name: string;
  description: string;
  steps: Array<{
    id: string;
    kind: 'llm' | 'tool' | 'parallel' | 'sequence' | 'gate' | 'loop';
    config: Record<string, unknown>;
    required?: boolean;
  }>;
  tags: string[];
}

/** A workflow synthesis result. */
export interface WorkflowSynthesisResult {
  workflow: SynthesizedWorkflow;
  action: SynthesisAction;
  confidence: number;
  sourceSessionIds: string[];
}

/** A synthesized skill pack. */
export interface SynthesizedSkillPack {
  name: string;
  description: string;
  mode: string;
  skills: string[];
}

/** A skill pack synthesis result. */
export interface SkillPackSynthesisResult {
  pack: SynthesizedSkillPack;
  action: SynthesisAction;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Improvement Signals
// ---------------------------------------------------------------------------

/** Types of improvement issues. */
export type IssueType =
  | 'skill-not-followed'
  | 'workflow-deviation'
  | 'tool-friction'
  | 'cost-inefficient'
  | 'quality-failure';

/** A specific improvement issue detected. */
export interface ImprovementIssue {
  type: IssueType;
  description: string;
  evidence: string;
  severity: 'low' | 'medium' | 'high';
}

/** An improvement signal for an artifact. */
export interface ImprovementSignal {
  artifact: { type: 'skill' | 'workflow' | 'skill-pack'; name: string };
  sessions: SessionPattern[];
  issues: ImprovementIssue[];
}

// ---------------------------------------------------------------------------
// Learning Config & Report
// ---------------------------------------------------------------------------

/** Configuration for the learning engine. */
export interface LearningConfig {
  /** Where to find session checkpoints. */
  sessionDir: string;
  /** Where to write generated artifacts. */
  outputDir: string;
  /** Whether to auto-apply improvements or just suggest. */
  autoApply: boolean;
  /** Minimum sessions required to auto-generate an artifact. */
  minSessionsThreshold: number;
}

/** The full report from a learning run. */
export interface LearningReport {
  skillsCreated: SkillSynthesisResult[];
  skillsUpdated: SkillSynthesisResult[];
  workflowsCreated: WorkflowSynthesisResult[];
  workflowsUpdated: WorkflowSynthesisResult[];
  packsCreated: SkillPackSynthesisResult[];
  packsUpdated: SkillPackSynthesisResult[];
  improvementsApplied: ImprovementSignal[];
  sessionsAnalyzed: number;
  completedAt: string;
}

/** Inventory of all synthesized artifacts. */
export interface ArtifactInventory {
  skills: Array<{ name: string; source: 'bundled' | 'synthesized' | 'user'; lastUpdated: string }>;
  workflows: Array<{ name: string; source: 'bundled' | 'synthesized' | 'user'; lastUpdated: string }>;
  skillPacks: Array<{ name: string; source: 'synthesized' | 'user'; lastUpdated: string }>;
}
