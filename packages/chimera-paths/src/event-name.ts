/**
 * Canonical log states used in the `{domain}.{action}_{state}` event convention.
 *
 * The convention pairs every `_started` event with a matching `_completed` or
 * `_failed` event, and reserves a small set of verb-form states for one-shot
 * events (validation, lookup, registration, etc.).
 *
 * Add new states here when introducing a new event family; keep the list
 * intentionally short to encourage convention adherence.
 */
export type LogState =
  | 'started'
  | 'completed'
  | 'failed'
  | 'validated'
  | 'rejected'
  | 'selected'
  | 'registered'
  | 'received'
  | 'loaded'
  | 'discovered'
  | 'adopted'
  | 'pruned'
  | 'applied'
  | 'detected'
  | 'created'
  | 'destroyed'
  | 'updated'
  | 'initialized'
  | 'skipped';

/**
 * Build a log event name in the `{domain}.{action}_{state}` convention.
 *
 *   logEvent('session', 'create', 'started')   -> 'session.create_started'
 *   logEvent('isolation', 'worktree', 'create_failed')  -> 'isolation.worktree_create_failed'
 *   logEvent('provider', 'select', 'completed') -> 'provider.select_completed'
 *
 * Callers should use the {@link LogState} type to keep the verb inventory
 * narrow. The function itself does not validate the inputs — it just joins
 * them — so producers stay untyped at the call site when they need a custom
 * state.
 */
export function logEvent(domain: string, action: string, state: string): string {
  return `${domain}.${action}_${state}`;
}
