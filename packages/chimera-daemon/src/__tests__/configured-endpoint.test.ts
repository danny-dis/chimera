import { expect, it, vi } from 'vitest';
import { resolveProviders } from '../config-loader.js';
it('resolves configured endpoint environment references without altering model IDs', () => {
  vi.stubEnv('CHIMERA_ENDPOINT_TEST', 'http://127.0.0.1:12345/v1');
  try {
    const [provider] = resolveProviders({ providers: [{ name: 'writer', provider: 'openai-compatible', model: 'literal-model', role: 'writer', base_url: '${CHIMERA_ENDPOINT_TEST}' }], defaults: {} } as any);
    expect(provider.baseUrl).toBe('http://127.0.0.1:12345/v1');
    expect(provider.model).toBe('literal-model');
  } finally { vi.unstubAllEnvs(); }
});
