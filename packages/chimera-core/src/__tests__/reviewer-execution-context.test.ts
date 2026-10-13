import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SessionOrchestrator, type LLMProvider } from '../session-orchestrator.js';
import { EventStream } from '../event-stream.js';

it('lets the inline reviewer see executed tool metadata without exposing raw output', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-reviewer-context-'));
  const content = 'exports.add=(a,b)=>a+b;';
  writeFileSync(join(root, 'verify.cjs'), "require('node:assert/strict').equal(require('./sum.js').add(2,3),5);");
  const usage = { inputTokens: 1, outputTokens: 1 };
  let call = 0;
  const writer: LLMProvider = { complete: async () => ++call === 1
    ? { content: '', usage, toolCalls: [{ id: 'write', name: 'write_file', arguments: { path: 'sum.js', content } }] }
    : { content: JSON.stringify({ response: 'Implemented', confidence: 0.9 }), usage } };
  let review = '';
  const reviewer: LLMProvider = { complete: async messages => {
    review = messages.map(message => message.content).join('\n');
    const sawExecution = review.includes('Executed tool metadata') && review.includes('"tool":"write_file"') && review.includes('"success":true');
    return { content: JSON.stringify({ verdict: sawExecution ? 'PASS' : 'FAIL', confidence: 0.9, findings: [] }), usage };
  } };
  let checks = 0;
  const orchestrator = new SessionOrchestrator(new EventStream(), {
    registry: { has: name => ['write_file', 'run_shell_command'].includes(name), getAll: () => [] },
    executor: { execute: async (name, args) => {
      if (name === 'write_file') writeFileSync(join(root, args.path as string), args.content as string);
      else { execFileSync(process.execPath, ['verify.cjs'], { cwd: root }); checks++; }
      return { success: true, data: { exitCode: 0, stdout: 'PRIVATE_TOOL_OUTPUT', content: 'PRIVATE_FILE_CONTENT' }, duration: 0 };
    } },
  }, root);
  try {
    const result = await orchestrator.execute({ task: 'Implement addition in sum.js', mode: 'code', providers: { writer, reviewer }, verificationCommands: ['node verify.cjs'] });
    expect(result.status).toBe('done');
    expect(result.verification?.verified).toBe(true);
    expect(checks).toBe(1);
    expect(review).not.toContain('PRIVATE_TOOL_OUTPUT');
    expect(review).not.toContain('PRIVATE_FILE_CONTENT');
    expect(readFileSync(join(root, 'sum.js'), 'utf8')).toBe(content);
  } finally { orchestrator.dispose(); rmSync(root, { recursive: true, force: true }); }
});
