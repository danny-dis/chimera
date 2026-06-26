import { promises as fs } from 'fs';
import path from 'path';
export class SessionStore {
    cache = new Map();
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    async saveSession(session) {
        this.cache.set(session.id, session);
        await this.adapter.persist(session.id, session);
    }
    async recoverSession(sessionId) {
        const cached = this.cache.get(sessionId);
        if (cached)
            return cached;
        const session = await this.adapter.load(sessionId);
        if (session) {
            this.cache.set(sessionId, session);
        }
        return session;
    }
    async listSessions(options = {}) {
        const allSessions = await this.adapter.listAll();
        const { filter, offset = 0, limit = 100 } = options;
        let filtered = allSessions;
        if (filter) {
            filtered = allSessions.filter((session) => {
                if (filter.searchTerm && !session.title.toLowerCase().includes(filter.searchTerm.toLowerCase())) {
                    return false;
                }
                if (filter.createdAfter && session.createdAt < filter.createdAfter) {
                    return false;
                }
                if (filter.createdBefore && session.createdAt > filter.createdBefore) {
                    return false;
                }
                return true;
            });
        }
        const sorted = filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const paginated = sorted.slice(offset, offset + limit);
        return paginated.map((session) => ({
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messageCount: session.messages.length,
        }));
    }
}
export class FileStorageAdapter {
    storePath;
    constructor(storePath) {
        this.storePath = storePath;
    }
    async ensureDir() {
        await fs.mkdir(this.storePath, { recursive: true });
    }
    async persist(id, data) {
        await this.ensureDir();
        const filePath = path.join(this.storePath, `${id}.json`);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
    async load(id) {
        const filePath = path.join(this.storePath, `${id}.json`);
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        }
        catch {
            return null;
        }
    }
    async listAll() {
        await this.ensureDir();
        const files = await fs.readdir(this.storePath);
        const sessions = [];
        for (const file of files) {
            if (!file.endsWith('.json'))
                continue;
            try {
                const data = await fs.readFile(path.join(this.storePath, file), 'utf-8');
                sessions.push(JSON.parse(data));
            }
            catch {
                // Skip corrupted files
            }
        }
        return sessions;
    }
}
//# sourceMappingURL=session-store.js.map