export interface MemoryItem {
  id: string;
  content: string;
  embedding: number[];
  metadata: MemoryMetadata;
}

export interface MemoryMetadata {
  topic: string;
  importance: number; // 0.0 - 1.0
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  source: 'user' | 'agent' | 'system';
  sessionId?: string;
  tags: string[];
}

export interface MemoryQuery {
  text: string;
  topK?: number;
  threshold?: number; // minimum similarity score 0.0 - 1.0
  topicFilter?: string;
  tagsFilter?: string[];
  since?: number; // timestamp — only return memories created after this
}

export interface MemoryResult {
  item: MemoryItem;
  score: number; // similarity score 0.0 - 1.0
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  dimension(): number;
}
