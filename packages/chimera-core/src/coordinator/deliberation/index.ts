/**
 * Re-exports for the `DeliberationEngine` facade.
 *
 * This is the public surface of the unified engine. Callers should
 * import from `'./deliberation/index.js'` (or via the coordinator
 * barrel) rather than reaching into the sub-files.
 */

export * from './types.js';
export * from './engine.js';
