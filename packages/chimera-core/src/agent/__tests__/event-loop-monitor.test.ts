import { describe, expect, test, vi } from 'vitest';
import { EventLoopMonitor } from '../event-loop-monitor';

describe('EventLoopMonitor', () => {
  test('should initialize and measure lag', async () => {
    const monitor = new EventLoopMonitor(50);
    // Wait for the monitor loop to run at least once
    await new Promise(resolve => setTimeout(resolve, 200));
    
    expect(monitor.getLag()).toBeGreaterThanOrEqual(0);
  });
});
