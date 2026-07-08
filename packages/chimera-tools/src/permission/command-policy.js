"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandPolicy = exports.DEFAULT_DANGEROUS_COMMANDS = void 0;
const zod_1 = require("zod");
const CommandPolicyConfigSchema = zod_1.z.object({
    allowlist: zod_1.z.array(zod_1.z.string()).optional(),
    blocklist: zod_1.z.array(zod_1.z.string()).optional(),
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
exports.DEFAULT_DANGEROUS_COMMANDS = DEFAULT_BLOCKLIST;
class CommandPolicy {
    allowlist;
    blocklist;
    constructor(config = {}) {
        CommandPolicyConfigSchema.parse(config);
        if (config.allowlist && config.allowlist.length > 0) {
            this.allowlist = config.allowlist.map((pattern) => new RegExp(pattern, 'i'));
        }
        else {
            this.allowlist = null;
        }
        const blockPatterns = config.blocklist && config.blocklist.length > 0
            ? config.blocklist
            : DEFAULT_BLOCKLIST;
        this.blocklist = blockPatterns.map((pattern) => new RegExp(pattern, 'i'));
    }
    isAllowed(command) {
        return this.getReason(command).allowed;
    }
    getReason(command) {
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
exports.CommandPolicy = CommandPolicy;
//# sourceMappingURL=command-policy.js.map