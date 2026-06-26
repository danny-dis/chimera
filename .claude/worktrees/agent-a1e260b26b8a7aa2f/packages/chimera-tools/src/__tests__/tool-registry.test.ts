import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../tool-registry.js';
import type { ToolDefinition, ToolContext } from '../tool-schema.js';
import { EventStream } from '@chimera/core';

function makeContext(workspaceRoot = '/tmp'): ToolContext {
  return {
    workspaceRoot,
    sessionId: 'test-session',
    eventStream: new EventStream(),
    costTracker: {
      setBudget: () => {},
      recordSpend: () => {},
      getSpend: () => 0,
      getRemaining: () => Infinity,
    } as any,
    permissionCheck: () => 'allow',
  };
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('registers a tool successfully', () => {
      const tool: ToolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: z.object({ input: z.string() }),
        returns: z.object({ output: z.string() }),
        category: 'search',
        permissionLevel: 'read',
        execute: async (params) => ({ output: params.input }),
      };

      registry.register(tool);
      expect(registry.get('test_tool')).toBe(tool);
    });

    it('throws when registering duplicate tool', () => {
      const tool: ToolDefinition = {
        name: 'dup_tool',
        description: 'Dup',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => ({}),
      };

      registry.register(tool);
      expect(() => registry.register(tool)).toThrow('Tool "dup_tool" is already registered');
    });
  });

  describe('get', () => {
    it('returns undefined for unknown tool', () => {
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('returns all registered tools', () => {
      const tool1: ToolDefinition = {
        name: 'tool_a',
        description: 'A',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => ({}),
      };
      const tool2: ToolDefinition = {
        name: 'tool_b',
        description: 'B',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'filesystem',
        permissionLevel: 'write',
        execute: async () => ({}),
      };

      registry.register(tool1);
      registry.register(tool2);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((t) => t.name)).toContain('tool_a');
      expect(all.map((t) => t.name)).toContain('tool_b');
    });
  });

  describe('getByCategory', () => {
    it('filters tools by category', () => {
      const searchTool: ToolDefinition = {
        name: 'search_tool',
        description: 'Search',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => ({}),
      };
      const fsTool: ToolDefinition = {
        name: 'fs_tool',
        description: 'FS',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'filesystem',
        permissionLevel: 'read',
        execute: async () => ({}),
      };

      registry.register(searchTool);
      registry.register(fsTool);

      const searchTools = registry.getByCategory('search');
      expect(searchTools).toHaveLength(1);
      expect(searchTools[0].name).toBe('search_tool');
    });
  });

  describe('getByPermissionLevel', () => {
    it('filters tools by permission level', () => {
      const readTool: ToolDefinition = {
        name: 'read_tool',
        description: 'Read',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => ({}),
      };
      const writeTool: ToolDefinition = {
        name: 'write_tool',
        description: 'Write',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'filesystem',
        permissionLevel: 'write',
        execute: async () => ({}),
      };

      registry.register(readTool);
      registry.register(writeTool);

      const writeTools = registry.getByPermissionLevel('write');
      expect(writeTools).toHaveLength(1);
      expect(writeTools[0].name).toBe('write_tool');
    });
  });

  describe('has', () => {
    it('returns true for registered tool', () => {
      const tool: ToolDefinition = {
        name: 'exists_tool',
        description: 'Exists',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => ({}),
      };
      registry.register(tool);
      expect(registry.has('exists_tool')).toBe(true);
    });

    it('returns false for unregistered tool', () => {
      expect(registry.has('nope')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('removes a registered tool', () => {
      const tool: ToolDefinition = {
        name: 'remove_me',
        description: 'Remove',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => ({}),
      };
      registry.register(tool);
      expect(registry.unregister('remove_me')).toBe(true);
      expect(registry.get('remove_me')).toBeUndefined();
    });

    it('returns false for unknown tool', () => {
      expect(registry.unregister('ghost')).toBe(false);
    });
  });

  describe('validateParams', () => {
    it('returns valid for correct params', () => {
      const tool: ToolDefinition = {
        name: 'validate_me',
        description: 'Validate',
        parameters: z.object({ name: z.string() }),
        returns: z.object({}),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => ({}),
      };
      registry.register(tool);

      const result = registry.validateParams('validate_me', { name: 'test' });
      expect(result.valid).toBe(true);
    });

    it('returns invalid for wrong params', () => {
      const tool: ToolDefinition = {
        name: 'validate_me',
        description: 'Validate',
        parameters: z.object({ name: z.string() }),
        returns: z.object({}),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => ({}),
      };
      registry.register(tool);

      const result = registry.validateParams('validate_me', { name: 123 });
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('returns invalid for unknown tool', () => {
      const result = registry.validateParams('unknown', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool "unknown" not found');
    });
  });

  describe('execute', () => {
    it('executes a tool and returns success', async () => {
      const tool: ToolDefinition = {
        name: 'echo_tool',
        description: 'Echo',
        parameters: z.object({ message: z.string() }),
        returns: z.object({ echoed: z.string() }),
        category: 'search',
        permissionLevel: 'read',
        execute: async (params) => ({ echoed: params.message }),
      };
      registry.register(tool);

      const result = await registry.execute('echo_tool', { message: 'hello' }, makeContext());
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ echoed: 'hello' });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('returns error for unknown tool', async () => {
      const result = await registry.execute('nope', {}, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for invalid params', async () => {
      const tool: ToolDefinition = {
        name: 'strict_tool',
        description: 'Strict',
        parameters: z.object({ required: z.string() }),
        returns: z.object({}),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => ({}),
      };
      registry.register(tool);

      const result = await registry.execute('strict_tool', { required: 123 }, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid params');
    });

    it('returns error when tool throws', async () => {
      const tool: ToolDefinition = {
        name: 'fail_tool',
        description: 'Fail',
        parameters: z.object({}),
        returns: z.object({}),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => {
          throw new Error('intentional failure');
        },
      };
      registry.register(tool);

      const result = await registry.execute('fail_tool', {}, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toBe('intentional failure');
    });

    it('validates return value schema', async () => {
      const tool: ToolDefinition = {
        name: 'bad_return',
        description: 'Bad Return',
        parameters: z.object({}),
        returns: z.object({ count: z.number() }),
        category: 'search',
        permissionLevel: 'read',
        execute: async () => ({ count: 'not a number' }),
      };
      registry.register(tool);

      const result = await registry.execute('bad_return', {}, makeContext());
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid return value');
    });
  });
});
