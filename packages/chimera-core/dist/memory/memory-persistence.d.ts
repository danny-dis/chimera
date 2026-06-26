import { LongTermMemory } from './long-term-memory.js';
export interface MemoryPersistenceConfig {
    workspaceRoot: string;
    memoryDir?: string;
    decayHalfLifeDays?: number;
    maxMemories?: number;
}
/**
 * Computes a deterministic storage path and initialises LongTermMemory
 * with file-backed persistence.  All writes to LTM are immediately
 * serialised to disk so memories survive process restarts.
 */
export declare class MemoryPersistence {
    private memory;
    private storagePath;
    constructor(config: MemoryPersistenceConfig);
    getMemory(): LongTermMemory;
    getStoragePath(): string;
    forget(id: string): boolean;
    forgetByTopic(topic: string): number;
}
//# sourceMappingURL=memory-persistence.d.ts.map