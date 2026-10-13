import { describe, it, expect } from 'vitest';
import {
  SessionIdSchema,
  RunIdSchema,
  TaskIdSchema,
  MissionIdSchema,
  AgentIdSchema,
  CheckpointIdSchema,
  SessionStatusSchema,
  RunStatusSchema,
  TaskTypeSchema,
  TaskStatusSchema,
  MissionStatusSchema,
  AgentRoleSchema,
  AgentStatusSchema,
  ModelTierSchema,
  ToolPermissionSchema,
  ToolCategorySchema,
  ArtifactTypeSchema,
  EvidenceTypeSchema,
  EvidenceSeveritySchema,
  CheckpointReasonSchema,
  DomainEventTypeSchema,
  ComplexitySchema,
  SessionConfigSchema,
  RunResultSchema,
} from './types.js';

describe('ID schemas', () => {
  it('accepts valid UUIDs for SessionId', () => {
    expect(SessionIdSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
  });

  it('accepts arbitrary non-empty strings for IDs', () => {
    expect(SessionIdSchema.safeParse('session-abc').success).toBe(true);
    expect(RunIdSchema.safeParse('run-xyz').success).toBe(true);
    expect(TaskIdSchema.safeParse('task-123').success).toBe(true);
    expect(MissionIdSchema.safeParse('mission-456').success).toBe(true);
    expect(AgentIdSchema.safeParse('agent-789').success).toBe(true);
    expect(CheckpointIdSchema.safeParse('checkpoint-abc').success).toBe(true);
  });

  it('rejects empty strings for IDs', () => {
    expect(SessionIdSchema.safeParse('').success).toBe(false);
    expect(AgentIdSchema.safeParse('').success).toBe(false);
  });
});

describe('Session schemas', () => {
  it('accepts valid session statuses', () => {
    for (const s of ['initializing', 'active', 'paused', 'completing', 'completed', 'failed', 'cancelled']) {
      expect(SessionStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects invalid session status', () => {
    expect(SessionStatusSchema.safeParse('running').success).toBe(false);
  });

  it('accepts valid session config', () => {
    const result = SessionConfigSchema.safeParse({
      modelOverrides: { planner: 'claude' },
      strategyOverride: 'trio',
      budgetUsd: 2.0,
      timeoutMs: 300000,
      workspaceRoot: '/tmp/repo',
      permissions: ['filesystem.read'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty session config', () => {
    expect(SessionConfigSchema.safeParse({}).success).toBe(true);
  });
});

describe('Run schemas', () => {
  it('accepts valid run statuses', () => {
    for (const s of ['pending', 'planning', 'executing', 'verifying', 'repairing', 'completed', 'failed', 'cancelled']) {
      expect(RunStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it('accepts valid run result', () => {
    const result = RunResultSchema.safeParse({
      success: true,
      summary: 'Done',
      filesChanged: ['src/index.ts'],
      testsPassed: 10,
      testsFailed: 0,
      costUsd: 0.05,
      durationMs: 5000,
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal run result', () => {
    const result = RunResultSchema.safeParse({
      success: false,
      summary: 'Failed',
      filesChanged: [],
      durationMs: 1000,
    });
    expect(result.success).toBe(true);
  });
});

describe('Task schemas', () => {
  it('accepts valid task types', () => {
    for (const t of ['code_generation', 'code_review', 'reasoning', 'analysis', 'research', 'summarization', 'debugging', 'testing', 'refactoring', 'general']) {
      expect(TaskTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('accepts valid task statuses', () => {
    for (const s of ['pending', 'assigned', 'in_progress', 'blocked', 'completed', 'failed', 'cancelled']) {
      expect(TaskStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it('accepts valid complexity', () => {
    const result = ComplexitySchema.safeParse({
      overall: 0.5,
      dimensions: {
        codeVolume: 0.5,
        architecturalDepth: 0.5,
        dependencyComplexity: 0.5,
        testCoverage: 0.5,
        securitySensitivity: 0.5,
        domainNovelty: 0.5,
        errorHandling: 0.5,
        concurrency: 0.5,
        externalIntegrations: 0.5,
        dataTransformation: 0.5,
        stateManagement: 0.5,
        algorithmicComplexity: 0.5,
        apiDesign: 0.5,
        refactoringScope: 0.5,
        crossCuttingConcerns: 0.5,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects complexity out of range', () => {
    const result = ComplexitySchema.safeParse({
      overall: 1.5,
      dimensions: {
        codeVolume: 0.5,
        architecturalDepth: 0.5,
        dependencyComplexity: 0.5,
        testCoverage: 0.5,
        securitySensitivity: 0.5,
        domainNovelty: 0.5,
        errorHandling: 0.5,
        concurrency: 0.5,
        externalIntegrations: 0.5,
        dataTransformation: 0.5,
        stateManagement: 0.5,
        algorithmicComplexity: 0.5,
        apiDesign: 0.5,
        refactoringScope: 0.5,
        crossCuttingConcerns: 0.5,
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('Mission schemas', () => {
  it('accepts valid mission statuses', () => {
    for (const s of ['draft', 'active', 'blocked', 'completed', 'failed', 'cancelled']) {
      expect(MissionStatusSchema.safeParse(s).success).toBe(true);
    }
  });
});

describe('Agent schemas', () => {
  it('accepts valid agent roles', () => {
    for (const r of ['planner', 'explorer', 'implementer', 'debugger', 'tester', 'reviewer', 'security-reviewer', 'synthesizer', 'researcher', 'summarizer']) {
      expect(AgentRoleSchema.safeParse(r).success).toBe(true);
    }
  });

  it('accepts valid agent statuses', () => {
    for (const s of ['registered', 'starting', 'ready', 'running', 'paused', 'failed', 'recovering', 'stopped']) {
      expect(AgentStatusSchema.safeParse(s).success).toBe(true);
    }
  });
});

describe('Model schemas', () => {
  it('accepts valid model tiers', () => {
    for (const t of ['cheap', 'mid', 'frontier', 'reasoning', 'local']) {
      expect(ModelTierSchema.safeParse(t).success).toBe(true);
    }
  });
});

describe('Tool schemas', () => {
  it('accepts valid tool permissions', () => {
    for (const p of ['allow', 'ask', 'deny', 'escalate']) {
      expect(ToolPermissionSchema.safeParse(p).success).toBe(true);
    }
  });

  it('accepts valid tool categories', () => {
    for (const c of ['filesystem', 'shell', 'git', 'network', 'lsp', 'mcp', 'browser', 'internal']) {
      expect(ToolCategorySchema.safeParse(c).success).toBe(true);
    }
  });
});

describe('Artifact schemas', () => {
  it('accepts valid artifact types', () => {
    for (const t of ['file', 'patch', 'log', 'test_report', 'plan', 'screenshot', 'diff', 'other']) {
      expect(ArtifactTypeSchema.safeParse(t).success).toBe(true);
    }
  });
});

describe('Evidence schemas', () => {
  it('accepts valid evidence types', () => {
    for (const t of ['test_result', 'typecheck', 'lint', 'build', 'security_scan', 'review_finding', 'tool_output', 'compiler_output', 'provenance']) {
      expect(EvidenceTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('accepts valid evidence severities', () => {
    for (const s of ['info', 'low', 'medium', 'high', 'critical']) {
      expect(EvidenceSeveritySchema.safeParse(s).success).toBe(true);
    }
  });
});

describe('Checkpoint schemas', () => {
  it('accepts valid checkpoint reasons', () => {
    for (const r of ['manual', 'auto', 'handoff', 'context_threshold', 'task_boundary', 'crash_recovery']) {
      expect(CheckpointReasonSchema.safeParse(r).success).toBe(true);
    }
  });
});

describe('Domain event schemas', () => {
  it('accepts valid domain event types', () => {
    for (const t of [
      'session_created',
      'session_status_changed',
      'run_started',
      'run_status_changed',
      'run_completed',
      'task_created',
      'task_status_changed',
      'task_assigned',
      'mission_created',
      'mission_status_changed',
      'agent_registered',
      'agent_status_changed',
      'checkpoint_created',
      'evidence_produced',
      'artifact_created',
    ]) {
      expect(DomainEventTypeSchema.safeParse(t).success).toBe(true);
    }
  });
});
