import React from 'react';
import type { CostData, SkillModelView } from '../types.js';
interface CostTrackerProps {
    data: CostData;
    showBreakdown?: boolean;
    contentWidth?: number;
    skillModel?: SkillModelView;
}
/** Full panel version (used as overlay). */
export declare const CostTracker: React.FC<CostTrackerProps>;
/** Compact single-line version (used in status bar). */
export declare const CostStatusLine: React.FC<{
    data: CostData;
}>;
export {};
//# sourceMappingURL=cost-tracker.d.ts.map