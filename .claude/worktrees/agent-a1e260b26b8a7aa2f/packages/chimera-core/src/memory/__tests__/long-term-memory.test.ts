import { describe, it, expect, beforeEach } from 'vitest';
import { LongTermMemory } from '../long-term-memory.js';
import { VectorStore, LocalEmbeddingProvider } from '../vector-store.js';

describe('LocalEmbeddingProvider', () => {
  it('produces deterministic embeddings', async () => {
    const provider = new LocalEmbeddingProvider(128);
    const a = await provider.embed('hello world');
    const b = await provider.embed('hello world');
    expect(a).toEqual(b);
  });

  it('produces different embeddings for different text', async () => {
    const provider = new LocalEmbeddingProvider(128);
    const a = await provider.embed('hello world');
    const b = await provider.embed('goodbye universe');
    expect(a).not.toEqual(b);
  });

  it('returns correct dimension', () => {
    const provider = new LocalEmbeddingProvider(64);
    expect(provider.dimension()).toBe(64);
  });
});

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(() => {
    store = new VectorStore(new LocalEmbeddingProvider(128));
  });

  it('adds and retrieves items', async () => {
    await store.add({
      id: '1',
      content: 'TypeScript is a typed superset of JavaScript',
      metadata: {
        topic: 'languages',
        importance: 0.7,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        source: 'agent',
        tags: ['typescript'],
      },
    });

    expect(store.size()).toBe(1);
    expect(store.get('1')?.content).toContain('TypeScript');
  });

  it('searches by semantic similarity', async () => {
    await store.add({
      id: '1',
      content: 'TypeScript is a typed superset of JavaScript',
      metadata: {
        topic: 'languages',
        importance: 0.7,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        source: 'agent',
        tags: ['typescript'],
      },
    });

    await store.add({
      id: '2',
      content: 'Python is a dynamically typed programming language',
      metadata: {
        topic: 'languages',
        importance: 0.6,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        source: 'agent',
        tags: ['python'],
      },
    });

    const results = await store.search({ text: 'JavaScript types', topK: 5 });
    expect(results.length).toBeGreaterThan(0);
    // TypeScript entry should rank higher since it mentions JavaScript
    expect(results[0].item.id).toBe('1');
  });

  it('filters by topic', async () => {
    await store.add({
      id: '1',
      content: 'React is a UI library',
      metadata: {
        topic: 'frontend',
        importance: 0.8,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        source: 'agent',
        tags: [],
      },
    });

    await store.add({
      id: '2',
      content: 'PostgreSQL is a relational database',
      metadata: {
        topic: 'backend',
        importance: 0.7,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        source: 'agent',
        tags: [],
      },
    });

    const results = await store.search({ text: 'UI components', topicFilter: 'frontend' });
    expect(results.every((r) => r.item.metadata.topic === 'frontend')).toBe(true);
  });

  it('removes items', async () => {
    await store.add({
      id: '1',
      content: 'test',
      metadata: {
        topic: 'test',
        importance: 0.5,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        source: 'agent',
        tags: [],
      },
    });

    expect(store.remove('1')).toBe(true);
    expect(store.size()).toBe(0);
    expect(store.remove('nonexistent')).toBe(false);
  });

  it('serializes and deserializes', async () => {
    await store.add({
      id: '1',
      content: 'test memory',
      metadata: {
        topic: 'test',
        importance: 0.8,
        createdAt: 1000,
        lastAccessedAt: 1000,
        accessCount: 0,
        source: 'user',
        tags: ['test'],
      },
    });

    const serialized = store.serialize();
    const newStore = new VectorStore(new LocalEmbeddingProvider(128));
    await newStore.deserialize(serialized);

    expect(newStore.size()).toBe(1);
    expect(newStore.get('1')?.content).toBe('test memory');
    expect(newStore.get('1')?.metadata.topic).toBe('test');
  });
});

describe('LongTermMemory', () => {
  let memory: LongTermMemory;

  beforeEach(() => {
    memory = new LongTermMemory({ decayHalfLifeDays: 30 });
  });

  it('writes and retrieves memories', async () => {
    await memory.write({
      content: 'The project uses Vitest for testing',
      topic: 'testing',
      importance: 0.8,
      tags: ['vitest', 'testing'],
    });

    const results = await memory.retrieve({ text: 'What test framework do we use?' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].item.content).toContain('Vitest');
  });

  it('forgets by id', async () => {
    const item = await memory.write({
      content: 'Temporary fact',
      topic: 'temp',
    });

    expect(memory.forget(item.id)).toBe(true);
    expect(memory.size()).toBe(0);
  });

  it('forgets by topic', async () => {
    await memory.write({ content: 'Fact 1', topic: 'old' });
    await memory.write({ content: 'Fact 2', topic: 'old' });
    await memory.write({ content: 'Fact 3', topic: 'new' });

    const removed = memory.forgetByTopic('old');
    expect(removed).toBe(2);
    expect(memory.size()).toBe(1);
  });

  it('decays old memories', async () => {
    const item = await memory.write({
      content: 'Old fact',
      topic: 'test',
      importance: 1.0,
    });

    // Manually backdate the memory
    item.metadata.createdAt = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days ago

    const decayed = memory.decay();
    expect(decayed).toBeGreaterThan(0);
    expect(item.metadata.importance).toBeLessThan(1.0);
    // After 60 days with 30-day half-life, importance should be ~0.25
    expect(item.metadata.importance).toBeCloseTo(0.25, 1);
  });

  it('prunes low-importance memories', async () => {
    const item = await memory.write({
      content: 'Very old fact',
      topic: 'test',
      importance: 0.001,
    });

    const pruned = memory.prune(0.01);
    expect(pruned).toBe(1);
    expect(memory.size()).toBe(0);
  });

  it('summarizes memories', async () => {
    await memory.write({ content: 'Fact A', topic: 'codebase' });
    await memory.write({ content: 'Fact B', topic: 'codebase' });

    const ids = memory.getAll().map((m) => m.id);
    const summary = await memory.summarize({
      topic: 'codebase',
      summaryContent: 'Combined facts about the codebase',
      sourceMemoryIds: ids,
    });

    expect(summary.content).toBe('Combined facts about the codebase');
    expect(summary.metadata.tags).toContain('summary');
    expect(memory.size()).toBe(1);
  });

  it('evicts when max memories exceeded', async () => {
    const mem = new LongTermMemory({ maxMemories: 3 });

    await mem.write({ content: 'a', topic: 'x', importance: 0.1 });
    await mem.write({ content: 'b', topic: 'x', importance: 0.2 });
    await mem.write({ content: 'c', topic: 'x', importance: 0.3 });
    await mem.write({ content: 'd', topic: 'x', importance: 0.9 });

    expect(mem.size()).toBe(3);
    // The lowest importance item should have been evicted
    const remaining = mem.getAll();
    expect(remaining.every((m) => m.content !== 'a')).toBe(true);
  });

  it('tracks access count on retrieval', async () => {
    await memory.write({
      content: 'Important fact about architecture',
      topic: 'arch',
    });

    await memory.retrieve({ text: 'architecture' });
    await memory.retrieve({ text: 'architecture' });

    const item = memory.getAll()[0];
    expect(item.metadata.accessCount).toBe(2);
  });
});
