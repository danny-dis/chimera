import { completeWithProvider } from './provider.js';
import { runExternalAgent } from './external-agent.js';
import { buildAgentContext, buildQuorum, getAgentRoles } from './orchestrator.js';

const ROLE_PROMPTS = {
  writer: 'You are the Writer agent. Produce the most direct safe implementation or plan. Be concrete and cite supplied evidence only.',
  reviewer: 'You are the Reviewer agent. Check the writer direction for correctness, missing tests, regressions, and maintainability. Prefer blockers over vague advice.',
  challenger: 'You are the Challenger agent. Adversarially pressure-test assumptions, alternatives, risk, security, rollback, and whether the task should be narrowed.',
};

export async function runAgentPanel({ taskMode, prompt, repo, selection, artifactKind = 'response' }) {
  const roles = getAgentRoles(selection.mode);
  const context = buildAgentContext({ taskMode, prompt, repo, selection });
  const results = await Promise.all(roles.map((role) => runRole({ role, taskMode, prompt, context, artifactKind })));
  return {
    mode: selection.mode,
    reasons: selection.reasons,
    roles,
    results,
    quorum: buildQuorum(results),
  };
}

function configForRole(role, env = process.env) {
  const prefix = `CHIMERA_${role.toUpperCase()}`;
  return {
    model: env[`${prefix}_MODEL`] || env.CHIMERA_MODEL,
    apiKey: env[`${prefix}_API_KEY`] || env.CHIMERA_API_KEY || env.OPENAI_API_KEY,
    baseUrl: env[`${prefix}_BASE_URL`] || env.CHIMERA_BASE_URL,
    command: env[`${prefix}_COMMAND`],
  };
}

async function runRole({ role, taskMode, prompt, context, artifactKind }) {
  const config = configForRole(role);
  const roleInput = `${ROLE_PROMPTS[role]}\n\n${context}\n\nReturn your ${artifactKind} for ${taskMode} mode. End with a line exactly like Vote: approve, Vote: revise, or Vote: block. Do not claim unobserved files, tests, or commands.`;
  const response = await runExternalAgent(config.command, roleInput) || await completeWithProvider({
    ...config,
    system: ROLE_PROMPTS[role],
    user: `${context}\n\nReturn your ${artifactKind} for ${taskMode} mode. End with a line exactly like Vote: approve, Vote: revise, or Vote: block.`,
    schemaHint: 'Use concise Markdown. Do not claim unobserved files, tests, or commands.',
  });

  if (!response) {
    return {
      role,
      model: config.model || null,
      command: config.command || null,
      available: false,
      vote: 'abstain',
      summary: `No provider/model configured for ${role}; skipped provider-backed ${role} pass.`,
    };
  }

  return {
    role,
    model: config.model || null,
    command: config.command || null,
    available: true,
    vote: extractVote(response),
    summary: response,
  };
}

function extractVote(text) {
  const match = /vote:\s*(approve|revise|block)/i.exec(text);
  if (!match) return 'revise';
  return match[1].toLowerCase();
}
