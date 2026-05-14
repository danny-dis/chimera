import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { runAgentPanel } from './agents.js';
import { discoverCheckCommands, runCheckCommands, summarizeCheckResults } from './checks.js';
import { applyPatch, checkPatch, loadPatch, validatePatchPaths } from './patch.js';
import { completeWithProvider } from './provider.js';

const execFileAsync = promisify(execFile);

export async function runAskMode({ repo, prompt, session, selection }) {
  await session.record({ type: 'mode_started', mode: 'ask', prompt });
  const agentPanel = await runAgentPanel({ taskMode: 'ask', prompt, repo, selection });
  const providerAnswer = firstAvailable(agentPanel) || await askProvider({ repo, prompt, mode: 'ask' });
  return {
    title: 'Ask mode',
    summary: prompt ? `Read-only answer for: "${prompt}"` : 'Read-only repository summary.',
    findings: [
      providerAnswer || repo.summary,
      providerAnswer ? 'Provider-backed response generated from the local evidence pack.' : 'No provider was configured; showing deterministic local evidence only. Set CHIMERA_API_KEY and CHIMERA_MODEL to enable provider-backed answers.',
    ],
    nextSteps: [
      'Wire exact line-range file reads into the evidence pack.',
      'Use --agents duo or --agents trio for cross-model validation when providers are configured.',
    ],
    agentPanel,
    evidence: repo.evidence,
  };
}

export async function runPlanMode({ repo, prompt, session, selection }) {
  await session.record({ type: 'mode_started', mode: 'plan', prompt });
  const goal = prompt || 'unspecified implementation goal';
  const agentPanel = await runAgentPanel({ taskMode: 'plan', prompt: goal, repo, selection });
  const providerPlan = firstAvailable(agentPanel) || await askProvider({ repo, prompt: goal, mode: 'plan' });
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
    checks: (await discoverCheckCommands(repo.root, repo)).map((check) => check.command),
    nextSteps: ['Implement patch application, shell policy, and test command discovery.'],
    agentPanel,
    evidence: repo.evidence,
  };
}

export async function runCodeMode({ repo, prompt, session, selection }) {
  await session.record({ type: 'mode_started', mode: 'code', prompt });
  const goal = prompt || 'unspecified coding goal';
  const agentPanel = await runAgentPanel({ taskMode: 'code', prompt: goal, repo, selection, artifactKind: 'patch proposal and review vote' });
  const patch = firstAvailable(agentPanel, 'writer') || await completeWithProvider({
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
      checks: (await discoverCheckCommands(repo.root, repo)).map((check) => check.command),
      nextSteps: ['Implement patch validation and explicit user approval before applying provider-generated diffs.'],
      agentPanel,
      evidence: repo.evidence,
    };
  }

  const artifactPath = path.join(session.dir, 'proposal.diff');
  await fs.writeFile(artifactPath, `${patch}\n`, 'utf8');
  await session.record({ type: 'patch_proposal_saved', artifactPath, quorum: agentPanel.quorum });

  return {
    title: 'Code mode',
    summary: `Saved provider-generated patch proposal for: ${goal}`,
    findings: [`Patch proposal artifact: ${artifactPath}`],
    risks: ['Patch was not applied automatically. Review it before applying.'],
    checks: ['git apply --check <proposal.diff>', ...(await discoverCheckCommands(repo.root, repo)).map((check) => check.command)],
    nextSteps: ['Review the proposal artifact, then apply it through the upcoming patch engine.'],
    agentPanel,
    evidence: repo.evidence,
  };
}

export async function runReviewMode({ repo, prompt, session, selection, cwd }) {
  await session.record({ type: 'mode_started', mode: 'review', prompt });
  const git = await safeGitDiff(cwd);
  const agentPanel = await runAgentPanel({ taskMode: 'review', prompt: prompt || 'current working tree diff', repo, selection, artifactKind: 'code review' });
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
    checks: (await discoverCheckCommands(cwd, repo)).map((check) => check.command),
    nextSteps: ['Add semantic reviewer prompts and blocker/warning/note schemas.'],
    agentPanel,
    evidence: repo.evidence,
  };
}

export async function runCheckMode({ repo, prompt, session, selection, cwd, permissionProfile }) {
  await session.record({ type: 'mode_started', mode: 'check', prompt, permissionProfile });
  const discovered = await discoverCheckCommands(cwd, repo);
  const requested = parseRequestedChecks(prompt, discovered);
  const results = await runCheckCommands({ root: cwd, commands: requested, permissionProfile, session });
  return {
    title: 'Check mode',
    summary: `Ran ${results.filter((result) => !result.skipped).length}/${requested.length} discovered checks with ${permissionProfile} permissions.`,
    findings: summarizeCheckResults(results),
    risks: results.some((result) => result.exitCode && result.exitCode !== 0)
      ? ['One or more checks failed; inspect the session log for command output excerpts.']
      : [],
    checks: requested.map((check) => check.command),
    nextSteps: ['Use `chimera review` to inspect the diff after checks complete.'],
    agentPanel: { mode: selection.mode, reasons: selection.reasons, results: [], quorum: null },
    evidence: repo.evidence,
  };
}

function parseRequestedChecks(prompt, discovered) {
  if (!prompt) return discovered;
  const requested = prompt.split(',').map((item) => item.trim()).filter(Boolean);
  if (!requested.length) return discovered;
  return requested.map((command) => ({ command, source: 'user prompt' }));
}

export async function runPatchMode({ repo, prompt, session, selection, cwd, permissionProfile, apply }) {
  await session.record({ type: 'mode_started', mode: 'patch', prompt, permissionProfile, apply });
  const loaded = await loadPatch(cwd, prompt);
  const pathValidation = validatePatchPaths(loaded.files);
  const check = pathValidation.valid
    ? await checkPatch(cwd, loaded.text)
    : { ok: false, exitCode: null, stdout: '', stderr: pathValidation.reason };
  const applyResult = apply && check.ok
    ? await applyPatch(cwd, loaded.text, permissionProfile)
    : null;

  await session.record({
    type: 'patch_evaluated',
    patchPath: loaded.path,
    files: loaded.files,
    pathValidation,
    check: { ok: check.ok, exitCode: check.exitCode, stderr: check.stderr },
    applyResult: applyResult ? { applied: applyResult.applied, skipped: applyResult.skipped, exitCode: applyResult.exitCode, stderr: applyResult.stderr, decision: applyResult.decision } : null,
  });

  const findings = [
    `Patch file: ${loaded.path}`,
    `Touched files: ${loaded.files.length ? loaded.files.join(', ') : 'none detected'}`,
    `Path validation: ${pathValidation.reason}`,
    `git apply --check: ${check.ok ? 'passed' : `failed${check.stderr ? ` (${check.stderr})` : ''}`}`,
  ];
  if (applyResult) {
    findings.push(applyResult.applied
      ? 'Patch applied successfully.'
      : `Patch not applied: ${applyResult.stderr || applyResult.decision.reason}`);
  } else if (apply) {
    findings.push('Patch was not applied because validation failed.');
  } else {
    findings.push('Patch was validated only. Re-run with `--apply --permission workspace-write` to apply it.');
  }

  return {
    title: 'Patch mode',
    summary: apply ? 'Validated and attempted to apply a unified diff.' : 'Validated a unified diff without applying it.',
    findings,
    risks: applyResult?.applied ? ['Review the resulting git diff before committing.'] : [],
    checks: (await discoverCheckCommands(repo.root, repo)).map((candidate) => candidate.command),
    nextSteps: applyResult?.applied
      ? ['Run `chimera check` and `chimera review` before committing.']
      : ['Inspect the patch validation result and apply only after review.'],
    agentPanel: { mode: selection.mode, reasons: selection.reasons, results: [], quorum: null },
    evidence: repo.evidence,
  };
}

function firstAvailable(agentPanel, role) {
  const result = agentPanel.results.find((item) => item.available && (!role || item.role === role));
  return result?.summary || null;
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

function indent(text) {
  return text.split('\n').map((line) => `  ${line}`).join('\n');
}
