// =============================================================================
// ServiceContainer — bundles all domain services for orchestrator delegation.
// Allows SessionOrchestrator to become a thin facade coordinating
// independent services instead of owning their internal logic.
// =============================================================================

import type { SessionStateStore } from './session-state-store.js';
import type { BudgetController } from './budget-controller.js';
import type { EventBus } from './event-bus.js';
import type { PolicyController } from './policy-controller.js';
import type { ToolController } from './tool-controller.js';
import type { ContextController } from './context-controller.js';
import type { AgentRegistry } from './agent-registry.js';
import type { ModelSelector } from './model-selector.js';
import type { VerificationController } from './verification-controller.js';
import type { CheckpointManager } from './checkpoint-manager.js';
import type { RoleComposer } from './role-composition.js';
import type { MultiProviderHealthMonitor } from './provider-health-monitor.js';
import type { DurableExecution } from './durable-execution.js';

export interface ServiceContainer {
  readonly sessionState: SessionStateStore;
  readonly budget: BudgetController;
  readonly events: EventBus;
  readonly policy: PolicyController;
  readonly tools: ToolController;
  readonly context: ContextController;
  readonly agents: AgentRegistry;
  readonly models: ModelSelector;
  readonly verification: VerificationController;
  readonly checkpoints: CheckpointManager;
  readonly roles: RoleComposer;
  readonly health: MultiProviderHealthMonitor;
  readonly durable: DurableExecution;
}
