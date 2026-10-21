import { it, expect, vi } from 'vitest';
import Module from 'node:module';
import { resolveAppInstalledTypeScriptServer } from '../lsp-registry.js';

it('pins the untrusted-workspace runtime to the current executable', () => {
  expect(resolveAppInstalledTypeScriptServer().command).toBe(process.execPath);
});

it('fails closed when the application-installed server is absent', () => {
  const original = (Module as any)._resolveFilename;
  const resolver = vi.spyOn(Module as any, '_resolveFilename').mockImplementation((request, ...args) => {
    if (String(request).startsWith('typescript-language-server/')) throw new Error('not installed');
    return Reflect.apply(original, Module, [request, ...args]);
  });
  try {
    expect(() => resolveAppInstalledTypeScriptServer()).toThrow(/application-installed.*unavailable/i);
  } finally {
    resolver.mockRestore();
  }
});
