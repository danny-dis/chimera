const RISK_KEYWORDS = [
  'auth', 'authentication', 'authorization', 'payment', 'billing', 'security', 'secret', 'token',
  'migration', 'database', 'schema', 'concurrency', 'race', 'rollback', 'production', 'deploy',
  'refactor', 'architecture', 'multi-file', 'breaking', 'delete', 'destructive', 'permission',
];

const MODE_ALIASES = new Map([
  ['1', 'solo'], ['one', 'solo'], ['solo', 'solo'],
  ['2', 'duo'], ['two', 'duo'], ['duo', 'duo'],
  ['3', 'trio'], ['three', 'trio'], ['triple', 'trio'], ['trio', 'trio'],
  ['auto', 'auto'],
]);

export function normalizeAgentMode(value = 'auto') {
  const normalized = MODE_ALIASES.get(String(value || 'auto').toLowerCase());
  if (!normalized) throw new Error(`invalid --agents value '${value}'. Use solo, duo, trio, or auto.`);
  return normalized;
}

export function selectAgentMode({ requested = 'auto', taskMode, prompt = '', repo }) {
  const normalized = normalizeAgentMode(requested);
  if (normalized !== 'auto') return buildSelection(normalized, ['User explicitly selected this agent mode.']);

  const reasons = [];
  const text = `${taskMode} ${prompt}`.toLowerCase();
  const riskHits = RISK_KEYWORDS.filter((keyword) => text.includes(keyword));
  const repoSignals = [];
  if ((repo?.sourceFiles?.length ?? 0) > 25) repoSignals.push('larger codebase');
  if ((repo?.tests?.length ?? 0) === 0 && ['code', 'debug'].includes(taskMode)) repoSignals.push('no detected tests');
  if (['code', 'debug', 'review'].includes(taskMode)) repoSignals.push(`${taskMode} mode`);

  if (riskHits.length >= 2 || text.includes('ultraplan')) {
    reasons.push(`High-risk task keywords: ${riskHits.join(', ') || 'ultraplan'}.`);
    return buildSelection('trio', reasons);
  }
  if (riskHits.length === 1 || repoSignals.length >= 2) {
    reasons.push(...riskHits.map((hit) => `Risk keyword detected: ${hit}.`));
    reasons.push(...repoSignals.map((signal) => `Repository/task signal: ${signal}.`));
    return buildSelection('duo', reasons);
  }
  if (['ask', 'status', 'check'].includes(taskMode)) {
    reasons.push(`${taskMode} mode is read-only and low risk.`);
    return buildSelection('solo', reasons);
  }

  reasons.push('Defaulting to duo for implementation-oriented work.');
  return buildSelection('duo', reasons);
}

export function getAgentRoles(agentMode) {
  if (agentMode === 'solo') return ['writer'];
  if (agentMode === 'duo') return ['writer', 'reviewer'];
  return ['writer', 'reviewer', 'challenger'];
}

export function buildQuorum(agentResults) {
  const available = agentResults.filter((result) => result.available);
  const total = agentResults.length;
  if (!available.length) {
    return {
      status: 'not_run',
      summary: 'No provider-backed agent responses were available; Chimera used deterministic local scaffolding only.',
      approvalsRequired: total === 3 ? 2 : total,
      approvals: 0,
    };
  }

  const approvals = available.filter((result) => result.vote === 'approve').length;
  const approvalsRequired = total === 3 ? 2 : total;
  const status = approvals >= approvalsRequired ? 'approved' : 'needs_review';
  return {
    status,
    summary: status === 'approved'
      ? `${approvals}/${total} agents approved; quorum reached.`
      : `${approvals}/${total} agents approved; user review required before trusting the result.`,
    approvalsRequired,
    approvals,
  };
}

export function buildAgentContext({ taskMode, prompt, repo, selection }) {
  return [
    `Task mode: ${taskMode}`,
    `Prompt: ${prompt || '(none)'}`,
    `Selected agent mode: ${selection.mode}`,
    `Selection reasons: ${selection.reasons.join(' ')}`,
    `Repository summary: ${repo.summary}`,
    'Evidence:',
    ...repo.evidence.map((item) => `- ${item}`),
  ].join('\n');
}

function buildSelection(mode, reasons) {
  return { mode, reasons: reasons.length ? reasons : ['No explicit selection reason recorded.'] };
}
