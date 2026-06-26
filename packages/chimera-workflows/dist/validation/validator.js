"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetLogCacheForTests = void 0;
exports.makeWorkflowResult = makeWorkflowResult;
exports.levenshtein = levenshtein;
exports.findSimilar = findSimilar;
exports.discoverAvailableCommands = discoverAvailableCommands;
exports.clearRuntimeCache = clearRuntimeCache;
exports.checkRuntimeAvailable = checkRuntimeAvailable;
exports.validateWorkflowResources = validateWorkflowResources;
exports.validateCommand = validateCommand;
exports.discoverAvailableScripts = discoverAvailableScripts;
exports.validateScript = validateScript;
const path_1 = require("path");
const os_1 = require("os");
const promises_1 = require("fs/promises");
const bundled_defaults_js_1 = require("../defaults/bundled-defaults.js");
const command_validation_js_1 = require("../command-validation.js");
const dag_node_js_1 = require("../schemas/dag-node.js");
const script_discovery_js_1 = require("../script-discovery.js");
const executor_shared_js_1 = require("../executor/executor-shared.js");
const model_validation_js_1 = require("./model-validation.js");
const logger_utils_js_1 = require("../logger-utils.js");
// Local stubs for @chimera/paths functions not yet ported
function getCommandFolderSearchPaths(_configuredFolder) {
    return ['.chimera/commands', '.archon/commands'];
}
function getHomeCommandsPath() {
    return (0, path_1.join)((0, os_1.homedir)(), '.chimera', 'commands');
}
function getDefaultCommandsPath() {
    return (0, path_1.join)(__dirname, '..', 'defaults');
}
async function findMarkdownFilesRecursive(dir, _prefix, _opts) {
    const { readdir } = await import('fs/promises');
    const results = [];
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
                results.push({ commandName: entry.name.replace(/\.md$/, ''), relativePath: entry.name });
            }
        }
    }
    catch { /* dir doesn't exist */ }
    return results;
}
// Local stubs for @chimera/isolation functions
async function execFileAsync(_cmd, _args) {
    throw new Error('execFileAsync not available in chimera stub');
}
// Local stubs for @chimera/providers functions
function isRegisteredProvider(_provider) { return true; }
function getProviderCapabilities(_provider) {
    return { mcp: false, skills: false, hooks: false, agents: false, toolRestrictions: false };
}
const { getLog, resetLog } = (0, logger_utils_js_1.createLazyLogger)('workflow.validator');
exports.resetLogCacheForTests = resetLog;
/** Create a WorkflowValidationResult with `valid` derived from issues */
function makeWorkflowResult(workflowName, issues, filename) {
    return {
        workflowName,
        ...(filename !== undefined && { filename }),
        valid: issues.every(i => i.level !== 'error'),
        issues,
    };
}
// =============================================================================
// Levenshtein distance and fuzzy matching
// =============================================================================
/** Classic Levenshtein distance between two strings */
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++)
        dp[i][0] = i;
    for (let j = 0; j <= n; j++)
        dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}
/** Find the closest matches from a list of candidates */
function findSimilar(name, candidates, maxDistance) {
    const threshold = maxDistance ?? Math.max(2, Math.floor(name.length * 0.3));
    const scored = candidates
        .map(c => ({ name: c, distance: levenshtein(name.toLowerCase(), c.toLowerCase()) }))
        .filter(s => s.distance <= threshold && s.distance > 0)
        .sort((a, b) => a.distance - b.distance);
    return scored.slice(0, 3).map(s => s.name);
}
// =============================================================================
// Command discovery
// =============================================================================
/** Check if a file exists */
async function fileExists(path) {
    try {
        await (0, promises_1.access)(path);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Discover all available command names from search paths and bundled defaults.
 * Returns deduplicated, sorted list of command names.
 */
async function discoverAvailableCommands(cwd, config) {
    const names = new Set();
    // Each scope is walked 1 subfolder deep (matches the workflows/scripts
    // discovery convention — supports `defaults/` grouping, rejects deeper nesting).
    // 1. Repo search paths
    const searchPaths = getCommandFolderSearchPaths(config?.commandFolder);
    for (const folder of searchPaths) {
        const dirPath = (0, path_1.join)(cwd, folder);
        const files = await findMarkdownFilesRecursive(dirPath, '', { maxDepth: 1 });
        for (const { commandName } of files) {
            names.add(commandName);
        }
    }
    // 2. Home-scoped commands (~/.archon/commands/) — personal helpers reusable across repos.
    // ENOENT already returns []; we only catch other errors (EACCES/EPERM/EIO) so a broken
    // home-scope doesn't take down repo/bundled discovery.
    const homePath = getHomeCommandsPath();
    try {
        const homeCommands = await findMarkdownFilesRecursive(homePath, '', { maxDepth: 1 });
        for (const { commandName } of homeCommands) {
            names.add(commandName);
        }
    }
    catch (err) {
        getLog().warn({ err, path: homePath }, 'commands.home_discovery_failed');
    }
    // 3. Bundled defaults
    const loadDefaults = config?.loadDefaultCommands !== false;
    if (loadDefaults) {
        if ((0, bundled_defaults_js_1.isBinaryBuild)()) {
            for (const name of Object.keys(bundled_defaults_js_1.BUNDLED_COMMANDS)) {
                names.add(name);
            }
        }
        else {
            const defaultsPath = getDefaultCommandsPath();
            const files = await findMarkdownFilesRecursive(defaultsPath, '', { maxDepth: 1 });
            for (const { commandName } of files) {
                names.add(commandName);
            }
        }
    }
    return [...names].sort();
}
/**
 * Resolve a command name to a file path within a single directory, walking at
 * most 1 subfolder deep. Returns the first `.md` file whose basename matches
 * `commandName`, or `null` if nothing matches.
 *
 * Within a single scope, if two files in different subfolders share a basename
 * (e.g. `triage/review.md` and `team/review.md`), the earlier match by the
 * deterministic walk order wins — duplicates within a scope are a user error.
 */
async function resolveCommandInDir(rootDir, commandName) {
    const entries = await findMarkdownFilesRecursive(rootDir, '', { maxDepth: 1 });
    const match = entries.find(e => e.commandName === commandName);
    return match ? (0, path_1.join)(rootDir, match.relativePath) : null;
}
/**
 * Check if a command file can be resolved via the standard search paths.
 * Returns the resolved path if found, null otherwise.
 *
 * Resolution precedence (first hit wins):
 *   1. Repo-local — `<cwd>/.archon/commands/` and configured folders
 *   2. Home-scoped — `~/.archon/commands/` (personal helpers, reusable across repos)
 *   3. Bundled defaults — embedded in the binary or the app's defaults folder
 */
async function resolveCommand(commandName, cwd, config) {
    // Each scope is walked 1 subfolder deep by basename — so `triage/review.md`
    // is resolvable as `review`. This matches the workflows/scripts discovery
    // convention and makes the listed commands in `discoverAvailableCommands`
    // actually resolvable.
    // 1. Repo search paths
    const searchPaths = getCommandFolderSearchPaths(config?.commandFolder);
    for (const folder of searchPaths) {
        const resolved = await resolveCommandInDir((0, path_1.join)(cwd, folder), commandName);
        if (resolved)
            return resolved;
    }
    // 2. Home-scoped commands (~/.archon/commands/).
    // ENOENT on the home dir already returns null; only wrap for other errors so a
    // broken home-scope doesn't prevent bundled-default resolution.
    try {
        const homeResolved = await resolveCommandInDir(getHomeCommandsPath(), commandName);
        if (homeResolved)
            return homeResolved;
    }
    catch (err) {
        getLog().warn({ err, commandName }, 'commands.home_resolve_failed');
    }
    // 3. Bundled defaults
    const loadDefaults = config?.loadDefaultCommands !== false;
    if (loadDefaults) {
        if ((0, bundled_defaults_js_1.isBinaryBuild)()) {
            if (commandName in bundled_defaults_js_1.BUNDLED_COMMANDS) {
                return `[bundled:${commandName}]`;
            }
        }
        else {
            const defaultsResolved = await resolveCommandInDir(getDefaultCommandsPath(), commandName);
            if (defaultsResolved)
                return defaultsResolved;
        }
    }
    return null;
}
// =============================================================================
// Runtime availability checking
// =============================================================================
/** Installation hints per runtime */
const RUNTIME_INSTALL_HINTS = {
    bun: 'Install bun: https://bun.sh — or run: curl -fsSL https://bun.sh/install | bash',
    uv: 'Install uv: https://docs.astral.sh/uv/getting-started/installation/ — or run: curl -LsSf https://astral.sh/uv/install.sh | sh',
};
const runtimeCache = new Map();
/** Clear the runtime availability cache (exposed for testing). */
function clearRuntimeCache() {
    runtimeCache.clear();
}
/**
 * Check whether a runtime binary (bun or uv) is available on PATH.
 * Results are memoized per runtime name to avoid repeated subprocess spawns.
 */
async function checkRuntimeAvailable(runtime) {
    const cached = runtimeCache.get(runtime);
    if (cached !== undefined)
        return cached;
    try {
        await execFileAsync('which', [runtime]);
        runtimeCache.set(runtime, true);
        return true;
    }
    catch {
        runtimeCache.set(runtime, false);
        return false;
    }
}
// =============================================================================
// Workflow resource validation (Level 3)
// =============================================================================
/** Get the resolved provider for a node (node-level > workflow-level > config default).
 *  Returns undefined only when no provider is set at any level. */
function resolveProvider(node, workflowProvider, defaultProvider) {
    if ('provider' in node && node.provider)
        return node.provider;
    return workflowProvider ?? defaultProvider;
}
/**
 * Validate a workflow's external resource references (Level 3).
 *
 * Checks that command files, MCP configs, and skill directories actually exist.
 * Call this AFTER parseWorkflow() has passed (Levels 1-2 are prerequisites).
 */
async function validateWorkflowResources(workflow, cwd, config, defaultProvider) {
    const issues = [];
    const availableCommands = await discoverAvailableCommands(cwd, config);
    const requiresPortableModelRefs = config?.workflowSource === 'bundled' || config?.workflowSource === 'global';
    const modelProfileProvider = config?.assistant ?? defaultProvider ?? 'claude';
    let aiProfile;
    try {
        aiProfile = (0, model_validation_js_1.buildAiProfile)(modelProfileProvider, {
            repoTiers: config?.tiers,
            repoAliases: config?.aliases,
        });
    }
    catch (error) {
        issues.push({
            level: 'error',
            field: 'model',
            message: error.message,
            hint: 'Fix tiers/aliases in .archon/config.yaml, or use literal provider model strings.',
        });
    }
    const validateModelRef = (ref, nodeId) => {
        if (!aiProfile)
            return;
        try {
            (0, model_validation_js_1.resolveModelSpec)(aiProfile, ref);
        }
        catch (error) {
            issues.push({
                level: 'error',
                ...(nodeId !== undefined ? { nodeId } : {}),
                field: 'model',
                message: error.message,
                hint: 'Fix tiers/aliases in .archon/config.yaml, or use a literal provider model string.',
            });
        }
    };
    if (requiresPortableModelRefs && workflow.model?.startsWith('@')) {
        issues.push({
            level: 'error',
            field: 'model',
            message: `Workflow '${workflow.name}' uses custom model alias '${workflow.model}', which is not portable for ${config.workflowSource} workflows`,
            hint: 'Use small, medium, large, or a literal provider model string. Reserve @custom aliases for project workflows.',
        });
    }
    if (workflow.model)
        validateModelRef(workflow.model);
    for (const node of workflow.nodes) {
        const provider = resolveProvider(node, workflow.provider, defaultProvider);
        if (requiresPortableModelRefs && 'model' in node && node.model?.startsWith('@')) {
            issues.push({
                level: 'error',
                nodeId: node.id,
                field: 'model',
                message: `Node '${node.id}' uses custom model alias '${node.model}', which is not portable for ${config.workflowSource} workflows`,
                hint: 'Use small, medium, large, or a literal provider model string. Reserve @custom aliases for project workflows.',
            });
        }
        if ('model' in node && node.model)
            validateModelRef(node.model, node.id);
        // --- Command nodes: check file exists ---
        if ('command' in node && typeof node.command === 'string') {
            if (!(0, command_validation_js_1.isValidCommandName)(node.command)) {
                issues.push({
                    level: 'error',
                    nodeId: node.id,
                    field: 'command',
                    message: `Invalid command name '${node.command}' — must not contain '/', '\\', '..', or start with '.'`,
                    hint: 'Use a simple name like "my-command" (without path separators or the .md extension)',
                });
                continue;
            }
            const resolved = await resolveCommand(node.command, cwd, config);
            if (!resolved) {
                const similar = findSimilar(node.command, availableCommands);
                const issue = {
                    level: 'error',
                    nodeId: node.id,
                    field: 'command',
                    message: `Command '${node.command}' not found`,
                    hint: `Create .archon/commands/${node.command}.md or use an existing command name`,
                };
                if (similar.length > 0) {
                    issue.hint = `Did you mean: ${similar.map(s => `'${s}'`).join(', ')}? Or create .archon/commands/${node.command}.md`;
                    issue.suggestions = similar;
                }
                issues.push(issue);
            }
        }
        // --- MCP nodes: check config file exists and is valid JSON ---
        if ('mcp' in node && typeof node.mcp === 'string') {
            const mcpPath = (0, path_1.isAbsolute)(node.mcp) ? node.mcp : (0, path_1.resolve)(cwd, node.mcp);
            if (!(await fileExists(mcpPath))) {
                issues.push({
                    level: 'error',
                    nodeId: node.id,
                    field: 'mcp',
                    message: `MCP config file not found: '${node.mcp}'`,
                    hint: `Create the file at ${mcpPath} with MCP server definitions (JSON format). Example:\n  {"server-name": {"command": "npx", "args": ["-y", "@package/name"], "env": {}}}`,
                });
            }
            else {
                // File exists — check it's valid JSON
                try {
                    const content = await (0, promises_1.readFile)(mcpPath, 'utf-8');
                    const parsed = JSON.parse(content);
                    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                        issues.push({
                            level: 'error',
                            nodeId: node.id,
                            field: 'mcp',
                            message: `MCP config file '${node.mcp}' must be a JSON object (Record<string, ServerConfig>)`,
                            hint: 'The file should contain a JSON object where each key is a server name',
                        });
                    }
                }
                catch (e) {
                    const err = e;
                    issues.push({
                        level: 'error',
                        nodeId: node.id,
                        field: 'mcp',
                        message: `MCP config file '${node.mcp}' contains invalid JSON: ${err.message}`,
                        hint: 'Fix the JSON syntax in the MCP config file',
                    });
                }
            }
            // Warn if using MCP with a provider that doesn't support it
            if (provider && isRegisteredProvider(provider)) {
                const caps = getProviderCapabilities(provider);
                if (!caps.mcp) {
                    issues.push({
                        level: 'warning',
                        nodeId: node.id,
                        field: 'mcp',
                        message: `MCP servers are not supported by provider '${provider}' — this will be ignored`,
                        hint: 'Remove the mcp field or switch to a provider that supports MCP',
                    });
                }
            }
        }
        // --- Skills nodes: check skill directories exist ---
        if ('skills' in node && Array.isArray(node.skills)) {
            for (const skillName of node.skills) {
                const projectSkillPath = (0, path_1.join)(cwd, '.claude', 'skills', skillName, 'SKILL.md');
                const userSkillPath = (0, path_1.join)((0, os_1.homedir)(), '.claude', 'skills', skillName, 'SKILL.md');
                const projectExists = await fileExists(projectSkillPath);
                const userExists = await fileExists(userSkillPath);
                if (!projectExists && !userExists) {
                    issues.push({
                        level: 'warning',
                        nodeId: node.id,
                        field: 'skills',
                        message: `Skill '${skillName}' not found in .claude/skills/ or ~/.claude/skills/`,
                        hint: `Install with: npx skills add <repo> — or create manually at .claude/skills/${skillName}/SKILL.md`,
                    });
                }
            }
            // Warn if using skills with a provider that doesn't support them
            if (provider && isRegisteredProvider(provider)) {
                const caps = getProviderCapabilities(provider);
                if (!caps.skills) {
                    issues.push({
                        level: 'warning',
                        nodeId: node.id,
                        field: 'skills',
                        message: `Skills are not supported by provider '${provider}' — this will be ignored`,
                        hint: 'Remove the skills field or switch to a provider that supports skills',
                    });
                }
            }
        }
        // --- Capability-driven warnings for hooks and tool restrictions ---
        if (provider && isRegisteredProvider(provider)) {
            const caps = getProviderCapabilities(provider);
            if ('hooks' in node && node.hooks && !caps.hooks) {
                issues.push({
                    level: 'warning',
                    nodeId: node.id,
                    field: 'hooks',
                    message: `Hooks are not supported by provider '${provider}' — this will be ignored`,
                    hint: 'Remove the hooks field or switch to a provider that supports hooks',
                });
            }
            if ('agents' in node && node.agents && !caps.agents) {
                issues.push({
                    level: 'warning',
                    nodeId: node.id,
                    field: 'agents',
                    message: `Inline agents are not supported by provider '${provider}' — this will be ignored`,
                    hint: 'Remove the agents field or switch to a provider that supports inline agents (e.g. claude)',
                });
            }
            if (!caps.toolRestrictions) {
                if (('allowed_tools' in node && node.allowed_tools !== undefined) ||
                    ('denied_tools' in node && node.denied_tools !== undefined)) {
                    issues.push({
                        level: 'warning',
                        nodeId: node.id,
                        field: 'allowed_tools/denied_tools',
                        message: `Tool restrictions are not supported by provider '${provider}' — this will be ignored`,
                        hint: 'Remove tool restriction fields or switch to a provider that supports them',
                    });
                }
            }
        }
        // --- Script nodes: check named script file exists + runtime available ---
        if ((0, dag_node_js_1.isScriptNode)(node)) {
            const script = node.script;
            // Named script: validate file exists in repo or home scope.
            // Precedence mirrors dag-executor: repo > home. Subfolders up to 1 level deep
            // are searched by discoverScriptsForCwd, matching the workflows/commands convention.
            if (!(0, executor_shared_js_1.isInlineScript)(script)) {
                const scripts = await (0, script_discovery_js_1.discoverScriptsForCwd)(cwd);
                const entry = scripts.get(script);
                const scriptExists = entry !== undefined &&
                    (node.runtime === 'uv' ? entry.runtime === 'uv' : entry.runtime === 'bun');
                if (!scriptExists) {
                    issues.push({
                        level: 'error',
                        nodeId: node.id,
                        field: 'script',
                        message: `Named script '${script}' not found in .archon/scripts/ or ~/.archon/scripts/`,
                        hint: `Create .archon/scripts/${script}.${node.runtime === 'uv' ? 'py' : 'ts'} with your script code (or place at ~/.archon/scripts/ to share across repos)`,
                    });
                }
            }
            // Runtime availability: warn if binary not on PATH
            const runtimeAvailable = await checkRuntimeAvailable(node.runtime);
            if (!runtimeAvailable) {
                issues.push({
                    level: 'warning',
                    nodeId: node.id,
                    field: 'runtime',
                    message: `Runtime '${node.runtime}' is not available on PATH`,
                    hint: RUNTIME_INSTALL_HINTS[node.runtime],
                });
            }
            // Warn when deps is specified with bun (bun auto-installs, deps is a no-op)
            if (node.runtime === 'bun' && node.deps && node.deps.length > 0) {
                issues.push({
                    level: 'warning',
                    nodeId: node.id,
                    field: 'deps',
                    message: "'deps' is ignored for bun runtime (bun auto-installs packages at runtime)",
                    hint: 'Remove deps or switch to runtime: uv if you need explicit dependency management',
                });
            }
        }
        //   wrong="$n.output.field" → wrong="'ok'" (single quotes become part of the value)
        //   right=$n.output.field   → right='ok' → bash assigns: ok
        const doubleQuotedOutputRef = /(?:^|[=\s])"[^"\n]*\$[a-zA-Z_][a-zA-Z0-9_-]*\.output/m;
        const warnDoubleQuoted = (body, field) => {
            if (doubleQuotedOutputRef.test(body)) {
                issues.push({
                    level: 'warning',
                    nodeId: node.id,
                    field,
                    message: '`"$nodeId.output"` — double-quoting a substitution that is already shell-quoted by Archon produces the wrong value',
                    hint: 'Use `var=$node.output.field` (unquoted) — the substitution is injected already quoted. (Numeric/boolean fields are injected raw, so double-quoting is harmless for those, but the rule is uniform.)',
                });
            }
        };
        if ((0, dag_node_js_1.isBashNode)(node))
            warnDoubleQuoted(node.bash, 'bash');
        if ((0, dag_node_js_1.isLoopNode)(node) && node.loop.until_bash) {
            warnDoubleQuoted(node.loop.until_bash, 'loop.until_bash');
        }
    }
    return issues;
}
// =============================================================================
// Command validation
// =============================================================================
/**
 * Validate a single command file: exists, non-empty, valid name.
 */
async function validateCommand(commandName, cwd, config) {
    const issues = [];
    if (!(0, command_validation_js_1.isValidCommandName)(commandName)) {
        issues.push({
            level: 'error',
            field: 'name',
            message: `Invalid command name '${commandName}' — must not contain '/', '\\', '..', or start with '.'`,
            hint: 'Use a simple name like "my-command" (without path separators)',
        });
        return { commandName, valid: false, issues };
    }
    const resolved = await resolveCommand(commandName, cwd, config);
    if (!resolved) {
        const availableCommands = await discoverAvailableCommands(cwd, config);
        const similar = findSimilar(commandName, availableCommands);
        const issue = {
            level: 'error',
            field: 'file',
            message: `Command '${commandName}' not found`,
            hint: `Create .archon/commands/${commandName}.md`,
        };
        if (similar.length > 0) {
            issue.hint = `Did you mean: ${similar.map(s => `'${s}'`).join(', ')}?`;
            issue.suggestions = similar;
        }
        issues.push(issue);
        return { commandName, valid: false, issues };
    }
    // For non-bundled commands, check file is non-empty
    if (!resolved.startsWith('[bundled:')) {
        try {
            const content = await (0, promises_1.readFile)(resolved, 'utf-8');
            if (content.trim().length === 0) {
                issues.push({
                    level: 'error',
                    field: 'content',
                    message: `Command file '${commandName}' is empty`,
                    hint: `Add prompt content to ${resolved}`,
                });
            }
        }
        catch (e) {
            const err = e;
            issues.push({
                level: 'error',
                field: 'file',
                message: `Cannot read command file '${commandName}': ${err.message}`,
                hint: 'Check file permissions',
            });
        }
    }
    return {
        commandName,
        valid: issues.filter(i => i.level === 'error').length === 0,
        issues,
    };
}
/**
 * Discover all script names from the repo and home scopes.
 * Returns a list of { name, path, runtime } entries. Repo-scoped scripts
 * silently override same-named home-scoped entries.
 */
async function discoverAvailableScripts(cwd) {
    try {
        const scripts = await (0, script_discovery_js_1.discoverScriptsForCwd)(cwd);
        return [...scripts.values()].map(s => ({ name: s.name, path: s.path, runtime: s.runtime }));
    }
    catch (error) {
        const err = error;
        getLog().warn({ err, cwd }, 'script_discovery_failed');
        return [];
    }
}
/**
 * Validate a single named script: file exists and runtime is available.
 */
async function validateScript(scriptName, cwd) {
    const issues = [];
    // Look up across repo + home scopes (repo wins). discoverScriptsForCwd handles
    // both 1-depth subfolders and the repo/home precedence.
    const scripts = await (0, script_discovery_js_1.discoverScriptsForCwd)(cwd);
    const entry = scripts.get(scriptName);
    const foundPath = entry?.path ?? null;
    const detectedRuntime = entry?.runtime ?? null;
    if (!foundPath || !detectedRuntime) {
        issues.push({
            level: 'error',
            field: 'file',
            message: `Script '${scriptName}' not found in .archon/scripts/ or ~/.archon/scripts/`,
            hint: `Create .archon/scripts/${scriptName}.ts (bun) or .archon/scripts/${scriptName}.py (uv). Place at ~/.archon/scripts/ to share across repos.`,
        });
        return { scriptName, valid: false, issues };
    }
    // Check runtime availability
    const runtimeAvailable = await checkRuntimeAvailable(detectedRuntime);
    if (!runtimeAvailable) {
        issues.push({
            level: 'warning',
            field: 'runtime',
            message: `Runtime '${detectedRuntime}' is not available on PATH`,
            hint: RUNTIME_INSTALL_HINTS[detectedRuntime],
        });
    }
    return {
        scriptName,
        valid: issues.filter(i => i.level === 'error').length === 0,
        issues,
    };
}
//# sourceMappingURL=validator.js.map