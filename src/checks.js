import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { evaluateCommandPermission } from './policy.js';

const DEFAULT_TIMEOUT_MS = 120_000;

export async function discoverCheckCommands(root, repo) {
  const checks = [];
  if (repo.packageFiles.includes('package.json')) {
    checks.push(...await discoverNodeChecks(root));
  }
  if (repo.packageFiles.includes('Cargo.toml')) checks.push({ command: 'cargo test', source: 'Cargo.toml' });
  if (repo.packageFiles.includes('go.mod')) checks.push({ command: 'go test ./...', source: 'go.mod' });
  if (repo.packageFiles.includes('pyproject.toml') || repo.packageFiles.includes('requirements.txt')) checks.push({ command: 'pytest', source: 'python manifest' });
  checks.push({ command: 'git diff --check', source: 'git' });
  return dedupeChecks(checks);
}

export async function runCheckCommands({ root, commands, permissionProfile = 'read-only', session, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const results = [];
  for (const check of commands) {
    const decision = evaluateCommandPermission(check.command, permissionProfile);
    await session?.record({ type: 'check_permission_evaluated', command: check.command, decision });
    if (!decision.allowed) {
      results.push({ ...check, skipped: true, exitCode: null, stdout: '', stderr: '', decision });
      continue;
    }
    const startedAt = new Date().toISOString();
    const result = await runShellLikeCommand(check.command, { cwd: root, timeoutMs });
    const completed = { ...check, ...result, skipped: false, decision, startedAt, completedAt: new Date().toISOString() };
    await session?.record({ type: 'check_completed', result: summarizeCheckResult(completed) });
    results.push(completed);
  }
  return results;
}

export function summarizeCheckResults(results) {
  if (!results.length) return ['No check commands were discovered.'];
  return results.map((result) => {
    if (result.skipped) return `${result.command}: skipped (${result.decision.reason})`;
    const status = result.exitCode === 0 ? 'passed' : `failed with exit ${result.exitCode}`;
    return `${result.command}: ${status}`;
  });
}

async function discoverNodeChecks(root) {
  const packageJsonPath = path.join(root, 'package.json');
  try {
    const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    const scripts = pkg.scripts || {};
    const preferred = ['lint', 'typecheck', 'test', 'build'];
    return preferred
      .filter((script) => typeof scripts[script] === 'string')
      .map((script) => ({ command: `npm run ${script}`, source: `package.json scripts.${script}` }));
  } catch {
    return [{ command: 'npm test', source: 'package.json fallback' }];
  }
}

function dedupeChecks(checks) {
  const seen = new Set();
  return checks.filter((check) => {
    if (seen.has(check.command)) return false;
    seen.add(check.command);
    return true;
  });
}

function runShellLikeCommand(command, { cwd, timeoutMs }) {
  const [file, ...args] = splitCommand(command);
  return new Promise((resolve) => {
    execFile(file, args, { cwd, timeout: timeoutMs, maxBuffer: 1_000_000 }, (error, stdout, stderr) => {
      resolve({
        exitCode: error?.code ?? 0,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr || error?.message || ''),
      });
    });
  });
}

function summarizeCheckResult(result) {
  return {
    command: result.command,
    source: result.source,
    skipped: result.skipped,
    exitCode: result.exitCode,
    stdout: trimOutput(result.stdout, 1000),
    stderr: trimOutput(result.stderr, 1000),
  };
}

function trimOutput(output = '', maxLength = 4000) {
  if (output.length <= maxLength) return output.trim();
  return `${output.slice(0, maxLength)}\n...[truncated]`;
}

function splitCommand(command) {
  const tokens = [];
  let current = '';
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}
