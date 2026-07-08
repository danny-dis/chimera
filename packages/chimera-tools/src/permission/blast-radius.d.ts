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
import type { PermissionDecision } from './policy.js';
export type BlastRadius = 'catastrophic' | 'risky' | 'safe';
export interface BlastRadiusResult {
    radius: BlastRadius;
    decision: PermissionDecision;
    reason: string;
    command: string;
}
/**
 * Classify a shell command by its blast radius.
 */
export declare function classifyBlastRadius(command: string): BlastRadiusResult;
/**
 * Parse shell command to extract the base command.
 * Handles chained commands (&&, ||, ;), env assignments, sudo.
 */
export declare function parseCommand(command: string): string[];
/**
 * Classify a potentially chained shell command.
 * Returns the worst blast radius across all sub-commands.
 */
export declare function classifyChainedCommand(command: string): BlastRadiusResult;
//# sourceMappingURL=blast-radius.d.ts.map