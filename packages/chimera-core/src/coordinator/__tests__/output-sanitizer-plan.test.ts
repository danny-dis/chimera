import { describe, expect, it } from 'vitest';
import { sanitizeReviewerOutput, sanitizeWriterOutput } from '../output-sanitizer.js';
import { DuoExecutor } from '../duo-executor.js';
import { EventStream } from '../../event-stream.js';
import { SimpleModelRegistry } from '@chimera/providers';

const plan = 'Implementation: create hello.js to print hello and add package.json:\n```json\n{\n  "name": "hello-cli",\n  "bin": { "hello": "hello.js" }\n}\n```\nVerification: run node hello.js and assert stdout is hello.';

describe('planning JSON examples', () => {
  it.each([sanitizeWriterOutput, sanitizeReviewerOutput])('preserves the plan and its JSON example with %s', sanitize => {
    expect(sanitize(plan)).toBe(plan);
  });

  it('still removes reasoning from a standalone fenced protocol response', () => {
    const response = '```json\n{\n  "thought": "private reasoning marker",\n  "confidence": 0.9\n}\n```';
    expect(sanitizeWriterOutput(response)).not.toContain('private reasoning marker');
  });

  it('does not turn two useful plans into both-models-failed', async () => {
    const executor = new DuoExecutor({ readOnly: true, eventStream: new EventStream(), registry: new SimpleModelRegistry() });
    const result = await executor.executeWithAnalysis('Plan a hello CLI; do not edit files.', { modelA: 'writer', modelB: 'reviewer' }, () => ({ complete: async () => ({ content: plan }) }));
    expect(result.output).toBe(plan);
    expect(result.sources.map(source => source.content)).toEqual([plan, plan]);
    expect(result.degraded).toBe(false);
  });
});
