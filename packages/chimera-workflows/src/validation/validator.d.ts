/**
 * Workflow and command validation — Level 3 (resource resolution).
 *
 * Levels 1-2 (syntax + structure) are handled by parseWorkflow() in loader.ts.
 * This module adds Level 3: checking that referenced resources actually exist
 * on disk (command files, MCP configs, skill directories).
 *
 * Lives in @chimera/workflows (no @chimera/core dependency) so both CLI and
 * REST API can use it.
 */
import type { WorkflowDefinition, WorkflowSource } from '../schemas/workflow.js';
import type { ScriptRuntime } from '../script-discovery.js';
import type { RawAliasesConfig, RawTiersConfig } from './model-validation.js';
declare const resetLog: () => void;
export { resetLog as resetLogCacheForTests };
/** A single validation issue with actionable hint */
export interface ValidationIssue {
    level: 'error' | 'warning';
    nodeId?: string;
    field: string;
    message: string;
    hint?: string;
    suggestions?: string[];
}
/** Result of validating a single workflow (Level 3) */
export interface WorkflowValidationResult {
    workflowName: string;
    filename?: string;
    valid: boolean;
    issues: ValidationIssue[];
}
/** Create a WorkflowValidationResult with `valid` derived from issues */
export declare function makeWorkflowResult(workflowName: string, issues: ValidationIssue[], filename?: string): WorkflowValidationResult;
/** Result of validating a single command */
export interface CommandValidationResult {
    commandName: string;
    valid: boolean;
    issues: ValidationIssue[];
}
/** Config subset for validation (avoids WorkflowDeps dependency) */
export interface ValidationConfig {
    loadDefaultCommands?: boolean;
    commandFolder?: string;
    workflowSource?: WorkflowSource;
    assistant?: string;
    aliases?: RawAliasesConfig;
    tiers?: RawTiersConfig;
}
/** Classic Levenshtein distance between two strings */
export declare function levenshtein(a: string, b: string): number;
/** Find the closest matches from a list of candidates */
export declare function findSimilar(name: string, candidates: string[], maxDistance?: number): string[];
/**
 * Discover all available command names from search paths and bundled defaults.
 * Returns deduplicated, sorted list of command names.
 */
export declare function discoverAvailableCommands(cwd: string, config?: ValidationConfig): Promise<string[]>;
/** Clear the runtime availability cache (exposed for testing). */
export declare function clearRuntimeCache(): void;
/**
 * Check whether a runtime binary (bun or uv) is available on PATH.
 * Results are memoized per runtime name to avoid repeated subprocess spawns.
 */
export declare function checkRuntimeAvailable(runtime: ScriptRuntime): Promise<boolean>;
/**
 * Validate a workflow's external resource references (Level 3).
 *
 * Checks that command files, MCP configs, and skill directories actually exist.
 * Call this AFTER parseWorkflow() has passed (Levels 1-2 are prerequisites).
 */
export declare function validateWorkflowResources(workflow: WorkflowDefinition, cwd: string, config?: ValidationConfig, defaultProvider?: string): Promise<ValidationIssue[]>;
/**
 * Validate a single command file: exists, non-empty, valid name.
 */
export declare function validateCommand(commandName: string, cwd: string, config?: ValidationConfig): Promise<CommandValidationResult>;
/** Result of validating a single script */
export interface ScriptValidationResult {
    scriptName: string;
    valid: boolean;
    issues: ValidationIssue[];
}
/**
 * Discover all script names from the repo and home scopes.
 * Returns a list of { name, path, runtime } entries. Repo-scoped scripts
 * silently override same-named home-scoped entries.
 */
export declare function discoverAvailableScripts(cwd: string): Promise<{
    name: string;
    path: string;
    runtime: ScriptRuntime;
}[]>;
/**
 * Validate a single named script: file exists and runtime is available.
 */
export declare function validateScript(scriptName: string, cwd: string): Promise<ScriptValidationResult>;
//# sourceMappingURL=validator.d.ts.map