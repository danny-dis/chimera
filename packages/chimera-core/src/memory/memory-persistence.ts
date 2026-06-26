import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { LongTermMemory } from './long-term-memory.js';

export interface MemoryPersistenceConfig {
  workspaceRoot: string;
  memoryDir?: string;
  decayHalfLifeDays?: number;
  maxMemories?: number;
}

const DEFAULT_MEMORY_DIR = '.chimera/memory';
const DEFAULT_DECAY_HALF_LIFE_DAYS = 30;
const DEFAULT_MAX_MEMORIES = 10_000;

/**
 * Computes a deterministic storage path and initialises LongTermMemory
 * with file-backed persistence.  All writes to LTM are immediately
 * serialised to disk so memories survive process restarts.
 */
export class MemoryPersistence {
  private memory: LongTermMemory;
  private storagePath: string;

  constructor(config: MemoryPersistenceConfig) {
    const memoryDir = config.memoryDir ?? DEFAULT_MEMORY_DIR;
    this.storagePath = path.join(config.workspaceRoot, memoryDir, 'long-term.json');

    const dir = path.dirname(this.storagePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.memory = new LongTermMemory({
      storagePath: this.storagePath,
      decayHalfLifeDays: config.decayHalfLifeDays ?? DEFAULT_DECAY_HALF_LIFE_DAYS,
      maxMemories: config.maxMemories ?? DEFAULT_MAX_MEMORIES,
    });
  }

  getMemory(): LongTermMemory {
    return this.memory;
  }

  getStoragePath(): string {
    return this.storagePath;
  }

  forget(id: string): boolean {
    return this.memory.forget(id);
  }

  forgetByTopic(topic: string): number {
    return this.memory.forgetByTopic(topic);
  }
}
