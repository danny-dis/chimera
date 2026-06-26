/**
 * Hooks subsystem barrel exports.
 */

export { HookExecutor, type HookExecutorOptions } from './executor.js';
export {
  HookEventSchema,
  HookDefinitionSchema,
  type HookEvent,
  type HookDefinition,
  type HookContext,
  type HookResult,
} from './schema.js';
