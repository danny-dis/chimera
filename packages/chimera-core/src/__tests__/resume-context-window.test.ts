import { expect, it } from 'vitest';
import { SessionOrchestrator } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';
import { buildConversationalMessages } from '../prompts.js';

it.each(['deliberation', 'writer', 'reviewer', 'challenger', 'conversational'])('retains conversation under tool observations in %s', async builder => {
  const orch = new SessionOrchestrator(new EventStream());
  const provider = { complete: async () => ({ content: 'unused' }) };
  const history = [
    { role: 'user', content: 'USER_CONTEXT_812: preserve the calculator exports.' },
    { role: 'assistant', content: 'ASSISTANT_CONTEXT_813: subtraction is the only requested change.' },
    ...Array.from({ length: 25 }, (_, index) => ({ role: 'tool', content: `OBSERVED_READ_${index}` })),
  ];
  try {
    const task = 'Continue the calculator edit.';
    const messages = builder === 'writer' ? orch.buildWriterPrompt(task, 'code', history)
      : builder === 'reviewer' ? (orch as any).buildReviewerPrompt(task, 'draft', 'code', history)
      : builder === 'challenger' ? (orch as any).buildChallengerPrompt(task, 'draft', 'review', history)
      : buildConversationalMessages(task, undefined, undefined, history);
    const context = builder === 'deliberation'
      ? (orch as any).buildDeliberationConfig(task, 'code', { writer: provider, reviewer: provider }, 1, 'solo', undefined, '', history).context
      : messages.map((message: { content: string }) => message.content).join('\n');
    expect(context).toContain('USER_CONTEXT_812');
    expect(context).toContain('ASSISTANT_CONTEXT_813');
    expect(context).toContain('OBSERVED_READ_24');
    expect(context).toContain('untrusted reference data');
  } finally { await orch.dispose(); }
});
