import { ProviderCostTracker } from './cost-tracker-provider.js';

export interface CostProjection {
  projectedTotal: number;
  projectedRemaining: number;
  confidence: 'low' | 'medium' | 'high';
  basedOnCalls: number;
  averageCostPerCall: number;
  trend: 'increasing' | 'stable' | 'decreasing';
}

interface CallRecord {
  cost: number;
  timestamp: Date;
}

export class CostProjectionEngine {
  private callHistory: Map<string, CallRecord[]> = new Map();

  constructor(private costTracker: ProviderCostTracker) {}

  project(sessionId: string, estimatedRemainingCalls: number): CostProjection {
    const session = this.costTracker.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const history = this.callHistory.get(sessionId) ?? [];

    if (history.length === 0) {
      return {
        projectedTotal: session.totalCost,
        projectedRemaining: 0,
        confidence: 'low',
        basedOnCalls: 0,
        averageCostPerCall: 0,
        trend: 'stable',
      };
    }

    const averageCostPerCall = session.totalCost / session.callCount;
    const projectedRemaining = averageCostPerCall * estimatedRemainingCalls;
    const projectedTotal = session.totalCost + projectedRemaining;

    const confidence = this.computeConfidence(history.length);
    const trend = this.computeTrend(history);

    return {
      projectedTotal,
      projectedRemaining,
      confidence,
      basedOnCalls: session.callCount,
      averageCostPerCall,
      trend,
    };
  }

  projectToBudget(
    sessionId: string,
    budget: number,
  ): { willExceed: boolean; atCall: number; projectedCost: number } {
    const session = this.costTracker.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.callCount === 0) {
      return { willExceed: false, atCall: 0, projectedCost: 0 };
    }

    const averageCostPerCall = session.totalCost / session.callCount;
    if (averageCostPerCall <= 0) {
      return { willExceed: false, atCall: 0, projectedCost: session.totalCost };
    }

    const remainingBudget = budget - session.totalCost;
    if (remainingBudget <= 0) {
      return { willExceed: true, atCall: 0, projectedCost: session.totalCost };
    }

    const callsUntilExceed = Math.ceil(remainingBudget / averageCostPerCall);
    const projectedCost = session.totalCost + averageCostPerCall * callsUntilExceed;

    return {
      willExceed: projectedCost > budget,
      atCall: session.callCount + callsUntilExceed,
      projectedCost,
    };
  }

  recordCall(sessionId: string, cost: number): void {
    let history = this.callHistory.get(sessionId);
    if (!history) {
      history = [];
      this.callHistory.set(sessionId, history);
    }
    history.push({ cost, timestamp: new Date() });
  }

  private computeConfidence(callCount: number): 'low' | 'medium' | 'high' {
    if (callCount >= 10) return 'high';
    if (callCount >= 3) return 'medium';
    return 'low';
  }

  private computeTrend(history: CallRecord[]): 'increasing' | 'stable' | 'decreasing' {
    if (history.length < 3) return 'stable';

    const recent = history.slice(-3);
    const older = history.slice(0, Math.ceil(history.length / 2));

    const recentAvg = recent.reduce((sum, r) => sum + r.cost, 0) / recent.length;
    const olderAvg = older.reduce((sum, r) => sum + r.cost, 0) / older.length;

    if (olderAvg === 0) return 'stable';

    const ratio = recentAvg / olderAvg;
    if (ratio > 1.2) return 'increasing';
    if (ratio < 0.8) return 'decreasing';
    return 'stable';
  }
}
