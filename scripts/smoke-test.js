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
const fs = require('fs');

// Disposable workspace-relative scratch dir for the modes that must actually
// write a file to report success. Recreated on every run so a stale file from
// a previous run can't make a broken build look like it passed.
const SCRATCH_DIR = 'smoke-tmp';
fs.rmSync(SCRATCH_DIR, { recursive: true, force: true });
fs.mkdirSync(SCRATCH_DIR, { recursive: true });

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
    // `code`, `debug` and `oal` gate completion on an actual file change, so
    // asking them to answer a question can only ever produce `needs_user`.
    // Give those modes a real (tiny, disposable) write task instead.
    const scratchFile = `${SCRATCH_DIR}/${mode}-${preset}.txt`;
    const testTask =
      mode === 'code' || mode === 'debug' || mode === 'oal'
        ? `Create a file at ${scratchFile} whose entire contents are the single word: hello`
        : 'Say \\"hello\\" and nothing else.';

    try {
      // Build the command — use the CLI directly.
      // NOTE: `--preset` must actually be passed, otherwise every "preset"
      // below runs the identical command and the 4x matrix is meaningless.
      // `--yolo` auto-approves tool calls: this is a non-interactive harness,
      // so a permission prompt would otherwise deadlock until the timeout.
      const cmd = `node packages/chimera-cli/dist/index.js ${mode} "${testTask}" --preset ${preset} --yolo`;
      const env = { ...process.env, NODE_NO_WARNINGS: '1' };

      // Multi-model presets (trio/fusion) legitimately take longer than a
      // single call, and a flaky upstream can add a fallback hop on top, so
      // the budget scales with the preset instead of a flat 30s that reports
      // "failure" for what is really "still working".
      const timeoutMs = preset === 'solo' ? 90_000 : 240_000;

      const output = execSync(cmd, {
        encoding: 'utf-8',
        timeout: timeoutMs,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // A run only counts as a pass if it actually reported a terminal status.
      // Length alone is not evidence of success — the spinner banner is more
      // than 10 characters on its own, which used to mask real failures.
      const statusMatch = /Status:\s*(\w+)/.exec(output || '');
      const status = statusMatch ? statusMatch[1] : null;

      // For write modes, "done" is only credible if the file actually landed.
      const mustWrite = mode === 'code' || mode === 'debug' || mode === 'oal';
      const wrote = mustWrite ? fs.existsSync(scratchFile) : true;

      if (status === 'done' && wrote) {
        results.passed++;
        console.log(`  ✓ ${mode}/${preset} — OK (${output.length} chars)`);
      } else if (status === 'done' && !wrote) {
        results.failed++;
        results.failures.push(`${mode}/${preset}: reported done but ${scratchFile} was never written`);
        console.log(`  ✗ ${mode}/${preset} — claimed done, no file written`);
      } else if (status) {
        // needs_user / blocked / error: the process behaved, the task did not
        // complete. Report the real status rather than a generic failure.
        results.failed++;
        results.failures.push(`${mode}/${preset}: status=${status}`);
        console.log(`  ✗ ${mode}/${preset} — status=${status}`);
      } else {
        results.failed++;
        results.failures.push(`${mode}/${preset}: no status line in output`);
        console.log(`  ✗ ${mode}/${preset} — no status line`);
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
      } else if (err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM') {
        // Distinguish "took too long" from "crashed" — conflating the two is
        // what made the previous 0/24 result impossible to act on.
        results.failed++;
        results.failures.push(`${mode}/${preset}: TIMEOUT after ${timeoutMs}ms`);
        console.log(`  ✗ ${mode}/${preset} — TIMEOUT (${timeoutMs}ms)`);
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
