import { EventStream } from '@chimera/core';
import { type SessionCheckpoint } from '@chimera/session';
import type { LearningConfig, LearningReport, ArtifactInventory } from './types.js';
export declare class LearningEngine {
    private config;
    private analyzer;
    private skillSynth;
    private workflowSynth;
    private packComposer;
    private improver;
    private checkpointStore;
    constructor(config: LearningConfig);
    /**
     * Run the full learning pipeline on recent sessions.
     */
    learn(): Promise<LearningReport>;
    /**
     * Learn from a single completed session.
     *
     * Produces the full artifact triad: skills, workflows, and skill packs.
     * Optionally emits telemetry events via the provided EventStream.
     *
     * Guard rails prevent artifact creation from trivial sessions:
     *   - Minimum 5 events in the session (otherwise too sparse to learn from)
     *   - Minimum 2 turns (single-turn Q&A has no repeatable pattern)
     *   - Minimum 3 distinct tools used (sessions with no tool usage are Q&A only)
     *   - Domain confidence > 0.6 (raised from 0.3 to avoid false positives)
     */
    learnFromSession(checkpoint: SessionCheckpoint, eventStream?: EventStream): Promise<LearningReport>;
    /**
     * Get the current state of all synthesized artifacts.
     */
    getArtifactInventory(): Promise<ArtifactInventory>;
    private writeArtifacts;
    private buildSkillCoOccurrence;
    private getDominantMode;
}
//# sourceMappingURL=learning-engine.d.ts.map