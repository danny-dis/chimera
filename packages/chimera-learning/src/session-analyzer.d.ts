import type { SessionCheckpoint } from '@chimera/session';
import type { SessionPattern, ClusteredPatterns } from './types.js';
export declare class SessionAnalyzer {
    /**
     * Analyze a single session checkpoint and extract patterns.
     */
    analyze(checkpoint: SessionCheckpoint): SessionPattern;
    /**
     * Analyze multiple sessions and find recurring patterns.
     */
    analyzeBatch(checkpoints: SessionCheckpoint[]): ClusteredPatterns;
}
//# sourceMappingURL=session-analyzer.d.ts.map