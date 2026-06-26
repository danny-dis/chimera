/**
 * Idempotent migration system for chimera sessions.
 *
 * Each migration is a named function that transforms data from one schema
 * version to the next. Migrations run in order and are idempotent — running
 * them multiple times produces the same result.
 */
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
/**
 * Register a migration.
 */
export declare function registerMigration(migration: Migration): void;
/**
 * Get all registered migrations.
 */
export declare function getMigrations(): Migration[];
/**
 * Get the latest migration version.
 */
export declare function getLatestVersion(): number;
/**
 * Run all pending migrations on a data object.
 * Returns the migrated data and migration state.
 */
export declare function runMigrations(data: unknown, currentVersion: number): {
    data: unknown;
    state: MigrationState;
};
/**
 * Load migration state from a file.
 */
export declare function loadMigrationState(filePath: string): Promise<MigrationState>;
/**
 * Save migration state to a file.
 */
export declare function saveMigrationState(filePath: string, state: MigrationState): Promise<void>;
/**
 * Run migrations on a file, loading and saving state automatically.
 */
export declare function migrateFile<T = unknown>(filePath: string, options?: {
    createIfMissing?: boolean;
    defaultData?: T;
}): Promise<{
    data: T;
    state: MigrationState;
    migrated: boolean;
}>;
//# sourceMappingURL=index.d.ts.map