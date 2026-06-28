import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpClient, McpManager, type McpServerConfig, type McpConfigFile } from '../mcp-client.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

vi.mock('child_process');

describe('McpClient', () => {
  let mockProcess: any;

  beforeEach(() => {
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdin = {
      write: vi.fn(),
    };
    mockProcess.kill = vi.fn();

    (spawn as any).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const config: McpServerConfig = {
    name: 'test-server',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
  };

  it('connects to an MCP server and discovers tools', async () => {
    const client = new McpClient(config);
    const connectPromise = client.connect();

    // 1. Wait for 'initialize' request
    await vi.waitFor(() => {
      const call = mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"initialize"'));
      expect(call).toBeDefined();
    });

    const initRequest = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"initialize"'))[0]);

    // 2. Send 'initialize' response
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
      jsonrpc: '2.0',
      id: initRequest.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'test-server', version: '1.0.0' },
      },
    }) + '\n'));

    // 3. Wait for 'tools/list' request
    await vi.waitFor(() => {
      const call = mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"tools/list"'));
      expect(call).toBeDefined();
    });

    const listRequest = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"tools/list"'))[0]);

    // 4. Send 'tools/list' response
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
      jsonrpc: '2.0',
      id: listRequest.id,
      result: {
        tools: [
          {
            name: 'hello',
            description: 'Say hello',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
              },
              required: ['name'],
            },
          },
        ],
      },
    }) + '\n'));

    // 5. Wait for 'resources/list' request
    await vi.waitFor(() => {
      const call = mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"resources/list"'));
      expect(call).toBeDefined();
    });

    const resRequest = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"resources/list"'))[0]);

    // 6. Send 'resources/list' response
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
      jsonrpc: '2.0',
      id: resRequest.id,
      result: { resources: [] },
    }) + '\n'));

    await connectPromise;

    expect(client.isConnected()).toBe(true);
    expect(client.getTools()).toHaveLength(1);
    expect(client.getTools()[0].name).toBe('hello');
  });

  it('calls a tool on the MCP server', async () => {
    const client = new McpClient(config);
    
    // We need to call connect to set up listeners, but we'll mock the responses quickly
    const connectPromise = client.connect();

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"initialize"')));
    const initId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"initialize"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: initId, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 't', version: '1' } } }) + '\n'));
    
    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"tools/list"')));
    const listId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"tools/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: listId, result: { tools: [] } }) + '\n'));

    // Handle resources/list
    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"resources/list"')));
    const resId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"resources/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: resId, result: { resources: [] } }) + '\n'));

    await connectPromise;

    // Now call the tool
    mockProcess.stdin.write.mockClear();
    const callPromise = client.callTool('hello', { name: 'world' });

    await vi.waitFor(() => expect(mockProcess.stdin.write).toHaveBeenCalled());
    const callRequest = JSON.parse(mockProcess.stdin.write.mock.calls[0][0]);
    
    // Send response
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
      jsonrpc: '2.0',
      id: callRequest.id,
      result: {
        content: [{ type: 'text', text: 'Hello, world!' }],
      },
    }) + '\n'));

    const result = await callPromise;
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Hello, world!' }],
    });
  });

  it('discovers and reads resources', async () => {
    const client = new McpClient(config);
    const connectPromise = client.connect();

    // 1. Initialize with resources capability
    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"initialize"')));
    const initId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"initialize"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
      jsonrpc: '2.0',
      id: initId,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { resources: {} }, // Enable resources
        serverInfo: { name: 'test', version: '1' },
      },
    }) + '\n'));

    // 2. Tools list (empty)
    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"tools/list"')));
    const listToolsId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"tools/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: listToolsId, result: { tools: [] } }) + '\n'));

    // 3. Resources list
    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"resources/list"')));
    const listResId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"resources/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
      jsonrpc: '2.0',
      id: listResId,
      result: {
        resources: [
          { uri: 'test://log', name: 'Log file', mimeType: 'text/plain' },
        ],
      },
    }) + '\n'));

    await connectPromise;

    expect(client.getResources()).toHaveLength(1);
    expect(client.getResources()[0].name).toBe('Log file');

    // 4. Read resource
    mockProcess.stdin.write.mockClear();
    const readPromise = client.readResource('test://log');

    await vi.waitFor(() => expect(mockProcess.stdin.write).toHaveBeenCalled());
    const readRequest = JSON.parse(mockProcess.stdin.write.mock.calls[0][0]);
    expect(readRequest.method).toBe('resources/read');
    expect(readRequest.params.uri).toBe('test://log');

    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({
      jsonrpc: '2.0',
      id: readRequest.id,
      result: {
        contents: [{ uri: 'test://log', mimeType: 'text/plain', text: 'log content' }],
      },
    }) + '\n'));

    const readResult = await readPromise;
    expect(readResult).toEqual({
      contents: [{ uri: 'test://log', mimeType: 'text/plain', text: 'log content' }],
    });
  });

  it('handles connection timeout', async () => {
    vi.useFakeTimers();
    const client = new McpClient(config);
    const connectPromise = client.connect();

    vi.advanceTimersByTime(11000);

    await expect(connectPromise).rejects.toThrow('connection timed out');
    vi.useRealTimers();
  });

  it('uses double-underscore tool naming convention', async () => {
    const client = new McpClient(config);
    const connectPromise = client.connect();

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"initialize"')));
    const initId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"initialize"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: initId, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 't', version: '1' } } }) + '\n'));

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"tools/list"')));
    const listId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"tools/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: listId, result: { tools: [{ name: 'my-tool', description: 'Test', inputSchema: {} }] } }) + '\n'));

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"resources/list"')));
    const resId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"resources/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: resId, result: { resources: [] } }) + '\n'));

    await connectPromise;

    const defs = client.toToolDefinitions();
    expect(defs[0].name).toBe('mcp__test-server__my-tool');
  });

  it('filters tools by includeTools', async () => {
    const filteredConfig: McpServerConfig = { ...config, includeTools: ['hello'] };
    const client = new McpClient(filteredConfig);
    const connectPromise = client.connect();

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"initialize"')));
    const initId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"initialize"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: initId, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 't', version: '1' } } }) + '\n'));

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"tools/list"')));
    const listId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"tools/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: listId, result: { tools: [{ name: 'hello', description: 'Hi', inputSchema: {} }, { name: 'goodbye', description: 'Bye', inputSchema: {} }] } }) + '\n'));

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"resources/list"')));
    const resId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"resources/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: resId, result: { resources: [] } }) + '\n'));

    await connectPromise;

    const defs = client.toToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toContain('hello');
  });

  it('filters tools by excludeTools', async () => {
    const filteredConfig: McpServerConfig = { ...config, excludeTools: ['goodbye'] };
    const client = new McpClient(filteredConfig);
    const connectPromise = client.connect();

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"initialize"')));
    const initId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"initialize"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: initId, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 't', version: '1' } } }) + '\n'));

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"tools/list"')));
    const listId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"tools/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: listId, result: { tools: [{ name: 'hello', description: 'Hi', inputSchema: {} }, { name: 'goodbye', description: 'Bye', inputSchema: {} }] } }) + '\n'));

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"resources/list"')));
    const resId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"resources/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: resId, result: { resources: [] } }) + '\n'));

    await connectPromise;

    const defs = client.toToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toContain('hello');
  });

  it('tracks connection status', async () => {
    const client = new McpClient(config);
    const statuses: string[] = [];
    client.onStatusChange((s) => statuses.push(s));

    expect(client.getStatus()).toBe('disconnected');

    const connectPromise = client.connect();
    expect(statuses).toContain('connecting');

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"initialize"')));
    const initId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"initialize"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: initId, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 't', version: '1' } } }) + '\n'));

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"tools/list"')));
    const listId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"tools/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: listId, result: { tools: [] } }) + '\n'));

    await vi.waitFor(() => mockProcess.stdin.write.mock.calls.some((c: any) => c[0].includes('"method":"resources/list"')));
    const resId = JSON.parse(mockProcess.stdin.write.mock.calls.find((c: any) => c[0].includes('"method":"resources/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: resId, result: { resources: [] } }) + '\n'));

    await connectPromise;
    expect(statuses).toContain('connected');
  });
});

describe('McpManager', () => {
  it('loads config from .mcp.json format', () => {
    const configFile: McpConfigFile = {
      mcpServers: {
        'my-server': { transport: 'stdio', command: 'node', args: ['server.js'] },
        'remote-server': { transport: 'http', url: 'http://localhost:3000' },
      },
    };

    const configs = McpManager.loadConfigFile(configFile);
    expect(configs).toHaveLength(2);
    expect(configs[0].name).toBe('my-server');
    expect(configs[0].transport).toBe('stdio');
    expect(configs[1].name).toBe('remote-server');
    expect(configs[1].url).toBe('http://localhost:3000');
  });

  it('collects all tools from connected servers', async () => {
    const manager = new McpManager();
    const mockProcess = new EventEmitter();
    (mockProcess as any).stdout = new EventEmitter();
    (mockProcess as any).stderr = new EventEmitter();
    (mockProcess as any).stdin = { write: vi.fn() };
    (mockProcess as any).kill = vi.fn();
    (spawn as any).mockReturnValue(mockProcess);

    const config: McpServerConfig = { name: 'test', transport: 'stdio', command: 'node' };
    const toolsPromise = manager.addServer(config);

    await vi.waitFor(() => (mockProcess.stdin.write as any).mock.calls.some((c: any) => c[0].includes('"method":"initialize"')));
    const initId = JSON.parse((mockProcess.stdin.write as any).mock.calls.find((c: any) => c[0].includes('"method":"initialize"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: initId, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 't', version: '1' } } }) + '\n'));

    await vi.waitFor(() => (mockProcess.stdin.write as any).mock.calls.some((c: any) => c[0].includes('"method":"tools/list"')));
    const listId = JSON.parse((mockProcess.stdin.write as any).mock.calls.find((c: any) => c[0].includes('"method":"tools/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: listId, result: { tools: [{ name: 'tool1', description: 'T1', inputSchema: {} }] } }) + '\n'));

    await vi.waitFor(() => (mockProcess.stdin.write as any).mock.calls.some((c: any) => c[0].includes('"method":"resources/list"')));
    const resId = JSON.parse((mockProcess.stdin.write as any).mock.calls.find((c: any) => c[0].includes('"method":"resources/list"'))[0]).id;
    mockProcess.stdout.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: resId, result: { resources: [] } }) + '\n'));

    await toolsPromise;
    const allTools = manager.getAllTools();
    expect(allTools).toHaveLength(1);
    expect(allTools[0].name).toContain('tool1');
  });
});
