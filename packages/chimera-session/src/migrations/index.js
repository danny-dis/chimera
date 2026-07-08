/**
 * Idempotent migration system for chimera sessions.
 *
 * Each migration is a named function that transforms data from one schema
 * version to the next. Migrations run in order and are idempotent — running
 * them multiple times produces the same result.
 */
import { promises as fs } from 'fs';
import path from 'path';
// ── Migration registry ───────────────────────────────────────────────────────
const migrations = [];
/**
 * Register a migration.
 */
export function registerMigration(migration) {
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
export function getMigrations() {
    return [...migrations];
}
/**
 * Get the latest migration version.
 */
export function getLatestVersion() {
    return migrations.length > 0 ? migrations[migrations.length - 1].version : 0;
}
// ── Migration runner ─────────────────────────────────────────────────────────
/**
 * Run all pending migrations on a data object.
 * Returns the migrated data and migration state.
 */
export function runMigrations(data, currentVersion) {
    const state = {
        currentVersion,
        lastMigratedAt: new Date().toISOString(),
        migrationHistory: [],
    };
    let migratedData = data;
    for (const migration of migrations) {
        if (migration.version <= currentVersion)
            continue;
        try {
            migratedData = migration.migrate(migratedData);
            state.migrationHistory.push({
                from: migration.version - 1,
                to: migration.version,
                timestamp: new Date().toISOString(),
                success: true,
            });
            state.currentVersion = migration.version;
        }
        catch (err) {
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
export async function loadMigrationState(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }
    catch {
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
export async function saveMigrationState(filePath, state) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2));
}
/**
 * Run migrations on a file, loading and saving state automatically.
 */
export async function migrateFile(filePath, options) {
    const statePath = filePath.replace(/\.(json|yaml|yml)$/, '.migration-state.json');
    // Load current state
    const state = await loadMigrationState(statePath);
    // Load data
    let data;
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        try {
            data = JSON.parse(content);
        }
        catch {
            // Try YAML
            try {
                const yaml = await import('yaml');
                data = yaml.parse(content);
            }
            catch {
                try {
                    const jsYaml = await import('js-yaml');
                    data = jsYaml.load(content);
                }
                catch {
                    throw new Error(`Cannot parse file: ${filePath}`);
                }
            }
        }
    }
    catch (err) {
        if (options?.createIfMissing && options.defaultData) {
            data = options.defaultData;
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        }
        else {
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
    return { data: migratedData, state: newState, migrated };
}
// ── Built-in migrations ──────────────────────────────────────────────────────
/**
 * Migrate v0 → v1: Add schema version field to config files.
 */
registerMigration({
    version: 1,
    description: 'Add schema version field to config',
    migrate: (data) => {
        const config = data;
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
    migrate: (data) => {
        const checkpoint = data;
        const updated = { ...checkpoint };
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
//# sourceMappingURL=index.js.map