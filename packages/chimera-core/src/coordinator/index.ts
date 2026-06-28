export { CoordinatorEngine } from './coordinator-engine.js';
export { TaskDecomposer } from './task-decomposer.js';
export { SubAgentSpawner } from './sub-agent-spawner.js';
export { ResultAggregator } from './result-aggregator.js';
export type {
  SubTask,
  SubTaskResult,
  DecompositionResult,
  AggregatedResult,
  Conflict,
  CoordinatorConfig,
  SubTaskType,
  ModelCapability,
  ModelPool,
} from './types.js';
export { DeliberationEngine } from './deliberation/index.js';
export type { DeliberationResult, DeliberationConfig } from './deliberation/index.js';
export { FusionExecutor } from './fusion-executor.js';
export type { FusionConfig, FusionResultV2, FusionAnalysis, FusionPanelResult } from './fusion-executor.js';
export { BiomeLinter } from './biome-linter.js';
export type { BiomeLinterConfig } from './biome-linter.js';

// Cross-vendor review enforcement
export {
  extractVendor,
  areSameVendor,
  findCrossVendorReviewer,
  assignCrossVendorProviders,
  validateCrossVendorReview,
} from './cross-vendor-review.js';

// Purpose guard — every sub-agent must declare purpose
export {
  validatePurpose,
  getAllowedToolsForPurpose,
  getRecommendedTierForPurpose,
  ALLOWED_PURPOSES,
} from './purpose-guard.js';
export type { SubAgentPurpose, PurposeGuardResult } from './purpose-guard.js';
