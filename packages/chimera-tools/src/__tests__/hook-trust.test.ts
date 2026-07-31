import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { isWorkspaceTrusted, trustWorkspace, trustStorePath } from '../hooks/trust.js';
import { HookExecutor } from '../hooks/executor.js';

// trust.ts resolves its store path via CHIMERA_TRUST_STORE (falling back to
// ~/.chimera/trusted-workspaces in production). Point it at a throwaway
// tmpdir for every test so we never read or write the developer's real
// trust store.
let tmpHome: string;
let storeFile: string;
let prevEnv: string | undefined;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-trusthome-'));
  storeFile = path.join(tmpHome, 'trusted-workspaces');
  prevEnv = process.env.CHIMERA_TRUST_STORE;
  process.env.CHIMERA_TRUST_STORE = storeFile;
});

afterEach(async () => {
  if (prevEnv === undefined) {
    delete process.env.CHIMERA_TRUST_STORE;
  } else {
    process.env.CHIMERA_TRUST_STORE = prevEnv;
  }
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe('trust store', () => {
  it('resolves the isolated store path (never the real home store)', () => {
    expect(trustStorePath()).toBe(storeFile);
  });

  it('reports untrusted by default', async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-ws-'));
    try {
      expect(await isWorkspaceTrusted(ws)).toBe(false);
    } finally {
      await fs.rm(ws, { recursive: true, force: true });
    }
  });

  it('trustWorkspace() makes a workspace trusted', async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-ws-'));
    try {
      expect(await isWorkspaceTrusted(ws)).toBe(false);
      await trustWorkspace(ws);
      expect(await isWorkspaceTrusted(ws)).toBe(true);
    } finally {
      await fs.rm(ws, { recursive: true, force: true });
    }
  });

  it('is idempotent — trusting twice does not duplicate the store line', async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-ws-'));
    try {
      await trustWorkspace(ws);
      await trustWorkspace(ws);
      const content = await fs.readFile(storeFile, 'utf-8');
      const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
      const matches = lines.filter((l) => l === path.resolve(ws));
      expect(matches.length).toBe(1);
    } finally {
      await fs.rm(ws, { recursive: true, force: true });
    }
  });

  it('canonicalizes ./ and trailing-slash variants to the same key', async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-ws-'));
    try {
      await trustWorkspace(ws);

      const dotVariant = path.join(ws, '.');
      const trailingSlashVariant = ws.endsWith(path.sep) ? ws : ws + path.sep;

      expect(await isWorkspaceTrusted(dotVariant)).toBe(true);
      expect(await isWorkspaceTrusted(trailingSlashVariant)).toBe(true);
    } finally {
      await fs.rm(ws, { recursive: true, force: true });
    }
  });

  it('untrust (rewrite store without the line) returns to untrusted', async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-ws-'));
    try {
      await trustWorkspace(ws);
      expect(await isWorkspaceTrusted(ws)).toBe(true);

      // Mirrors what the CLI's /trust --untrust does: rewrite the store
      // with the workspace's line removed.
      const content = await fs.readFile(trustStorePath(), 'utf-8');
      const next = content
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => l !== path.resolve(ws));
      await fs.writeFile(trustStorePath(), next.join('\n') + (next.length ? '\n' : ''));

      expect(await isWorkspaceTrusted(ws)).toBe(false);
    } finally {
      await fs.rm(ws, { recursive: true, force: true });
    }
  });
});

describe('HookExecutor.loadFromWorkspace trust gate', () => {
  async function writeHooksYaml(workspaceRoot: string): Promise<void> {
    const hooksYaml = path.join(workspaceRoot, '.chimera', 'hooks.yaml');
    await fs.mkdir(path.dirname(hooksYaml), { recursive: true });
    await fs.writeFile(
      hooksYaml,
      [
        'hooks:',
        '  - id: evil',
        '    event: pre-tool-use',
        "    toolFilter: '*'",
        '    command: \'node -e "process.exit(1)"\'',
        '    canModify: false',
        '    priority: 0',
        '    enabled: true',
        '',
      ].join('\n'),
    );
  }

  it('loads zero hooks when the workspace is untrusted', async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-untrusted-'));
    try {
      await writeHooksYaml(ws);
      const executor = new HookExecutor();
      await executor.loadFromWorkspace(ws);
      expect(executor.getHooks().length).toBe(0);
    } finally {
      await fs.rm(ws, { recursive: true, force: true });
    }
  });

  it('loads the configured hooks once the workspace is trusted', async () => {
    const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-trusted-'));
    try {
      await writeHooksYaml(ws);
      await trustWorkspace(ws);
      expect(await isWorkspaceTrusted(ws)).toBe(true);

      const executor = new HookExecutor();
      await executor.loadFromWorkspace(ws);
      expect(executor.getHooks().length).toBe(1);
      expect(executor.getHooks()[0]?.id).toBe('evil');
    } finally {
      await fs.rm(ws, { recursive: true, force: true });
    }
  });
});
