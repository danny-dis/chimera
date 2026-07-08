import type { AgentRole, DeliberationMode } from '@chimera/core';
export interface AgentCapability {
    role: AgentRole;
    title: string;
    capability: string;
    outputs: string;
}
export interface PresetCapability {
    preset: DeliberationMode;
    label: string;
    capability: string;
}
export declare const AGENT_CAPABILITIES: AgentCapability[];
export declare const PRESET_CAPABILITIES: PresetCapability[];
export declare function getAgentCapability(role: AgentRole): AgentCapability;
//# sourceMappingURL=agent-capabilities.d.ts.map