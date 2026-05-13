import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { completeWithProvider } from './provider.js';

const execFileAsync = promisify(execFile);

export async function runAskMode({ repo, prompt, session }) {
  await session.record({ type: 'mode_started', mode: 'ask', prompt });
  const providerAnswer = await askProvider({ repo, prompt, mode: 'ask' });
  return {
    title: 'Ask mode',
    summary: prompt ? `Read-only answer for: "${prompt}"` : 'Read-only repository summary.',
    findings: [
      providerAnswer || repo.summary,
      providerAnswer ? 'Provider-backed response generated from the local evidence pack.' : 'No provider was configured; showing deterministic local evidence only. Set CHIMERA_API_KEY and CHIMERA_MODEL to enable provider-backed answers.',
    ],
    nextSteps: [
      'Wire the provider registry to turn this evidence pack into natural-language Q&A.',
      'Add citations to exact line ranges when file-reading tools are introduced.',
    ],
    evidence: repo.evidence,
  };
}

export async function runPlanMode({ repo, prompt, session }) {
  await session.record({ type: 'mode_started', mode: 'plan', prompt });
  const goal = prompt || 'unspecified implementation goal';
  const providerPlan = await askProvider({ repo, prompt: goal, mode: 'plan' });
  return {
    title: 'Plan mode',
    summary: providerPlan || `Implementation plan for: ${goal}`,
    plan: [
      'Confirm the task contract, success criteria, and permission profile before editing.',
      'Refresh repository context using instruction files, manifests, source files, tests, and recent git state.',
      'Identify the smallest vertical slice that can be implemented and verified end-to-end.',
      'Apply changes through the patch engine rather than unconstrained file writes.',
      'Run the narrowest meaningful checks, then expand to broader tests if the narrow checks pass.',
      'Record session events, tool outputs, diffs, and final findings for replay and evaluation.',
    ],
    risks: [
      'The current MVP has deterministic planning only; model-backed planning is still a roadmap item.',
      repo.tests.length ? 'Detected test-like files, but test command discovery still needs implementation.' : 'No test-like files were detected; verification may initially rely on syntax and smoke checks.',
    ],
    checks: ['npm test', 'npm run lint', 'git diff --check'],
    nextSteps: ['Implement provider adapters, patch application, shell policy, and test command discovery.'],
    evidence: repo.evidence,
  };
}

export async function runCodeMode({ repo, prompt, session }) {
  await session.record({ type: 'mode_started', mode: 'code', prompt });
  const goal = prompt || 'unspecified coding goal';
  const patch = await completeWithProvider({
    system: 'You are Chimera in CODE mode. Produce a minimal unified diff only when confident. Do not invent files without evidence. If evidence is insufficient, explain what to inspect next instead of producing a patch.',
    user: `Goal: ${goal}\nRepository summary: ${repo.summary}\nEvidence:\n${repo.evidence.join('\n')}`,
    schemaHint: 'Return either a unified diff or a concise BLOCKED explanation with required next inspections.',
  });

  if (!patch) {
    return {
      title: 'Code mode',
      summary: `Code mode is ready for provider-backed patch proposals for: ${goal}`,
      findings: [
        'No provider was configured, so Chimera did not attempt to generate or apply code.',
        'Set CHIMERA_API_KEY and CHIMERA_MODEL to generate a patch proposal artifact in the session directory.',
      ],
      risks: ['Automatic patch application remains intentionally disabled until the patch engine and permission prompts land.'],
      checks: ['npm test', 'npm run lint', 'git diff --check'],
      nextSteps: ['Implement patch validation and explicit user approval before applying provider-generated diffs.'],
      evidence: repo.evidence,
    };
  }

  const artifactPath = path.join(session.dir, 'proposal.diff');
  await fs.writeFile(artifactPath, `${patch}\n`, 'utf8');
  await session.record({ type: 'patch_proposal_saved', artifactPath });

  return {
    title: 'Code mode',
    summary: `Saved provider-generated patch proposal for: ${goal}`,
    findings: [`Patch proposal artifact: ${artifactPath}`],
    risks: ['Patch was not applied automatically. Review it before applying.'],
    checks: ['git apply --check <proposal.diff>', 'npm test', 'npm run lint'],
    nextSteps: ['Review the proposal artifact, then apply it through the upcoming patch engine.'],
    evidence: repo.evidence,
  };
}

export async function runReviewMode({ repo, prompt, session, cwd }) {
  await session.record({ type: 'mode_started', mode: 'review', prompt });
  const git = await safeGitDiff(cwd);
  const findings = [];
  if (git.status) findings.push(git.status);
  if (git.diffStat) findings.push(git.diffStat);
  if (!git.status && !git.diffStat) findings.push('No git diff information was available or the repository has no changes to review.');

  return {
    title: 'Review mode',
    summary: prompt ? `Review target: ${prompt}` : 'Reviewing current working tree changes.',
    findings,
    risks: [
      'This MVP review checks repository and git evidence only; semantic code review requires provider-backed reviewer mode.',
    ],
    checks: ['git diff --check', ...detectLikelyChecks(repo)],
    nextSteps: ['Add semantic reviewer prompts and blocker/warning/note schemas.'],
    evidence: repo.evidence,
  };
}

async function askProvider({ repo, prompt, mode }) {
  const evidence = repo.evidence.join('\n');
  const system = 'You are Chimera, a terminal-native coding agent. Use only the supplied repository evidence. Be concise, practical, and explicit about uncertainty.';
  const user = `Mode: ${mode}\nPrompt: ${prompt || '(none)'}\nRepository summary: ${repo.summary}\nEvidence:\n${evidence}`;
  return completeWithProvider({
    system,
    user,
    schemaHint: 'Return Markdown. Include practical next steps and do not claim files or tests you did not observe.',
  });
}

async function safeGitDiff(cwd) {
  try {
    const [{ stdout: status }, { stdout: diffStat }] = await Promise.all([
      execFileAsync('git', ['status', '--short'], { cwd, timeout: 5_000, maxBuffer: 200_000 }),
      execFileAsync('git', ['diff', '--stat'], { cwd, timeout: 5_000, maxBuffer: 200_000 }),
    ]);
    return {
      status: status.trim() ? `Git status:\n${indent(status.trim())}` : 'Git status: clean working tree.',
      diffStat: diffStat.trim() ? `Git diff stat:\n${indent(diffStat.trim())}` : '',
    };
  } catch (error) {
    return { status: `Unable to read git diff: ${error.message}`, diffStat: '' };
  }
}

function detectLikelyChecks(repo) {
  const checks = [];
  if (repo.packageFiles.includes('package.json')) checks.push('npm test');
  if (repo.packageFiles.includes('Cargo.toml')) checks.push('cargo test');
  if (repo.packageFiles.includes('go.mod')) checks.push('go test ./...');
  if (repo.packageFiles.includes('pyproject.toml') || repo.packageFiles.includes('requirements.txt')) checks.push('pytest');
  return checks;
}

function indent(text) {
  return text.split('\n').map((line) => `  ${line}`).join('\n');
}
