import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoExtractService } from '../auto-extract.js';
import { LongTermMemory } from '../long-term-memory.js';
import * as sideQueryModule from '../../side-query.js';

vi.mock('../../side-query.js', () => ({
  sideQuery: vi.fn(),
}));

function mockSideQuery(data: { facts: Array<{ content: string; type: string; importance: number; tags: string[] }> }) {
  vi.mocked(sideQueryModule.sideQuery).mockResolvedValue({ ok: true, data });
}

function mockSideQueryFailure() {
  vi.mocked(sideQueryModule.sideQuery).mockResolvedValue({ ok: false, error: 'timeout' });
}

describe('AutoExtractService', () => {
  let memory: LongTermMemory;
  let service: AutoExtractService;

  beforeEach(() => {
    vi.clearAllMocks();
    memory = new LongTermMemory();
    service = new AutoExtractService(memory, { minImportance: 0.3 });
  });

  it('extracts facts and writes them to memory', async () => {
    mockSideQuery({
      facts: [
        { content: 'User prefers TypeScript', type: 'user', importance: 0.8, tags: ['lang'] },
        { content: 'Project uses pnpm', type: 'project', importance: 0.6, tags: ['tooling'] },
      ],
    });

    const messages = [
      { role: 'user', content: 'I prefer TypeScript for all projects' },
      { role: 'assistant', content: 'Noted! This project uses pnpm.' },
    ];

    const newCursor = await service.extract({ messages, sessionId: 's1', cursor: 0 });

    expect(newCursor).toBe(2);
    expect(memory.size()).toBe(2);
  });

  it('skips facts below minImportance', async () => {
    mockSideQuery({
      facts: [
        { content: 'Weak signal', type: 'reference', importance: 0.1, tags: [] },
        { content: 'Strong signal', type: 'user', importance: 0.9, tags: [] },
      ],
    });

    await service.extract({ messages: [{ role: 'user', content: 'test' }], sessionId: 's1', cursor: 0 });

    expect(memory.size()).toBe(1);
    const items = memory.getAll();
    expect(items[0].content).toBe('Strong signal');
  });

  it('returns cursor unchanged when disabled', async () => {
    const disabled = new AutoExtractService(memory, { enabled: false });
    const cursor = await disabled.extract({
      messages: [{ role: 'user', content: 'test' }],
      sessionId: 's1',
      cursor: 0,
    });

    expect(cursor).toBe(0);
    expect(memory.size()).toBe(0);
  });

  it('returns cursor unchanged when cursor >= messages length', async () => {
    const cursor = await service.extract({
      messages: [{ role: 'user', content: 'test' }],
      sessionId: 's1',
      cursor: 1,
    });

    expect(cursor).toBe(1);
  });

  it('returns full cursor on sideQuery failure', async () => {
    mockSideQueryFailure();

    const messages = [{ role: 'user', content: 'test' }];
    const cursor = await service.extract({ messages, sessionId: 's1', cursor: 0 });

    expect(cursor).toBe(1);
    expect(memory.size()).toBe(0);
  });

  it('only processes new messages from cursor', async () => {
    mockSideQuery({ facts: [] });

    const messages = [
      { role: 'user', content: 'old message' },
      { role: 'user', content: 'new message' },
    ];

    const cursor = await service.extract({ messages, sessionId: 's1', cursor: 1 });

    expect(cursor).toBe(2);
    const callArgs = vi.mocked(sideQueryModule.sideQuery).mock.calls[0][0];
    expect(callArgs.prompt).toContain('new message');
    expect(callArgs.prompt).not.toContain('old message');
  });
});
