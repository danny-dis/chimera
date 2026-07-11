import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, saveConfig, configExists, autoGenerateConfig } from '../config-loader.js';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-daemon-test-'));
  // Isolate provider env so autoGenerateConfig only sees what each test sets.
  for (const k of [
    'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL',
    'OPENAI_API_KEY', 'OPENAI_MODEL',
    'GOOGLE_API_KEY', 'GOOGLE_MODEL',
    'OLLAMA_MODEL', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENROUTER_BASE_URL',
  ]) {
    delete process.env[k];
  }
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const validConfig = {
  providers: [
    {
      name: 'writer',
      provider: 'anthropic',
      model: 'claude-opus-4',
      role: 'writer' as const,
    },
  ],
};

describe('config-loader', () => {
  describe('configExists', () => {
    it('returns false when no config exists', () => {
      expect(configExists(tmpDir)).toBe(false);
    });

    it('returns true when config exists', async () => {
      const dir = path.join(tmpDir, '.chimera');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'config.yaml'), 'providers: []');
      expect(configExists(tmpDir)).toBe(true);
    });
  });

  describe('loadConfig', () => {
    it('returns null when no config exists', () => {
      expect(loadConfig(tmpDir)).toBeNull();
    });

    it('loads a valid YAML config', async () => {
      const dir = path.join(tmpDir, '.chimera');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'config.yaml'),
        `providers:
  - name: writer
    provider: anthropic
    model: claude-opus-4
    role: writer
`,
      );

      const cfg = loadConfig(tmpDir);
      expect(cfg).not.toBeNull();
      expect(cfg!.providers).toHaveLength(1);
      expect(cfg!.providers[0].name).toBe('writer');
    });

    it('returns null for invalid YAML', async () => {
      const dir = path.join(tmpDir, '.chimera');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'config.yaml'), '{{invalid yaml');

      expect(loadConfig(tmpDir)).toBeNull();
    });

    it('returns null for config that fails schema validation', async () => {
      const dir = path.join(tmpDir, '.chimera');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, 'config.yaml'),
        `providers:
  - name: ""
    provider: ""
    model: ""
    role: invalid_role
`,
      );

      expect(loadConfig(tmpDir)).toBeNull();
    });
  });

  describe('saveConfig', () => {
    it('saves a config to .chimera/config.yaml', async () => {
      await saveConfig(validConfig as any, tmpDir);

      const cfgPath = path.join(tmpDir, '.chimera', 'config.yaml');
      const content = await fs.readFile(cfgPath, 'utf-8');
      expect(content).toContain('writer');
      expect(content).toContain('anthropic');
    });

    it('creates .chimera directory if missing', async () => {
      await saveConfig(validConfig as any, tmpDir);

      const dirExists = await fs.stat(path.join(tmpDir, '.chimera'));
      expect(dirExists.isDirectory()).toBe(true);
    });

    it('round-trips: save then load', async () => {
      await saveConfig(validConfig as any, tmpDir);
      const loaded = loadConfig(tmpDir);

      expect(loaded).not.toBeNull();
      expect(loaded!.providers).toHaveLength(1);
      expect(loaded!.providers[0].model).toBe('claude-opus-4');
    });
  });

  describe('autoGenerateConfig', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns null when no env vars are set', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_MODEL;
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_MODEL;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_MODEL;
      delete process.env.OLLAMA_MODEL;

      expect(await autoGenerateConfig(tmpDir)).toBeNull();
    });

    it('generates config from Anthropic env vars', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.ANTHROPIC_MODEL = 'claude-opus-4';
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_MODEL;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_MODEL;
      delete process.env.OLLAMA_MODEL;

      const cfg = await autoGenerateConfig(tmpDir);
      expect(cfg).not.toBeNull();
      // A single detected provider is auto-assigned to all three roles so the
      // quality gate runs out-of-the-box (primary=writer, secondary=reviewer,
      // tertiary=challenger).
      expect(cfg!.providers).toHaveLength(3);
      expect(cfg!.providers[0].role).toBe('writer');
      expect(cfg!.providers[0].provider).toBe('anthropic');
      expect(cfg!.providers[1].role).toBe('reviewer');
      expect(cfg!.providers[1].provider).toBe('anthropic');
      expect(cfg!.providers[2].role).toBe('challenger');
    });

    it('generates config from multiple providers', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.ANTHROPIC_MODEL = 'claude-opus-4';
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_MODEL = 'gpt-4o';
      process.env.GOOGLE_API_KEY = 'test-key';
      process.env.GOOGLE_MODEL = 'gemini-2.5-pro';
      delete process.env.OLLAMA_MODEL;

      const cfg = await autoGenerateConfig(tmpDir);
      expect(cfg).not.toBeNull();
      expect(cfg!.providers).toHaveLength(3);
      expect(cfg!.providers[0].role).toBe('writer');
      expect(cfg!.providers[1].role).toBe('reviewer');
      expect(cfg!.providers[2].role).toBe('challenger');
    });

    it('saves config to disk', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.ANTHROPIC_MODEL = 'claude-opus-4';
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_MODEL;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_MODEL;
      delete process.env.OLLAMA_MODEL;

      await autoGenerateConfig(tmpDir);
      expect(configExists(tmpDir)).toBe(true);

      const loaded = loadConfig(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.providers.length).toBeGreaterThan(0);
    });

    it('generates 3 models from 1 API key using per-role env vars', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.CHIMERA_WRITER_MODEL = 'claude-haiku';
      process.env.CHIMERA_REVIEWER_MODEL = 'claude-sonnet-4-20250514';
      process.env.CHIMERA_CHALLENGER_MODEL = 'claude-opus-4';
      delete process.env.ANTHROPIC_MODEL;
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_MODEL;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_MODEL;
      delete process.env.OLLAMA_MODEL;

      const cfg = await autoGenerateConfig(tmpDir);
      expect(cfg).not.toBeNull();
      expect(cfg!.providers).toHaveLength(3);
      expect(cfg!.providers[0].name).toBe('writer');
      expect(cfg!.providers[0].provider).toBe('anthropic');
      expect(cfg!.providers[0].model).toBe('claude-haiku');
      expect(cfg!.providers[0].role).toBe('writer');
      expect(cfg!.providers[1].name).toBe('reviewer');
      expect(cfg!.providers[1].model).toBe('claude-sonnet-4-20250514');
      expect(cfg!.providers[1].role).toBe('reviewer');
      expect(cfg!.providers[2].name).toBe('challenger');
      expect(cfg!.providers[2].model).toBe('claude-opus-4');
      expect(cfg!.providers[2].role).toBe('challenger');
    });

    it('generates partial per-role config with only writer set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.CHIMERA_WRITER_MODEL = 'claude-haiku';
      delete process.env.CHIMERA_REVIEWER_MODEL;
      delete process.env.CHIMERA_CHALLENGER_MODEL;
      delete process.env.ANTHROPIC_MODEL;
      delete process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_MODEL;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_MODEL;
      delete process.env.OLLAMA_MODEL;

      const cfg = await autoGenerateConfig(tmpDir);
      expect(cfg).not.toBeNull();
      // Single provider gets duplicated for writer + reviewer
      expect(cfg!.providers).toHaveLength(2);
      expect(cfg!.providers[0].name).toBe('writer');
      expect(cfg!.providers[0].model).toBe('claude-haiku');
      expect(cfg!.providers[0].role).toBe('writer');
      expect(cfg!.providers[1].role).toBe('reviewer');
    });
  });
});
