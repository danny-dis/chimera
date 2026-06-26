export class SessionMigrator {
    steps = [];
    register(step) {
        const existing = this.steps.find(s => s.version === step.version);
        if (existing) {
            throw new Error(`Migration step for version ${step.version} already registered`);
        }
        this.steps.push(step);
        this.steps.sort((a, b) => a.version - b.version);
    }
    getSteps() {
        return [...this.steps];
    }
    getLatestVersion() {
        if (this.steps.length === 0)
            return 0;
        return this.steps[this.steps.length - 1].version;
    }
    getVersion(data) {
        if (typeof data !== 'object' || data === null)
            return 0;
        const obj = data;
        return typeof obj._schemaVersion === 'number' ? obj._schemaVersion : 0;
    }
    migrate(data, targetVersion) {
        const currentVersion = this.getVersion(data);
        const target = targetVersion ?? this.getLatestVersion();
        const stepsApplied = [];
        let migrated = data;
        for (const step of this.steps) {
            if (step.version <= currentVersion)
                continue;
            if (step.version > target)
                break;
            migrated = step.migrate(migrated);
            stepsApplied.push(step.description);
        }
        return {
            data: migrated,
            fromVersion: currentVersion,
            toVersion: stepsApplied.length > 0
                ? this.steps.find(s => s.description === stepsApplied[stepsApplied.length - 1])?.version ?? currentVersion
                : currentVersion,
            stepsApplied,
        };
    }
    migrateSession(session) {
        return this.migrate(session);
    }
    migrateCheckpoint(checkpoint) {
        return this.migrate(checkpoint);
    }
    isUpToDate(data) {
        return this.getVersion(data) >= this.getLatestVersion();
    }
}
export function createDefaultMigrator() {
    const migrator = new SessionMigrator();
    migrator.register({
        version: 1,
        description: 'Add _schemaVersion field',
        migrate(data) {
            if (typeof data !== 'object' || data === null)
                return { _schemaVersion: 1 };
            return { ...data, _schemaVersion: 1 };
        },
    });
    migrator.register({
        version: 2,
        description: 'Rename messages to history for sessions',
        migrate(data) {
            if (typeof data !== 'object' || data === null)
                return data;
            const obj = data;
            if ('messages' in obj && !('history' in obj)) {
                const { messages, ...rest } = obj;
                return { ...rest, history: messages, _schemaVersion: 2 };
            }
            return { ...obj, _schemaVersion: 2 };
        },
    });
    return migrator;
}
//# sourceMappingURL=session-migrator.js.map