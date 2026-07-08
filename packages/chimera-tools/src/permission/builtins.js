"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askOnOsTools = askOnOsTools;
exports.readOnlyPolicy = readOnlyPolicy;
exports.workspaceWritePolicy = workspaceWritePolicy;
exports.trustedProjectPolicy = trustedProjectPolicy;
exports.costBudgetPolicy = costBudgetPolicy;
exports.maxToolCallsPolicy = maxToolCallsPolicy;
exports.destructiveCommandsPolicy = destructiveCommandsPolicy;
exports.networkPolicy = networkPolicy;
exports.getBuiltinPolicyNames = getBuiltinPolicyNames;
exports.createBuiltinPolicy = createBuiltinPolicy;
/**
 * Builtin policy factories — ready-to-use policies for common governance patterns.
 * Modeled after Omnigent's builtin policy handlers.
 */
/**
 * Ask before OS tools — requires approval for shell commands and file writes.
 * Default first-run policy.
 */
function askOnOsTools() {
    return {
        name: 'ask-on-os-tools',
        mode: 'custom',
        rules: [
            { toolPattern: 'read_file', decision: 'allow' },
            { toolPattern: 'search_files', decision: 'allow' },
            { toolPattern: 'glob_files', decision: 'allow' },
            { toolPattern: 'git_status', decision: 'allow' },
            { toolPattern: 'git_diff', decision: 'allow' },
            { toolPattern: 'git_log', decision: 'allow' },
            { toolPattern: 'write_file', decision: 'ask' },
            { toolPattern: 'edit_file', decision: 'ask' },
            { toolPattern: 'shell_*', decision: 'ask' },
            { toolPattern: '*', decision: 'deny' },
        ],
    };
}
/**
 * Read-only policy — no modifications allowed.
 * Useful for review/plan modes.
 */
function readOnlyPolicy() {
    return {
        name: 'read-only',
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
}
/**
 * Workspace write policy — allows edits within repo, asks for risky commands.
 * Default for normal coding sessions.
 */
function workspaceWritePolicy() {
    return {
        name: 'workspace-write',
        mode: 'editFiles',
        rules: [
            { toolPattern: 'read_file', decision: 'allow' },
            { toolPattern: 'search_files', decision: 'allow' },
            { toolPattern: 'glob_files', decision: 'allow' },
            { toolPattern: 'write_file', decision: 'allow' },
            { toolPattern: 'edit_file', decision: 'allow' },
            { toolPattern: 'git_*', decision: 'allow' },
            {
                toolPattern: 'shell_*',
                decision: 'ask',
                conditions: [
                    { type: 'command', match: 'rm\\s+-rf', action: 'deny' },
                    { type: 'command', match: 'git\\s+reset\\s+--hard', action: 'deny' },
                    { type: 'command', match: 'git\\s+push\\s+--force', action: 'deny' },
                ],
            },
            { toolPattern: '*', decision: 'deny' },
        ],
    };
}
/**
 * Trusted project policy — allows most operations, denies only dangerous ones.
 * For experienced users with well-tested repos.
 */
function trustedProjectPolicy() {
    return {
        name: 'trusted-project',
        mode: 'custom',
        rules: [
            { toolPattern: '*', decision: 'allow' },
            {
                toolPattern: 'shell_*',
                decision: 'deny',
                conditions: [
                    { type: 'command', match: 'rm\\s+-rf\\s+/', action: 'deny' },
                    { type: 'command', match: 'git\\s+push\\s+--force.*origin\\s+main', action: 'deny' },
                    { type: 'command', match: 'npm\\s+publish', action: 'deny' },
                    { type: 'command', match: 'pip\\s+upload', action: 'deny' },
                ],
            },
        ],
    };
}
/**
 * Cost budget policy — limits total cost per session.
 * Returns 'deny' when budget exceeded, 'ask' at warning thresholds.
 */
function costBudgetPolicy(options) {
    const { maxCostUsd, askThresholdsUsd = [] } = options;
    return {
        name: 'cost-budget',
        mode: 'custom',
        rules: [
            // Cost checking is handled by the CostTracker, not by pattern matching.
            // This policy profile serves as a declaration that cost limits are active.
            { toolPattern: '*', decision: 'allow' },
        ],
        // Store budget config in metadata (accessible via profile name lookup)
        commandAllowlist: [`budget:${maxCostUsd}:${askThresholdsUsd.join(',')}`],
    };
}
/**
 * Max tool calls policy — limits total tool calls per session.
 */
function maxToolCallsPolicy(limit) {
    return {
        name: 'max-tool-calls',
        mode: 'custom',
        rules: [
            // Tool call counting is handled by the session orchestrator.
            // This policy profile serves as a declaration that limits are active.
            { toolPattern: '*', decision: 'allow' },
        ],
        commandAllowlist: [`max-calls:${limit}`],
    };
}
/**
 * Destructive commands policy — blocks all destructive operations.
 */
function destructiveCommandsPolicy() {
    return {
        name: 'destructive-commands',
        mode: 'custom',
        rules: [
            {
                toolPattern: 'shell_*',
                decision: 'deny',
                conditions: [
                    { type: 'command', match: 'rm\\s+-rf', action: 'deny' },
                    { type: 'command', match: 'git\\s+reset\\s+--hard', action: 'deny' },
                    { type: 'command', match: 'git\\s+push\\s+--force', action: 'deny' },
                    { type: 'command', match: 'git\\s+clean\\s+-fd', action: 'deny' },
                    { type: 'command', match: 'drop\\s+table', action: 'deny' },
                    { type: 'command', match: 'drop\\s+database', action: 'deny' },
                    { type: 'command', match: 'npm\\s+publish', action: 'deny' },
                    { type: 'command', match: 'pip\\s+upload', action: 'deny' },
                ],
            },
            { toolPattern: '*', decision: 'allow' },
        ],
    };
}
/**
 * Network policy — controls network access.
 */
function networkPolicy(options = {}) {
    const { allowNetwork = false, allowedDomains = [] } = options;
    return {
        name: 'network-policy',
        mode: 'custom',
        rules: [
            {
                toolPattern: 'shell_*',
                decision: allowNetwork ? 'allow' : 'deny',
                conditions: allowedDomains.length > 0
                    ? [{ type: 'command', match: `curl|wget|fetch`, action: 'allow' }]
                    : undefined,
            },
            { toolPattern: '*', decision: 'allow' },
        ],
    };
}
/**
 * Get all builtin policy names.
 */
function getBuiltinPolicyNames() {
    return [
        'ask-on-os-tools',
        'read-only',
        'workspace-write',
        'trusted-project',
        'cost-budget',
        'max-tool-calls',
        'destructive-commands',
        'network-policy',
    ];
}
/**
 * Create a builtin policy by name.
 */
function createBuiltinPolicy(name, options) {
    switch (name) {
        case 'ask-on-os-tools':
            return askOnOsTools();
        case 'read-only':
            return readOnlyPolicy();
        case 'workspace-write':
            return workspaceWritePolicy();
        case 'trusted-project':
            return trustedProjectPolicy();
        case 'cost-budget':
            return costBudgetPolicy({
                maxCostUsd: options?.maxCostUsd ?? 5.0,
                askThresholdsUsd: options?.askThresholdsUsd ?? [3.0],
            });
        case 'max-tool-calls':
            return maxToolCallsPolicy(options?.limit ?? 50);
        case 'destructive-commands':
            return destructiveCommandsPolicy();
        case 'network-policy':
            return networkPolicy({
                allowNetwork: options?.allowNetwork,
                allowedDomains: options?.allowedDomains,
            });
        default:
            return undefined;
    }
}
//# sourceMappingURL=builtins.js.map