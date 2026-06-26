"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoDreamService = exports.DreamConfigSchema = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const side_query_js_1 = require("../side-query.js");
exports.DreamConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(true),
    minSessionGap: zod_1.z.number().positive().default(5),
    minTimeGapMs: zod_1.z.number().min(0).default(86_400_000),
    lockfileDir: zod_1.z.string().optional(),
    maxMemoriesPerConsolidation: zod_1.z.number().positive().default(20),
    model: zod_1.z.string().optional(),
});
const STALE_LOCK_MS = 5 * 60 * 1000;
const ConsolidationSchema = zod_1.z.object({
    summaries: zod_1.z.array(zod_1.z.object({
        topic: zod_1.z.string(),
        summary: zod_1.z.string().min(1),
        sourceIds: zod_1.z.array(zod_1.z.string()),
        importance: zod_1.z.number().min(0).max(1),
    })),
});
/**
 * 4-phase periodic memory consolidation:
 *   Orient → Gather → Consolidate → Prune
 *
 * Gated by session count and time since last dream.
 * Uses PID lockfile (mtime-based stale detection) for process safety.
 */
class AutoDreamService {
    memory;
    config;
    state;
    lockfilePath;
    statePath;
    constructor(memory, config) {
        this.memory = memory;
        this.config = exports.DreamConfigSchema.parse(config ?? {});
        const lockDir = this.config.lockfileDir ?? path_1.default.join('.chimera', 'memory');
        if (!(0, fs_1.existsSync)(lockDir))
            (0, fs_1.mkdirSync)(lockDir, { recursive: true });
        this.lockfilePath = path_1.default.join(lockDir, '.dream.lock');
        this.statePath = path_1.default.join(lockDir, '.dream-state.json');
        this.state = this.loadState();
    }
    async shouldDream() {
        if (!this.config.enabled)
            return false;
        this.state.sessionsSinceDream++;
        this.saveState();
        if (this.state.sessionsSinceDream < this.config.minSessionGap)
            return false;
        if (Date.now() - this.state.lastDreamAt < this.config.minTimeGapMs)
            return false;
        return true;
    }
    async dream() {
        const locked = await this.acquirePidLock();
        if (!locked)
            return { consolidated: 0, pruned: 0 };
        try {
            const candidates = this.orient();
            if (candidates.length === 0)
                return { consolidated: 0, pruned: 0 };
            const groups = this.gather(candidates);
            const consolidated = await this.consolidate(groups);
            const pruned = this.prune();
            this.state.lastDreamAt = Date.now();
            this.state.sessionsSinceDream = 0;
            this.state.totalDreams++;
            this.saveState();
            return { consolidated, pruned };
        }
        finally {
            this.releasePidLock();
        }
    }
    getState() {
        return { ...this.state };
    }
    orient() {
        const all = this.memory.getAll();
        const since = this.state.lastDreamAt;
        return since > 0 ? all.filter((m) => m.metadata.createdAt > since) : all;
    }
    gather(items) {
        const groups = new Map();
        for (const item of items.slice(0, this.config.maxMemoriesPerConsolidation)) {
            const topic = item.metadata.topic;
            const group = groups.get(topic) ?? [];
            group.push(item);
            groups.set(topic, group);
        }
        return groups;
    }
    async consolidate(groups) {
        let count = 0;
        for (const [topic, items] of groups) {
            if (items.length < 2)
                continue;
            const itemsText = items.map((m) => `[${m.id}] ${m.content}`).join('\n');
            const result = await (0, side_query_js_1.sideQuery)({
                prompt: `Summarize these ${items.length} related memories about "${topic}" into a single concise fact. Preserve the most important details.\n\n${itemsText}`,
                schema: ConsolidationSchema,
                model: this.config.model,
                maxTokens: 1024,
                timeoutMs: 30_000,
            });
            if (!result.ok)
                continue;
            for (const s of result.data.summaries) {
                await this.memory.summarize({
                    topic: s.topic,
                    summaryContent: s.summary,
                    sourceMemoryIds: s.sourceIds,
                    importance: s.importance,
                });
                count++;
            }
        }
        return count;
    }
    prune() {
        this.memory.decay();
        return this.memory.prune(0.01);
    }
    async acquirePidLock() {
        if ((0, fs_1.existsSync)(this.lockfilePath)) {
            try {
                const stat = (0, fs_1.statSync)(this.lockfilePath);
                if (Date.now() - stat.mtimeMs < STALE_LOCK_MS)
                    return false;
            }
            catch {
                // stat failed — treat as stale
            }
        }
        try {
            (0, fs_1.writeFileSync)(this.lockfilePath, String(process.pid), 'utf-8');
            return true;
        }
        catch {
            return false;
        }
    }
    releasePidLock() {
        try {
            if ((0, fs_1.existsSync)(this.lockfilePath))
                (0, fs_1.unlinkSync)(this.lockfilePath);
        }
        catch {
            // best-effort cleanup
        }
    }
    loadState() {
        if ((0, fs_1.existsSync)(this.statePath)) {
            try {
                return JSON.parse((0, fs_1.readFileSync)(this.statePath, 'utf-8'));
            }
            catch {
                // corrupted — start fresh
            }
        }
        return { lastDreamAt: 0, sessionsSinceDream: 0, totalDreams: 0 };
    }
    saveState() {
        const dir = path_1.default.dirname(this.statePath);
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        (0, fs_1.writeFileSync)(this.statePath, JSON.stringify(this.state), 'utf-8');
    }
}
exports.AutoDreamService = AutoDreamService;
//# sourceMappingURL=auto-dream.js.map