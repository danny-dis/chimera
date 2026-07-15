// @chimera/learning — Self-improvement engine: session analysis → skill/workflow synthesis

export { SessionAnalyzer } from './session-analyzer.js';
export { SkillSynthesizer } from './skill-synthesizer.js';
export type { SkillSynthesizerConfig } from './skill-synthesizer.js';
export { WorkflowSynthesizer } from './workflow-synthesizer.js';
export { SkillPackComposer } from './skill-pack-composer.js';
export type { SkillPackComposerConfig } from './skill-pack-composer.js';
export { ArtifactImprover } from './artifact-improver.js';
export { LearningEngine } from './learning-engine.js';
export { AutoSkillService } from './auto-skill-service.js';
export type { AutoSkillConfig, AutoSkillResult } from './auto-skill-service.js';

// Adaptive onboarding & guidance (skill-signal scoring + tiered surfacing)
export { UserSkillModel, skillTierFromCli } from './user-skill-model.js';
export type {
  SkillTier,
  ExplainDepth,
  SkillOverride,
  SkillSignal,
  SkillAuditEntry,
  ObservedCapability,
} from './user-skill-model.js';
export {
  tierMessage,
  depthMessage,
  suggestNextValue,
  CAPABILITY_TIPS,
} from './guidance.js';
export type { TieredMessage, CapabilityTip, ValueSuggestion } from './guidance.js';

// Types
export type {
  SessionPattern,
  DomainSignal,
  ToolPattern,
  QualityOutcome,
  CostProfile,
  AgentBehavior,
  ClusteredPatterns,
  DomainCluster,
  RepeatedSequence,
  SynthesizedSkill,
  SkillSpecialization,
  SynthesisAction,
  SkillSynthesisResult,
  SynthesizedWorkflow,
  WorkflowSynthesisResult,
  SynthesizedSkillPack,
  SkillPackSynthesisResult,
  ImprovementIssue,
  ImprovementSignal,
  LearningConfig,
  LearningReport,
  ArtifactInventory,
} from './types.js';
