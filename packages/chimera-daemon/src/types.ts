// ---------------------------------------------------------------------------
// JSON-RPC 2.0 protocol types for chimera-daemon ↔ chimera-vscode
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: string | number;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcSuccess | JsonRpcError | JsonRpcNotification;

// ---------------------------------------------------------------------------
// Daemon → Extension event stream (sent as JSON-RPC notifications)
// ---------------------------------------------------------------------------

export interface DaemonNotification {
  jsonrpc: '2.0';
  method: 'notification';
  params: {
    type: string;
    data: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Method signatures
// ---------------------------------------------------------------------------

export interface ExecuteTaskParams {
  task: string;
  mode?: string;
  workspaceRoot: string;
}

export interface ExecuteTaskResult {
  status: 'done' | 'blocked' | 'needs_user' | 'error' | 'queued';
  output: string;
  cost: number;
  agentCount: number;
  events: unknown[];
  /** Present when workflow was dispatched to background. */
  workflowRunId?: string;
}

export interface GetWorkflowStatusParams {
  workflowRunId: string;
}

export interface GetWorkflowStatusResult {
  workflowRunId: string;
  workflowName: string;
  status: 'queued' | 'running' | 'success' | 'error' | 'cancelled';
  dispatchedAt: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  stepsCompleted?: number;
  totalSteps?: number;
  error?: string;
}

export interface GetStateResult {
  status: string;
  cost: Record<string, number>;
  events: unknown[];
  hidden: number;
}

export interface ListAgentsResult {
  agents: Array<{
    id: string;
    role: string;
    provider: string;
    model: string;
  }>;
}

export interface GetConfigResult {
  configured: boolean;
  providers: unknown[];
}

export interface LoadConfigParams {
  workspaceRoot: string;
}

export interface SaveConfigParams {
  workspaceRoot: string;
  config: unknown;
}

export interface GetCostResult {
  total: number;
  byProvider: Record<string, number>;
  budgetPerProvider: Record<string, { perTask: number; perSession: number; perDay: number }>;
}

export interface CheckHealthResult {
  status: 'ok' | 'error';
  version: string;
  uptime: number;
  activeWorkers: number;
}