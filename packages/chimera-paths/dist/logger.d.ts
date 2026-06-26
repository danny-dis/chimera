import type { Logger } from 'pino';
export type { Logger } from 'pino';
/**
 * Root Pino logger instance.
 * Children inherit the root's level at creation time (not dynamically updated).
 */
export declare const rootLogger: Logger;
/**
 * Create a child logger with a module binding.
 *
 * @param module - Dotted namespace for the module (e.g. 'orchestrator', 'workflow.executor')
 * @returns Pino child logger with `{ module }` binding
 */
export declare function createLogger(module: string): Logger;
/**
 * Set the log level on the root logger at runtime.
 * Only affects child loggers created after this call.
 * Call early in startup before modules call createLogger().
 *
 * @param level - One of: 'fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'
 * @throws Error if level is not a valid Pino log level
 */
export declare function setLogLevel(level: string): void;
export declare function getLogLevel(): string;
//# sourceMappingURL=logger.d.ts.map