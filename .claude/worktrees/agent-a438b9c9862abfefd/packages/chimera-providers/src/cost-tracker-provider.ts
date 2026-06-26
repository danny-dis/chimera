import { ModelRegistry } from './model-registry.js';
import { CostBreakdown } from './cost-calculator.js';

export interface CostSession {
  id: string;
  startTime: Date;
  modelId: string;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  callCount: number;
}

interface DailyTotal {
  date: string;
  modelTotals: Map<string, number>;
  grandTotal: number;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class ProviderCostTracker {
  private sessions: Map<string, CostSession> = new Map();
  private dailyTotals: Map<string, DailyTotal> = new Map();

  constructor(private registry: ModelRegistry) {}

  startSession(modelId: string): string {
    const model = this.registry.get(modelId);
    if (!model) {
      throw new Error(`Model not found in registry: ${modelId}`);
    }

    const id = generateSessionId();
    const session: CostSession = {
      id,
      startTime: new Date(),
      modelId,
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      callCount: 0,
    };
    this.sessions.set(id, session);
    return id;
  }

  recordCall(sessionId: string, tokens: { input: number; output: number }): CostBreakdown {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const model = this.registry.get(session.modelId);
    if (!model) {
      throw new Error(`Model not found in registry: ${session.modelId}`);
    }

    const inputCost = (tokens.input / 1_000_000) * model.pricing.inputPerMillion;
    const outputCost = (tokens.output / 1_000_000) * model.pricing.outputPerMillion;
    const callCost = inputCost + outputCost;

    session.totalCost += callCost;
    session.totalInputTokens += tokens.input;
    session.totalOutputTokens += tokens.output;
    session.callCount += 1;

    const dayKey = todayKey();
    let daily = this.dailyTotals.get(dayKey);
    if (!daily) {
      daily = { date: dayKey, modelTotals: new Map(), grandTotal: 0 };
      this.dailyTotals.set(dayKey, daily);
    }

    const modelDaily = daily.modelTotals.get(session.modelId) ?? 0;
    daily.modelTotals.set(session.modelId, modelDaily + callCost);
    daily.grandTotal += callCost;

    return {
      inputCost,
      outputCost,
      cacheReadCost: 0,
      cacheWriteCost: 0,
      totalCost: callCost,
      tokenCount: {
        input: tokens.input,
        output: tokens.output,
        cacheRead: 0,
        cacheWrite: 0,
      },
    };
  }

  getSessionCost(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session.totalCost;
  }

  getDayTotal(modelId: string): number {
    const daily = this.dailyTotals.get(todayKey());
    if (!daily) return 0;
    return daily.modelTotals.get(modelId) ?? 0;
  }

  getDayTotalAll(): number {
    const daily = this.dailyTotals.get(todayKey());
    if (!daily) return 0;
    return daily.grandTotal;
  }

  resetDay(): void {
    this.dailyTotals.delete(todayKey());
  }

  getSession(sessionId: string): CostSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): CostSession[] {
    return Array.from(this.sessions.values());
  }
}
