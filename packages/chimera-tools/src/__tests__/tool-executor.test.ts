import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../tool-registry.js';
import { ToolExecutor } from '../tool-executor.js';
import type { ToolDefinition, ToolContext, PermissionDecision } from '../tool-schema.js';
import { EventStream } from '@chimera/core';

function makeContext(
  permissionCheck: (tool: string, params: Record<string, unknown>) => PermissionDecision = () => 'allow',
): ToolContext {
  return {
    workspaceRoot: '/tmp',
    sessionId: 'test-session',
    eventStream: new EventStream(),
    costTracker: {
      setBudget: () => {},
      recordSpend: () => {},
      getSpend: () => 0,
      getRemaining: () => Infinity,
    } as any,
    permissionCheck,
  };
}

describe('ToolExecutor', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry, () => 'allow');
  });

  const sampleTool: ToolDefinition = {
    name: 'sample',
    description: 'Sample tool',
    parameters: z.object({ value: z.string() }),
    returns: z.object({ result: z.string() }),
    category: 'search',
    permissionLevel: 'read',
    execute: async (params) => ({ result: params.value }),
  };

  describe('execute', () => {
    it('executes a tool successfully', async () => {
      registry.register(sampleTool);

      const result = await executor.execute('sample', { value: 'test' }, makeContext());
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'test' });
    });

    it('returns error for unknown tool', async () => {
      const result = await executor.execute('unknown', {}, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for invalid params', async () => {
      registry.register(sampleTool);

      const result = await executor.execute('sample', { value: 123 }, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Parameter validation failed');
    });
  });

  describe('permission enforcement', () => {
    it('denies execution when permission is denied', async () => {
      registry.register(sampleTool);
      const denyExecutor = new ToolExecutor(registry, () => 'deny');

      const result = await denyExecutor.execute('sample', { value: 'test' }, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('blocks and denies when policy is ask (non-interactive falls back to deny)', async () => {
      registry.register(sampleTool);
      const askExecutor = new ToolExecutor(registry, () => 'ask');

      const result = await askExecutor.execute('sample', { value: 'test' }, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('emits tool_call_requested event when asking', async () => {
      registry.register(sampleTool);
      const eventStream = new EventStream();
      const askContext: ToolContext = {
        workspaceRoot: '/tmp',
        sessionId: 'test',
        eventStream,
        costTracker: {
          setBudget: () => {},
          recordSpend: () => {},
          getSpend: () => 0,
          getRemaining: () => Infinity,
        } as any,
        permissionCheck: () => 'ask',
      };

      const askExecutor = new ToolExecutor(registry, () => 'ask');
      await askExecutor.execute('sample', { value: 'test' }, askContext);

      const events = eventStream.getByType('tool_call_requested');
      expect(events.length).toBe(1);
      expect((events[0] as any).call.tool).toBe('sample');
    });

    it('emits tool_call_result event on success', async () => {
      registry.register(sampleTool);
      const eventStream = new EventStream();
      const allowContext: ToolContext = {
        workspaceRoot: '/tmp',
        sessionId: 'test',
        eventStream,
        costTracker: {
          setBudget: () => {},
          recordSpend: () => {},
          getSpend: () => 0,
          getRemaining: () => Infinity,
        } as any,
        permissionCheck: () => 'allow',
      };

      await executor.execute('sample', { value: 'test' }, allowContext);

      const events = eventStream.getByType('tool_call_result');
      expect(events.length).toBe(1);
      expect((events[0] as any).result.tool).toBe('sample');
    });

    it('emits tool_call_result event on failure', async () => {
      const failingTool: ToolDefinition = {
        name: 'fail',
        description: 'Failing tool',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => {
          throw new Error('boom');
        },
      };
      registry.register(failingTool);
      const eventStream = new EventStream();
      const allowContext: ToolContext = {
        workspaceRoot: '/tmp',
        sessionId: 'test',
        eventStream,
        costTracker: {
          setBudget: () => {},
          recordSpend: () => {},
          getSpend: () => 0,
          getRemaining: () => Infinity,
        } as any,
        permissionCheck: () => 'allow',
      };

      await executor.execute('fail', {}, allowContext);

      const events = eventStream.getByType('tool_call_result');
      expect(events.length).toBe(1);
      expect((events[0] as any).result.exitCode).toBe(1);
    });
  });

  describe('conditional permissions', () => {
    it('allows some tools and denies others', async () => {
      const readTool: ToolDefinition = {
        name: 'read',
        description: 'Read',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'filesystem',
        permissionLevel: 'read',
        execute: async () => ({}),
      };
      const writeTool: ToolDefinition = {
        name: 'write',
        description: 'Write',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'filesystem',
        permissionLevel: 'write',
        execute: async () => ({}),
      };
      registry.register(readTool);
      registry.register(writeTool);

      const selectiveExecutor = new ToolExecutor(registry, (tool) =>
        tool === 'read' ? 'allow' : 'deny',
      );

      const readResult = await selectiveExecutor.execute('read', {}, makeContext());
      expect(readResult.success).toBe(true);

      const writeResult = await selectiveExecutor.execute('write', {}, makeContext());
      expect(writeResult.success).toBe(false);
      expect(writeResult.error).toContain('Permission denied');
    });
  });
});
