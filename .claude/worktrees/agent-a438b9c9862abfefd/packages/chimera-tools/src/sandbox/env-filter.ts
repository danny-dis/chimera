import { z } from 'zod';

const EnvironmentFilterConfigSchema = z.object({
  allowedVars: z.array(z.string()).optional(),
  blockedVars: z.array(z.string()).optional(),
  blockedPatterns: z.array(z.instanceof(RegExp)).optional(),
});

const DEFAULT_BLOCKED_VARS = [
  'PASSWORD', 'PASSWD', 'PWD', 'SECRET', 'TOKEN', 'KEY',
  'CREDENTIAL', 'AUTH', 'API_KEY', 'PRIVATE_KEY', 'ACCESS_KEY',
  'SECRET_KEY', 'DATABASE_URL', 'CONNECTION_STRING',
];

export class EnvironmentFilter {
  private blockedVars: Set<string>;
  private blockedPatterns: RegExp[];

  constructor(config: {
    allowedVars?: string[];
    blockedVars?: string[];
    blockedPatterns?: RegExp[];
  } = {}) {
    EnvironmentFilterConfigSchema.parse(config);

    this.blockedVars = new Set(config.blockedVars ?? DEFAULT_BLOCKED_VARS);
    this.blockedPatterns = config.blockedPatterns ?? [
      /PASSWORD/i,
      /SECRET/i,
      /TOKEN/i,
      /KEY$/i,
      /CREDENTIAL/i,
      /AUTH/i,
    ];
  }

  filter(env: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};

    for (const [name, value] of Object.entries(env)) {
      if (this.isBlocked(name)) {
        continue;
      }
      filtered[name] = value;
    }

    return filtered;
  }

  isSecretVar(name: string): boolean {
    return this.isBlocked(name);
  }

  private isBlocked(name: string): boolean {
    if (this.blockedVars.has(name)) {
      return true;
    }

    for (const pattern of this.blockedPatterns) {
      if (pattern.test(name)) {
        return true;
      }
    }

    const upperName = name.toUpperCase();
    for (const blocked of this.blockedVars) {
      if (upperName.includes(blocked.toUpperCase())) {
        return true;
      }
    }

    return false;
  }
}
