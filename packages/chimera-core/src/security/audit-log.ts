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
export class AuditLog {
  private entries: AuditEntry[] = [];
  private storagePath: string | null;

  constructor(storagePath?: string) {
    this.storagePath = storagePath ?? null;
    if (this.storagePath) {
      this.loadFromDisk();
    }
  }

  /**
   * Append a new audit entry. Returns the entry id.
   */
  log(params: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const entry: AuditEntry = {
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
  logToolCall(params: {
    sessionId: string;
    tool: string;
    paramsHash: string;
    userApproved: boolean;
    tokenCost: number;
    details?: Record<string, unknown>;
  }): AuditEntry {
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
  logLLMCall(params: {
    sessionId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    tokenCost: number;
    details?: Record<string, unknown>;
  }): AuditEntry {
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
  logSecurityEvent(params: {
    sessionId: string;
    event: string;
    confidence: number;
    flags: string[];
    details?: Record<string, unknown>;
  }): AuditEntry {
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
  query(filter?: AuditQuery): AuditEntry[] {
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
      results = results.filter((e) => e.timestamp >= filter.since!);
    }
    if (filter?.until) {
      results = results.filter((e) => e.timestamp <= filter.until!);
    }

    const limit = filter?.limit ?? 100;
    return results.slice(-limit);
  }

  /**
   * Get total token cost for a session.
   */
  sessionCost(sessionId: string): number {
    return this.entries
      .filter((e) => e.sessionId === sessionId)
      .reduce((sum, e) => sum + e.tokenCost, 0);
  }

  /**
   * Get count of entries.
   */
  size(): number {
    return this.entries.length;
  }

  /**
   * Export entries as JSON.
   */
  export(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  private saveToDisk(): void {
    if (!this.storagePath) return;
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.storagePath, JSON.stringify(this.entries), 'utf-8');
    } catch {
      // Silent fail — audit log should not crash the system
    }
  }

  private loadFromDisk(): void {
    if (!this.storagePath) return;
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.storagePath)) return;
      const data = fs.readFileSync(this.storagePath, 'utf-8');
      this.entries = JSON.parse(data);
    } catch {
      this.entries = [];
    }
  }
}
