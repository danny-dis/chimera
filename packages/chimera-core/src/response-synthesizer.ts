/**
 * Re-export shim — `ResponseSynthesizer` now lives in `coordinator/`.
 *
 * Kept at this location so the public package API (`index.ts`), the
 * session orchestrator, and any third-party importers keep working
 * unchanged. Prefer importing from `./coordinator/response-synthesizer.js`
 * for new code.
 */
export { ResponseSynthesizer } from './coordinator/response-synthesizer.js';
export type {
  SynthesisInput,
  Conflict,
  SynthesisResult,
} from './coordinator/response-synthesizer.js';
