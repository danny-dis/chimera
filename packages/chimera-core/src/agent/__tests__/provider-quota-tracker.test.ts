import { describe, expect, test } from 'vitest';
import { ProviderQuotaTracker } from '../provider-quota-tracker';

describe('ProviderQuotaTracker', () => {
  test('should track remaining quota correctly', () => {
    const tracker = new ProviderQuotaTracker(100, 10000);
    const status = tracker.getStatus();
    expect(status.rpmRemaining).toBe(100);
    expect(status.tpmRemaining).toBe(10000);
  });
});
