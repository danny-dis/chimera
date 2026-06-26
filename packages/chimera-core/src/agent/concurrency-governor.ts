import os from 'os';

export interface GovernorMetrics {
  cpuLoad: number;
  freeMem: number;
  queueSize: number;
  backpressure: boolean;
}

export interface GovernorConfig {
  maxCpuLoad: number;
  minFreeMem: number;
  baseConcurrency: number;
  maxConcurrency: number;
}

/**
 * ConcurrencyGovernor suggests optimal concurrency levels based on system health.
 */
export class ConcurrencyGovernor {
  private config: GovernorConfig;

  constructor(config?: Partial<GovernorConfig>) {
    this.config = {
      maxCpuLoad: os.cpus().length * 0.8,
      minFreeMem: 512 * 1024 * 1024, // 512MB
      baseConcurrency: 4,
      maxConcurrency: 20,
      ...config,
    };
  }

  /**
   * Calculates the suggested concurrency level.
   */
  suggestConcurrency(metrics: Partial<GovernorMetrics>): number {
    let suggestion = this.config.baseConcurrency;

    // Scale up based on queue size if health is good
    if (metrics.queueSize && metrics.queueSize > suggestion * 2) {
      suggestion = Math.min(this.config.maxConcurrency, Math.ceil(metrics.queueSize / 2));
    }

    // Apply health-based caps
    let cap = this.config.maxConcurrency;

    // CPU cap
    const cpuLoad = metrics.cpuLoad ?? this.getAvgCpuLoad();
    if (cpuLoad > this.config.maxCpuLoad) {
      const reductionFactor = this.config.maxCpuLoad / cpuLoad;
      cap = Math.min(cap, Math.floor(this.config.maxConcurrency * reductionFactor));
    }

    // Memory cap
    const freeMem = metrics.freeMem ?? os.freemem();
    if (freeMem < this.config.minFreeMem) {
      cap = Math.min(cap, Math.floor(this.config.maxConcurrency * 0.2)); // Aggressive reduction
    }

    // Backpressure cap
    if (metrics.backpressure) {
      cap = 1;
    }

    // Final suggestion is capped by system health
    return Math.max(1, Math.min(suggestion, cap));
  }

  private getAvgCpuLoad(): number {
    const loadAvg = os.loadavg()[0];
    if (loadAvg > 0) return loadAvg;
    const cpus = os.cpus();
    const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTick = cpus.reduce(
      (acc, cpu) => acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq,
      0,
    );
    return totalTick > 0 ? cpus.length * (1 - totalIdle / totalTick) : 0;
  }
}
