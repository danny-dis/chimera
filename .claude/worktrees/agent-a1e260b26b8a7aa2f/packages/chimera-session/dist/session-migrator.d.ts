import type { Session } from './session-store.js';
import type { SessionCheckpoint } from './index.js';
export interface MigrationStep {
    version: number;
    description: string;
    migrate(data: unknown): unknown;
}
export interface MigrationResult {
    data: unknown;
    fromVersion: number;
    toVersion: number;
    stepsApplied: string[];
}
export declare class SessionMigrator {
    private steps;
    register(step: MigrationStep): void;
    getSteps(): MigrationStep[];
    getLatestVersion(): number;
    getVersion(data: unknown): number;
    migrate(data: unknown, targetVersion?: number): MigrationResult;
    migrateSession(session: Session): MigrationResult;
    migrateCheckpoint(checkpoint: SessionCheckpoint): MigrationResult;
    isUpToDate(data: unknown): boolean;
}
export declare function createDefaultMigrator(): SessionMigrator;
//# sourceMappingURL=session-migrator.d.ts.map