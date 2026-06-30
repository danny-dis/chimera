import React from 'react';
import type { Mode } from '@chimera/core';
import type { Agent, CostData, ToolActivity } from '../types.js';
interface StatusBarProps {
    mode: Mode;
    costData: CostData;
    agents: Agent[];
    activeTool?: ToolActivity;
    sidebarVisible?: boolean;
    workingDir?: string;
}
export declare const StatusBar: React.FC<StatusBarProps>;
export {};
//# sourceMappingURL=status-bar.d.ts.map