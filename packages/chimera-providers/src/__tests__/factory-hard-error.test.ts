import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProviderFactory } from '../provider-factory.js';
import { MockProvider } from '../providers/mock.js';

/**
 * When no provider is configured, the factory falls back to MockProvider
 * so the CLI works out of the box for demos, CI, and first-run experience.
 */
describe('ProviderFactory.createFromEnv — mock fallback on no config', () => {
  const originalEnv = process.env;
  const originalCwd = process.cwd();
  let tmpDir: string;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Wipe all known provider env vars
    for (const k of [
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GOOGLE_API_KEY',
      'OLLAMA_MODEL',
      'OLLAMA_HOST',
      'ANTHROPIC_MODEL',
      'OPENAI_MODEL',
      'GOOGLE_MODEL',
      'CHIMERA_USE_MOCK',
      'CHIMERA_CHEAP_API_KEY',
      'CHIMERA_CHEAP_BASE_URL',
      'CHIMERA_CHEAP_MODEL',
    ]) {
      delete process.env[k];
    }
    // Make sure no .chimera/config.yaml lurks in the project root
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-no-config-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('returns MockProvider when no env vars and no config file', () => {
    const providers = ProviderFactory.createFromEnv();
    expect(providers).toHaveLength(1);
    expect(providers[0]).toBeInstanceOf(MockProvider);
  });

  it('createSingle() also returns MockProvider when nothing is configured', () => {
    const provider = ProviderFactory.createSingle();
    expect(provider).toBeInstanceOf(MockProvider);
  });

  it('createFromEnvOrMock() returns a MockProvider', () => {
    const provider = ProviderFactory.createFromEnvOrMock();
    expect(provider.getModel().provider).toBe('mock');
  });
});
