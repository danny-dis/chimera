import { describe, it, expect, beforeEach } from 'vitest';
import { McpServerAdapter, McpRegistry } from './server-adapter.js';
import { McpToolBridge } from './tool-bridge.js';
import { z } from 'zod';

describe('McpServerAdapter', () => {
  let adapter: McpServerAdapter;

  beforeEach(() => {
    adapter = new McpServerAdapter({
      id: 'test-server',
      name: 'Test MCP Server',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server'],
    });
  });

  it('starts disconnected', () => {
    expect(adapter.state).toBe('disconnected');
    expect(adapter.isConnected).toBe(false);
  });

  it('connects and discovers empty tools initially', async () => {
    await adapter.connect();
    expect(adapter.state).toBe('connected');
    expect(adapter.tools).toEqual([]);
  });

  it('disconnects', async () => {
    await adapter.connect();
    await adapter.disconnect();
    expect(adapter.state).toBe('disconnected');
    expect(adapter.tools).toEqual([]);
  });

  it('fails to execute when disconnected', async () => {
    const result = await adapter.executeTool({
      toolName: 'test',
      arguments: {},
      context: { sessionId: 's1', runId: 'r1', agentId: 'a1' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('fails to execute unknown tool', async () => {
    await adapter.connect();
    const result = await adapter.executeTool({
      toolName: 'unknown_tool',
      arguments: {},
      context: { sessionId: 's1', runId: 'r1', agentId: 'a1' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('tracks permission levels via MCP tool category', () => {
    // Register tools with known categories
    adapter.registerTestTool({
      name: 'read_file',
      description: 'Read a file',
      inputSchema: {},
      category: 'filesystem',
      requiresApproval: false,
    });
    adapter.registerTestTool({
      name: 'shell_run',
      description: 'Run shell command',
      inputSchema: {},
      category: 'shell',
      requiresApproval: true,
    });
    expect(adapter.getPermissionLevel('read_file')).toBe('read');
    expect(adapter.getPermissionLevel('shell_run')).toBe('execute');
    // Unknown tools default to 'read'
    expect(adapter.getPermissionLevel('unknown')).toBe('read');
  });
});

describe('McpRegistry', () => {
  let registry: McpRegistry;

  beforeEach(() => {
    registry = new McpRegistry();
  });

  it('registers a server', () => {
    const adapter = registry.registerServer({
      id: 's1',
      name: 'Server 1',
      transport: 'stdio',
      command: 'npx',
    });
    expect(adapter.config.id).toBe('s1');
    expect(registry.getAllServers()).toHaveLength(1);
  });

  it('gets a server by ID', () => {
    registry.registerServer({
      id: 's1',
      name: 'Server 1',
      transport: 'stdio',
      command: 'npx',
    });
    expect(registry.getServer('s1')).toBeDefined();
    expect(registry.getServer('s2')).toBeUndefined();
  });

  it('unregisters a server', () => {
    registry.registerServer({
      id: 's1',
      name: 'Server 1',
      transport: 'stdio',
      command: 'npx',
    });
    registry.unregisterServer('s1');
    expect(registry.getAllServers()).toHaveLength(0);
  });

  it('connects to all servers', async () => {
    registry.registerServer({
      id: 's1',
      name: 'Server 1',
      transport: 'stdio',
      command: 'npx',
    });
    registry.registerServer({
      id: 's2',
      name: 'Server 2',
      transport: 'http',
      url: 'http://localhost:3000',
    });
    await registry.connectAll();
    expect(registry.getServer('s1')?.isConnected).toBe(true);
    expect(registry.getServer('s2')?.isConnected).toBe(true);
  });
});

describe('McpToolBridge', () => {
  it('gets empty tools list when no servers registered', () => {
    const registry = new McpRegistry();
    const bridge = new McpToolBridge(registry);
    expect(bridge.getAvailableTools()).toEqual([]);
  });

  it('tracks permission levels via server adapter', () => {
    const registry = new McpRegistry();
    const server = registry.registerServer({
      id: 's1',
      name: 'Server 1',
      transport: 'stdio',
      command: 'npx',
    });
    // Register a shell tool
    server.registerTestTool({
      name: 'shell_run',
      description: 'Run shell',
      inputSchema: {},
      category: 'shell',
      requiresApproval: true,
    });
    const bridge = new McpToolBridge(registry);
    expect(bridge.getPermissionLevel('shell_run')).toBe('execute');
  });

  it('maintains audit log', () => {
    const registry = new McpRegistry();
    const bridge = new McpToolBridge(registry);
    expect(bridge.getAuditLog()).toEqual([]);
  });
});
