// @chimera/paths — Cross-cutting utilities: logger, event-name helper.
// Public API is exported below; implementation files live alongside.

export {
  createLogger,
  setLogLevel,
  getLogLevel,
  rootLogger,
} from './logger.js';
export type { Logger } from './logger.js';

export { logEvent } from './event-name.js';
export type { LogState } from './event-name.js';
