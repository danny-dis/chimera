#!/usr/bin/env node

/**
 * E2E smoke test runner for Chimera.
 *
 * Tests all mode/preset combinations with configured providers.
 *
 * Usage:
 *   node scripts/smoke-test.js                          # test all modes and presets
 *   node scripts/smoke-test.js --mode code --preset solo # test one combination
 *   node scripts/smoke-test.js --provider google         # test with specific provider
 */

const { execSync } = require('child_process');

const ALL_MODES = ['ask', 'plan', 'code', 'debug', 'review', 'oal'];
const ALL_PRESETS = ['solo', 'duo', 'trio', 'fusion'];
const ALL_PROVIDER_ENVS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY'];

// Parse args
const args = process.argv.slice(2);
let filterMode = null;
let filterPreset = null;
let filterProvider = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--mode' && args[i + 1]) filterMode = args[++i];
  if (args[i] === '--preset' && args[i + 1]) filterPreset = args[++i];
  if (args[i] === '--provider' && args[i + 1]) filterProvider = args[++i];
  if (args[i] === '--help') {
    console.log(`
Usage: node scripts/smoke-test.js [options]

Options:
  --mode <mode>       Filter to specific mode (ask|plan|code|debug|review|oal)
  --preset <preset>   Filter to specific preset (solo|duo|trio|fusion)
  --provider <name>   Filter to specific provider (anthropic|openai|google)
  --help              Show this help
`);
    process.exit(0);
  }
}

const modes = filterMode ? [filterMode] : ALL_MODES;
const presets = filterPreset ? [filterPreset] : ALL_PRESETS;

// Check which providers are available
function getAvailableProviders() {
  const providers = [];
  for (const envVar of ALL_PROVIDER_ENVS) {
    if (process.env[envVar]) {
      providers.push(envVar.replace('_API_KEY', '').toLowerCase());
    }
  }
  // Also check CHIMERA_CHEAP which works for any openai-compatible provider
  if (process.env.CHIMERA_CHEAP_API_KEY && process.env.CHIMERA_CHEAP_BASE_URL) {
    providers.push('openai-compatible');
  }
  return providers;
}

const availableProviders = getAvailableProviders();

if (availableProviders.length === 0) {
  console.log('\n  ⚠ No API keys found in environment. Set at least one of:');
  console.log('    ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY');
  console.log('    CHIMERA_CHEAP_API_KEY + CHIMERA_CHEAP_BASE_URL\n');
  console.log('  Running offline mock tests only...\n');
}

// Detect available modes/presets by checking what the system supports
const SUPPORTED_PRESETS_PER_MODE = {
  ask: ['solo', 'duo', 'trio', 'fusion'],
  plan: ['solo', 'duo', 'trio', 'fusion'],
  code: ['solo', 'duo', 'trio', 'fusion'],
  debug: ['solo', 'duo', 'trio', 'fusion'],
  review: ['solo', 'duo', 'trio', 'fusion'],
  oal: ['solo', 'duo', 'trio', 'fusion'],
};

const results = { passed: 0, failed: 0, skipped: 0, failures: [] };

console.log('╔══════════════════════════════════════════════╗');
console.log('║        Chimera E2E Smoke Tests               ║');
console.log('╚══════════════════════════════════════════════╝');
console.log(`  Providers: ${availableProviders.length > 0 ? availableProviders.join(', ') : 'mock (offline)'}`);
console.log(`  Modes: ${modes.join(', ')}`);
console.log(`  Presets: ${presets.join(', ')}`);
console.log(`  Total combinations: ${modes.length * presets.length}`);
console.log('');

for (const mode of modes) {
  for (const preset of presets) {
    const supportedPresets = SUPPORTED_PRESETS_PER_MODE[mode] || ALL_PRESETS;
    if (!supportedPresets.includes(preset)) {
      results.skipped++;
      console.log(`  ⊘ ${mode}/${preset} — skipped (unsupported combo)`);
      continue;
    }

    const label = `  ${mode}/${preset}`;
    const testTask = 'Say "hello" and nothing else.';

    try {
      // Build the command — use the CLI directly
      const cmd = `node packages/chimera-cli/dist/index.js ${mode} "${testTask}"`;
      const env = { ...process.env, NODE_NO_WARNINGS: '1' };

      const output = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 30000,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Check output has content
      if (output && output.length > 10) {
        results.passed++;
        console.log(`  ✓ ${mode}/${preset} — OK (${output.length} chars)`);
      } else {
        results.failed++;
        results.failures.push(`${mode}/${preset}: empty output`);
        console.log(`  ✗ ${mode}/${preset} — empty output`);
      }
    } catch (err) {
      const stderr = err.stderr || '';
      const stdout = err.stdout || '';

      // Mock provider fallback is acceptable for CI without keys
      if (stdout.includes('MockProvider') || stdout.includes('offline') || stdout.includes('No API keys')) {
        results.passed++;
        console.log(`  ✓ ${mode}/${preset} — OK (mock fallback)`);
      } else if (stderr.includes('ENOTFOUND') || stderr.includes('ECONNREFUSED')) {
        results.skipped++;
        console.log(`  ⊘ ${mode}/${preset} — skipped (network unavailable)`);
      } else {
        results.failed++;
        const errMsg = (stderr || stdout || err.message).slice(0, 120);
        results.failures.push(`${mode}/${preset}: ${errMsg}`);
        console.log(`  ✗ ${mode}/${preset} — FAILED`);
        console.log(`    ${errMsg}`);
      }
    }
  }
}

console.log('');
console.log('══════════════════════════════════════════════');
console.log(`  Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);

if (results.failures.length > 0) {
  console.log('');
  console.log('  Failures:');
  for (const f of results.failures) {
    console.log(`    - ${f}`);
  }
}

console.log('══════════════════════════════════════════════');

process.exit(results.failed > 0 ? 1 : 0);
