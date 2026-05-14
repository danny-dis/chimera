import { createSession } from './session.js';
import { scanRepository } from './repo.js';
import { selectAgentMode } from './orchestrator.js';
import { runAskMode, runCheckMode, runCodeMode, runPlanMode, runReviewMode } from './modes.js';

const HELP = `Chimera MVP CLI

Usage:
  chimera <mode> [prompt]

Modes:
  ask <question>      Read-only repository Q&A with cited local evidence
  plan <goal>         Produce a repo-aware implementation plan without edits
  code <goal>         Generate a provider-backed patch proposal artifact
  review [target]     Review the current git diff or named target
  check [commands]    Discover and run safe project checks
  status              Show repository profile and active instruction files

Options:
  --agents <mode>     solo, duo, trio, or auto (default: auto)
  --permission <mode> read-only, ask-before-write, workspace-write, trusted-project, or danger-full-access
  --json              Emit machine-readable JSON
  --help, -h          Show this help

Examples:
  chimera ask "what kind of project is this?"
  chimera plan "add a provider registry"
  chimera code --agents duo "add a provider registry"
  chimera plan --agents trio "redesign auth rollback"
  chimera check
  chimera review
`;

export async function runCli(args, io) {
  const parsed = parseArgs(args);
  if (parsed.help || !parsed.mode) {
    io.stdout.write(HELP);
    return;
  }

  const repo = await scanRepository(io.cwd);
  const selection = selectAgentMode({ requested: parsed.agents, taskMode: parsed.mode, prompt: parsed.prompt, repo });
  const session = await createSession(io.cwd, {
    mode: parsed.mode,
    prompt: parsed.prompt,
    json: parsed.json,
    agents: selection.mode,
    permissionProfile: parsed.permission,
  });
  await session.record({ type: 'agent_mode_selected', selection });

  let result;
  if (parsed.mode === 'ask') {
    result = await runAskMode({ repo, prompt: parsed.prompt, session, selection });
  } else if (parsed.mode === 'plan') {
    result = await runPlanMode({ repo, prompt: parsed.prompt, session, selection });
  } else if (parsed.mode === 'code') {
    result = await runCodeMode({ repo, prompt: parsed.prompt, session, selection });
  } else if (parsed.mode === 'review') {
    result = await runReviewMode({ repo, prompt: parsed.prompt, session, selection, cwd: io.cwd });
  } else if (parsed.mode === 'check') {
    result = await runCheckMode({ repo, prompt: parsed.prompt, session, selection, cwd: io.cwd, permissionProfile: parsed.permission });
  } else if (parsed.mode === 'status') {
    result = {
      title: 'Repository status',
      summary: repo.summary,
      agentPanel: { mode: selection.mode, reasons: selection.reasons, results: [], quorum: null },
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
  const options = { agents: 'auto', permission: 'read-only' };
  const rest = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') flags.add('help');
    else if (arg === '--json') flags.add('json');
    else if (arg === '--agents') {
      options.agents = args[index + 1];
      index += 1;
    } else if (arg.startsWith('--agents=')) {
      options.agents = arg.slice('--agents='.length);
    } else if (arg === '--permission') {
      options.permission = args[index + 1];
      index += 1;
    } else if (arg.startsWith('--permission=')) {
      options.permission = arg.slice('--permission='.length);
    } else rest.push(arg);
  }
  return {
    help: flags.has('help'),
    json: flags.has('json'),
    agents: options.agents,
    permission: options.permission,
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
  writeAgentPanel(stdout, result.agentPanel);
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

function writeAgentPanel(stdout, panel) {
  if (!panel) return;
  stdout.write('## Agent panel\n');
  stdout.write(`- Mode: ${panel.mode}\n`);
  for (const reason of panel.reasons || []) stdout.write(`- Selection reason: ${reason}\n`);
  if (panel.quorum) stdout.write(`- Quorum: ${panel.quorum.summary}\n`);
  for (const result of panel.results || []) {
    stdout.write(`- ${result.role}: ${result.vote}${result.available ? '' : ' (skipped)'}\n`);
  }
  stdout.write('\n');
}
