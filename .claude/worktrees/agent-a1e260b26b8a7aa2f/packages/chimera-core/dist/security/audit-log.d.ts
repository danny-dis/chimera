/**
 * Immutable append-only audit log for all CHIMERA actions.
 * Every tool call, LLM interaction, and state change is recorded.
 */
export interface AuditEntry {
    id: string;
    timestamp: number;
    sessionId: string;
    actionType: 'tool_call' | 'llm_call' | 'state_change' | 'security_event' | 'memory_write';
    tool?: string;
    paramsHash?: string;
    userApproved: boolean;
    tokenCost: number;
    details: Record<string, unknown>;
}
export interface AuditQuery {
    sessionId?: string;
    actionType?: AuditEntry['actionType'];
    tool?: string;
    since?: number;
    until?: number;
    limit?: number;
}
/**
 * Append-only in-memory audit log with disk persistence.
 */
export declare class AuditLog {
    private entries;
    private storagePath;
    constructor(storagePath?: string);
    /**
     * Append a new audit entry. Returns the entry id.
     */
    log(params: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry;
    /**
     * Log a tool call.
     */
    logToolCall(params: {
        sessionId: string;
        tool: string;
        paramsHash: string;
        userApproved: boolean;
        tokenCost: number;
        details?: Record<string, unknown>;
    }): AuditEntry;
    /**
     * Log an LLM interaction.
     */
    logLLMCall(params: {
        sessionId: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        tokenCost: number;
        details?: Record<string, unknown>;
    }): AuditEntry;
    /**
     * Log a security event (injection detected, permission denied, etc).
     */
    logSecurityEvent(params: {
        sessionId: string;
        event: string;
        confidence: number;
        flags: string[];
        details?: Record<string, unknown>;
    }): AuditEntry;
    /**
     * Query audit entries.
     */
    query(filter?: AuditQuery): AuditEntry[];
    /**
     * Get total token cost for a session.
     */
    sessionCost(sessionId: string): number;
    /**
     * Get count of entries.
     */
    size(): number;
    /**
     * Export entries as JSON.
     */
    export(): string;
    private saveToDisk;
    private loadFromDisk;
}
//# sourceMappingURL=audit-log.d.ts.map