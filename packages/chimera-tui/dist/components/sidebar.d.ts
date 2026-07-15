import React from 'react';
import type { Agent, CostData, SkillModelView } from '../types.js';
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
    instructions?: string[];
    contentWidth?: number;
    onModeChange?: (mode: import('@chimera/core').Mode) => void;
    onPresetChange?: (preset: import('@chimera/core').DeliberationMode) => void;
    skillModel?: SkillModelView;
}
export declare const Sidebar: React.FC<SidebarProps>;
export {};
//# sourceMappingURL=sidebar.d.ts.map