const PROFILES = new Set(['read-only', 'ask-before-write', 'workspace-write', 'trusted-project', 'danger-full-access']);

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-[^\s]*r[^\s]*f|-rf|-fr)\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-[^\s]*f/,
  /\bgit\s+push\b.*\s--force(?:\s|$)/,
  /\b(drop|truncate)\s+(database|table)\b/i,
  /\bchmod\s+-R\b/,
  /\bchown\s+-R\b/,
  /\b(publish|deploy)\b/,
];

const WRITE_PATTERNS = [
  />\s*[^\s]/,
  /\b(npm|pnpm|yarn|bun)\s+(install|add|remove|update)\b/,
  /\b(pip|uv)\s+install\b/,
  /\bcargo\s+(add|update|install)\b/,
  /\bgo\s+get\b/,
  /\bgit\s+apply\b/,
  /\btouch\b|\bmkdir\b|\bmv\b|\bcp\b|\bsed\s+-i\b/,
];

export function normalizePermissionProfile(profile = 'read-only') {
  if (!PROFILES.has(profile)) {
    throw new Error(`invalid permission profile '${profile}'. Use ${[...PROFILES].join(', ')}.`);
  }
  return profile;
}

export function classifyCommand(command) {
  const normalized = command.trim();
  if (!normalized) return { risk: 'empty', destructive: false, writes: false };
  const destructive = DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(normalized));
  const writes = destructive || WRITE_PATTERNS.some((pattern) => pattern.test(normalized));
  if (destructive) return { risk: 'destructive', destructive, writes };
  if (writes) return { risk: 'writes', destructive, writes };
  return { risk: 'read-only', destructive, writes };
}

export function evaluateCommandPermission(command, profile = 'read-only') {
  const normalizedProfile = normalizePermissionProfile(profile);
  const classification = classifyCommand(command);

  if (normalizedProfile === 'danger-full-access') {
    return { allowed: true, requiresApproval: false, profile: normalizedProfile, classification, reason: 'danger-full-access allows all commands.' };
  }
  if (classification.destructive) {
    return { allowed: false, requiresApproval: true, profile: normalizedProfile, classification, reason: 'Destructive commands are blocked in this MVP.' };
  }
  if (normalizedProfile === 'read-only' && classification.writes) {
    return { allowed: false, requiresApproval: true, profile: normalizedProfile, classification, reason: 'Read-only profile blocks write-like commands.' };
  }
  if (normalizedProfile === 'ask-before-write' && classification.writes) {
    return { allowed: false, requiresApproval: true, profile: normalizedProfile, classification, reason: 'This non-interactive MVP cannot ask before write-like commands.' };
  }

  return { allowed: true, requiresApproval: false, profile: normalizedProfile, classification, reason: 'Command allowed by profile.' };
}
