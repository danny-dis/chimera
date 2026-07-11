import React from 'react';
import type { Mode } from '@chimera/core';
import type { Agent, ToolActivity } from '../types.js';
interface StatusBarProps {
    mode: Mode;
    agents: Agent[];
    activeTool?: ToolActivity;
    sidebarVisible?: boolean;
}
export declare const StatusBar: React.FC<StatusBarProps>;
export {};
//# sourceMappingURL=status-bar.d.ts.map