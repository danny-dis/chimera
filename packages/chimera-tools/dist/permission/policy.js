"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionEngine = exports.customProfile = exports.fullAccessProfile = exports.editFilesProfile = exports.readOnlyProfile = void 0;
const zod_1 = require("zod");
const PermissionDecisionSchema = zod_1.z.enum(['allow', 'deny', 'ask']);
const PermissionModeSchema = zod_1.z.enum(['readOnly', 'editFiles', 'fullAccess', 'custom']);
const PermissionConditionSchema = zod_1.z.object({
    type: zod_1.z.enum(['path', 'command', 'env']),
    match: zod_1.z.string(),
    action: zod_1.z.enum(['allow', 'deny']),
});
const PermissionRuleSchema = zod_1.z.object({
    toolPattern: zod_1.z.string(),
    decision: PermissionDecisionSchema,
    conditions: zod_1.z.array(PermissionConditionSchema).optional(),
});
const PermissionProfileSchema = zod_1.z.object({
    name: zod_1.z.string(),
    mode: PermissionModeSchema,
    rules: zod_1.z.array(PermissionRuleSchema),
    commandAllowlist: zod_1.z.array(zod_1.z.string()).optional(),
    commandBlocklist: zod_1.z.array(zod_1.z.string()).optional(),
    pathRestrictions: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.readOnlyProfile = {
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
exports.editFilesProfile = {
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
exports.fullAccessProfile = {
    name: 'fullAccess',
    mode: 'fullAccess',
    rules: [
        { toolPattern: '*', decision: 'allow' },
    ],
};
exports.customProfile = {
    name: 'custom',
    mode: 'custom',
    rules: [],
};
function validateProfile(profile) {
    PermissionProfileSchema.parse(profile);
}
class PermissionEngine {
    mode = 'custom';
    rules = [];
    constructor(initialProfile) {
        if (initialProfile) {
            this.loadProfile(initialProfile);
        }
    }
    loadProfile(profile) {
        validateProfile(profile);
        this.mode = profile.mode;
        this.rules = [...profile.rules];
    }
    setMode(mode) {
        this.mode = mode;
        switch (mode) {
            case 'readOnly':
                this.rules = [...exports.readOnlyProfile.rules];
                break;
            case 'editFiles':
                this.rules = [...exports.editFilesProfile.rules];
                break;
            case 'fullAccess':
                this.rules = [...exports.fullAccessProfile.rules];
                break;
            case 'custom':
                this.rules = [...exports.customProfile.rules];
                break;
        }
    }
    getMode() {
        return this.mode;
    }
    addRule(rule) {
        PermissionRuleSchema.parse(rule);
        const index = this.rules.findIndex((r) => r.toolPattern === rule.toolPattern);
        if (index >= 0) {
            this.rules[index] = rule;
        }
        else {
            this.rules.push(rule);
        }
    }
    removeRule(toolPattern) {
        this.rules = this.rules.filter((r) => r.toolPattern !== toolPattern);
    }
    check(toolName, params = {}) {
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
    matchesPattern(toolName, pattern) {
        if (pattern === '*')
            return true;
        if (pattern === toolName)
            return true;
        const regexPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '\x00')
            .replace(/\*/g, '[^]*')
            .replace(/\x00/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(toolName);
    }
    evaluateConditions(conditions, params) {
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
                        for (const [key, value] of Object.entries(envValue)) {
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
exports.PermissionEngine = PermissionEngine;
//# sourceMappingURL=policy.js.map