"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryPersistence = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const long_term_memory_js_1 = require("./long-term-memory.js");
const DEFAULT_MEMORY_DIR = '.chimera/memory';
const DEFAULT_DECAY_HALF_LIFE_DAYS = 30;
const DEFAULT_MAX_MEMORIES = 10_000;
/**
 * Computes a deterministic storage path and initialises LongTermMemory
 * with file-backed persistence.  All writes to LTM are immediately
 * serialised to disk so memories survive process restarts.
 */
class MemoryPersistence {
    memory;
    storagePath;
    constructor(config) {
        const memoryDir = config.memoryDir ?? DEFAULT_MEMORY_DIR;
        this.storagePath = path_1.default.join(config.workspaceRoot, memoryDir, 'long-term.json');
        const dir = path_1.default.dirname(this.storagePath);
        if (!(0, fs_1.existsSync)(dir)) {
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        }
        this.memory = new long_term_memory_js_1.LongTermMemory({
            storagePath: this.storagePath,
            decayHalfLifeDays: config.decayHalfLifeDays ?? DEFAULT_DECAY_HALF_LIFE_DAYS,
            maxMemories: config.maxMemories ?? DEFAULT_MAX_MEMORIES,
        });
    }
    getMemory() {
        return this.memory;
    }
    getStoragePath() {
        return this.storagePath;
    }
    forget(id) {
        return this.memory.forget(id);
    }
    forgetByTopic(topic) {
        return this.memory.forgetByTopic(topic);
    }
}
exports.MemoryPersistence = MemoryPersistence;
//# sourceMappingURL=memory-persistence.js.map