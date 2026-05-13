import { createSession } from './session.js';
import { scanRepository } from './repo.js';
import { runAskMode, runCodeMode, runPlanMode, runReviewMode } from './modes.js';

const HELP = `Chimera MVP CLI

Usage:
  chimera <mode> [prompt]

Modes:
  ask <question>      Read-only repository Q&A with cited local evidence
  plan <goal>         Produce a repo-aware implementation plan without edits
  code <goal>         Generate a provider-backed patch proposal artifact
  review [target]     Review the current git diff or named target
  status              Show repository profile and active instruction files

Options:
  --json              Emit machine-readable JSON
  --help, -h          Show this help

Examples:
  chimera ask "what kind of project is this?"
  chimera plan "add a provider registry"
  chimera code "add a provider registry"
  chimera review
`;

export async function runCli(args, io) {
  const parsed = parseArgs(args);
  if (parsed.help || !parsed.mode) {
    io.stdout.write(HELP);
    return;
  }

  const repo = await scanRepository(io.cwd);
  const session = await createSession(io.cwd, {
    mode: parsed.mode,
    prompt: parsed.prompt,
    json: parsed.json,
  });

  let result;
  if (parsed.mode === 'ask') {
    result = await runAskMode({ repo, prompt: parsed.prompt, session });
  } else if (parsed.mode === 'plan') {
    result = await runPlanMode({ repo, prompt: parsed.prompt, session });
  } else if (parsed.mode === 'code') {
    result = await runCodeMode({ repo, prompt: parsed.prompt, session });
  } else if (parsed.mode === 'review') {
    result = await runReviewMode({ repo, prompt: parsed.prompt, session, cwd: io.cwd });
  } else if (parsed.mode === 'status') {
    result = {
      title: 'Repository status',
      summary: repo.summary,
      evidence: repo.evidence,
      nextSteps: ['Use `chimera plan <goal>` to generate a concrete implementation plan.'],
    };
  } else {
    throw new Error(`unknown mode '${parsed.mode}'. Run 'chimera --help'.`);
  }

  await session.record({ type: 'final_result', result });
  renderResult(result, { json: parsed.json, stdout: io.stdout });
}

function parseArgs(args) {
  const flags = new Set();
  const rest = [];
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') flags.add('help');
    else if (arg === '--json') flags.add('json');
    else rest.push(arg);
  }
  return {
    help: flags.has('help'),
    json: flags.has('json'),
    mode: rest[0],
    prompt: rest.slice(1).join(' ').trim(),
  };
}

function renderResult(result, { json, stdout }) {
  if (json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  stdout.write(`# ${result.title}\n\n`);
  if (result.summary) stdout.write(`${result.summary}\n\n`);
  writeList(stdout, 'Findings', result.findings);
  writeList(stdout, 'Plan', result.plan);
  writeList(stdout, 'Risks', result.risks);
  writeList(stdout, 'Checks', result.checks);
  writeList(stdout, 'Next steps', result.nextSteps);
  writeEvidence(stdout, result.evidence);
}

function writeList(stdout, title, items = []) {
  if (!items.length) return;
  stdout.write(`## ${title}\n`);
  for (const item of items) stdout.write(`- ${item}\n`);
  stdout.write('\n');
}

function writeEvidence(stdout, evidence = []) {
  if (!evidence.length) return;
  stdout.write('## Evidence\n');
  for (const item of evidence) stdout.write(`- ${item}\n`);
  stdout.write('\n');
}
