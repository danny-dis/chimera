// @chimera/context — Context engine and relay racing

export { ContextEngine } from './context-engine.js';
export type { ContextEngineConfig } from './context-engine.js';
export { TfIdfEmbeddingProvider } from './embedding-provider.js';
export type { EmbeddingProvider } from './embedding-provider.js';
export { VectorStore } from './vector-store.js';
export { RelayRacing } from './relay-racing.js';
export { HandoffProtocol } from './handoff-protocol.js';
export type { HandoffProposal } from './handoff-protocol.js';
export { ToolContextRelay } from './tool-context-relay.js';
export type { BoxedPayload, RelayReference } from './tool-context-relay.js';
export { ContextBudget } from './context-budget.js';
export type {
  ContextLayer,
  BudgetAllocation,
  BudgetReport,
} from './context-budget.js';

export {
  runCompactionPipeline,
  applyToolResultBudget,
  snipCompact,
  microCompact,
  contextCollapse,
} from './compaction/index.js';
export type { CompactionPipelineResult } from './compaction/index.js';

// Shared types (also re-exported by @chimera/core for backwards compat)
export type {
  ChimeraEvent,
  HandoffDocument,
  HandoffChecklist,
  HandoffDelta,
} from './types.js';

// Output-ref resolver (for $nodeId.output.field references)
export { resolveNodeOutputField, OutputRefError, declaredFieldsFromSchema } from './output-ref.js';
export type {
  NodeOutput,
  NodeOutputState,
  FieldResolution,
  OutputRefErrorReason,
} from './output-ref.js';
