import React from 'react';
import { Text } from 'ink';
import { afterEach, expect, it, vi } from 'vitest';
import type { TUIProps, TUIHandle } from '../index.js';
const observed = vi.hoisted(() => [] as TUIProps[]);
vi.mock('../tui.js', () => ({
  TUI: (props: TUIProps) => { observed.push(props); return <Text>Bridge contract</Text>; },
}));
import { runTUI } from '../index.js';
const handles: TUIHandle[] = [];
afterEach(() => { for (const handle of handles.splice(0)) handle.cleanup(); observed.length = 0; });
it('retains updates submitted before the bridge effect is ready', async () => {
  const handle = runTUI({ mode: 'code', sessionId: 'before' }); handles.push(handle);
  handle.update({ mode: 'review' });
  handle.update({ sessionId: 'after' });
  await vi.waitFor(() => expect(observed.at(-1)).toMatchObject({ mode: 'review', sessionId: 'after' }));
});
it('retains independent fields during consecutive host updates', async () => {
  const handle = runTUI({ mode: 'code', sessionId: 'before' }); handles.push(handle);
  await new Promise(resolve => setTimeout(resolve, 100));
  handle.update({ costData: { currentCost: 3, budget: 10, breakdown: [] } });
  handle.update({ isRunning: true });
  handle.update({ sessionId: 'next' });
  await vi.waitFor(() => expect(observed.at(-1)).toMatchObject({
    isRunning: true, sessionId: 'next', costData: { currentCost: 3 },
  }));
});
