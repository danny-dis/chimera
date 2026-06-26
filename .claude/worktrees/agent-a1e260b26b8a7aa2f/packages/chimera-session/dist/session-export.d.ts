import type { Session } from './session-store.js';
import type { SessionCheckpoint } from './index.js';
export interface ExportMetadata {
    exportedAt: string;
    version: number;
    sessionCount: number;
    checkpointCount: number;
}
export interface SessionExportBundle {
    metadata: ExportMetadata;
    sessions: Session[];
    checkpoints: SessionCheckpoint[];
}
export interface ExportOptions {
    sessionIds?: string[];
    checkpointIds?: string[];
    createdAfter?: string;
    createdBefore?: string;
}
export interface ImportResult {
    sessionsImported: number;
    checkpointsImported: number;
    errors: string[];
}
export interface ValidationRule {
    validate(data: unknown): boolean;
    message: string;
}
export declare class SessionExporter {
    exportBundle(sessions: Session[], checkpoints: SessionCheckpoint[], options?: ExportOptions): SessionExportBundle;
    exportToFile(filePath: string, sessions: Session[], checkpoints: SessionCheckpoint[], options?: ExportOptions): Promise<void>;
    static getDefaultValidationRules(): ValidationRule[];
}
export declare class SessionImporter {
    private validationRules;
    constructor(validationRules?: ValidationRule[]);
    validate(data: unknown): {
        valid: boolean;
        errors: string[];
    };
    importFromFile(filePath: string): Promise<SessionExportBundle>;
    importFromJson(jsonString: string): SessionExportBundle;
    mergeWithExisting(imported: SessionExportBundle, existingSessions: Session[], existingCheckpoints: SessionCheckpoint[]): ImportResult;
}
//# sourceMappingURL=session-export.d.ts.map