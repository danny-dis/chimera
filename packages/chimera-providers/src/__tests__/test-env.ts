/**
 * Shared test helper for isolating `process.env` from the developer's real
 * machine environment when testing `ProviderFactory`'s env-var discovery.
 *
 * `ProviderFactory.discoverEnvConfigs` (see ../provider-factory.ts) scans a
 * fixed set of `<PROVIDER>_API_KEY` / `<PROVIDER>_MODEL` variables. On a dev
 * machine that has real provider credentials exported (e.g. `MISTRAL_API_KEY`
 * / `MISTRAL_MODEL`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, ...), tests that
 * only clear the "big four" (Anthropic/OpenAI/Google/Ollama) leak those
 * ambient credentials straight into `createFromEnv()` / `createSingle()` and
 * silently defeat the "no config -> MockProvider" fallback under test.
 *
 * This list must stay in sync with the `providerConfigs` table in
 * `../provider-factory.ts`.
 */
export const PROVIDER_ENV_KEYS: readonly string[] = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'GOOGLE_API_KEY',
  'GOOGLE_MODEL',
  'OLLAMA_MODEL',
  'OLLAMA_HOST',
  'XAI_API_KEY',
  'XAI_MODEL',
  'PERPLEXITY_API_KEY',
  'PERPLEXITY_MODEL',
  'COHERE_API_KEY',
  'COHERE_MODEL',
  'MISTRAL_API_KEY',
  'MISTRAL_MODEL',
  'META_API_KEY',
  'META_MODEL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_MODEL',
  'QWEN_API_KEY',
  'QWEN_MODEL',
  'MOONSHOT_API_KEY',
  'MOONSHOT_MODEL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  // Not read by discoverEnvConfigs directly, but related knobs that other
  // fallback paths (CLI config-loader, mock opt-in) key off of — cleared
  // here too so these tests stay agnostic to the host environment.
  'CHIMERA_USE_MOCK',
  'CHIMERA_CHEAP_API_KEY',
  'CHIMERA_CHEAP_BASE_URL',
  'CHIMERA_CHEAP_MODEL',
  'OPENGOV_API_KEY',
  'OPENGOV_BASE_URL',
];

/** Delete every known provider-related env var from `process.env`. */
export function clearProviderEnv(): void {
  for (const key of PROVIDER_ENV_KEYS) {
    delete process.env[key];
  }
}
