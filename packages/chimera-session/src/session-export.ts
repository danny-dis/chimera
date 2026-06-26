import { promises as fs } from 'fs';
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

export class SessionExporter {
  exportBundle(
    sessions: Session[],
    checkpoints: SessionCheckpoint[],
    options: ExportOptions = {},
  ): SessionExportBundle {
    const { sessionIds, checkpointIds, createdAfter, createdBefore } = options;

    let filteredSessions = sessions;
    if (sessionIds) {
      const idSet = new Set(sessionIds);
      filteredSessions = filteredSessions.filter(s => idSet.has(s.id));
    }
    if (createdAfter) {
      filteredSessions = filteredSessions.filter(s => s.createdAt >= createdAfter);
    }
    if (createdBefore) {
      filteredSessions = filteredSessions.filter(s => s.createdAt <= createdBefore);
    }

    let filteredCheckpoints = checkpoints;
    if (checkpointIds) {
      const idSet = new Set(checkpointIds);
      filteredCheckpoints = filteredCheckpoints.filter(c => idSet.has(c.sessionId));
    }
    if (createdAfter) {
      filteredCheckpoints = filteredCheckpoints.filter(c => c.timestamp >= createdAfter);
    }
    if (createdBefore) {
      filteredCheckpoints = filteredCheckpoints.filter(c => c.timestamp <= createdBefore);
    }

    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        version: 1,
        sessionCount: filteredSessions.length,
        checkpointCount: filteredCheckpoints.length,
      },
      sessions: filteredSessions,
      checkpoints: filteredCheckpoints,
    };
  }

  async exportToFile(
    filePath: string,
    sessions: Session[],
    checkpoints: SessionCheckpoint[],
    options: ExportOptions = {},
  ): Promise<void> {
    const bundle = this.exportBundle(sessions, checkpoints, options);
    await fs.writeFile(filePath, JSON.stringify(bundle, null, 2), 'utf-8');
  }

  static getDefaultValidationRules(): ValidationRule[] {
    return [
      {
        validate: (data): data is SessionExportBundle =>
          typeof data === 'object' && data !== null && 'metadata' in data && 'sessions' in data && 'checkpoints' in data,
        message: 'Export bundle must have metadata, sessions, and checkpoints fields',
      },
      {
        validate: (data) => {
          const obj = data as Record<string, unknown>;
          const meta = obj.metadata as Record<string, unknown>;
          return typeof meta?.version === 'number' && meta.version >= 1;
        },
        message: 'Metadata must have a valid version >= 1',
      },
      {
        validate: (data) => {
          const obj = data as Record<string, unknown>;
          return Array.isArray(obj.sessions) && Array.isArray(obj.checkpoints);
        },
        message: 'Sessions and checkpoints must be arrays',
      },
    ];
  }
}

export class SessionImporter {
  private validationRules: ValidationRule[];

  constructor(validationRules?: ValidationRule[]) {
    this.validationRules = validationRules ?? SessionExporter.getDefaultValidationRules();
  }

  validate(data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    for (const rule of this.validationRules) {
      if (!rule.validate(data)) {
        errors.push(rule.message);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  async importFromFile(filePath: string): Promise<SessionExportBundle> {
    const raw = await fs.readFile(filePath, 'utf-8');
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Failed to parse import file as JSON: ${filePath}`);
    }
    const { valid, errors } = this.validate(data);
    if (!valid) {
      throw new Error(`Invalid import file: ${errors.join('; ')}`);
    }
    return data as SessionExportBundle;
  }

  importFromJson(jsonString: string): SessionExportBundle {
    let data: unknown;
    try {
      data = JSON.parse(jsonString);
    } catch {
      throw new Error('Failed to parse import data as JSON');
    }
    const { valid, errors } = this.validate(data);
    if (!valid) {
      throw new Error(`Invalid import data: ${errors.join('; ')}`);
    }
    return data as SessionExportBundle;
  }

  mergeWithExisting(
    imported: SessionExportBundle,
    existingSessions: Session[],
    existingCheckpoints: SessionCheckpoint[],
  ): ImportResult {
    const errors: string[] = [];
    let sessionsImported = 0;
    let checkpointsImported = 0;

    const existingSessionMap = new Map(existingSessions.map(s => [s.id, s]));
    for (const session of imported.sessions) {
      if (!existingSessionMap.has(session.id)) {
        existingSessions.push(session);
        sessionsImported++;
      } else {
        errors.push(`Session ${session.id} already exists, skipped`);
      }
    }

    const existingCheckpointMap = new Map(existingCheckpoints.map(c => [c.sessionId, c]));
    for (const checkpoint of imported.checkpoints) {
      if (!existingCheckpointMap.has(checkpoint.sessionId)) {
        existingCheckpoints.push(checkpoint);
        checkpointsImported++;
      } else {
        errors.push(`Checkpoint ${checkpoint.sessionId} already exists, skipped`);
      }
    }

    return { sessionsImported, checkpointsImported, errors };
  }
}
