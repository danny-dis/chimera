"use strict";
// Ported from research/archon/packages/paths/src/logger.ts @ 2026-06-15.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rootLogger = void 0;
exports.createLogger = createLogger;
exports.setLogLevel = setLogLevel;
exports.getLogLevel = getLogLevel;
/**
 * Structured logging utility built on Pino
 *
 * Usage:
 *   import { createLogger } from '@chimera/paths';
 *   const log = createLogger('orchestrator');
 *   log.info({ conversationId }, 'session.create_started');
 *   log.error({ err, conversationId }, 'session.create_failed');
 *
 * Log levels (standard Pino levels):
 *   fatal  (60) - Process cannot continue
 *   error  (50) - Failures needing immediate attention
 *   warn   (40) - Degraded behavior, fallbacks
 *   info   (30) - Key user-visible events (DEFAULT)
 *   debug  (20) - Internal details, tool calls, state transitions
 *   trace  (10) - Fine-grained diagnostic output
 *   silent      - Disables all logging (used by the CLI in --json mode so no
 *                 log line can interleave with the machine-readable payload)
 *
 * Configuration:
 *   LOG_LEVEL env var or setLogLevel() at startup
 *   Pretty-printed when stdout is a TTY and NODE_ENV !== 'production'
 *   Newline-delimited JSON otherwise (piped, redirected, or production)
 */
const pino_1 = __importDefault(require("pino"));
const pino_pretty_1 = __importDefault(require("pino-pretty"));
// 'silent' is Pino's built-in level that disables all output. The CLI uses it
// in --json mode to keep stdout to exactly the JSON payload.
const VALID_LEVELS = new Set(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
function getInitialLevel() {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    if (envLevel) {
        if (VALID_LEVELS.has(envLevel)) {
            return envLevel;
        }
        // Warn via console since the logger itself isn't configured yet
        console.warn(`[logger] Invalid LOG_LEVEL '${process.env.LOG_LEVEL}'. ` +
            `Valid levels: ${[...VALID_LEVELS].join(', ')}. Falling back to 'info'.`);
    }
    return 'info';
}
/**
 * Build the root Pino logger.
 *
 * Uses `pino-pretty` as a **destination stream** (not a worker-thread transport)
 * when stdout is a TTY and NODE_ENV !== 'production'. Running pino-pretty as a
 * destination stream keeps the formatter on the main thread, which avoids the
 * `require.resolve('pino-pretty')` lookup that crashes inside Bun's `/$bunfs/`
 * virtual filesystem in compiled binaries (see GitHub issue #960 / #979).
 *
 * The same code path runs in dev and compiled binaries — no environment
 * detection required.
 */
function buildLogger() {
    const level = getInitialLevel();
    const usePretty = process.stdout.isTTY && process.env.NODE_ENV !== 'production';
    if (usePretty) {
        try {
            const stream = (0, pino_pretty_1.default)({
                colorize: true,
                levelFirst: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
            });
            return (0, pino_1.default)({ level }, stream);
        }
        catch (err) {
            // pino-pretty failed to initialize (missing peer, broken TTY descriptor,
            // or incompatible runtime). Fall back to plain JSON so logging keeps
            // working instead of crashing the entire process at module import time.
            console.warn(`[logger] pino-pretty failed to initialize, falling back to JSON output: ${err.message}`);
        }
    }
    return (0, pino_1.default)({ level });
}
/**
 * Root Pino logger instance.
 * Children inherit the root's level at creation time (not dynamically updated).
 */
exports.rootLogger = buildLogger();
/**
 * Create a child logger with a module binding.
 *
 * @param module - Dotted namespace for the module (e.g. 'orchestrator', 'workflow.executor')
 * @returns Pino child logger with `{ module }` binding
 */
function createLogger(module) {
    return exports.rootLogger.child({ module });
}
/**
 * Set the log level on the root logger at runtime.
 * Only affects child loggers created after this call.
 * Call early in startup before modules call createLogger().
 *
 * @param level - One of: 'fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'
 * @throws Error if level is not a valid Pino log level
 */
function setLogLevel(level) {
    const normalized = level.toLowerCase();
    if (!VALID_LEVELS.has(normalized)) {
        throw new Error(`Invalid log level: '${level}'. Valid levels: ${[...VALID_LEVELS].join(', ')}`);
    }
    exports.rootLogger.level = normalized;
}
function getLogLevel() {
    return exports.rootLogger.level;
}
//# sourceMappingURL=logger.js.map