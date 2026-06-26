import type { AgentRole, Mode } from '@chimera/core';

export interface ToolActivity {
  tool: string;
  args?: string;
  status: 'running' | 'completed' | 'error';
  startedAt: number;
}

export interface MessageAnalysis {
  confidence: number;
  thought?: string;
  consensus: string[];
  conflicts: string[];
  uniqueInsights: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  toolCalls?: ToolCallIndicator[];
  analysis?: MessageAnalysis;
  timestamp: number;
}

export interface ToolCallIndicator {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  args?: string;
  result?: string;
}

export interface Agent {
  id: string;
  role: AgentRole;
  provider: string;
  model: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  tokenUsage: {
    input: number;
    output: number;
  };
  taskDescription?: string;
  progress?: number;
}

export interface CostData {
  currentCost: number;
  budget: number;
  breakdown: CostBreakdown[];
}

export interface CostBreakdown {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface Session {
  id: string;
  date: Date;
  taskSummary: string;
  cost: number;
  messageCount: number;
  agentCount: number;
}

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface EventLogEntry {
  id: string;
  timestamp: number;
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface TUIProps {
  mode?: Mode;
  preset?: import('@chimera/core').DeliberationMode;
  sessionId?: string;
  messages?: Message[];
  agents?: Agent[];
  costData?: CostData;
  sessions?: Session[];
  diffFiles?: DiffFile[];
  events?: EventLogEntry[];
  activeTool?: ToolActivity;
  onSendMessage?: (text: string) => void;
  onModeChange?: (mode: Mode) => void;
  onPresetChange?: (preset: import('@chimera/core').DeliberationMode) => void;
  onSessionSelect?: (sessionId: string) => void;
  onSessionDelete?: (sessionId: string) => void;
  onEventFilter?: (type: string | null) => void;
  onExit?: () => void;
}
