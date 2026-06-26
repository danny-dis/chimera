"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetLogCacheForTests = void 0;
exports.getWorkflowEventEmitter = getWorkflowEventEmitter;
exports.resetWorkflowEventEmitter = resetWorkflowEventEmitter;
/**
 * WorkflowEventEmitter - typed event emitter for workflow execution observability.
 *
 * Lives in @chimera/workflows so the executor can emit events.
 *
 * Design:
 * - Singleton pattern via getWorkflowEventEmitter()
 * - Fire-and-forget: listener errors never propagate to the executor
 * - Conversation-scoped subscriptions via registerRun() mapping
 */
const events_1 = require("events");
const logger_utils_js_1 = require("../logger-utils.js");
const { getLog, resetLog } = (0, logger_utils_js_1.createLazyLogger)('workflow.emitter');
exports.resetLogCacheForTests = resetLog;
/**
 * Maximum size of the conversationMap before oldest entries are pruned.
 * Configurable via CHIMERA_CONVERSATION_MAP_MAX_SIZE environment variable.
 */
const CONVERSATION_MAP_MAX_SIZE = (() => {
    const parsed = parseInt(process.env.CHIMERA_CONVERSATION_MAP_MAX_SIZE ?? '10000', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
})();
const WORKFLOW_EVENT = 'workflow_event';
class WorkflowEventEmitter {
    emitter = new events_1.EventEmitter();
    conversationMap = new Map(); // runId -> conversationId
    constructor() {
        // Allow many subscribers (adapters, DB persistence, tests, etc.)
        this.emitter.setMaxListeners(50);
    }
    /**
     * Register a run-to-conversation mapping so subscribers can filter by conversation.
     */
    registerRun(runId, conversationId) {
        // Prune oldest entries if map exceeds configured limit
        if (this.conversationMap.size >= CONVERSATION_MAP_MAX_SIZE) {
            this.pruneOldestEntries();
        }
        this.conversationMap.set(runId, conversationId);
    }
    /**
     * Remove the run-to-conversation mapping (called at workflow end).
     */
    unregisterRun(runId) {
        this.conversationMap.delete(runId);
    }
    /**
     * Remove oldest entries when map exceeds size limit.
     * Map iteration order is insertion order, so deleting the first entries
     * removes the oldest (most likely stale) entries.
     */
    pruneOldestEntries() {
        const entriesToDelete = Math.ceil(CONVERSATION_MAP_MAX_SIZE * 0.1); // Remove 10%
        let deleted = 0;
        for (const key of this.conversationMap.keys()) {
            if (deleted >= entriesToDelete)
                break;
            this.conversationMap.delete(key);
            deleted++;
        }
        getLog().warn({ pruned: deleted, remaining: this.conversationMap.size, limit: CONVERSATION_MAP_MAX_SIZE }, 'event_emitter.conversation_map_pruned');
    }
    /**
     * Get the conversation ID for a given run.
     */
    getConversationId(runId) {
        return this.conversationMap.get(runId);
    }
    /**
     * Emit a workflow event. Fire-and-forget: listener errors are caught and logged.
     */
    emit(event) {
        try {
            this.emitter.emit(WORKFLOW_EVENT, event);
        }
        catch (error) {
            getLog().error({ err: error, eventType: event.type }, 'event_emit_failed');
        }
    }
    /**
     * Subscribe to all workflow events. Returns an unsubscribe function.
     */
    subscribe(listener) {
        // Wrap listener to catch errors - listener failures must not propagate
        const safeListener = (event) => {
            try {
                listener(event);
            }
            catch (error) {
                getLog().error({ err: error, eventType: event.type }, 'event_listener_error');
            }
        };
        this.emitter.on(WORKFLOW_EVENT, safeListener);
        return () => {
            this.emitter.removeListener(WORKFLOW_EVENT, safeListener);
        };
    }
    /**
     * Subscribe to events for a specific conversation only. Returns unsubscribe function.
     */
    subscribeForConversation(conversationId, listener) {
        return this.subscribe((event) => {
            const eventConversationId = this.conversationMap.get(event.runId);
            if (eventConversationId === conversationId) {
                listener(event);
            }
        });
    }
}
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let instance = null;
function getWorkflowEventEmitter() {
    if (!instance) {
        instance = new WorkflowEventEmitter();
    }
    return instance;
}
/**
 * Reset singleton for testing.
 */
function resetWorkflowEventEmitter() {
    instance = null;
}
//# sourceMappingURL=event-emitter.js.map