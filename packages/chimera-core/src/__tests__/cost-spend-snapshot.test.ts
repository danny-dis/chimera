import { expect, it } from 'vitest';
import { CostTracker } from '../cost-tracker.js';
import { EventStream } from '../event-stream.js';
it('returns an independent complete spend snapshot without spawn events', () => {
  const tracker = new CostTracker(new EventStream());
  tracker.recordSpend('unseen-provider', 3);
  const snapshot = tracker.getSpendByProvider();
  expect(snapshot).toEqual({ 'unseen-provider': 3 });
  snapshot['unseen-provider'] = 999;
  expect(tracker.getSpend('unseen-provider')).toBe(3);
});
