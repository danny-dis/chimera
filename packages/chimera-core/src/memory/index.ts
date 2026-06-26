export { LongTermMemory } from './long-term-memory.js';
export type { LongTermMemoryConfig } from './long-term-memory.js';
export { VectorStore, LocalEmbeddingProvider } from './vector-store.js';
export type {
  MemoryItem,
  MemoryMetadata,
  MemoryQuery,
  MemoryResult,
  EmbeddingProvider,
} from './types.js';
export { AgentMemory } from './agent-memory.js';
export type {
  AgentMemoryItem,
  AgentMemoryType,
  AgentMemoryQuery,
  AgentMemorySnapshot,
} from './agent-memory.js';
export { MemoryPersistence } from './memory-persistence.js';
export type { MemoryPersistenceConfig } from './memory-persistence.js';
export { AutoExtractService } from './auto-extract.js';
export type { ExtractionConfig, ExtractedFacts } from './auto-extract.js';
export { RecallService } from './recall-service.js';
export type { RecallConfig } from './recall-service.js';
export { AutoDreamService } from './auto-dream.js';
export type { DreamConfig, DreamState } from './auto-dream.js';
