import { checkUserInput } from '../security/prompt-guard.js';
import { AuditLog } from '../security/audit-log.js';
import type { RateLimiter } from '@chimera/providers';
import type { ToolPermission } from '../types/tool-permission.js';

/**
 * PolicyController — security policy, rate limiting, and audit logging.
 * Centralizes all security decisions that were scattered across SessionOrchestrator.
 */
export class PolicyController {
  private rateLimiter: RateLimiter | null = null;
  private auditLog: AuditLog;

  constructor(opts?: { rateLimiter?: RateLimiter; auditLog?: AuditLog }) {
    this.rateLimiter = opts?.rateLimiter ?? null;
    this.auditLog = opts?.auditLog ?? new AuditLog();
  }

  /**
   * Check user input for prompt injection.
   */
  checkSecurity(input: string): {
    safe: boolean;
    confidence: number;
    flags: string[];
  } {
    const result = checkUserInput(input);
    return {
      safe: result.safe,
      confidence: result.confidence,
      flags: result.flags,
    };
  }

  /**
   * Enforce rate limit for estimated tokens.
   */
  async enforceRateLimit(estimatedTokens: number): Promise<void> {
    if (this.rateLimiter) {
      await this.rateLimiter.acquire(estimatedTokens);
    }
  }

  /**
   * Log a security event to the audit log.
   */
  logSecurityEvent(
    event: string,
    confidence: number,
    flags: string[],
    details?: Record<string, unknown>,
  ): void {
    this.auditLog.log({
      sessionId: details?.sessionId as string ?? 'unknown',
      actionType: 'security_event',
      userApproved: false,
      tokenCost: 0,
      details: { event, confidence, flags, ...details },
    });
  }

  /**
   * Determine permission decision for an action.
   */
  getPermissionDecision(
    action: string,
    context: Record<string, unknown>,
  ): ToolPermission {
    // Default policy: allow read operations, ask for dangerous ones
    const dangerousActions = ['shell.execute', 'filesystem.write', 'git.push', 'network.http'];
    if (dangerousActions.includes(action)) {
      return 'ask';
    }
    return 'allow';
  }

  /**
   * Check if a task is conversational (simple question, no coding needed).
   */
  isConversationalTask(task: string): boolean {
    const lower = task.toLowerCase().trim();
    const conversationalPatterns = [
      /^what is/i,
      /^how do i/i,
      /^how to/i,
      /^why does/i,
      /^explain/i,
      /^describe/i,
      /^help me understand/i,
      /^can you explain/i,
      /^difference between/i,
    ];
    return conversationalPatterns.some((p) => p.test(lower));
  }

  getAuditLog(): AuditLog {
    return this.auditLog;
  }
}
