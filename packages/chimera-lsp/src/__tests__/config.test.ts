import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadLspConfig, mergeLspConfig, DEFAULT_LSP_CONFIG, LspConfigSchema, LspServerConfigSchema } from '../config.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('LspServerConfigSchema', () => {
  it('validates a minimal config', () => {
    const result = LspServerConfigSchema.parse({ command: 'lsp-server' });
    expect(result.command).toBe('lsp-server');
    expect(result.args).toEqual([]);
    expect(result.enabled).toBe(true);
  });

  it('validates a full config', () => {
    const result = LspServerConfigSchema.parse({
      name: 'typescript',
      command: 'typescript-language-server',
      args: ['--stdio'],
      cwd: '/tmp',
      filePatterns: ['**/*.ts'],
      rootFiles: ['tsconfig.json'],
      env: { NODE_ENV: 'test' },
      enabled: true,
      diagnosticsLimit: 100,
    });
    expect(result.name).toBe('typescript');
    expect(result.args).toEqual(['--stdio']);
    expect(result.diagnosticsLimit).toBe(100);
  });

  it('rejects config without command', () => {
    expect(() => LspServerConfigSchema.parse({})).toThrow();
  });

  it('rejects empty command', () => {
    expect(() => LspServerConfigSchema.parse({ command: '' })).toThrow();
  });
});

describe('LspConfigSchema', () => {
  it('validates empty object with defaults', () => {
    const result = LspConfigSchema.parse({});
    expect(result.enabled).toBe(true);
    expect(result.autoStart).toBe(true);
    expect(result.diagnosticsLimit).toBe(200);
    expect(result.servers).toEqual({});
  });

  it('validates full config', () => {
    const result = LspConfigSchema.parse({
      enabled: false,
      autoStart: false,
      diagnosticsLimit: 500,
      servers: {
        ts: { command: 'tsserver', args: [] },
      },
    });
    expect(result.enabled).toBe(false);
    expect(result.servers.ts.command).toBe('tsserver');
  });

  it('validates with nested server configs', () => {
    const result = LspConfigSchema.parse({
      servers: {
        typescript: {
          command: 'typescript-language-server',
          args: ['--stdio'],
          filePatterns: ['**/*.ts', '**/*.tsx'],
        },
        python: {
          command: 'pylsp',
        },
      },
    });
    expect(Object.keys(result.servers)).toHaveLength(2);
    expect(result.servers.typescript.args).toEqual(['--stdio']);
    expect(result.servers.python.command).toBe('pylsp');
  });
});

describe('DEFAULT_LSP_CONFIG', () => {
  it('has expected shape', () => {
    expect(DEFAULT_LSP_CONFIG.enabled).toBe(true);
    expect(DEFAULT_LSP_CONFIG.autoStart).toBe(true);
    expect(DEFAULT_LSP_CONFIG.diagnosticsLimit).toBe(200);
    expect(DEFAULT_LSP_CONFIG.servers).toEqual({});
  });
});

describe('mergeLspConfig', () => {
  it('returns base config when no override', () => {
    const result = mergeLspConfig(DEFAULT_LSP_CONFIG);
    expect(result).toEqual(DEFAULT_LSP_CONFIG);
  });

  it('merges server configs', () => {
    const base = {
      ...DEFAULT_LSP_CONFIG,
      servers: {
        ts: { command: 'tsserver', args: [] },
      },
    };
    const override = {
      servers: {
        py: { command: 'pylsp', args: [] },
      },
    };
    const result = mergeLspConfig(base, override);
    expect(Object.keys(result.servers)).toContain('ts');
    expect(Object.keys(result.servers)).toContain('py');
  });

  it('override replaces base servers with same name', () => {
    const base = {
      ...DEFAULT_LSP_CONFIG,
      servers: {
        ts: { command: 'old-server', args: [] },
      },
    };
    const override = {
      servers: {
        ts: { command: 'new-server', args: ['--stdio'] },
      },
    };
    const result = mergeLspConfig(base, override);
    expect(result.servers.ts.command).toBe('new-server');
    expect(result.servers.ts.args).toEqual(['--stdio']);
  });

  it('merges top-level config', () => {
    const result = mergeLspConfig(DEFAULT_LSP_CONFIG, { enabled: false });
    expect(result.enabled).toBe(false);
    expect(result.autoStart).toBe(true);
  });
});

describe('loadLspConfig', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-lsp-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('returns default config when file does not exist', async () => {
    const result = await loadLspConfig(tmpDir, path.join(tmpDir, 'nonexistent.yaml'));
    expect(result).toEqual(DEFAULT_LSP_CONFIG);
  });

  it('loads YAML config', async () => {
    const configDir = path.join(tmpDir, '.chimera');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'config.yaml'), `
lsp:
  enabled: false
  servers:
    ts:
      command: typescript-language-server
      args:
        - --stdio
`);
    const result = await loadLspConfig(tmpDir);
    expect(result.enabled).toBe(false);
    expect(result.servers.ts.command).toBe('typescript-language-server');
  });

  it('loads config without lsp key wrapper', async () => {
    const configDir = path.join(tmpDir, '.chimera');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'config.yaml'), `
enabled: true
servers:
  py:
    command: pylsp
`);
    const result = await loadLspConfig(tmpDir);
    expect(result.enabled).toBe(true);
    expect(result.servers.py.command).toBe('pylsp');
  });

  it('throws on invalid YAML content', async () => {
    const configDir = path.join(tmpDir, '.chimera');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'config.yaml'), `
enabled: not-a-boolean
`);
    await expect(loadLspConfig(tmpDir)).rejects.toThrow();
  });
});
