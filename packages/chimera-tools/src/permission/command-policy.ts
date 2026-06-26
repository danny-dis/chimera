import { z } from 'zod';

const CommandPolicyConfigSchema = z.object({
  allowlist: z.array(z.string()).optional(),
  blocklist: z.array(z.string()).optional(),
});

const DEFAULT_BLOCKLIST = [
  '^rm\\s+-rf\\s+/$',
  '^rm\\s+-rf\\s+~/.*',
  '^dd\\s+if=',
  '^mkfs',
  '^fdisk',
  'curl\\s+.*\\|\\s*sh',
  'wget\\s+.*\\|\\s*sh',
  '^chmod\\s+777',
  '^sudo(\\s|$)',
  '^su\\s',
  '^kill\\s+-9',
  ':\\(\\)\\{:\\|\\:&\\};:',
  '>\\s*/dev/sda',
  '^shutdown',
  '^reboot',
  '^init\\s+0',
  '^crontab\\s+-r',
  '^iptables\\s+-F',
];

export const DEFAULT_DANGEROUS_COMMANDS = DEFAULT_BLOCKLIST;

export class CommandPolicy {
  private allowlist: RegExp[] | null;
  private blocklist: RegExp[];

  constructor(config: { allowlist?: string[]; blocklist?: string[] } = {}) {
    CommandPolicyConfigSchema.parse(config);

    if (config.allowlist && config.allowlist.length > 0) {
      this.allowlist = config.allowlist.map((pattern) => new RegExp(pattern, 'i'));
    } else {
      this.allowlist = null;
    }

    const blockPatterns = config.blocklist && config.blocklist.length > 0
      ? config.blocklist
      : DEFAULT_BLOCKLIST;
    this.blocklist = blockPatterns.map((pattern) => new RegExp(pattern, 'i'));
  }

  isAllowed(command: string): boolean {
    return this.getReason(command).allowed;
  }

  getReason(command: string): { allowed: boolean; reason: string } {
    if (this.allowlist !== null) {
      for (const pattern of this.allowlist) {
        if (pattern.test(command)) {
          return { allowed: true, reason: `Command matches allowlist pattern: ${pattern.source}` };
        }
      }
      return { allowed: false, reason: 'Command not found in allowlist' };
    }

    for (const pattern of this.blocklist) {
      if (pattern.test(command)) {
        return { allowed: false, reason: `Command matches blocklist pattern: ${pattern.source}` };
      }
    }

    return { allowed: true, reason: 'Command not blocked' };
  }
}
