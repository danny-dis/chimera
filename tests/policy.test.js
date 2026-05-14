import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCommand, evaluateCommandPermission, normalizePermissionProfile } from '../src/policy.js';

test('classifyCommand identifies read-only, write-like, and destructive commands', () => {
  assert.equal(classifyCommand('npm test').risk, 'read-only');
  assert.equal(classifyCommand('npm install left-pad').risk, 'writes');
  assert.equal(classifyCommand('git apply change.diff').risk, 'writes');
  assert.equal(classifyCommand('rm -rf dist').risk, 'destructive');
});

test('evaluateCommandPermission blocks writes in read-only profile', () => {
  const decision = evaluateCommandPermission('npm install left-pad', 'read-only');
  assert.equal(decision.allowed, false);
  assert.equal(decision.requiresApproval, true);
});

test('normalizePermissionProfile rejects unknown profiles', () => {
  assert.throws(() => normalizePermissionProfile('root-mode'), /invalid permission profile/);
});
