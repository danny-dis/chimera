export interface HandoffDocument {
  goal: string;
  status: 'in_progress' | 'blocked' | 'done';
  progress: string;
  decisions: Array<{ decision: string; rationale: string; source: string; confidence: string }>;
  next: Array<{ priority: 'HIGH' | 'MED' | 'LOW'; action: string }>;
  context: string[];
  filesModified: Array<{ path: string; status: string; lines: number }>;
  filesRead: Array<{ path: string; lines: string; reason: string }>;
  errors: string[];
  meta: {
    session: string;
    agent: string;
    provider: string;
    ts: string;
    contextFill: number;
    claims: string[];
  };
}

export interface HandoffDelta {
  base: string;
  progressDelta: string;
  decisionsAdded: Array<{ decision: string; rationale: string; source: string; confidence: string }>;
  nextUpdated: Array<{ priority: 'HIGH' | 'MED' | 'LOW'; action: string }>;
  filesModifiedAdded: Array<{ path: string; status: string; lines: number }>;
  claimsAdded: string[];
}

export interface HandoffChecklist {
  dataComplete: boolean;
  referencesGrounded: boolean;
  claimsVerified: boolean;
  capabilityMatch: boolean;
}
