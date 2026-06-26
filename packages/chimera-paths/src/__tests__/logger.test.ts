/**
 * @chimera/paths — logger + event-name unit tests
 *
 * Logger tests are tricky because Pino writes to stdout/stderr:
 *   - Pure API tests (setLogLevel / getLogLevel / logEvent) just inspect state.
 *   - The `silent` test redirects `process.stdout.write` to a buffer.
 *   - The end-to-end JSON test captures stdout and parses the last line.
 *   - The LOG_LEVEL env-var tests use `vi.resetModules()` to re-run the
 *     top-level `buildLogger()` side effect with a controlled env.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { logEvent } from '../event-name.js';

describe('createLogger', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { setLogLevel } = await import('../logger.js');
    setLogLevel('info');
  });

  it('returns a Pino logger instance', async () => {
    const { createLogger } = await import('../logger.js');
    const log = createLogger('test.module');
    expect(typeof log.info).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.trace).toBe('function');
    expect(typeof log.fatal).toBe('function');
    // child() and bindings() are Pino-specific affordances
    expect(typeof log.child).toBe('function');
    expect(typeof log.bindings).toBe('function');
  });

  it('child loggers inherit the module name via { module } binding', async () => {
    const { createLogger } = await import('../logger.js');
    const log = createLogger('workflow.executor');
    const bindings = log.bindings();
    expect(bindings.module).toBe('workflow.executor');
  });

  it('multiple calls with the same module return independent children', async () => {
    const { createLogger } = await import('../logger.js');
    const log1 = createLogger('same-module');
    const log2 = createLogger('same-module');
    expect(log1).not.toBe(log2);
    expect(log1.bindings().module).toBe('same-module');
    expect(log2.bindings().module).toBe('same-module');
  });

  it('the silent level suppresses output (no JSON written to stdout)', async () => {
    const { createLogger, setLogLevel } = await import('../logger.js');
    setLogLevel('silent');

    const originalWrite = process.stdout.write.bind(process.stdout);
    const captured: string[] = [];
    (process.stdout as { write: typeof originalWrite }).write = ((
      chunk: string | Uint8Array,
    ): boolean => {
      captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof originalWrite;

    try {
      const log = createLogger('silent.module');
      log.info({ test: 1 }, 'silent.test_completed');
      log.error({ test: 2 }, 'silent.test_failed');
      log.warn({ test: 3 }, 'silent.test_warning');
    } finally {
      (process.stdout as { write: typeof originalWrite }).write = originalWrite;
    }

    expect(captured.length).toBe(0);
  });
});

describe('setLogLevel / getLogLevel', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { setLogLevel } = await import('../logger.js');
    setLogLevel('info');
  });

  it('round-trips: setLogLevel(debug) then getLogLevel() returns debug', async () => {
    const { getLogLevel, setLogLevel } = await import('../logger.js');
    setLogLevel('debug');
    expect(getLogLevel()).toBe('debug');
  });

  it('throws on invalid level', async () => {
    const { setLogLevel } = await import('../logger.js');
    expect(() => setLogLevel('bogus')).toThrow(/Invalid log level/);
  });
});

describe('LOG_LEVEL env var (getInitialLevel)', () => {
  const ORIGINAL = process.env.LOG_LEVEL;

  beforeEach(() => {
    delete process.env.LOG_LEVEL;
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = ORIGINAL;
    }
    vi.resetModules();
  });

  it('valid LOG_LEVEL=warn is respected by buildLogger at module load', async () => {
    process.env.LOG_LEVEL = 'warn';
    const { getLogLevel } = await import('../logger.js');
    expect(getLogLevel()).toBe('warn');
  });

  it('invalid LOG_LEVEL=bogus falls back to info and warns on stderr', async () => {
    process.env.LOG_LEVEL = 'bogus';

    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((a) => String(a)).join(' '));
    };

    try {
      const { getLogLevel } = await import('../logger.js');
      expect(getLogLevel()).toBe('info');
    } finally {
      console.warn = originalWarn;
    }

    const warnedAboutBogus = warnings.some((w) => w.includes("Invalid LOG_LEVEL 'bogus'"));
    expect(warnedAboutBogus).toBe(true);
  });
});

describe('logEvent', () => {
  it('builds session.create_started', () => {
    expect(logEvent('session', 'create', 'started')).toBe('session.create_started');
  });

  it('builds isolation.worktree_create_failed', () => {
    expect(logEvent('isolation', 'worktree', 'create_failed')).toBe(
      'isolation.worktree_create_failed',
    );
  });

  it('builds provider.select_completed', () => {
    expect(logEvent('provider', 'select', 'completed')).toBe('provider.select_completed');
  });
});

describe('end-to-end JSON output', () => {
  it('emits valid JSON log lines to stdout in non-TTY mode', async () => {
    vi.resetModules();
    const { createLogger, setLogLevel } = await import('../logger.js');

    // Force non-TTY JSON output regardless of the test runner's tty state
    const originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });

    const originalWrite = process.stdout.write.bind(process.stdout);
    const captured: string[] = [];
    (process.stdout as { write: typeof originalWrite }).write = ((
      chunk: string | Uint8Array,
    ): boolean => {
      captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof originalWrite;

    try {
      setLogLevel('info');
      const log = createLogger('test');
      log.info({ foo: 42 }, 'session.test_completed');
    } finally {
      (process.stdout as { write: typeof originalWrite }).write = originalWrite;
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      });
    }

    expect(captured.length).toBeGreaterThan(0);
    const lines = captured.join('').trim().split('\n');
    const lastLine = lines[lines.length - 1] ?? '{}';
    const parsed: { module?: string; msg?: string; foo?: number } = JSON.parse(lastLine);
    expect(parsed.module).toBe('test');
    expect(parsed.msg).toBe('session.test_completed');
    expect(parsed.foo).toBe(42);
  });
});
