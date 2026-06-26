import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ProviderFactory } from '../provider-factory.js';
import { NoProviderConfiguredError, ProviderError } from '../errors.js';

/**
 * Quick-win 0.2: hard-error when no provider is configured.
 *
 * The factory used to silently fall back to MockProvider, which made the
 * CLI "work" for users with no API keys by echoing their prompt back.
 * That's a footgun — fail loudly instead.
 */
describe('ProviderFactory.createFromEnv — hard error on no config', () => {
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

  it('throws NoProviderConfiguredError when no env vars and no config file', () => {
    expect(() => ProviderFactory.createFromEnv()).toThrow(NoProviderConfiguredError);
  });

  it('error extends ProviderError so callers can catch the parent class', () => {
    let caught: unknown = null;
    try {
      ProviderFactory.createFromEnv();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProviderError);
    expect(caught).toBeInstanceOf(NoProviderConfiguredError);
    expect((caught as Error).name).toBe('NoProviderConfiguredError');
  });

  it('error message lists every supported provider and the env var to set', () => {
    try {
      ProviderFactory.createFromEnv();
      throw new Error('expected throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('No LLM provider configured');
      expect(msg).toContain('ANTHROPIC_API_KEY');
      expect(msg).toContain('OPENAI_API_KEY');
      expect(msg).toContain('GOOGLE_API_KEY');
      expect(msg).toContain('OLLAMA');
    }
  });

  it('error message mentions the config file and `chimera init` as alternatives', () => {
    try {
      ProviderFactory.createFromEnv();
      throw new Error('expected throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('.chimera/config.yaml');
      expect(msg).toContain('chimera init');
    }
  });

  it('error includes the locations that were checked (env + config path)', () => {
    try {
      ProviderFactory.createFromEnv();
      throw new Error('expected throw');
    } catch (err) {
      const e = err as NoProviderConfiguredError;
      expect(Array.isArray(e.checkedLocations)).toBe(true);
      expect(e.checkedLocations).toContain('process.env');
      // last entry is the resolved config path; match in a cross-platform way
      const hasConfig = e.checkedLocations.some(
        (l) => l.includes('.chimera') && l.endsWith('config.yaml'),
      );
      expect(hasConfig).toBe(true);
    }
  });

  it('createSingle() also throws NoProviderConfiguredError when nothing is configured', () => {
    expect(() => ProviderFactory.createSingle()).toThrow(NoProviderConfiguredError);
  });

  it('createFromEnvOrMock() still returns a MockProvider (backward compat)', () => {
    const provider = ProviderFactory.createFromEnvOrMock();
    expect(provider.getModel().provider).toBe('mock');
  });
});
