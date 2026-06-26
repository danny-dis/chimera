"use strict";
/**
 * Immutable append-only audit log for all CHIMERA actions.
 * Every tool call, LLM interaction, and state change is recorded.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = void 0;
/**
 * Append-only in-memory audit log with disk persistence.
 */
class AuditLog {
    entries = [];
    storagePath;
    constructor(storagePath) {
        this.storagePath = storagePath ?? null;
        if (this.storagePath) {
            this.loadFromDisk();
        }
    }
    /**
     * Append a new audit entry. Returns the entry id.
     */
    log(params) {
        const entry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            ...params,
        };
        this.entries.push(entry);
        this.saveToDisk();
        return entry;
    }
    /**
     * Log a tool call.
     */
    logToolCall(params) {
        return this.log({
            sessionId: params.sessionId,
            actionType: 'tool_call',
            tool: params.tool,
            paramsHash: params.paramsHash,
            userApproved: params.userApproved,
            tokenCost: params.tokenCost,
            details: params.details ?? {},
        });
    }
    /**
     * Log an LLM interaction.
     */
    logLLMCall(params) {
        return this.log({
            sessionId: params.sessionId,
            actionType: 'llm_call',
            userApproved: true,
            tokenCost: params.tokenCost,
            details: {
                model: params.model,
                inputTokens: params.inputTokens,
                outputTokens: params.outputTokens,
                ...params.details,
            },
        });
    }
    /**
     * Log a security event (injection detected, permission denied, etc).
     */
    logSecurityEvent(params) {
        return this.log({
            sessionId: params.sessionId,
            actionType: 'security_event',
            userApproved: false,
            tokenCost: 0,
            details: {
                event: params.event,
                confidence: params.confidence,
                flags: params.flags,
                ...params.details,
            },
        });
    }
    /**
     * Query audit entries.
     */
    query(filter) {
        let results = this.entries;
        if (filter?.sessionId) {
            results = results.filter((e) => e.sessionId === filter.sessionId);
        }
        if (filter?.actionType) {
            results = results.filter((e) => e.actionType === filter.actionType);
        }
        if (filter?.tool) {
            results = results.filter((e) => e.tool === filter.tool);
        }
        if (filter?.since) {
            results = results.filter((e) => e.timestamp >= filter.since);
        }
        if (filter?.until) {
            results = results.filter((e) => e.timestamp <= filter.until);
        }
        const limit = filter?.limit ?? 100;
        return results.slice(-limit);
    }
    /**
     * Get total token cost for a session.
     */
    sessionCost(sessionId) {
        return this.entries
            .filter((e) => e.sessionId === sessionId)
            .reduce((sum, e) => sum + e.tokenCost, 0);
    }
    /**
     * Get count of entries.
     */
    size() {
        return this.entries.length;
    }
    /**
     * Export entries as JSON.
     */
    export() {
        return JSON.stringify(this.entries, null, 2);
    }
    saveToDisk() {
        if (!this.storagePath)
            return;
        try {
            const fs = require('fs');
            const path = require('path');
            const dir = path.dirname(this.storagePath);
            if (!fs.existsSync(dir))
                fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.storagePath, JSON.stringify(this.entries), 'utf-8');
        }
        catch {
            // Silent fail — audit log should not crash the system
        }
    }
    loadFromDisk() {
        if (!this.storagePath)
            return;
        try {
            const fs = require('fs');
            if (!fs.existsSync(this.storagePath))
                return;
            const data = fs.readFileSync(this.storagePath, 'utf-8');
            this.entries = JSON.parse(data);
        }
        catch {
            this.entries = [];
        }
    }
}
exports.AuditLog = AuditLog;
//# sourceMappingURL=audit-log.js.map