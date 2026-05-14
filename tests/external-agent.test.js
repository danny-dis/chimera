import test from 'node:test';
import assert from 'node:assert/strict';
import { runExternalAgent } from '../src/external-agent.js';

test('runExternalAgent sends prompt on stdin and captures output', async () => {
  const output = await runExternalAgent('node -e "process.stdin.pipe(process.stdout)"', 'hello external agent');
  assert.equal(output, 'hello external agent');
});
