"use strict";
/**
 * Shared types consumed by @chimera/context and re-exported by @chimera/core.
 *
 * Lives here to break the circular dependency:
 *   @chimera/core → @chimera/context → @chimera/core
 *
 * ChimeraEvent is a minimal discriminated union covering the subset of event
 * types that the context engine actually inspects. @chimera/core extends it
 * with the full 30+ member Zod schema at the type level.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=types.js.map