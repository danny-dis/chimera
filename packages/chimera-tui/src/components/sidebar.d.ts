import React from 'react';
import type { Agent, CostData } from '../types.js';
interface SidebarProps {
    sessionId: string;
    mode: import('@chimera/core').Mode;
    preset: import('@chimera/core').DeliberationMode;
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
    onModeChange?: (mode: import('@chimera/core').Mode) => void;
    onPresetChange?: (preset: import('@chimera/core').DeliberationMode) => void;
}
export declare const Sidebar: React.FC<SidebarProps>;
export {};
//# sourceMappingURL=sidebar.d.ts.map