import { describe, it, expect } from 'vitest';
import { CliRouter } from '../cli-router.js';

describe('CliRouter', () => {
  it('can be instantiated and exposes runCli', () => {
    const router = new CliRouter();
    expect(typeof router.runCli).toBe('function');
  });
});
