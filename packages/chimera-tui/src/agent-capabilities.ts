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

export const AGENT_CAPABILITIES: AgentCapability[] = [
  {
    role: 'writer',
    title: 'Writer',
    capability: 'Implements scoped changes, explores approaches, drafts plans.',
    outputs: 'approach, files, patches, confidence',
  },
  {
    role: 'reviewer',
    title: 'Reviewer',
    capability: 'Checks correctness, test coverage, maintainability, security.',
    outputs: 'PASS/FAIL verdict, issues, severity',
  },
  {
    role: 'challenger',
    title: 'Challenger',
    capability: 'Attacks assumptions, edge cases, and coupling pressure.',
    outputs: 'challenges, alternatives, confidence',
  },
  {
    role: 'synthesizer',
    title: 'Synthesizer',
    capability: 'Merges agent perspectives into one user-facing answer.',
    outputs: 'unified response, resolved conflicts',
  },
  {
    role: 'planner',
    title: 'Planner',
    capability: 'Decomposes goals into reversible, verifiable steps.',
    outputs: 'plan, risks, verification criteria',
  },
  {
    role: 'researcher',
    title: 'Researcher',
    capability: 'Finds current or repository-grounded evidence before changes.',
    outputs: 'sources, observations, citations',
  },
  {
    role: 'summarizer',
    title: 'Summarizer',
    capability: 'Compacts long context while preserving decisions and state.',
    outputs: 'handoff summary, open threads',
  },
];

export const PRESET_CAPABILITIES: PresetCapability[] = [
  { preset: 'solo', label: 'Solo', capability: 'Single-agent fast path for focused tasks.' },
  { preset: 'duo', label: 'Duo', capability: 'Writer plus reviewer quality gate.' },
  { preset: 'trio', label: 'Trio', capability: 'Writer, reviewer, and challenger deliberation.' },
  { preset: 'fusion', label: 'Fusion', capability: 'Multiple drafts synthesized into one response.' },
  { preset: 'hive', label: 'Hive', capability: 'High-parallelism swarm execution for broad task sets.' },
];

export function getAgentCapability(role: AgentRole): AgentCapability {
  return AGENT_CAPABILITIES.find((capability) => capability.role === role) ?? {
    role,
    title: role,
    capability: 'Custom agent capability.',
    outputs: 'agent-defined output',
  };
}
