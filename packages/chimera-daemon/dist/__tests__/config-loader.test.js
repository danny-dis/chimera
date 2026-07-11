"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const config_loader_js_1 = require("../config-loader.js");
let tmpDir;
(0, vitest_1.beforeEach)(async () => {
    tmpDir = await fs_1.promises.mkdtemp(path_1.default.join(os_1.default.tmpdir(), 'chimera-daemon-test-'));
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
(0, vitest_1.afterEach)(async () => {
    await fs_1.promises.rm(tmpDir, { recursive: true, force: true });
});
const validConfig = {
    providers: [
        {
            name: 'writer',
            provider: 'anthropic',
            model: 'claude-opus-4',
            role: 'writer',
        },
    ],
};
(0, vitest_1.describe)('config-loader', () => {
    (0, vitest_1.describe)('configExists', () => {
        (0, vitest_1.it)('returns false when no config exists', () => {
            (0, vitest_1.expect)((0, config_loader_js_1.configExists)(tmpDir)).toBe(false);
        });
        (0, vitest_1.it)('returns true when config exists', async () => {
            const dir = path_1.default.join(tmpDir, '.chimera');
            await fs_1.promises.mkdir(dir, { recursive: true });
            await fs_1.promises.writeFile(path_1.default.join(dir, 'config.yaml'), 'providers: []');
            (0, vitest_1.expect)((0, config_loader_js_1.configExists)(tmpDir)).toBe(true);
        });
    });
    (0, vitest_1.describe)('loadConfig', () => {
        (0, vitest_1.it)('returns null when no config exists', () => {
            (0, vitest_1.expect)((0, config_loader_js_1.loadConfig)(tmpDir)).toBeNull();
        });
        (0, vitest_1.it)('loads a valid YAML config', async () => {
            const dir = path_1.default.join(tmpDir, '.chimera');
            await fs_1.promises.mkdir(dir, { recursive: true });
            await fs_1.promises.writeFile(path_1.default.join(dir, 'config.yaml'), `providers:
  - name: writer
    provider: anthropic
    model: claude-opus-4
    role: writer
`);
            const cfg = (0, config_loader_js_1.loadConfig)(tmpDir);
            (0, vitest_1.expect)(cfg).not.toBeNull();
            (0, vitest_1.expect)(cfg.providers).toHaveLength(1);
            (0, vitest_1.expect)(cfg.providers[0].name).toBe('writer');
        });
        (0, vitest_1.it)('returns null for invalid YAML', async () => {
            const dir = path_1.default.join(tmpDir, '.chimera');
            await fs_1.promises.mkdir(dir, { recursive: true });
            await fs_1.promises.writeFile(path_1.default.join(dir, 'config.yaml'), '{{invalid yaml');
            (0, vitest_1.expect)((0, config_loader_js_1.loadConfig)(tmpDir)).toBeNull();
        });
        (0, vitest_1.it)('returns null for config that fails schema validation', async () => {
            const dir = path_1.default.join(tmpDir, '.chimera');
            await fs_1.promises.mkdir(dir, { recursive: true });
            await fs_1.promises.writeFile(path_1.default.join(dir, 'config.yaml'), `providers:
  - name: ""
    provider: ""
    model: ""
    role: invalid_role
`);
            (0, vitest_1.expect)((0, config_loader_js_1.loadConfig)(tmpDir)).toBeNull();
        });
    });
    (0, vitest_1.describe)('saveConfig', () => {
        (0, vitest_1.it)('saves a config to .chimera/config.yaml', async () => {
            await (0, config_loader_js_1.saveConfig)(validConfig, tmpDir);
            const cfgPath = path_1.default.join(tmpDir, '.chimera', 'config.yaml');
            const content = await fs_1.promises.readFile(cfgPath, 'utf-8');
            (0, vitest_1.expect)(content).toContain('writer');
            (0, vitest_1.expect)(content).toContain('anthropic');
        });
        (0, vitest_1.it)('creates .chimera directory if missing', async () => {
            await (0, config_loader_js_1.saveConfig)(validConfig, tmpDir);
            const dirExists = await fs_1.promises.stat(path_1.default.join(tmpDir, '.chimera'));
            (0, vitest_1.expect)(dirExists.isDirectory()).toBe(true);
        });
        (0, vitest_1.it)('round-trips: save then load', async () => {
            await (0, config_loader_js_1.saveConfig)(validConfig, tmpDir);
            const loaded = (0, config_loader_js_1.loadConfig)(tmpDir);
            (0, vitest_1.expect)(loaded).not.toBeNull();
            (0, vitest_1.expect)(loaded.providers).toHaveLength(1);
            (0, vitest_1.expect)(loaded.providers[0].model).toBe('claude-opus-4');
        });
    });
    (0, vitest_1.describe)('autoGenerateConfig', () => {
        const originalEnv = { ...process.env };
        (0, vitest_1.afterEach)(() => {
            process.env = { ...originalEnv };
        });
        (0, vitest_1.it)('returns null when no env vars are set', async () => {
            delete process.env.ANTHROPIC_API_KEY;
            delete process.env.ANTHROPIC_MODEL;
            delete process.env.OPENAI_API_KEY;
            delete process.env.OPENAI_MODEL;
            delete process.env.GOOGLE_API_KEY;
            delete process.env.GOOGLE_MODEL;
            delete process.env.OLLAMA_MODEL;
            (0, vitest_1.expect)(await (0, config_loader_js_1.autoGenerateConfig)(tmpDir)).toBeNull();
        });
        (0, vitest_1.it)('generates config from Anthropic env vars', async () => {
            process.env.ANTHROPIC_API_KEY = 'test-key';
            process.env.ANTHROPIC_MODEL = 'claude-opus-4';
            delete process.env.OPENAI_API_KEY;
            delete process.env.OPENAI_MODEL;
            delete process.env.GOOGLE_API_KEY;
            delete process.env.GOOGLE_MODEL;
            delete process.env.OLLAMA_MODEL;
            const cfg = await (0, config_loader_js_1.autoGenerateConfig)(tmpDir);
            (0, vitest_1.expect)(cfg).not.toBeNull();
            // A single detected provider is auto-assigned to all three roles so the
            // quality gate runs out-of-the-box (primary=writer, secondary=reviewer,
            // tertiary=challenger).
            (0, vitest_1.expect)(cfg.providers).toHaveLength(3);
            (0, vitest_1.expect)(cfg.providers[0].role).toBe('writer');
            (0, vitest_1.expect)(cfg.providers[0].provider).toBe('anthropic');
            (0, vitest_1.expect)(cfg.providers[1].role).toBe('reviewer');
            (0, vitest_1.expect)(cfg.providers[1].provider).toBe('anthropic');
            (0, vitest_1.expect)(cfg.providers[2].role).toBe('challenger');
        });
        (0, vitest_1.it)('generates config from multiple providers', async () => {
            process.env.ANTHROPIC_API_KEY = 'test-key';
            process.env.ANTHROPIC_MODEL = 'claude-opus-4';
            process.env.OPENAI_API_KEY = 'test-key';
            process.env.OPENAI_MODEL = 'gpt-4o';
            process.env.GOOGLE_API_KEY = 'test-key';
            process.env.GOOGLE_MODEL = 'gemini-2.5-pro';
            delete process.env.OLLAMA_MODEL;
            const cfg = await (0, config_loader_js_1.autoGenerateConfig)(tmpDir);
            (0, vitest_1.expect)(cfg).not.toBeNull();
            (0, vitest_1.expect)(cfg.providers).toHaveLength(3);
            (0, vitest_1.expect)(cfg.providers[0].role).toBe('writer');
            (0, vitest_1.expect)(cfg.providers[1].role).toBe('reviewer');
            (0, vitest_1.expect)(cfg.providers[2].role).toBe('challenger');
        });
        (0, vitest_1.it)('saves config to disk', async () => {
            process.env.ANTHROPIC_API_KEY = 'test-key';
            process.env.ANTHROPIC_MODEL = 'claude-opus-4';
            delete process.env.OPENAI_API_KEY;
            delete process.env.OPENAI_MODEL;
            delete process.env.GOOGLE_API_KEY;
            delete process.env.GOOGLE_MODEL;
            delete process.env.OLLAMA_MODEL;
            await (0, config_loader_js_1.autoGenerateConfig)(tmpDir);
            (0, vitest_1.expect)((0, config_loader_js_1.configExists)(tmpDir)).toBe(true);
            const loaded = (0, config_loader_js_1.loadConfig)(tmpDir);
            (0, vitest_1.expect)(loaded).not.toBeNull();
            (0, vitest_1.expect)(loaded.providers.length).toBeGreaterThan(0);
        });
        (0, vitest_1.it)('generates 3 models from 1 API key using per-role env vars', async () => {
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
            const cfg = await (0, config_loader_js_1.autoGenerateConfig)(tmpDir);
            (0, vitest_1.expect)(cfg).not.toBeNull();
            (0, vitest_1.expect)(cfg.providers).toHaveLength(3);
            (0, vitest_1.expect)(cfg.providers[0].name).toBe('writer');
            (0, vitest_1.expect)(cfg.providers[0].provider).toBe('anthropic');
            (0, vitest_1.expect)(cfg.providers[0].model).toBe('claude-haiku');
            (0, vitest_1.expect)(cfg.providers[0].role).toBe('writer');
            (0, vitest_1.expect)(cfg.providers[1].name).toBe('reviewer');
            (0, vitest_1.expect)(cfg.providers[1].model).toBe('claude-sonnet-4-20250514');
            (0, vitest_1.expect)(cfg.providers[1].role).toBe('reviewer');
            (0, vitest_1.expect)(cfg.providers[2].name).toBe('challenger');
            (0, vitest_1.expect)(cfg.providers[2].model).toBe('claude-opus-4');
            (0, vitest_1.expect)(cfg.providers[2].role).toBe('challenger');
        });
        (0, vitest_1.it)('generates partial per-role config with only writer set', async () => {
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
            const cfg = await (0, config_loader_js_1.autoGenerateConfig)(tmpDir);
            (0, vitest_1.expect)(cfg).not.toBeNull();
            // Single provider gets duplicated for writer + reviewer
            (0, vitest_1.expect)(cfg.providers).toHaveLength(2);
            (0, vitest_1.expect)(cfg.providers[0].name).toBe('writer');
            (0, vitest_1.expect)(cfg.providers[0].model).toBe('claude-haiku');
            (0, vitest_1.expect)(cfg.providers[0].role).toBe('writer');
            (0, vitest_1.expect)(cfg.providers[1].role).toBe('reviewer');
        });
    });
});
//# sourceMappingURL=config-loader.test.js.map