import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { interactiveScreen } from './interactive-screen';
const screens: ReturnType<typeof interactiveScreen>[] = [];
const render: typeof interactiveScreen = element => {
  const screen = interactiveScreen(element);
  screens.push(screen);
  return screen;
};
const cleanup = async () => { for (const screen of screens.splice(0)) await screen.unmount(); };
import { Box, Text } from 'ink';
import { TUI } from '../tui.js';
import { Input } from '../components/input.js';
import { Sidebar } from '../components/sidebar.js';
import { Viewport } from '../components/viewport.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 50));
afterEach(async () => { await cleanup(); vi.restoreAllMocks(); });

it('does not insert navigation escape sequences into the composer', async () => {
  const onSubmit = vi.fn();
  const screen = render(<Input onSubmit={onSubmit} focused />);
  await flush();
  screen.stdin.write('abc'); process.stdin.emit('data', Buffer.from('abc'));
  await vi.waitFor(() => expect(screen.lastFrame()).toContain('abc'));
  screen.stdin.write('\x1b[D'); process.stdin.emit('data', Buffer.from('\x1b[D'));
  await flush();
  expect(screen.lastFrame()).not.toContain('abc[D');
  screen.stdin.write('\r'); process.stdin.emit('data', Buffer.from('\r'));
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('abc'));
});

it.each(['😀', 'e\u0301', '👩‍💻'])('removes a whole grapheme with Backspace: %s', async character => {
  const onSubmit = vi.fn();
  const screen = render(<Input onSubmit={onSubmit} focused />);
  await flush();
  screen.stdin.write(`ok${character}`);
  await vi.waitFor(() => expect(screen.lastFrame()).toContain('ok'));
  await flush(); screen.stdin.write('\x7f'); await flush(); screen.stdin.write('\r');
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('ok'));
});

it('normalizes pasted tabs and excludes C1 controls for every insertion path', async () => {
  const onSubmit = vi.fn();
  const screen = render(<Input onSubmit={onSubmit} focused />);
  await flush();
  screen.stdin.write('a\tb'); await flush(); screen.stdin.write('\u0085'); await flush();
  screen.stdin.write('c\u0090d'); await flush(); screen.stdin.write('\r');
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a bcd'));
});

it('sanitizes completion text before submission and history recall', async () => {
  const onSubmit = vi.fn();
  const autocomplete = vi.fn(() => ['/help\t\u0085done']);
  const screen = render(<Input onSubmit={onSubmit} autocomplete={autocomplete} placeholder="composer-ready" focused />);
  await vi.waitFor(() => expect(screen.lastFrame()).toContain('composer-ready'));
  screen.stdin.write('/he');
  await vi.waitFor(() => expect(screen.lastFrame()).toContain('/he'));
  screen.stdin.emit('data', Buffer.from('\t'));
  await vi.waitFor(() => expect(autocomplete).toHaveBeenCalledWith('/he'));
  await vi.waitFor(() => expect(screen.lastFrame()).toContain('/help'));
  screen.stdin.write('\r');
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('/help done'));
  await flush(); screen.stdin.write('\x1b[A'); await flush(); screen.stdin.write('\r');
  await vi.waitFor(() => expect(onSubmit.mock.calls).toEqual([['/help done'], ['/help done']]));
});

it('does not let the sidebar consume composer Enter or arrow keys', async () => {
  const onModeChange = vi.fn(), onPresetChange = vi.fn();
  const screen = render(<Sidebar sessionId="test" mode="code" preset="solo" agents={[]} costData={{ currentCost: 0, budget: 1, breakdown: [] }} onModeChange={onModeChange} onPresetChange={onPresetChange} />);
  await flush();
  expect(screen.lastFrame()).toContain('test');
  expect(screen.errors()).toBe('');
  screen.stdin.write('\x1b[C'); screen.stdin.write('\r');
  await flush();
  expect(onModeChange).not.toHaveBeenCalled();
  expect(onPresetChange).not.toHaveBeenCalled();
});

it('pages inside a message taller than the viewport', async () => {
  const rows = ['row-1', 'row-2', 'row-3', 'row-4', 'row-5', 'row-6', 'row-7', 'row-8', 'row-9'];
  const screen = render(<Viewport items={[rows]} height={3} focused autoScroll={false} getItemHeight={item => item.length} renderItem={item => <Text>{item.join('\n')}</Text>} />);
  await flush();
  screen.stdin.write('\x1b[6~');
  await vi.waitFor(() => expect(screen.lastFrame()).toContain('row-4'));
  expect(screen.lastFrame()).not.toContain('row-1');
  screen.stdin.write('\x1b[6~');
  await vi.waitFor(() => expect(screen.lastFrame()).toContain('row-7'));
});

it('does not call the height callback with an empty item while navigating', async () => {
  const height = vi.fn((item: { lines: number }) => item.lines);
  const screen = render(<Box flexDirection="column"><Text>viewport-ready</Text><Viewport items={[]} height={3} focused getItemHeight={height} renderItem={() => <Text>empty</Text>} /></Box>);
  await flush();
  expect(screen.lastFrame()).toContain('viewport-ready');
  expect(screen.errors()).toBe('');
  for (const key of ['\x1b[B', '\x1b[A', '\x1b[5~', '\x1b[6~', '\x1b[H', '\x1b[F']) screen.stdin.write(key);
  await flush();
  expect(height).not.toHaveBeenCalled();
});

it('lets Tab leave the disabled composer while a task is running', async () => {
  const messages = Array.from({ length: 50 }, (_, index) => ({ id: String(index), role: 'assistant' as const, content: `message-${index}`, timestamp: index }));
  const onSendMessage = vi.fn();
  const screen = render(<TUI messages={messages} onSendMessage={onSendMessage} />);
  await vi.waitFor(() => expect(screen.lastFrame()).toContain('message-49'));
  screen.rerender(<TUI messages={messages} onSendMessage={onSendMessage} isRunning />);
  await vi.waitFor(() => expect(screen.lastFrame()).toContain('(disabled)'));
  await flush();
  screen.stdin.write('\t'); await flush(); screen.stdin.write('\x1b[H');
  await vi.waitFor(() => expect(screen.lastFrame()).toContain('message-0'));
  expect(onSendMessage).not.toHaveBeenCalled();
});
