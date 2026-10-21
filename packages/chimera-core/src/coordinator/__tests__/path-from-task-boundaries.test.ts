import { describe, expect, it } from 'vitest';
import { expectedPathFromTask } from '../path-from-task.js';

describe('target inference sentence boundaries', () => {
  it('does not turn preserve-add instructions into a write to a forbidden package file', () => {
    const task = 'Extend this existing CommonJS calculator with subtraction. Edit mathops.js to export sub(a,b) and calc.js to dispatch calc("sub",a,b) through that export. Preserve add, mul and unknown-op behavior. Change only these two implementation files; never modify verify.cjs or package.json, add dependencies, or replace the framework. Run node verify.cjs.';
    expect(expectedPathFromTask(task)).toBe('mathops.js');
  });

  it('does not attach a filename in a later sentence to an unrelated add verb', () => {
    expect(expectedPathFromTask('Inspect source.ts. Do not add dependencies. Leave package.json unchanged.')).toBe('source.ts');
  });
});
