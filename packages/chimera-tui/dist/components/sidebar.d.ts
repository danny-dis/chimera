import React from 'react';
import type { Mode, DeliberationMode } from '@chimera/core';
import type { Agent, CostData } from '../types.js';
interface SidebarProps {
    sessionId: string;
    mode: Mode;
    preset: DeliberationMode;
    agents: Agent[];
    costData: CostData;
    tokenUsage?: {
        input: number;
        output: number;
        total: number;
    };
    workingDir?: string;
    instructions?: string[];
    contentWidth?: number;
    onModeChange?: (mode: Mode) => void;
    onPresetChange?: (preset: DeliberationMode) => void;
}
export declare const Sidebar: React.FC<SidebarProps>;
export {};
//# sourceMappingURL=sidebar.d.ts.map