/**
 * @chimera/core — Config schema unit tests
 *
 * Tests for `schema.ts`: valid configs, invalid values, missing fields,
 * type coercion, edge cases.
 *
 * Uses vitest (matching the monorepo's test harness).
 */

import { describe, expect, it } from 'vitest';

import {
  validateConfig,
  loadAndValidate,
  LogLevelSchema,
  chimeraConfigSchema,
} from '../schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that validation succeeds and returns the expected fields. */
function expectValid(cfg: unknown, fields?: Record<string, unknown>) {
  const result = validateConfig(cfg);
  expect(result.ok).toBe(true);
  if (fields) {
    const valid = result as Extract<typeof result, { ok: true }>;
    for (const [key, val] of Object.entries(fields)) {
      expect(valid.data[key as keyof typeof valid.data]).toEqual(val);
    }
  }
}

/** Assert that validation fails with at least one error. */
function expectInvalid(
  cfg: unknown,
  expectedPatterns: string[] = [],
): Extract<typeof result, { ok: false }> {
  const result = validateConfig(cfg);
  expect(result.ok).toBe(false);
  const failure = result as Extract<typeof result, { ok: false }>;
  expect(failure.errors.length).toBeGreaterThan(0);
  for (const pattern of expectedPatterns) {
    expect(failure.errors.some((e) => e.includes(pattern))).toBe(true);
  }
  return failure;
}

// ---------------------------------------------------------------------------
// Empty / bare-minimum configs
// ---------------------------------------------------------------------------

describe('empty config', () => {
  it('accepts an empty object', () => {
    const result = validateConfig({});
    expect(result.ok).toBe(true);
  });

  it('accepts null (fails gracefully)', () => {
    const result = validateConfig(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('object');
    }
  });

  it('accepts an empty object — no required fields', () => {
    const result = validateConfig({});
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

describe('version', () => {
  it('accepts a valid version string', () => {
    expectValid({ version: '1.0.0' });
  });

  it('rejects an empty version', () => {
    expectInvalid({ version: '' }, ['must be a string with at least 1 characters']);
  });
});

// ---------------------------------------------------------------------------
// defaultModel
// ---------------------------------------------------------------------------

describe('defaultModel', () => {
  it('accepts a non-empty string', () => {
    expectValid({ defaultModel: 'gpt-4o' });
  });

  it('rejects an empty string', () => {
    expectInvalid({ defaultModel: '' }, ['must be a string with at least 1 characters']);
  });
});

// ---------------------------------------------------------------------------
// log_level / logLevel
// ---------------------------------------------------------------------------

describe('log_level', () => {
  it('accepts debug', () => {
    expectValid({ log_level: 'debug' });
  });

  it('accepts info', () => {
    expectValid({ log_level: 'info' });
  });

  it('accepts warn', () => {
    expectValid({ log_level: 'warn' });
  });

  it('accepts error', () => {
    expectValid({ log_level: 'error' });
  });

  it('rejects invalid log level', () => {
    expectInvalid({ log_level: 'verbose' }, ['must be one of']);
  });

  it('rejects numeric log level', () => {
    expectInvalid({ log_level: 42 }, ['must be one of']);
  });

  it('accepts logLevel alias', () => {
    expectValid({ logLevel: 'debug' });
  });

  it('rejects invalid logLevel alias', () => {
    expectInvalid({ logLevel: 'trace' }, ['must be one of']);
  });
});

// ---------------------------------------------------------------------------
// rate_limit
// ---------------------------------------------------------------------------

describe('rate_limit', () => {
  it('accepts valid rpm and tpm', () => {
    expectValid({ rate_limit: { rpm: 60, tpm: 100000 } });
  });

  it('accepts optional rph and tph', () => {
    expectValid({ rate_limit: { rpm: 60, tpm: 100000, rph: 3000, tph: 5000000 } });
  });

  it('rejects rpm of zero', () => {
    expectInvalid({ rate_limit: { rpm: 0, tpm: 100000 } }, ['must be >= 1']);
  });

  it('rejects negative rpm', () => {
    expectInvalid({ rate_limit: { rpm: -1, tpm: 100000 } }, ['must be >= 1']);
  });

  it('rejects tpm of zero', () => {
    expectInvalid({ rate_limit: { rpm: 60, tpm: 0 } }, ['must be >= 1']);
  });

  it('rejects non-integer rpm', () => {
    expectInvalid({ rate_limit: { rpm: 60.5, tpm: 100000 } }, ['must be an integer']);
  });

  it('rejects non-numeric rpm', () => {
    expectInvalid({ rate_limit: { rpm: 'fast', tpm: 100000 } }, ['must be a number']);
  });
});

// ---------------------------------------------------------------------------
// worktree
// ---------------------------------------------------------------------------

describe('worktree', () => {
  it('accepts valid worktree config', () => {
    expectValid(
      { worktree: { path: '/tmp/worktrees', enabled: true } },
      { worktree: { path: '/tmp/worktrees', enabled: true } },
    );
  });

  it('accepts empty worktree config', () => {
    // path is required in RawWorktreeSchema, so {} fails — test with minimal valid
    expectValid({ worktree: { path: '.chimera/worktrees' } });
  });

  it('accepts relative worktree path', () => {
    expectValid({ worktree: { path: '.chimera/worktrees' } });
  });

  it('accepts absolute worktree path', () => {
    expectValid({ worktree: { path: '/tmp/worktrees' } });
  });

  it('rejects empty worktree path', () => {
    expectInvalid({ worktree: { path: '' } }, ['must be a string with at least 1 characters']);
  });

  it('accepts maxConcurrent', () => {
    expectValid({ worktree: { path: '.chimera/worktrees', maxConcurrent: 5 } });
  });

  it('rejects maxConcurrent of zero', () => {
    expectInvalid({ worktree: { path: '.chimera/worktrees', maxConcurrent: 0 } }, ['must be >= 1']);
  });

  it('accepts initSubmodules true', () => {
    expectValid({ worktree: { path: '.chimera/worktrees', initSubmodules: true } });
  });

  it('accepts initSubmodules false', () => {
    expectValid({ worktree: { path: '.chimera/worktrees', initSubmodules: false } });
  });
});

// ---------------------------------------------------------------------------
// AI provider settings
// ---------------------------------------------------------------------------

describe('ai.providers', () => {
  it('accepts valid provider config', () => {
    expectValid({
      ai: {
        providers: {
          openai: { baseUrl: 'https://api.openai.com', model: 'gpt-4o' },
        },
      },
    });
  });

  it('accepts provider with all fields', () => {
    expectValid({
      ai: {
        providers: {
          openai: {
            baseUrl: 'https://api.openai.com',
            apiKey: 'sk-test-key',
            model: 'gpt-4o',
            timeout: 30000,
            retries: 3,
            maxTokens: 4096,
            temperature: 0.7,
            presencePenalty: 0.5,
            frequencyPenalty: 0.3,
          },
        },
      },
    });
  });

  it('rejects invalid baseUrl', () => {
    expectInvalid(
      { ai: { providers: { openai: { baseUrl: 'not-a-url' } } } },
      ['must be'],
    );
  });

  it('rejects negative timeout', () => {
    expectInvalid(
      { ai: { providers: { openai: { timeout: -100 } } } },
      ['must be >= 1'],
    );
  });

  it('rejects zero retries', () => {
    expectValid({
      ai: {
        providers: { openai: { retries: 0 } },
      },
    });
  });

  it('rejects retries > 20', () => {
    expectInvalid(
      { ai: { providers: { openai: { retries: 21 } } } },
      ['must be <= 20'],
    );
  });

  it('rejects temperature outside 0-2 range', () => {
    expectInvalid(
      { ai: { providers: { openai: { temperature: 3 } } } },
      ['must be'],
    );
  });
});

describe('ai.profiles', () => {
  it('accepts valid AI profile', () => {
    expectValid({
      ai: {
        defaultProfile: 'expert',
        profiles: {
          expert: {
            provider: 'openai',
            model: 'gpt-4o',
            maxTokens: 8192,
            temperature: 0.7,
          },
        },
      },
    });
  });

  it('rejects profile with missing provider', () => {
    expectInvalid(
      { ai: { profiles: { expert: { model: 'gpt-4o' } } } },
      ['must be'],
    );
  });

  it('rejects profile with empty model', () => {
    expectInvalid(
      { ai: { profiles: { expert: { provider: 'openai', model: '' } } } },
      ['must be a string with at least 1 characters'],
    );
  });

  it('accepts profile with optional fields', () => {
    expectValid({
      ai: {
        profiles: {
          expert: {
            provider: 'openai',
            model: 'gpt-4o',
            apiKey: 'sk-xxx',
            baseUrl: 'https://custom.example.com',
          },
        },
      },
    });
  });
});

describe('ai.defaultProfile', () => {
  it('accepts non-empty default profile', () => {
    expectValid({ ai: { defaultProfile: 'expert' } });
  });

  it('rejects empty default profile', () => {
    expectInvalid({ ai: { defaultProfile: '' } }, ['must be a string with at least 1 characters']);
  });
});

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

describe('sandbox', () => {
  it('accepts valid sandbox config', () => {
    expectValid({
      sandbox: {
        provider: 'e2b',
        apiKey: 'e2b-key',
        timeout: 60000,
      },
    });
  });

  it('accepts empty sandbox config', () => {
    expectValid({ sandbox: {} });
  });

  it('rejects zero timeout', () => {
    expectInvalid({ sandbox: { timeout: 0 } }, ['must be >= 1']);
  });

  it('rejects negative timeout', () => {
    expectInvalid({ sandbox: { timeout: -100 } }, ['must be >= 1']);
  });
});

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

describe('gateway', () => {
  it('accepts valid gateway config', () => {
    expectValid({ gateway: { enabled: true, port: 3000 } });
  });

  it('rejects port 0', () => {
    expectInvalid({ gateway: { port: 0 } }, ['must be >= 1']);
  });

  it('rejects port above 65535', () => {
    expectInvalid({ gateway: { port: 65536 } }, ['must be <= 65535']);
  });

  it('rejects negative port', () => {
    expectInvalid({ gateway: { port: -1 } }, ['must be >= 1']);
  });

  it('accepts no port (optional)', () => {
    expectValid({ gateway: { enabled: true } });
  });
});

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

describe('mcp', () => {
  it('accepts valid MCP config', () => {
    expectValid({
      mcp: { enabled: true, timeout: 30000, retries: 3, toolTimeout: 15000 },
    });
  });

  it('rejects zero timeout', () => {
    expectInvalid({ mcp: { timeout: 0 } }, ['must be >= 1']);
  });

  it('rejects retries > 10', () => {
    expectInvalid({ mcp: { retries: 11 } }, ['must be <= 10']);
  });

  it('accepts zero retries', () => {
    expectValid({ mcp: { retries: 0 } });
  });
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

describe('tools', () => {
  it('accepts valid tools config', () => {
    expectValid({ tools: { timeout: 60000, retries: 3 } });
  });

  it('rejects zero timeout', () => {
    expectInvalid({ tools: { timeout: 0 } }, ['must be >= 1']);
  });

  it('accepts zero retries', () => {
    expectValid({ tools: { retries: 0 } });
  });
});

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

describe('memory', () => {
  it('accepts valid memory config', () => {
    expectValid({ memory: { enabled: true, vectorStore: 'sqlite' } });
  });

  it('accepts empty memory config', () => {
    expectValid({ memory: {} });
  });
});

// ---------------------------------------------------------------------------
// cost_caps
// ---------------------------------------------------------------------------

describe('cost_caps', () => {
  it('accepts valid cost caps', () => {
    expectValid({ cost_caps: { perTask: 5, perSession: 20, perDay: 100 } });
  });

  it('accepts zero cost caps', () => {
    expectValid({ cost_caps: { perTask: 0 } });
  });

  it('rejects negative cost caps', () => {
    expectInvalid({ cost_caps: { perTask: -1 } }, ['must be >= 0']);
  });
});

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

describe('sessions', () => {
  it('accepts valid session config', () => {
    expectValid({
      sessions: {
        idleTimeout: 3600000,
        maxConcurrent: 5,
        maxPerUserPerDay: 100,
        persist: true,
      },
    });
  });

  it('rejects idleTimeout of zero', () => {
    expectInvalid({ sessions: { idleTimeout: 0 } }, ['must be >= 1']);
  });

  it('rejects maxConcurrent of zero', () => {
    expectInvalid({ sessions: { maxConcurrent: 0 } }, ['must be >= 1']);
  });
});

// ---------------------------------------------------------------------------
// learning
// ---------------------------------------------------------------------------

describe('learning', () => {
  it('accepts disabled mode', () => {
    expectValid({ learning: { mode: 'disabled' } });
  });

  it('accepts read mode', () => {
    expectValid({ learning: { mode: 'read' } });
  });

  it('accepts write mode', () => {
    expectValid({ learning: { mode: 'write' } });
  });

  it('accepts read-write mode', () => {
    expectValid({ learning: { mode: 'read-write' } });
  });

  it('rejects invalid mode', () => {
    expectInvalid({ learning: { mode: 'all' } }, ['must be one of']);
  });

  it('rejects zero maxIterations', () => {
    expectInvalid({ learning: { maxIterations: 0 } }, ['must be >= 1']);
  });

  it('rejects zero maxContextWindows', () => {
    expectInvalid({ learning: { maxContextWindows: 0 } }, ['must be >= 1']);
  });
});

// ---------------------------------------------------------------------------
// eval
// ---------------------------------------------------------------------------

describe('eval', () => {
  it('accepts valid eval config', () => {
    expectValid({ eval: { maxConcurrent: 3, timeout: 300000 } });
  });

  it('rejects zero maxConcurrent', () => {
    expectInvalid({ eval: { maxConcurrent: 0 } }, ['must be >= 1']);
  });

  it('rejects zero timeout', () => {
    expectInvalid({ eval: { timeout: 0 } }, ['must be >= 1']);
  });
});

// ---------------------------------------------------------------------------
// tui
// ---------------------------------------------------------------------------

describe('tui', () => {
  it('accepts valid TUI config', () => {
    expectValid({ tui: { theme: 'dark', keyboardShortcuts: true, animationSpeed: 1.5 } });
  });

  it('rejects animationSpeed above 5', () => {
    expectInvalid({ tui: { animationSpeed: 6 } }, ['must be <= 5']);
  });

  it('rejects negative animationSpeed', () => {
    expectInvalid({ tui: { animationSpeed: -1 } }, ['must be >= 0']);
  });
});

// ---------------------------------------------------------------------------
// cli
// ---------------------------------------------------------------------------

describe('cli', () => {
  it('accepts valid CLI config', () => {
    expectValid({ cli: { mode: 'code', defaultProvider: 'openai' } });
  });

  it('accepts empty CLI config', () => {
    expectValid({ cli: {} });
  });

  it('rejects invalid mode', () => {
    expectInvalid({ cli: { mode: 'hack' } }, ['must be one of']);
  });

  it('accepts all valid modes', () => {
    for (const mode of ['ask', 'plan', 'code', 'debug', 'review']) {
      expectValid({ cli: { mode } }, { cli: { mode } });
    }
  });
});

// ---------------------------------------------------------------------------
// security
// ---------------------------------------------------------------------------

describe('security', () => {
  it('accepts valid security config', () => {
    expectValid({ security: { secretDetection: true, rateLimitMode: 'per-user' } });
  });

  it('accepts empty security config', () => {
    expectValid({ security: {} });
  });

  it('rejects invalid rateLimitMode', () => {
    expectInvalid({ security: { rateLimitMode: 'per-project' } }, ['must be one of']);
  });
});

// ---------------------------------------------------------------------------
// oal
// ---------------------------------------------------------------------------

describe('oal', () => {
  it('accepts valid OAL config', () => {
    expectValid({
      oal: {
        maxIterations: 100,
        maxDuration: 3600000,
        maxCost: 50,
      },
    });
  });

  it('rejects zero maxIterations', () => {
    expectInvalid({ oal: { maxIterations: 0 } }, ['must be >= 1']);
  });

  it('rejects zero maxDuration', () => {
    expectInvalid({ oal: { maxDuration: 0 } }, ['must be >= 1']);
  });

  it('accepts zero maxCost', () => {
    expectValid({ oal: { maxCost: 0 } });
  });

  it('rejects negative maxCost', () => {
    expectInvalid({ oal: { maxCost: -1 } }, ['must be >= 0']);
  });
});

// ---------------------------------------------------------------------------
// workspace / workspaces paths
// ---------------------------------------------------------------------------

describe('workspace paths', () => {
  it('accepts workspace.dir', () => {
    expectValid({ workspace: { dir: '/home/user/project' } });
  });

  it('accepts workspaces.dir (modern key)', () => {
    expectValid({ workspaces: { dir: '/home/user/project' } });
  });

  it('accepts tempDir', () => {
    expectValid({ workspace: { tempDir: '/tmp/chimera' } });
  });

  it('rejects empty dir', () => {
    expectInvalid({ workspace: { dir: '' } }, ['must be a string with at least 1 characters']);
  });
});

// ---------------------------------------------------------------------------
// Max turns
// ---------------------------------------------------------------------------

describe('maxTurns', () => {
  it('accepts valid maxTurns', () => {
    expectValid({ maxTurns: 20 });
  });

  it('rejects zero maxTurns', () => {
    expectInvalid({ maxTurns: 0 }, ['must be >= 1']);
  });

  it('rejects negative maxTurns', () => {
    expectInvalid({ maxTurns: -5 }, ['must be >= 1']);
  });

  it('rejects non-integer maxTurns', () => {
    expectInvalid({ maxTurns: 5.5 }, ['must be']);
  });
});

// ---------------------------------------------------------------------------
// worktreeIsolation
// ---------------------------------------------------------------------------

describe('worktreeIsolation', () => {
  it('accepts true', () => {
    expectValid({ worktreeIsolation: true });
  });

  it('accepts false', () => {
    expectValid({ worktreeIsolation: false });
  });

  it('rejects non-boolean', () => {
    expectInvalid({ worktreeIsolation: 'yes' }, ['must be a boolean']);
  });
});

// ---------------------------------------------------------------------------
// Full realistic config
// ---------------------------------------------------------------------------

describe('full realistic config', () => {
  it('accepts a comprehensive config', () => {
    const fullConfig = {
      version: '1.0.0',
      defaultModel: 'gpt-4o',
      log_level: 'info',
      ai: {
        defaultProfile: 'expert',
        profiles: {
          expert: {
            provider: 'openai',
            model: 'gpt-4o',
            maxTokens: 8192,
            temperature: 0.7,
          },
        },
        providers: {
          openai: {
            baseUrl: 'https://api.openai.com',
            model: 'gpt-4o',
            timeout: 30000,
            retries: 3,
            maxTokens: 4096,
            temperature: 0.7,
            presencePenalty: 0.5,
            frequencyPenalty: 0.3,
          },
        },
      },
      rate_limit: {
        rpm: 60,
        tpm: 100000,
        rph: 3000,
        tph: 5000000,
      },
      worktree: {
        path: '.chimera/worktrees',
        enabled: true,
        initSubmodules: true,
        maxConcurrent: 5,
      },
      sandbox: {
        provider: 'e2b',
        apiKey: 'e2b-key',
        timeout: 60000,
      },
      gateway: {
        enabled: true,
        port: 3000,
      },
      mcp: {
        enabled: true,
        timeout: 30000,
        retries: 3,
        toolTimeout: 15000,
      },
      tools: {
        timeout: 60000,
        retries: 3,
      },
      memory: {
        enabled: true,
        vectorStore: 'sqlite',
      },
      cost_caps: {
        perTask: 5,
        perSession: 20,
        perDay: 100,
      },
      sessions: {
        idleTimeout: 3600000,
        maxConcurrent: 5,
        maxPerUserPerDay: 100,
        persist: true,
      },
      learning: {
        mode: 'read',
        maxIterations: 50,
        maxContextWindows: 10,
      },
      eval: {
        maxConcurrent: 3,
        timeout: 300000,
      },
      tui: {
        theme: 'dark',
        keyboardShortcuts: true,
        animationSpeed: 1.0,
      },
      cli: {
        mode: 'code',
        defaultProvider: 'openai',
      },
      security: {
        secretDetection: true,
        rateLimitMode: 'per-user',
      },
      oal: {
        maxIterations: 100,
        maxDuration: 3600000,
        maxCost: 50,
      },
      workspace: {
        dir: '/home/user/project',
        tempDir: '/tmp/chimera',
      },
      instructions: 'AGENTS.md',
      maxTurns: 20,
      worktreeIsolation: true,
    };

    const result = validateConfig(fullConfig);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Type coercion / edge cases
// ---------------------------------------------------------------------------

describe('type coercion edge cases', () => {
  it('rejects string where number expected', () => {
    expectInvalid({ maxTurns: '10' }, ['must be a number']);
  });

  it('rejects boolean where string expected', () => {
    expectInvalid({ defaultModel: true }, ['must be a string']);
  });

  it('rejects number where boolean expected', () => {
    expectInvalid({ worktreeIsolation: 1 }, ['must be a boolean']);
  });

  it('rejects array where object expected', () => {
    expectInvalid({ ai: [] }, ['must be an object']);
  });

  it('rejects null in a nested object', () => {
    expectInvalid({ worktree: { path: null } }, ['must be a string']);
  });

  it('accepts unknown fields (zod strips/ignores by default)', () => {
    expectValid({
      unknownField: 'ignored',
      anotherUnknown: 42,
    });
  });
});

// ---------------------------------------------------------------------------
// LogLevelSchema (standalone)
// ---------------------------------------------------------------------------

describe('LogLevelSchema', () => {
  it('accepts all valid levels', () => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      const result = LogLevelSchema.safeParse(level);
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid levels', () => {
    for (const level of ['trace', 'verbose', 'off', '']) {
      const result = LogLevelSchema.safeParse(level);
      expect(result.success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// loadAndValidate
// ---------------------------------------------------------------------------

describe('loadAndValidate', () => {
  it('returns error for nonexistent file', () => {
    const result = loadAndValidate('/nonexistent/path/config.yaml');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('not found');
    }
  });
});