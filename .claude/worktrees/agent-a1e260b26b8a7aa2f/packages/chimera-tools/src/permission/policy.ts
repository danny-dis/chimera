import { z } from 'zod';

const PermissionDecisionSchema = z.enum(['allow', 'deny', 'ask']);
const PermissionModeSchema = z.enum(['readOnly', 'editFiles', 'fullAccess', 'custom']);

const PermissionConditionSchema = z.object({
  type: z.enum(['path', 'command', 'env']),
  match: z.string(),
  action: z.enum(['allow', 'deny']),
});

const PermissionRuleSchema = z.object({
  toolPattern: z.string(),
  decision: PermissionDecisionSchema,
  conditions: z.array(PermissionConditionSchema).optional(),
});

const PermissionProfileSchema = z.object({
  name: z.string(),
  mode: PermissionModeSchema,
  rules: z.array(PermissionRuleSchema),
  commandAllowlist: z.array(z.string()).optional(),
  commandBlocklist: z.array(z.string()).optional(),
  pathRestrictions: z.array(z.string()).optional(),
});

export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;
export type PermissionMode = z.infer<typeof PermissionModeSchema>;
export type PermissionRule = z.infer<typeof PermissionRuleSchema>;
export type PermissionCondition = z.infer<typeof PermissionConditionSchema>;
export type PermissionProfile = z.infer<typeof PermissionProfileSchema>;

export const readOnlyProfile: PermissionProfile = {
  name: 'readOnly',
  mode: 'readOnly',
  rules: [
    { toolPattern: 'read_file', decision: 'allow' },
    { toolPattern: 'search_files', decision: 'allow' },
    { toolPattern: 'glob_files', decision: 'allow' },
    { toolPattern: 'git_status', decision: 'allow' },
    { toolPattern: 'git_diff', decision: 'allow' },
    { toolPattern: 'git_log', decision: 'allow' },
    { toolPattern: '*', decision: 'deny' },
  ],
};

export const editFilesProfile: PermissionProfile = {
  name: 'editFiles',
  mode: 'editFiles',
  rules: [
    { toolPattern: 'read_file', decision: 'allow' },
    { toolPattern: 'search_files', decision: 'allow' },
    { toolPattern: 'glob_files', decision: 'allow' },
    { toolPattern: 'write_file', decision: 'allow' },
    { toolPattern: 'edit_file', decision: 'allow' },
    { toolPattern: 'git_*', decision: 'allow' },
    { toolPattern: 'shell_*', decision: 'deny' },
    { toolPattern: '*', decision: 'deny' },
  ],
};

export const fullAccessProfile: PermissionProfile = {
  name: 'fullAccess',
  mode: 'fullAccess',
  rules: [
    { toolPattern: '*', decision: 'allow' },
  ],
};

export const customProfile: PermissionProfile = {
  name: 'custom',
  mode: 'custom',
  rules: [],
};

function validateProfile(profile: PermissionProfile): void {
  PermissionProfileSchema.parse(profile);
}

export class PermissionEngine {
  private mode: PermissionMode = 'custom';
  private rules: PermissionRule[] = [];

  constructor(initialProfile?: PermissionProfile) {
    if (initialProfile) {
      this.loadProfile(initialProfile);
    }
  }

  loadProfile(profile: PermissionProfile): void {
    validateProfile(profile);
    this.mode = profile.mode;
    this.rules = [...profile.rules];
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
    switch (mode) {
      case 'readOnly':
        this.rules = [...readOnlyProfile.rules];
        break;
      case 'editFiles':
        this.rules = [...editFilesProfile.rules];
        break;
      case 'fullAccess':
        this.rules = [...fullAccessProfile.rules];
        break;
      case 'custom':
        this.rules = [...customProfile.rules];
        break;
    }
  }

  getMode(): PermissionMode {
    return this.mode;
  }

  addRule(rule: PermissionRule): void {
    PermissionRuleSchema.parse(rule);
    const index = this.rules.findIndex((r) => r.toolPattern === rule.toolPattern);
    if (index >= 0) {
      this.rules[index] = rule;
    } else {
      this.rules.push(rule);
    }
  }

  removeRule(toolPattern: string): void {
    this.rules = this.rules.filter((r) => r.toolPattern !== toolPattern);
  }

  check(toolName: string, params: Record<string, unknown> = {}): PermissionDecision {
    if (this.mode === 'fullAccess') {
      return 'allow';
    }

    for (const rule of this.rules) {
      if (this.matchesPattern(toolName, rule.toolPattern)) {
        if (rule.conditions && rule.conditions.length > 0) {
          const conditionResult = this.evaluateConditions(rule.conditions, params);
          if (conditionResult !== null) {
            return conditionResult;
          }
        }
        return rule.decision;
      }
    }

    return this.mode === 'custom' ? 'ask' : 'deny';
  }

  private matchesPattern(toolName: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern === toolName) return true;

    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\x00')
      .replace(/\*/g, '[^]*')
      .replace(/\x00/g, '.*');

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(toolName);
  }

  private evaluateConditions(
    conditions: PermissionCondition[],
    params: Record<string, unknown>,
  ): PermissionDecision | null {
    for (const condition of conditions) {
      const regex = new RegExp(condition.match);

      switch (condition.type) {
        case 'path': {
          const pathValue = params.path ?? params.filePath ?? params.targetPath;
          if (typeof pathValue === 'string' && regex.test(pathValue)) {
            return condition.action === 'allow' ? 'allow' : 'deny';
          }
          break;
        }
        case 'command': {
          const cmdValue = params.command ?? params.cmd;
          if (typeof cmdValue === 'string' && regex.test(cmdValue)) {
            return condition.action === 'allow' ? 'allow' : 'deny';
          }
          break;
        }
        case 'env': {
          const envValue = params.env;
          if (typeof envValue === 'object' && envValue !== null) {
            for (const [key, value] of Object.entries(envValue as Record<string, unknown>)) {
              if (regex.test(key) && typeof value === 'string' && regex.test(value)) {
                return condition.action === 'allow' ? 'allow' : 'deny';
              }
            }
          }
          break;
        }
      }
    }
    return null;
  }
}
