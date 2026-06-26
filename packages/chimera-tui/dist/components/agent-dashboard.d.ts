import React from 'react';
import type { Agent } from '../types.js';
interface AgentDashboardProps {
    agents: Agent[];
}
/** Full panel version (used as overlay). */
export declare const AgentDashboard: React.FC<AgentDashboardProps>;
/** Compact single-line version (used in status bar). */
export declare const AgentStatusLine: React.FC<AgentDashboardProps>;
export {};
//# sourceMappingURL=agent-dashboard.d.ts.map