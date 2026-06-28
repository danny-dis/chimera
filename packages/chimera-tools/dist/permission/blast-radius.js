"use strict";
/**
 * Blast Radius Policy
 *
 * Classifies shell commands by reversibility, not just "is this a shell command."
 * Modeled after Omnigent's blast radius classifier.
 *
 * Three tiers:
 * - DENY (irreversible/catastrophic): force-push, rm -rf /, hard-reset to remote
 * - ASK (recoverable but outward): git push, gh pr merge, deploy/destroy
 * - ALLOW (local/reversible): reads, tests, edits, local git operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyBlastRadius = classifyBlastRadius;
exports.parseCommand = parseCommand;
exports.classifyChainedCommand = classifyChainedCommand;
// Catastrophic patterns — DENY
const CATASTROPHIC_PATTERNS = [
    { pattern: /rm\s+-rf\s+[\/~]/, reason: 'Recursive delete from root or home' },
    { pattern: /rm\s+-rf\s+\*/, reason: 'Recursive delete all' },
    { pattern: /git\s+push\s+--force.*origin\s+(main|master)/, reason: 'Force push to main/master' },
    { pattern: /git\s+reset\s+--hard.*HEAD~10/, reason: 'Hard reset more than 10 commits' },
    { pattern: /git\s+clean\s+-fdx/, reason: 'Clean all untracked files and ignored files' },
    { pattern: /drop\s+(table|database)\s+/, reason: 'Drop table or database' },
    { pattern: /(?:sudo\s+)?(?:rm|shred|wipefs)\s+.*(?:\/dev\/|\/boot\/|\/etc\/)/, reason: 'Destructive system operation' },
    { pattern: /(?:curl|wget)\s+.*\|\s*(?:bash|sh|python)/, reason: 'Pipe remote content to shell' },
    { pattern: /chmod\s+777\s+/, reason: 'World-writable permissions' },
    { pattern: /eval\s*\(/, reason: 'Dynamic code execution' },
];
// Risky patterns — ASK
const RISKY_PATTERNS = [
    { pattern: /git\s+push(?!.*--force)/, reason: 'Git push to remote' },
    { pattern: /git\s+push\s+--force(?!.*origin\s+(main|master))/, reason: 'Force push (not to main)' },
    { pattern: /gh\s+pr\s+(merge|close)/, reason: 'Merge or close PR' },
    { pattern: /npm\s+(publish|unpublish)/, reason: 'Publish/unpublish npm package' },
    { pattern: /pip\s+upload/, reason: 'Upload Python package' },
    { pattern: /docker\s+(rm|rmi|stop|kill)/, reason: 'Remove/stop Docker resources' },
    { pattern: /kubectl\s+(delete|drain|cordon)/, reason: 'Delete/drain Kubernetes resources' },
    { pattern: /(?:terraform|pulumi)\s+(destroy|down)/, reason: 'Destroy infrastructure' },
    { pattern: /git\s+rebase\s+-i/, reason: 'Interactive rebase' },
    { pattern: /git\s+push.*--force-with-lease/, reason: 'Force push with lease' },
    { pattern: /rm\s+(?!-rf\s+[\/~])/, reason: 'File deletion' },
    { pattern: /mv\s+.*\//, reason: 'Move file to different directory' },
    { pattern: /sudo\s+/, reason: 'Elevated privileges' },
    { pattern: /chmod\s+/, reason: 'Change file permissions' },
    { pattern: /chown\s+/, reason: 'Change file ownership' },
];
// Safe patterns — ALLOW (explicit overrides for read-only operations)
const SAFE_PATTERNS = [
    { pattern: /git\s+(status|log|diff|show|blame|branch\s+-v)/, reason: 'Read-only git operation' },
    { pattern: /git\s+branch\s+(?!.*-D\s)/, reason: 'List/create branches' },
    { pattern: /git\s+stash\s+(list|show)/, reason: 'View stash entries' },
    { pattern: /ls|cat|head|tail|grep|find|wc|file|stat/, reason: 'Read-only system commands' },
    { pattern: /npm\s+(test|run|list|outdated)/, reason: 'npm read operations' },
    { pattern: /node\s+(?!-e\s)/, reason: 'Run Node.js script' },
    { pattern: /python\s+(?!-c\s)/, reason: 'Run Python script' },
    { pattern: /tsc|--noEmit/, reason: 'Type checking' },
    { pattern: /eslint|prettier|biome/, reason: 'Linting/formatting' },
];
/**
 * Classify a shell command by its blast radius.
 */
function classifyBlastRadius(command) {
    const trimmed = command.trim();
    // Check catastrophic patterns first (highest priority)
    for (const { pattern, reason } of CATASTROPHIC_PATTERNS) {
        if (pattern.test(trimmed)) {
            return {
                radius: 'catastrophic',
                decision: 'deny',
                reason,
                command: trimmed,
            };
        }
    }
    // Check risky patterns (medium priority)
    for (const { pattern, reason } of RISKY_PATTERNS) {
        if (pattern.test(trimmed)) {
            return {
                radius: 'risky',
                decision: 'ask',
                reason,
                command: trimmed,
            };
        }
    }
    // Check safe patterns (lowest priority)
    for (const { pattern, reason } of SAFE_PATTERNS) {
        if (pattern.test(trimmed)) {
            return {
                radius: 'safe',
                decision: 'allow',
                reason,
                command: trimmed,
            };
        }
    }
    // Default: treat unknown commands as risky (ASK)
    return {
        radius: 'risky',
        decision: 'ask',
        reason: 'Unknown command pattern',
        command: trimmed,
    };
}
/**
 * Parse shell command to extract the base command.
 * Handles chained commands (&&, ||, ;), env assignments, sudo.
 */
function parseCommand(command) {
    const commands = [];
    // Split by &&, ||, ;
    const parts = command.split(/\s*(?:&&|\|\||;)\s*/);
    for (const part of parts) {
        let trimmed = part.trim();
        // Skip empty parts
        if (!trimmed)
            continue;
        // Strip leading env assignments (FOO=bar cmd)
        trimmed = trimmed.replace(/^[A-Z_]+=\S+\s+/, '');
        // Strip sudo
        trimmed = trimmed.replace(/^sudo\s+/, '');
        // Strip pipe to stdin (cat file | cmd)
        if (trimmed.includes('|') && !trimmed.includes('||')) {
            const pipeParts = trimmed.split('|');
            trimmed = pipeParts[pipeParts.length - 1].trim();
        }
        if (trimmed) {
            commands.push(trimmed);
        }
    }
    return commands;
}
/**
 * Classify a potentially chained shell command.
 * Returns the worst blast radius across all sub-commands.
 */
function classifyChainedCommand(command) {
    const commands = parseCommand(command);
    if (commands.length === 0) {
        return {
            radius: 'safe',
            decision: 'allow',
            reason: 'Empty command',
            command,
        };
    }
    // Classify each sub-command and return the worst
    let worst = {
        radius: 'safe',
        decision: 'allow',
        reason: 'All sub-commands safe',
        command,
    };
    const RADIUS_ORDER = { safe: 0, risky: 1, catastrophic: 2 };
    for (const cmd of commands) {
        const result = classifyBlastRadius(cmd);
        if (RADIUS_ORDER[result.radius] > RADIUS_ORDER[worst.radius]) {
            worst = result;
        }
    }
    return worst;
}
//# sourceMappingURL=blast-radius.js.map