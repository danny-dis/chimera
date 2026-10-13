import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionOrchestrator } from '@chimera/core';
import type { ModelProvider } from '@chimera/providers';
import { RealTrajectoryRecorder, formatEvalMarkdown } from '../eval-runner.js';
import * as toolContext from '../tool-context.js';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const verification = { verified: true, bundle: { evidences: [{ type: 'test_result', verdict: 'pass', description: 'node verify.cjs', data: { exitCode: 0 } }] } };

it('forwards caller verification and records only existing confined expected files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-eval-evidence-'));
  roots.push(root);
  writeFileSync(join(root, 'sum.js'), 'exports.add=(a,b)=>a+b;');
  const execute = vi.spyOn(SessionOrchestrator.prototype, 'execute').mockResolvedValue({ status: 'done', output: 'Done', cost: 0, verification } as any);
  const provider = { getModel: () => ({ id: 'fixture', provider: 'fixture' }), getPricing: () => ({ inputPerMillion: 0, outputPerMillion: 0 }) } as unknown as ModelProvider;
  const recorder = new RealTrajectoryRecorder({ writer: provider, reviewer: provider }, root);
  const trajectory = await recorder.record({ id: 'fixture', description: 'Implement addition', expectedFiles: ['sum.js', 'missing.js', '../outside.js'], verificationCommands: ['node verify.cjs'], verificationOutputs: ['dist'], maxCost: 1 }, 'code');
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ verificationCommands: ['node verify.cjs'], verificationOutputs: ['dist'], costCap: 1 }));
  const lastCheck = trajectory.steps.filter(step => step.type === 'check').at(-1)!;
  expect((lastCheck.output as any).files).toEqual(['sum.js']);
  expect(trajectory.config.tokensMeasured).toBe(false);
});

it('preserves explicit host authorization instead of silently denying verifier tools', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chimera-eval-permission-'));
  roots.push(root);
  vi.spyOn(SessionOrchestrator.prototype, 'execute').mockResolvedValue({ status: 'done', output: 'Done', cost: 0, verification } as any);
  const create = vi.spyOn(toolContext, 'createToolContext');
  const provider = { getModel: () => ({ id: 'fixture', provider: 'fixture' }), getPricing: () => ({ inputPerMillion: 0, outputPerMillion: 0 }) } as unknown as ModelProvider;
  const recorder = new RealTrajectoryRecorder({ writer: provider, reviewer: provider }, root, { yolo: true, interactive: false });
  await recorder.record({ id: 'fixture', description: 'Implement addition' }, 'code');
  expect(create).toHaveBeenCalledWith('code', { yolo: true, interactive: false });
});

it('renders unavailable comparison and labels activity quality as heuristic', () => {
  const markdown = formatEvalMarkdown({ runId: 'fixture', timestamp: 0, tasks: [], failureBreakdown: {}, summary: { totalTasks: 0, passed: 0, failed: 0, passRate: 0, avgCost: 0, avgLatency: 0, avgQuality: 0.5, costSavingsVsFrontier: null } });
  expect(markdown).toContain('Cost savings vs frontier: unavailable');
  expect(markdown).toContain('heuristic');
  expect(markdown).not.toContain('null%');
});
