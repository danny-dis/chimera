import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProviderConfig } from '../src/provider.js';

test('loadProviderConfig requires both an API key and model', () => {
  assert.equal(loadProviderConfig({}), null);
  assert.equal(loadProviderConfig({ CHIMERA_API_KEY: 'key' }), null);
  assert.deepEqual(loadProviderConfig({ CHIMERA_API_KEY: 'key', CHIMERA_MODEL: 'model' }), {
    apiKey: 'key',
    model: 'model',
    baseUrl: 'https://api.openai.com/v1',
  });
});

test('loadProviderConfig accepts role overrides', () => {
  assert.deepEqual(loadProviderConfig({ CHIMERA_API_KEY: 'global', CHIMERA_MODEL: 'global-model' }, {
    apiKey: 'role-key',
    model: 'role-model',
    baseUrl: 'https://example.test/v1/',
  }), {
    apiKey: 'role-key',
    model: 'role-model',
    baseUrl: 'https://example.test/v1',
  });
});
