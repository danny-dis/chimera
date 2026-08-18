// scripts/matrix-disk.mjs
// Full 37-combo live matrix, asserting DISK side-effects + validity + an
// OBJECTIVE grade from hidden tests (scripts/task-suite.mjs).
//
// Gradeable modes (code, debug, code_multi) are scored by the fraction of
// hidden assertions their artifact passes — NOT by a completion heuristic.
// Non-gradeable modes (ask/plan/review/oal/auto) still use the rubric in
// score-combo.mjs and are reported separately; the two are never averaged.
//
// Env:
//   COMBO=mode/preset   run a single combo (writes a SEPARATE smoke artifact)
//   RUNS=n              repeat the whole list n times, report per-combo median
//                       + spread and name every non-reproducible combo
//
// Verifies the truncation-hardened write_file: code/debug must land a
// syntactically-valid file OR route to needs_user — never broken-and-done.
//
// Key wiring (matches real chimera-cli):
//   new ToolExecutor(toolRegistry, () => 'allow')  // registry is REQUIRED
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'fs';
import { resolve as resolvePath, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(__dirname, '..');
const require = createRequire(join(repoRoot, 'packages', 'chimera-cli', 'package.json'));

// load .env
const envPath = join(repoRoot, '.env');
try {
  const txt = readFileSync(envPath, 'utf-8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const { SessionOrchestrator, EventStream } = require('@chimera/core');
const { ProviderFactory, SimpleModelRegistry, RateLimiter } = require('@chimera/providers');
const { ToolRegistry, ToolExecutor, allTools } = require('@chimera/tools');
const { scoreCombo } = await import('./score-combo.mjs');
const { promptFor, GRADEABLE, TASKS } = await import('./task-suite.mjs');
const { gradeTask, seedTask, validateJsFiles } = await import('./grade-task.mjs');

function adaptProvider(provider) {
  return {
    async complete(messages, options) {
      const mappedMessages = messages.map((m) => {
        const extra = m;
        const msg = { role: m.role, content: m.content };
        if (m.role === 'tool') {
          if (typeof extra.tool_call_id === 'string') msg.toolResultId = extra.tool_call_id;
          else { try { const p = JSON.parse(m.content); if (p.toolCallId) msg.toolResultId = p.toolCallId; } catch {} }
        }
        if (m.role === 'assistant' && Array.isArray(extra.tool_calls)) {
          msg.toolCalls = extra.tool_calls
            .filter((tc) => tc && tc.function && typeof tc.function.name === 'string')
            .map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments }));
        }
        return msg;
      });
      const result = await provider.complete(mappedMessages, {
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        responseFormat: options?.responseFormat,
        tools: options?.tools,
        cacheControl: options?.cacheControl,
      });
      return {
        content: result.content,
        toolCalls: result.toolCalls?.map((tc) => ({ id: tc.id, name: tc.name, arguments: typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments })),
        usage: result.usage,
      };
    },
    getModel() { return provider.getModel ? provider.getModel() : { provider: 'adapted', model: 'unknown' }; },
    getModelId() { return provider.getModelId ? provider.getModelId() : 'unknown'; },
  };
}

function buildProvider(entry) {
  const p = ProviderFactory.create({
    name: entry.name, provider: entry.provider, model: entry.model,
    apiKey: resolveEnvRef(entry.apiKey ?? entry.api_key), baseUrl: resolveEnvRef(entry.baseUrl ?? entry.base_url),
    role: entry.role, timeoutMs: entry.timeoutMs ?? entry.timeout_ms ?? 120000,
    constraints: { maxTokensPerTurn: 4096, costCapPerTask: 10, costCapPerSession: 20, costCapPerDay: 50, maxParallelInstances: 1, rateLimitRpm: 60 },
  });
  return adaptProvider(p);
}

// Load providers from the REAL .chimera/config.yaml so this matrix tests the
// exact wiring the user configured (writer=OpenGateway tencent/hy3,
// reviewer=Google, challenger=Mistral). Mirrors config-loader.resolveEnvRef.
const { parse: parseYaml } = require('yaml');
function resolveEnvRef(v) {
  if (!v) return v;
  const m = String(v).match(/^\$?\${([\w]+)}$/);
  return m ? (process.env[m[1]] || undefined) : v;
}
const yamlPath = join(repoRoot, '.chimera', 'config.yaml');
const cfg = parseYaml(readFileSync(yamlPath, 'utf-8'));
const resolved = cfg.providers.map((p) => ({ ...p, apiKey: resolveEnvRef(p.api_key), baseUrl: resolveEnvRef(p.base_url) }));
const byRole = (role) => resolved.find((p) => p.role === role);
const writerEntry = byRole('writer');
const reviewerEntry = byRole('reviewer');
const challengerEntry = byRole('challenger');
if (!writerEntry || !reviewerEntry || !challengerEntry) {
  console.error(`Missing role(s): writer=${!!writerEntry} reviewer=${!!reviewerEntry} challenger=${!!challengerEntry}`);
  process.exit(2);
}
// expose for the summary line
const writerModel = writerEntry.model;
const reviewerModel = reviewerEntry.model;

const writer = buildProvider(writerEntry);
const reviewer = buildProvider(reviewerEntry);
const challenger = buildProvider(challengerEntry);

const toolRegistry = new ToolRegistry();
for (const tool of allTools) {
  toolRegistry.register(tool);
}
// CORRECT wiring: executor MUST receive the registry, else writes silently fail.
const toolExecutor = new ToolExecutor(toolRegistry, () => 'allow');
// Build a POPULATED model registry. `buildDeliberationConfig` derives every
// preset's model ids from `registry.getAll()`; an EMPTY registry made it fall
// back to the literal string 'default' for every role, so duo threw
// ("modelA=modelB=default") and fusion degraded ("no panel models available").
// The real CLI (cli-router.ts) populates the registry from the resolved
// providers — this mirrors that so the matrix tests the same wiring.
function buildRegistry(providers) {
  const reg = new SimpleModelRegistry();
  for (const prov of providers) {
    if (!prov) continue;
    let info, pricing;
    try { info = prov.getModel ? prov.getModel() : null; } catch { info = null; }
    try { pricing = prov.getPricing ? prov.getPricing() : null; } catch { pricing = null; }
    const id = info?.id || info?.name;
    if (!id) continue;
    try {
      reg.register({
        id,
        name: info.name ?? id,
        provider: info.provider ?? 'openai-compatible',
        contextWindow: info.contextWindow ?? 128000,
        maxOutputTokens: info.maxOutputTokens ?? 4096,
        pricing: {
          inputPerMillion: pricing?.inputPerMillion ?? 0,
          outputPerMillion: pricing?.outputPerMillion ?? 0,
          cacheReadPerMillion: pricing?.cacheReadPerMillion ?? 0,
          cacheWritePerMillion: pricing?.cacheWritePerMillion ?? 0,
        },
        capabilities: {
          toolCalling: prov.supportsToolCalling ? prov.supportsToolCalling() : true,
          structuredOutput: prov.supportsStructuredOutput ? prov.supportsStructuredOutput() : true,
          vision: prov.supportsVision ? prov.supportsVision() : false,
          reasoning: prov.supportsReasoning ? prov.supportsReasoning() : false,
          parallelToolCalls: false,
        },
        degradationThreshold: 0.75,
        tier: 'frontier',
      });
    } catch {
      // A partial/odd entry shouldn't abort the matrix.
    }
  }
  return reg;
}

const budgetEnforcer = undefined; // metadata subsystem removed (72b668d); core uses its own BudgetGuard
const rateLimiter = new RateLimiter({ rpm: 60, tpm: 1_000_000 });

const VALID = [
  ['ask', 'solo'],
  ['plan', 'solo'], ['plan', 'duo'],
  ['code', 'auto'], ['code', 'solo'], ['code', 'duo'], ['code', 'trio'], ['code', 'fusion'], ['code', 'hive'], ['code', 'swarm'],
  ['debug', 'auto'], ['debug', 'solo'], ['debug', 'duo'], ['debug', 'trio'], ['debug', 'fusion'], ['debug', 'swarm'],
  // code_multi: two files that must agree on export names — the cross-file
  // consistency failure the old suite never tested (BUG-3).
  ['code_multi', 'auto'], ['code_multi', 'solo'], ['code_multi', 'duo'], ['code_multi', 'trio'], ['code_multi', 'fusion'], ['code_multi', 'hive'], ['code_multi', 'swarm'],
  ['review', 'solo'], ['review', 'auto'], ['review', 'duo'], ['review', 'trio'], ['review', 'fusion'], ['review', 'swarm'],
  ['oal', 'solo'],
  ['auto', 'auto'], ['auto', 'solo'], ['auto', 'duo'], ['auto', 'trio'], ['auto', 'fusion'], ['auto', 'hive'], ['auto', 'swarm'],
];

function taskFor(mode) {
  // Gradeable modes get the real task suite (task-suite.mjs) whose prompts
  // hide edge cases a careless single pass misses. The old trivial prompts
  // ("Hello, " + name) gave a reviewer nothing to catch (BUG-3).
  const real = promptFor(mode);
  if (real) return real;
  switch (mode) {
    case 'ask': return 'Reply with exactly the single word: PONG';
    case 'plan': return 'Write a plan (as markdown) to create a small Node.js CLI that prints "hello". Do not write code files, just the plan.';
    case 'review': return 'Review this code for bugs: function divide(a,b){ return a*b; }. Reply with PASS or list the issues.';
    case 'oal': return 'Loop: first say STEP1, then say STEP2. Demonstrate a 2-step autonomous loop.';
    case 'auto': return 'Reply with exactly the single word: PONG';
    default: return 'Reply with exactly the single word: PONG';
  }
}

// Seeding and JS validation now live in grade-task.mjs (seedTask /
// validateJsFiles) so the harness and the offline grader tests share one
// implementation. The old seedDebug/validateJs were removed here.

// validateJs was replaced by validateJsFiles (grade-task.mjs), which also
// skips the generated grader runner. Kept as a thin alias so any remaining
// call site keeps working.
const validateJs = validateJsFiles;

// Separate INFRA failures from CAPABILITY failures.
//
// A `fetch failed` / `ProviderUnavailableError` / empty-completion is the
// DMR-X gateway dying mid-run, NOT a defect in the preset that happened to
// be executing. Counting them against the preset is precisely how a flaky
// run gets recorded as a quality finding: three runs of THIS harness on the
// same commit within 80 minutes produced 19/30, 25/30 and duo-still-broken,
// because gateway blips landed on different combos each time.
//
// Infra rows are reported separately and EXCLUDED from the quality average.
const INFRA_PATTERNS = [
  /ProviderUnavailableError/i,
  /fetch failed/i,
  /returned empty content with no tool calls/i,
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i,
  /\b(?:429|500|502|503|504)\b/,
  /rate ?limit/i,
  /timed? ?out/i,
];

function classifyFailure(text) {
  if (!text) return null;
  return INFRA_PATTERNS.some((re) => re.test(text)) ? 'infra' : 'capability';
}

const results = [];
const failures = [];

async function runCombo(mode, preset, runIndex = 1) {
  const workdir = join(tmpdir(), `chimera-matrix-${mode}-${preset}-${Date.now()}`);
  mkdirSync(workdir, { recursive: true });
  seedTask(mode, workdir);

  const eventStream = new EventStream();
  let toolCalls = 0, diskWrites = 0, writeErrors = 0;
  const evErrors = [];
  eventStream.subscribe('*', (ev) => {
    const t = ev?.type || '';
    if (t.includes('error')) evErrors.push(t);
    if (t === 'tool_call_requested') { toolCalls++; const tn = ev?.call?.tool || ev?.tool; if (tn === 'write_file' || tn === 'edit_file') diskWrites++; }
    if (t === 'tool_error' || (t.includes('tool') && /exit 1|error|fail/i.test(JSON.stringify(ev)))) writeErrors++;
  });

  const providerFactory = (id) => (id === 'reviewer' ? reviewer : id === 'challenger' ? (challenger || writer) : writer);

  const orchestrator = new SessionOrchestrator(
    eventStream,
    { registry: toolRegistry, executor: toolExecutor },
    workdir,
    undefined,
    { registry: buildRegistry([writer, reviewer, challenger]), budgetEnforcer, rateLimiter, providerFactory, availableProviders: ['writer', 'reviewer', 'challenger'] },
  );

  const start = Date.now();
  let result;
  const runOnce = async () => {
    try {
      return await orchestrator.execute({ task: taskFor(mode), mode, providers: { writer, reviewer, challenger }, preset, costCap: 10 });
    } catch (e) {
      return { status: 'throw', error: e instanceof Error ? e.message : String(e) };
    }
  };
  result = await runOnce();
  // Retry once on transient failures (provider empty-content blips, throws)
  // so a one-off API hiccup doesn't poison the unattended audit. A genuine
  // capability gap will still surface on the second attempt.
  const s0 = result?.status;
  if (s0 === 'throw' || s0 === 'error') {
    await new Promise((r) => setTimeout(r, 5000));
    result = await runOnce();
  }
  const ms = Date.now() - start;
  const status = result?.status || 'unknown';

  // Disk assertions for code/debug — but NOT for swarm: swarm is a
  // text-only deliberation preset (sub-agents run complete() with no tools),
  // so it can never satisfy a file-on-disk gate. Asserting disk here produces
  // a false needs_user (code/swarm) or a false pass (debug/swarm, target is
  // pre-seeded). Remove the artifact; score swarm on status/events only.
  let disk = null;
  if (GRADEABLE.has(mode) && preset !== 'swarm') {
    const js = validateJs(workdir);
    const targetExists = existsSync(join(workdir, TASKS[mode].target));
    disk = { targetExists, ...js };
    // A "done" with a broken/target-missing file is the failure we are hunting.
    const brokenDone = (status === 'done') && (js.broken > 0 || !targetExists);
    if (brokenDone) {
      failures.push({ mode, preset, status, reason: `done but broken/missing file (broken=${js.broken}, targetExists=${targetExists})` });
    }
    // LANDED != CORRECT: parsable (valid>0) but nothing ran = the file loads
    // with a thrown error (missing dep, top-level crash). Strong defect signal.
    const unrunnableDone = (status === 'done') && targetExists && js.valid > 0 && js.ran === 0;
    if (unrunnableDone) {
      failures.push({ mode, preset, status, reason: `done but file unrunnable (ran=0/${js.valid}, err=${js.runError})` });
    }
  }

  // OBJECTIVE GRADING (BUG-4): run hidden tests against the artifact. Must
  // happen BEFORE the workdir is removed. For gradeable modes this REPLACES
  // the completion rubric as `quality`, so the headline number reflects
  // whether the code actually works rather than whether a file appeared.
  let grade = null;
  if (GRADEABLE.has(mode)) {
    try { grade = gradeTask(mode, workdir); } catch (e) { grade = { gradeable: true, passed: 0, total: 0, ratio: null, failures: ['grader crashed: ' + String(e?.message).slice(0, 120)] }; }
  }
  // A graded row that finished but failed assertions is a real defect the
  // old rubric scored 1.00. Record it.
  if (grade && grade.ratio !== null && status === 'done' && grade.ratio < 1) {
    failures.push({ mode, preset, status, reason: `done but only ${grade.passed}/${grade.total} hidden tests pass: ${(grade.failures || []).slice(0, 3).join('; ')}` });
  }

  const rubricScore = scoreCombo({ mode, preset, status, disk, diskWrites, toolCalls, evErrors });
  const useObjective = grade && typeof grade.ratio === 'number';
  const score = useObjective ? grade.ratio : rubricScore;
  const scoreKind = useObjective ? 'objective' : 'rubric';
  // Persist the failure text INTO the artifact. Historically results.json
  // carried `error: None` while the real `ERR:` string existed only in the
  // .log, so a run could not be triaged from the JSON alone.
  const errorText = (status === 'error' || status === 'throw')
    ? (result?.error || result?.output || '').toString()
    : '';
  const failureClass = classifyFailure(errorText);
  const rec = { run: runIndex, mode, preset, status, ms, toolCalls, diskWrites, writeErrors, evErrors: [...new Set(evErrors)], disk, quality: score, scoreKind, rubricScore, grade, failureClass, errorText: errorText.slice(0, 400), output: (result?.output || result?.result || result?.error || '').toString().slice(0, 160) };
  results.push(rec);
  const diskStr = disk ? ` disk.target=${disk.targetExists} valid=${disk.valid} broken=${disk.broken} ran=${disk.ran}` : '';
  const gradeStr = grade && grade.total ? ` grade=${grade.passed}/${grade.total}` : '';
  console.log(`  ${mode}/${preset} -> ${status} (${ms}ms tools=${toolCalls} diskW=${diskWrites}${diskStr}${gradeStr}${evErrors.length ? ' EV:' + [...new Set(evErrors)].join(',') : ''})${status === 'throw' || status === 'error' ? ' ERR:' + ((result?.error || result?.output || '').toString().slice(0, 300)) : ''}`);

  // cleanup
  try { rmSync(workdir, { recursive: true, force: true }); } catch {}
  // Inter-combo delay: 5s gives free-tier rate limits time to reset
  // (tencent/hy3 says "retry in 16s" — a longer gap between combos
  // avoids cascading 429s across the matrix).
  await new Promise((r) => setTimeout(r, 5000));
}

// Quality stand-in imported from score-combo.mjs (pure, unit-tested).
const RUNS = Math.max(1, Number(process.env.RUNS || 1));

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Aggregate every row of a mode/preset across runs. Median is the headline —
// a single sample is not a quality gate (BUG-2: one commit produced 19/30,
// 25/30 and duo-broken across three passes).
function buildAggregates(rows) {
  const byCombo = new Map();
  for (const r of rows) {
    const k = `${r.mode}/${r.preset}`;
    if (!byCombo.has(k)) byCombo.set(k, []);
    byCombo.get(k).push(r);
  }
  const agg = {};
  for (const [k, rs] of byCombo) {
    const qs = rs.map((r) => r.quality);
    const statuses = [...new Set(rs.map((r) => r.status))];
    agg[k] = {
      mode: rs[0].mode, preset: rs[0].preset, n: rs.length,
      medianQuality: median(qs), min: Math.min(...qs), max: Math.max(...qs),
      spread: Math.max(...qs) - Math.min(...qs),
      statuses, flaky: statuses.length > 1,
      scoreKind: rs[0].scoreKind,
      anyInfra: rs.some((r) => r.failureClass === 'infra'),
    };
  }
  return agg;
}

async function main() {
  // Optional: COMBO=mode/preset runs a single combo (smoke test).
  const comboFilter = process.env.COMBO;
  const combos = comboFilter ? VALID.filter(([m, p]) => `${m}/${p}` === comboFilter) : VALID;
  if (comboFilter && combos.length === 0) {
    console.error(`COMBO '${comboFilter}' not found in VALID list.`);
    process.exit(2);
  }
  console.log(`Matrix (disk+validity+grade): writer=${writerModel} reviewer=${reviewerModel} challenger=${challengerEntry.model}${comboFilter ? ` [smoke: ${comboFilter}]` : ''}${RUNS > 1 ? ` [RUNS=${RUNS}]` : ''}`);
  for (let run = 1; run <= RUNS; run++) {
    if (RUNS > 1) console.log(`\n########## RUN ${run}/${RUNS} ##########`);
    let i = 0;
    for (const [mode, preset] of combos) {
      i++;
      console.log(`[${i}/${combos.length}]${RUNS > 1 ? ` (run ${run})` : ''}`);
      await runCombo(mode, preset, run);
    }
  }
  const done = results.filter((r) => r.status === 'done' || r.status === 'complete').length;
  const codeRows = results.filter((r) => r.mode === 'code' || r.mode === 'debug');
  const codeBrokenDone = codeRows.filter((r) => r.status === 'done' && r.disk && (r.disk.broken > 0 || !r.disk.targetExists));
  const codeUnrunnableDone = codeRows.filter((r) => r.status === 'done' && r.disk && r.disk.valid > 0 && r.disk.ran === 0);
  console.log(`\n=== SUMMARY: ${done}/${results.length} done/complete ===`);
  const infraRows = results.filter((r) => r.failureClass === 'infra');
  const capRows = results.filter((r) => r.failureClass === 'capability');
  const totalWriteErrors = results.reduce((a, r) => a + (r.writeErrors || 0), 0);
  console.log(`code/debug rows: ${codeRows.length}, broken-and-done: ${codeBrokenDone.length}, unrunnable-done: ${codeUnrunnableDone.length}`);
  console.log(`\n=== FAILURE BUCKETS ===`);
  console.log(`  infra (gateway/network — NOT a Chimera defect): ${infraRows.length}`);
  for (const r of infraRows) console.log(`    ${r.mode}/${r.preset}: ${r.errorText.slice(0, 110)}`);
  console.log(`  capability (real Chimera defect): ${capRows.length}`);
  for (const r of capRows) console.log(`    ${r.mode}/${r.preset}: ${r.errorText.slice(0, 110)}`);
  if (infraRows.length) {
    console.log(`  >> ${infraRows.length} row(s) failed on infrastructure. Re-run before treating`);
    console.log('     this pass as a quality measurement; probe the gateway first.');
  }
  // writeErrors was collected per-combo but never asserted on or reported.
  console.log(`\n=== TOOL WRITE ERRORS: ${totalWriteErrors} ===`);
  if (totalWriteErrors) {
    for (const r of results.filter((x) => x.writeErrors > 0)) {
      console.log(`  ${r.mode}/${r.preset}: ${r.writeErrors} write/tool error event(s) (status=${r.status})`);
    }
    console.log('  NOTE: tool errors occurred even in rows that reported success.');
  }
  if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  ' + JSON.stringify(f)); }
  else console.log('No broken-and-done code/debug rows. Truncation guard OK.');

  const aggregates = buildAggregates(results);
  const aggList = Object.values(aggregates);

  console.log('\n=== QUALITY BY PRESET (median across runs) ===');
  console.log('  objective = fraction of hidden tests passing; rubric = completion heuristic');
  const presets = [...new Set(aggList.map((a) => a.preset))];
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  for (const p of presets) {
    const objRows = aggList.filter((a) => a.preset === p && a.scoreKind === 'objective' && !a.anyInfra);
    const rubRows = aggList.filter((a) => a.preset === p && a.scoreKind === 'rubric' && !a.anyInfra);
    const objStr = objRows.length ? `objective=${avg(objRows.map((a) => a.medianQuality)).toFixed(2)} (n=${objRows.length})` : 'objective=n/a';
    const rubStr = rubRows.length ? `rubric=${avg(rubRows.map((a) => a.medianQuality)).toFixed(2)} (n=${rubRows.length})` : 'rubric=n/a';
    console.log(`  ${p.padEnd(7)} ${objStr}  ${rubStr}`);
  }

  if (RUNS > 1) {
    console.log('\n=== REPRODUCIBILITY ===');
    const flaky = aggList.filter((a) => a.flaky);
    const spready = aggList.filter((a) => a.spread > 0);
    console.log(`  runs=${RUNS}  combos=${aggList.length}`);
    console.log(`  status-unstable combos: ${flaky.length}`);
    for (const a of flaky) console.log(`    ${a.mode}/${a.preset}: ${a.statuses.join(' | ')}`);
    console.log(`  quality-varying combos: ${spready.length}`);
    for (const a of spready) console.log(`    ${a.mode}/${a.preset}: min=${a.min.toFixed(2)} max=${a.max.toFixed(2)} spread=${a.spread.toFixed(2)}`);
    if (!flaky.length && !spready.length) console.log('  fully reproducible across runs.');
  } else {
    console.log('\n=== REPRODUCIBILITY ===');
    console.log('  RUNS=1 — single sample, variance UNMEASURED. Re-run with RUNS=3 before');
    console.log('  quoting any score (BUG-2: one commit gave 19/30, 25/30 and duo-broken).');
  }

  // Solo vs multi on MEDIANS, objective rows only, infra excluded.
  const objAgg = aggList.filter((a) => a.scoreKind === 'objective' && !a.anyInfra);
  const soloAgg = objAgg.filter((a) => a.preset === 'solo');
  const multiAgg = objAgg.filter((a) => !['solo', 'auto'].includes(a.preset));
  const soloQ = avg(soloAgg.map((a) => a.medianQuality));
  const multiQ = avg(multiAgg.map((a) => a.medianQuality));
  console.log('\n=== SOLO vs MULTI-AGENT (objective medians, infra excluded) ===');
  console.log(`  solo     medianQuality=${soloQ.toFixed(2)}  n=${soloAgg.length}`);
  console.log(`  multi    medianQuality=${multiQ.toFixed(2)}  n=${multiAgg.length}`);
  console.log(`  delta    ${(multiQ - soloQ >= 0 ? '+' : '')}${(multiQ - soloQ).toFixed(2)}`);
  console.log('  `quality` for code/debug/code_multi is now OBJECTIVE (hidden tests, see');
  console.log('  scripts/task-suite.mjs). Non-gradeable modes (ask/plan/review/oal/auto)');
  console.log('  still use the completion rubric in score-combo.mjs and are reported');
  console.log(`  separately above.${RUNS > 1 ? '' : ' RUNS=1: treat this as ONE sample, not a finding.'}`);
  if (multiQ <= soloQ && multiAgg.length) console.log('  NOTE: multi-agent did NOT beat solo on the objective tasks.');

  const outPath = join(repoRoot, 'scripts', comboFilter ? 'matrix-disk-results-smoke.json' : 'matrix-disk-results.json');
  writeFileSync(outPath, JSON.stringify({ writer: writerModel, reviewer: reviewerModel, challenger: challengerEntry.model, ranAt: new Date().toISOString(), smoke: comboFilter || undefined, runs: RUNS, comboCount: results.length, aggregates, results }, null, 2));
  console.log(`Wrote ${outPath}`);
  if (comboFilter) console.log('(smoke run — full-run artifact matrix-disk-results.json left untouched)');
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
