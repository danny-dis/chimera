import { describe, expect, test } from 'vitest';
import { AsyncSemaphore } from '../async-semaphore';

describe('AsyncSemaphore', () => {
  test('should acquire and release permits', async () => {
    const semaphore = new AsyncSemaphore(1);
    await semaphore.acquire();
    expect(semaphore.getAvailablePermits()).toBe(0);
    semaphore.release();
    expect(semaphore.getAvailablePermits()).toBe(1);
  });

  test('should queue requests when no permits available', async () => {
    const semaphore = new AsyncSemaphore(1);
    await semaphore.acquire();
    
    let acquired = false;
    semaphore.acquire().then(() => {
      acquired = true;
    });
    
    // Give time to queue
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(acquired).toBe(false);
    
    semaphore.release();
    // Give time to acquire
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(acquired).toBe(true);
  });
});
