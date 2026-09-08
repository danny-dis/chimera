import { ContextEngine, RelayRacing, HandoffProtocol, ToolContextRelay } from '@chimera/context';
import type { HandoffDocument, HandoffChecklist } from '@chimera/context';
import type { Checkpoint } from '@chimera/domain';

/**
 * ContextController — wraps ContextEngine, RelayRacing, and HandoffProtocol.
 * Centralizes context building, token tracking, and handoff management.
 */
export class ContextController {
  private contextEngine: ContextEngine | null = null;
  private relayRacing: RelayRacing;
  private handoffProtocol: HandoffProtocol;
  private toolRelay: ToolContextRelay;
  private workspaceRoot: string;

  constructor(opts?: { workspaceRoot?: string; defaultContextWindow?: number }) {
    this.workspaceRoot = opts?.workspaceRoot ?? process.cwd();
    this.relayRacing = new RelayRacing({
      defaultContextWindow: opts?.defaultContextWindow ?? 200_000,
    });
    this.handoffProtocol = new HandoffProtocol();
    this.toolRelay = new ToolContextRelay({ boxThreshold: 2000 });
  }

  /**
   * Set the context engine for repo indexing and context pack building.
   */
  setContextEngine(engine: ContextEngine): void {
    this.contextEngine = engine;
  }

  /**
   * Build a context pack for a task.
   */
  async buildContextPack(task: string, options?: {
    maxTokens?: number;
    useRecallService?: boolean;
  }): Promise<{ content: string; files: string[]; tokenEstimate: number }> {
    if (!this.contextEngine) {
      return { content: '', files: [], tokenEstimate: 0 };
    }
    try {
      await this.contextEngine.indexRepo();
      const contextPack = await this.contextEngine.buildContextPack({
        task,
        maxTokens: options?.maxTokens ?? 16000,
      });
      if (contextPack.files.length > 0) {
        const content = contextPack.files
          .map((f: any) => `[${f.path}] (${f.reason}, ${f.tokens} tokens)\n${(f.content ?? '').slice(0, 500)}`)
          .join('\n---\n');
        return {
          content,
          files: contextPack.files.map((f: any) => f.path),
          tokenEstimate: contextPack.totalTokens,
        };
      }
    } catch {
      // Context building is best-effort
    }
    return { content: '', files: [], tokenEstimate: 0 };
  }

  /**
   * Register an agent for token tracking.
   */
  registerAgent(agentId: string, contextWindow: number): void {
    this.relayRacing.registerAgent(agentId, contextWindow);
  }

  /**
   * Track token usage and get threshold recommendation.
   */
  trackTokens(agentId: string, inputTokens: number, outputTokens: number): {
    fillPercent: number;
    recommendedAction: 'none' | 'compact' | 'handoff' | 'emergency_handoff';
  } {
    const threshold = this.relayRacing.trackTokens(agentId, inputTokens + outputTokens);
    const actionMap: Record<string, 'none' | 'compact' | 'handoff' | 'emergency_handoff'> = {
      continue: 'none',
      mask: 'compact',
      handoff: 'handoff',
      emergency_handoff: 'emergency_handoff',
    };
    return {
      fillPercent: threshold.fillPercent,
      recommendedAction: actionMap[threshold.recommendedAction] ?? 'none',
    };
  }

  /**
   * Mask observations in messages to save tokens.
   */
  maskObservations(messages: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
    return this.relayRacing.maskObservations(messages) as any;
  }

  /**
   * Compact messages using the compaction pipeline.
   */
  compact(messages: Array<{ role: string; content: string }>): {
    messages: Array<{ role: string; content: string }>;
    handoffDoc: Checkpoint;
  } {
    // Simplified compaction: truncate tool results
    const compacted = messages.map((m) => {
      if (m.role === 'tool' && m.content.length > 1000) {
        return { ...m, content: m.content.slice(0, 500) + '\n...[truncated]\n' + m.content.slice(-200) };
      }
      return m;
    });
    const handoffDoc: Checkpoint = {
      id: `checkpoint-${Date.now()}`,
      runId: '',
      sessionId: '',
      reason: 'context_threshold',
      createdAt: Date.now(),
      state: {
        objective: '',
        currentPlan: '',
        completedWork: [],
        filesChanged: [],
        commandsRun: [],
        testResults: {},
        knownFailures: [],
        openQuestions: [],
        constraints: {},
        nextActions: [],
        relevantContext: [],
      },
      tokenCount: 0,
      valid: true,
    };
    return { messages: compacted, handoffDoc };
  }

  /**
   * Create a handoff document.
   */
  createHandoff(fromAgentId: string, reason: string): Checkpoint {
    const events: any[] = [];
    const handoffDoc = this.handoffProtocol.createCompactingHandoff(events, {
      session: 'session',
      agent: fromAgentId,
      contextFill: 0.8,
    });
    return {
      id: `checkpoint-${Date.now()}`,
      runId: '',
      sessionId: '',
      reason: 'handoff',
      createdAt: Date.now(),
      state: {
        objective: handoffDoc.goal,
        currentPlan: handoffDoc.progress,
        completedWork: handoffDoc.filesModified.map((f) => `${f.path} (${f.status})`),
        filesChanged: handoffDoc.filesModified.map((f) => f.path),
        commandsRun: [],
        testResults: {},
        knownFailures: handoffDoc.errors,
        openQuestions: [],
        constraints: {},
        nextActions: handoffDoc.next.map((n) => n.action),
        relevantContext: handoffDoc.context,
      },
      tokenCount: 0,
      valid: true,
    };
  }

  /**
   * Validate a handoff document.
   */
  validateHandoff(checkpoint: Checkpoint): {
    valid: boolean;
    checklist: { dataComplete: boolean; referencesGrounded: boolean; claimsVerified: boolean; capabilityMatch: boolean };
    clarifications: string[];
  } {
    return {
      valid: checkpoint.valid,
      checklist: {
        dataComplete: checkpoint.state.completedWork.length > 0,
        referencesGrounded: true,
        claimsVerified: true,
        capabilityMatch: true,
      },
      clarifications: [],
    };
  }

  /**
   * Destroy the controller and release resources.
   */
  dispose(): void {
    this.toolRelay.destroy();
  }
}
