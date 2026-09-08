// =============================================================================
// CodingLoop — orchestrates the Understand → Plan → Explore → Implement →
// Run → Observe → Debug → Test → Review → Repair → Verify → Deliver cycle.
// =============================================================================

export interface CodingLoopState {
  phase: 'understand' | 'plan' | 'explore' | 'implement' | 'run' | 'observe' | 'debug' | 'test' | 'review' | 'repair' | 'verify' | 'deliver';
  iterations: number;
  filesChanged: string[];
  testsPassed: number;
  testsFailed: number;
  errors: string[];
  warnings: string[];
}

export interface CodingLoopResult {
  success: boolean;
  state: CodingLoopState;
  output: string;
  filesChanged: string[];
  testResults: { passed: number; failed: number };
}

export interface CodingLoopConfig {
  maxIterations: number;
  enableTesting: boolean;
  enableReview: boolean;
  enableRepair: boolean;
  testCommand?: string;
}

const DEFAULT_CONFIG: CodingLoopConfig = {
  maxIterations: 10,
  enableTesting: true,
  enableReview: true,
  enableRepair: true,
  testCommand: 'npm test',
};

/**
 * CodingLoop — manages the coding tool loop lifecycle.
 */
export class CodingLoop {
  private config: CodingLoopConfig;
  private state: CodingLoopState;

  constructor(config?: Partial<CodingLoopConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      phase: 'understand',
      iterations: 0,
      filesChanged: [],
      testsPassed: 0,
      testsFailed: 0,
      errors: [],
      warnings: [],
    };
  }

  /**
   * Get the current loop state.
   */
  getState(): CodingLoopState {
    return { ...this.state };
  }

  /**
   * Transition to a new phase.
   */
  transition(phase: CodingLoopState['phase']): void {
    this.state.phase = phase;
  }

  /**
   * Record a file change.
   */
  recordFileChange(file: string): void {
    if (!this.state.filesChanged.includes(file)) {
      this.state.filesChanged.push(file);
    }
  }

  /**
   * Record test results.
   */
  recordTestResults(passed: number, failed: number): void {
    this.state.testsPassed += passed;
    this.state.testsFailed += failed;
  }

  /**
   * Record an error.
   */
  recordError(error: string): void {
    this.state.errors.push(error);
  }

  /**
   * Record a warning.
   */
  recordWarning(warning: string): void {
    this.state.warnings.push(warning);
  }

  /**
   * Check if the loop should continue.
   */
  shouldContinue(): boolean {
    if (this.state.iterations >= this.config.maxIterations) {
      return false;
    }
    // Stop if we've delivered
    if (this.state.phase === 'deliver') {
      return false;
    }
    return true;
  }

  /**
   * Increment iteration counter.
   */
  incrementIteration(): void {
    this.state.iterations++;
  }

  /**
   * Determine the next phase based on current state.
   */
  getNextPhase(): CodingLoopState['phase'] {
    const phase = this.state.phase;
    switch (phase) {
      case 'understand':
        return 'plan';
      case 'plan':
        return 'explore';
      case 'explore':
        return 'implement';
      case 'implement':
        return this.config.enableTesting ? 'test' : 'review';
      case 'test':
        if (this.state.testsFailed > 0 && this.config.enableRepair) {
          return 'repair';
        }
        return 'review';
      case 'review':
        if (this.state.errors.length > 0 && this.config.enableRepair) {
          return 'repair';
        }
        return 'verify';
      case 'repair':
        return 'implement';
      case 'verify':
        return 'deliver';
      case 'deliver':
        return 'deliver';
      case 'run':
        return 'observe';
      case 'observe':
        return this.state.errors.length > 0 ? 'debug' : 'test';
      case 'debug':
        return 'implement';
      default:
        return 'deliver';
    }
  }

  /**
   * Check if the loop has completed successfully.
   */
  isSuccessful(): boolean {
    return this.state.phase === 'deliver' && this.state.errors.length === 0;
  }

  /**
   * Get a summary of the loop execution.
   */
  getSummary(): {
    iterations: number;
    filesChanged: number;
    testsPassed: number;
    testsFailed: number;
    errors: number;
    warnings: number;
  } {
    return {
      iterations: this.state.iterations,
      filesChanged: this.state.filesChanged.length,
      testsPassed: this.state.testsPassed,
      testsFailed: this.state.testsFailed,
      errors: this.state.errors.length,
      warnings: this.state.warnings.length,
    };
  }
}
