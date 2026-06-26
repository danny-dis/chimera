export interface ContextLayer {
  name: string;
  priority: number;
  tokenCount: number;
  maxTokens: number;
  minTokens: number;
  compressed?: boolean;
}

export interface BudgetAllocation {
  layer: string;
  allocated: number;
  used: number;
  utilization: number;
  status: 'ok' | 'near_limit' | 'over_limit' | 'compressed';
}

export interface BudgetReport {
  totalAllocated: number;
  totalUsed: number;
  totalBudget: number;
  utilization: number;
  layers: BudgetAllocation[];
  recommendations: string[];
}

const DEFAULT_LAYERS: Array<{
  name: string;
  priority: number;
  maxTokens: number;
  minTokens: number;
}> = [
  { name: 'system', priority: 1, maxTokens: 2000, minTokens: 500 },
  { name: 'instructions', priority: 2, maxTokens: 4000, minTokens: 1000 },
  { name: 'tools', priority: 3, maxTokens: 6000, minTokens: 2000 },
  { name: 'retrieval', priority: 4, maxTokens: 30000, minTokens: 2000 },
  { name: 'history', priority: 5, maxTokens: 80000, minTokens: 5000 },
];

function getLayerStatus(
  utilization: number,
  compressed: boolean,
): BudgetAllocation['status'] {
  if (compressed) return 'compressed';
  if (utilization >= 1.0) return 'over_limit';
  if (utilization >= 0.85) return 'near_limit';
  return 'ok';
}

export class ContextBudget {
  private layers: Map<string, ContextLayer> = new Map();
  private totalBudget: number;

  constructor(params: {
    totalBudget: number;
    layers?: Array<{
      name: string;
      priority: number;
      maxTokens: number;
      minTokens?: number;
    }>;
  }) {
    this.totalBudget = params.totalBudget;

    const layerDefs = params.layers ?? DEFAULT_LAYERS;
    for (const def of layerDefs) {
      this.layers.set(def.name, {
        name: def.name,
        priority: def.priority,
        tokenCount: 0,
        maxTokens: def.maxTokens,
        minTokens: def.minTokens ?? Math.floor(def.maxTokens * 0.25),
        compressed: false,
      });
    }
  }

  registerLayer(layer: ContextLayer): void {
    this.layers.set(layer.name, layer);
  }

  updateLayer(name: string, tokenCount: number): void {
    const layer = this.layers.get(name);
    if (!layer) throw new Error(`Layer "${name}" not registered`);
    layer.tokenCount = tokenCount;
    layer.compressed = false;
  }

  getAllocation(): BudgetAllocation[] {
    const allocations: BudgetAllocation[] = [];

    for (const [, layer] of this.layers) {
      const allocated = layer.maxTokens;
      const used = layer.tokenCount;
      const utilization = allocated > 0 ? used / allocated : 0;

      allocations.push({
        layer: layer.name,
        allocated,
        used,
        utilization,
        status: getLayerStatus(utilization, layer.compressed ?? false),
      });
    }

    return allocations;
  }

  getReport(): BudgetReport {
    const allocations = this.getAllocation();
    let totalAllocated = 0;
    let totalUsed = 0;

    for (const a of allocations) {
      totalAllocated += a.allocated;
      totalUsed += a.used;
    }

    const utilization = totalAllocated > 0 ? totalUsed / totalAllocated : 0;
    const recommendations = this.buildRecommendations(allocations);

    return {
      totalAllocated,
      totalUsed,
      totalBudget: this.totalBudget,
      utilization,
      layers: allocations,
      recommendations,
    };
  }

  availableTokens(): number {
    let used = 0;
    for (const [, layer] of this.layers) {
      used += layer.tokenCount;
    }
    return Math.max(0, this.totalBudget - used);
  }

  compressLayer(
    name: string,
    targetTokens: number,
  ): { freed: number; compressed: string } | null {
    const layer = this.layers.get(name);
    if (!layer) return null;

    const excess = layer.tokenCount - targetTokens;
    if (excess <= 0) {
      return { freed: 0, compressed: layer.name };
    }

    layer.compressed = true;
    return { freed: excess, compressed: layer.name };
  }

  suggestCompression(): Array<{
    layer: string;
    targetTokens: number;
    reason: string;
  }> {
    const suggestions: Array<{
      layer: string;
      targetTokens: number;
      reason: string;
    }> = [];

    const allocations = this.getAllocation();
    const overLayers = allocations
      .filter(a => a.utilization >= 0.85)
      .sort((a, b) => {
        const layerA = this.layers.get(a.layer)!;
        const layerB = this.layers.get(b.layer)!;
        return layerB.priority - layerA.priority;
      });

    for (const alloc of overLayers) {
      const layer = this.layers.get(alloc.layer)!;
      const target = Math.floor(layer.maxTokens * 0.6);
      const reason =
        alloc.utilization >= 1.0
          ? `${alloc.layer} layer is over limit (${(alloc.utilization * 100).toFixed(0)}% utilization)`
          : `${alloc.layer} layer is near limit (${(alloc.utilization * 100).toFixed(0)}% utilization)`;
      suggestions.push({
        layer: alloc.layer,
        targetTokens: Math.max(layer.minTokens, target),
        reason,
      });
    }

    return suggestions;
  }

  autoBalance(): BudgetAllocation[] {
    const layerList = Array.from(this.layers.values()).sort(
      (a, b) => a.priority - b.priority,
    );

    let remaining = this.totalBudget;
    const reserved: Array<{ layer: ContextLayer; tokens: number }> = [];

    for (const layer of layerList) {
      const alloc = Math.min(layer.maxTokens, remaining);
      reserved.push({ layer, tokens: alloc });
      remaining -= alloc;
    }

    const priorityWeight = layerList.reduce((sum, l) => sum + (1 / l.priority), 0);

    for (const { layer, tokens } of reserved) {
      if (remaining > 0 && priorityWeight > 0) {
        const extra = Math.floor((1 / layer.priority / priorityWeight) * remaining);
        layer.maxTokens = Math.min(tokens + extra, this.totalBudget);
      } else {
        layer.maxTokens = tokens;
      }
    }

    return this.getAllocation();
  }

  setTotalBudget(budget: number): void {
    this.totalBudget = budget;
  }

  private buildRecommendations(allocations: BudgetAllocation[]): string[] {
    const recs: string[] = [];

    for (const alloc of allocations) {
      if (alloc.status === 'over_limit') {
        recs.push(
          `Compress ${alloc.layer} layer (currently at ${(alloc.utilization * 100).toFixed(0)}% utilization, exceeds limit)`,
        );
      } else if (alloc.status === 'near_limit') {
        recs.push(
          `Compress ${alloc.layer} layer (currently at ${(alloc.utilization * 100).toFixed(0)}% utilization)`,
        );
      } else if (alloc.status === 'compressed') {
        recs.push(`${alloc.layer} layer is already compressed`);
      }
    }

    const totalUsed = allocations.reduce((s, a) => s + a.used, 0);
    if (totalUsed > this.totalBudget * 0.9) {
      recs.push('Overall budget is above 90% — consider offloading context');
    }

    return recs;
  }
}
