"use strict";
/**
 * Types for the unified `DeliberationEngine`.
 *
 * Chimera historically had 5 separate deliberation systems (Solo, Duo,
 * Trio, Fusion, Merge). This module defines a single config + result
 * surface that all 5 modes are exposed through. The engine itself lives
 * in `./engine.ts`; the underlying executors (`SoloExecutor`,
 * `DuoExecutor`, `TrioExecutor`, `ResultAggregator`) remain the
 * internal implementations — the engine is a thin facade that
 * dispatches on `config.mode` and normalizes each result to the same
 * 5-field `DeliberationResult` shape.
 *
 * Design notes (mirroring `research/deliberation-engine-design.md`):
 *   - The `DeliberationConfig` is a discriminated union on `mode`. All
 *     modes share `DeliberationConfigBase` so callers can write generic
 *     dispatch code without downcasting.
 *   - The `DeliberationResult` is identical for every mode. Modes that
 *     don't have a particular field (e.g. solo has no consensus) get an
 *     empty array / 0 confidence — never undefined.
 *   - The engine is **additive** to the existing executors. The old
 *     call sites (e.g. `AgentMesh.executeQualityGate` → `TrioExecutor`)
 *     keep working unchanged.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=types.js.map