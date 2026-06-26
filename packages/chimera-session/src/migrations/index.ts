/**
 * Idempotent migration system for chimera sessions.
 *
 * Each migration is a named function that transforms data from one schema
 * version to the next. Migrations run in order and are idempotent — running
 * them multiple times produces the same result.
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface Migration {
  /** Version number (e.g., 1, 2, 3) */
  version: number;
  /** Human-readable description */
  description: string;
  /** The migration function — idempotent */
  migrate: (data: unknown) => unknown;
}

export interface MigrationState {
  currentVersion: number;
  lastMigratedAt: string;
  migrationHistory: Array<{
    from: number;
    to: number;
    timestamp: string;
    success: boolean;
    error?: string;
  }>;
}

// ── Migration registry ───────────────────────────────────────────────────────

const migrations: Migration[] = [];

/**
 * Register a migration.
 */
export function registerMigration(migration: Migration): void {
  // Prevent duplicates
  if (migrations.some((m) => m.version === migration.version)) {
    throw new Error(`Migration v${migration.version} already registered`);
  }
  migrations.push(migration);
  migrations.sort((a, b) => a.version - b.version);
}

/**
 * Get all registered migrations.
 */
export function getMigrations(): Migration[] {
  return [...migrations];
}

/**
 * Get the latest migration version.
 */
export function getLatestVersion(): number {
  return migrations.length > 0 ? migrations[migrations.length - 1]!.version : 0;
}

// ── Migration runner ─────────────────────────────────────────────────────────

/**
 * Run all pending migrations on a data object.
 * Returns the migrated data and migration state.
 */
export function runMigrations(
  data: unknown,
  currentVersion: number,
): { data: unknown; state: MigrationState } {
  const state: MigrationState = {
    currentVersion,
    lastMigratedAt: new Date().toISOString(),
    migrationHistory: [],
  };

  let migratedData = data;

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    try {
      migratedData = migration.migrate(migratedData);
      state.migrationHistory.push({
        from: migration.version - 1,
        to: migration.version,
        timestamp: new Date().toISOString(),
        success: true,
      });
      state.currentVersion = migration.version;
    } catch (err) {
      state.migrationHistory.push({
        from: migration.version - 1,
        to: migration.version,
        timestamp: new Date().toISOString(),
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      // Stop on error — don't continue with potentially corrupted data
      break;
    }
  }

  return { data: migratedData, state };
}

// ── File-based migration state ───────────────────────────────────────────────

/**
 * Load migration state from a file.
 */
export async function loadMigrationState(filePath: string): Promise<MigrationState> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as MigrationState;
  } catch {
    return {
      currentVersion: 0,
      lastMigratedAt: new Date(0).toISOString(),
      migrationHistory: [],
    };
  }
}

/**
 * Save migration state to a file.
 */
export async function saveMigrationState(
  filePath: string,
  state: MigrationState,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2));
}

/**
 * Run migrations on a file, loading and saving state automatically.
 */
export async function migrateFile<T = unknown>(
  filePath: string,
  options?: { createIfMissing?: boolean; defaultData?: T },
): Promise<{ data: T; state: MigrationState; migrated: boolean }> {
  const statePath = filePath.replace(/\.(json|yaml|yml)$/, '.migration-state.json');

  // Load current state
  const state = await loadMigrationState(statePath);

  // Load data
  let data: T;
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    try {
      data = JSON.parse(content) as T;
    } catch {
      // Try YAML
      try {
        const yaml = await import('yaml');
        data = yaml.parse(content) as T;
      } catch {
        try {
          const jsYaml = await import('js-yaml');
          data = jsYaml.load(content) as T;
        } catch {
          throw new Error(`Cannot parse file: ${filePath}`);
        }
      }
    }
  } catch (err) {
    if (options?.createIfMissing && options.defaultData) {
      data = options.defaultData;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } else {
      throw err;
    }
  }

  // Run migrations
  const { data: migratedData, state: newState } = runMigrations(data, state.currentVersion);

  // Save if migrated
  const migrated = newState.currentVersion > state.currentVersion;
  if (migrated) {
    await fs.writeFile(filePath, JSON.stringify(migratedData, null, 2));
    await saveMigrationState(statePath, newState);
  }

  return { data: migratedData as T, state: newState, migrated };
}

// ── Built-in migrations ──────────────────────────────────────────────────────

/**
 * Migrate v0 → v1: Add schema version field to config files.
 */
registerMigration({
  version: 1,
  description: 'Add schema version field to config',
  migrate: (data: unknown) => {
    const config = data as Record<string, unknown>;
    if (config.schemaVersion === undefined) {
      return { ...config, schemaVersion: 1 };
    }
    return data;
  },
});

/**
 * Migrate v1 → v2: Normalize session checkpoint format.
 */
registerMigration({
  version: 2,
  description: 'Normalize session checkpoint format',
  migrate: (data: unknown) => {
    const checkpoint = data as Record<string, unknown>;
    const updated: Record<string, unknown> = { ...checkpoint };

    // Ensure metadata exists
    if (!updated.metadata) {
      updated.metadata = {};
    }

    // Ensure toolCallHistory exists
    if (!updated.toolCallHistory) {
      updated.toolCallHistory = [];
    }

    // Ensure events is an array
    if (!Array.isArray(updated.events)) {
      updated.events = [];
    }

    return updated;
  },
});
