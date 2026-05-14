import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuorum, getAgentRoles, normalizeAgentMode, selectAgentMode } from '../src/orchestrator.js';

const repo = { sourceFiles: [], tests: [] };

test('normalizeAgentMode accepts common aliases', () => {
  assert.equal(normalizeAgentMode('1'), 'solo');
  assert.equal(normalizeAgentMode('2'), 'duo');
  assert.equal(normalizeAgentMode('3'), 'trio');
  assert.equal(normalizeAgentMode('triple'), 'trio');
});

test('selectAgentMode escalates high-risk work to trio', () => {
  const selected = selectAgentMode({ requested: 'auto', taskMode: 'plan', prompt: 'redesign auth token rollback', repo });
  assert.equal(selected.mode, 'trio');
});

test('selectAgentMode uses explicit duo selection', () => {
  const selected = selectAgentMode({ requested: 'duo', taskMode: 'ask', prompt: 'simple question', repo });
  assert.equal(selected.mode, 'duo');
});

test('getAgentRoles maps modes to role sets', () => {
  assert.deepEqual(getAgentRoles('solo'), ['writer']);
  assert.deepEqual(getAgentRoles('duo'), ['writer', 'reviewer']);
  assert.deepEqual(getAgentRoles('trio'), ['writer', 'reviewer', 'challenger']);
});

test('buildQuorum requires two approvals in trio mode', () => {
  const quorum = buildQuorum([
    { available: true, vote: 'approve' },
    { available: true, vote: 'approve' },
    { available: true, vote: 'block' },
  ]);
  assert.equal(quorum.status, 'approved');
  assert.equal(quorum.approvalsRequired, 2);
});
