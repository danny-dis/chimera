"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = logEvent;
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
function logEvent(domain, action, state) {
    return `${domain}.${action}_${state}`;
}
//# sourceMappingURL=event-name.js.map