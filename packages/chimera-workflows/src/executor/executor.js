"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetLogCacheForTests = void 0;
exports.hydrateResumableRun = hydrateResumableRun;
exports.executeWorkflow = executeWorkflow;
/**
 * Workflow Executor - runs DAG-based workflows
 */
const promises_1 = require("fs/promises");
const path_1 = require("path");
const dag_node_1 = require("../schemas/dag-node");
const dag_executor_1 = require("./dag-executor");
const logger_1 = require("../logger");
const duration_1 = require("../utils/duration");
const event_emitter_1 = require("./event-emitter");
const executor_shared_1 = require("./executor-shared");
const github_token_policy_1 = require("../utils/github-token-policy");
const model_validation_1 = require("../validation/model-validation");
const logger_utils_1 = require("../logger-utils");
function captureWorkflowInvoked(_data) {
    // Telemetry stub — wired when telemetry backend is available
}
function captureWorkflowCompleted(_data) {
    // Telemetry stub — wired when telemetry backend is available
}
async function getDefaultBranch(_repoPath) {
    return 'main';
}
function toRepoPath(cwd) {
    return cwd;
}
function isRegisteredProvider(_id) {
    return true;
}
function getRegisteredProviders() {
    return [];
}
const { getLog, resetLog } = (0, logger_utils_1.createLazyLogger)('workflow.executor');
exports.resetLogCacheForTests = resetLog;
/**
 * Delay execution for specified milliseconds
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Send a critical message with retry logic.
 * Used for failure/completion notifications that the user must receive.
 */
async function sendCriticalMessage(platform, conversationId, message, context, maxRetries = 3, metadata) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await platform.sendMessage(conversationId, message, metadata);
            return true;
        }
        catch (error) {
            const err = error;
            const errorType = (0, executor_shared_1.classifyError)(err);
            getLog().error({
                err,
                conversationId,
                messageLength: message.length,
                errorType,
                platformType: platform.getPlatformType(),
                ...context,
                attempt,
                maxRetries,
            }, 'platform.critical_message_send_failed');
            // Don't retry fatal errors
            if (errorType === 'FATAL') {
                break;
            }
            // Wait before retry (exponential backoff: 1s, 2s, 3s...)
            if (attempt < maxRetries) {
                await delay(1000 * attempt);
            }
        }
    }
    // Log prominently so operators can manually notify user
    getLog().error({ conversationId, messagePreview: message.slice(0, 100), ...context }, 'critical_message_delivery_failed');
    return false;
}
/**
 * Parse `owner/repo` from a github.com URL. Returns null for non-GitHub URLs
 * so the caller can fall through to env-inheritance.
 *
 *   https://github.com/owner/repo.git   → { owner, repo }
 *   https://github.com/owner/repo       → { owner, repo }
 *   git@github.com:owner/repo.git       → { owner, repo }
 *   <anything else>                     → null
 */
function parseGithubRepoUrl(url) {
    // HTTPS form
    const https = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(url);
    if (https)
        return { owner: https[1], repo: https[2] };
    // SSH form (git@github.com:owner/repo[.git])
    const ssh = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(url);
    if (ssh)
        return { owner: ssh[1], repo: ssh[2] };
    return null;
}
/**
 * Resolve a fresh GH_TOKEN/GITHUB_TOKEN pair from the registered bot-token
 * provider, if any. Used at the top of executeWorkflow to inject the token
 * into the workflow's envVars so bash/script subprocesses pick it up.
 *
 * Contract: NEVER THROWS. On any failure (no codebase, non-GitHub URL,
 * provider rejected, network blip) returns {} — the workflow continues with
 * whatever env inheritance was already in place. This matches the
 * resolveBotGitHubToken? contract in deps.ts.
 */
async function resolveBotGitHubEnvForWorkflow(deps, codebaseId) {
    if (!codebaseId || !deps.resolveBotGitHubToken)
        return {};
    try {
        const codebase = await deps.store.getCodebase(codebaseId);
        if (!codebase?.repository_url)
            return {};
        const parsed = parseGithubRepoUrl(codebase.repository_url);
        if (!parsed)
            return {};
        const token = await deps.resolveBotGitHubToken(parsed.owner, parsed.repo);
        if (!token)
            return {};
        getLog().debug({ owner: parsed.owner, repo: parsed.repo }, 'workflow.bot_github_token_injected');
        return { GH_TOKEN: token, GITHUB_TOKEN: token };
    }
    catch (err) {
        // Resolution failure must not block the workflow — log and fall back.
        getLog().warn({ err: err, codebaseId }, 'workflow.bot_github_token_resolve_failed');
        return {};
    }
}
/**
 * Resolve per-user GitHub token overrides for a run. When per-user mode is on
 * and the run has an originating user, this routes `gh`/`git push` through the
 * user's personal token — or scrubs the org/bot token when they haven't
 * connected (see {@link resolveGithubTokenOverrides}). Returns {} (no opinion)
 * for server-initiated runs and solo installs, leaving the bot env untouched.
 */
async function resolveUserGithubEnvForWorkflow(deps, userId) {
    const perUserEnabled = deps.isPerUserGitHubEnabled?.() ?? false;
    if (!perUserEnabled)
        return {};
    let userToken;
    if (userId && deps.getUserGithubToken) {
        try {
            userToken = await deps.getUserGithubToken(userId);
        }
        catch (err) {
            getLog().warn({ err: err, userId }, 'workflow.user_github_token_resolve_failed');
        }
    }
    return (0, github_token_policy_1.resolveGithubTokenOverrides)(perUserEnabled, userId, userToken);
}
/**
 * Resolve per-user AI-provider credential env (Phase 2) for a run, and write
 * any file-based deliveries (e.g. Codex `CODEX_HOME/auth.json`) under the
 * run's artifacts directory. Returns the env bag to merge LAST into
 * `config.envVars` so a connected user's keys win over file/db/bot-github
 * env. Returns `{}` when per-user provider keys are disabled, no userId is
 * present, or the deps adapter is absent.
 *
 * Contract: NEVER THROWS. Adapter failures are logged and yield `{}` so the
 * workflow continues with whatever env inheritance was already in place.
 */
async function resolveUserProviderEnvForWorkflow(deps, userId, artifactsDir) {
    const perUserEnabled = deps.isPerUserProviderKeysEnabled?.() ?? false;
    if (!perUserEnabled || !userId || !deps.getUserProviderEnv)
        return {};
    try {
        // TODO(#1891 PR-3): when Codex OAuth delivery is enabled, file-write failures
        // must drop only the affected provider's env keys, not all of them. Move file
        // writes into getUserProviderEnv per-delivery so env + write are atomic
        // per-provider, or wrap each write in a per-file try-catch that strips the
        // matching env keys on failure. Currently safe: no OAuth rows can be created
        // in PR-1 so `files` is always empty and this loop never executes.
        const { env, files } = await deps.getUserProviderEnv(userId, artifactsDir);
        for (const f of files) {
            try {
                await (0, promises_1.mkdir)((0, path_1.dirname)(f.path), { recursive: true });
                await (0, promises_1.writeFile)(f.path, f.contents, { encoding: 'utf8', mode: 0o600 });
            }
            catch (writeErr) {
                getLog().warn({ err: writeErr, path: f.path }, 'provider_env_file_write_failed');
            }
        }
        const envKeys = Object.keys(env);
        if (envKeys.length > 0) {
            getLog().debug({ userId, keys: envKeys }, 'workflow.user_provider_env_injected');
        }
        return env;
    }
    catch (err) {
        getLog().warn({ err: err, userId }, 'workflow.user_provider_env_resolve_failed');
        return {};
    }
}
/**
 * Resolve the artifacts and log directories for a workflow run.
 * Looks up the codebase by ID once, parses owner/repo, and returns project-scoped paths.
 * Falls back to cwd-based paths for unregistered repos.
 */
async function resolveProjectPaths(deps, cwd, workflowRunId, codebaseId) {
    if (codebaseId) {
        try {
            const codebase = await deps.store.getCodebase(codebaseId);
            if (codebase?.name) {
                const name = codebase.name.replace(/\.git$/, '');
                const parts = name.split('/');
                if (parts.length === 2) {
                    const [owner, repo] = parts;
                    return {
                        artifactsDir: (0, path_1.join)(cwd, '.chimera', 'artifacts', 'runs', workflowRunId),
                        logDir: (0, path_1.join)(cwd, '.chimera', 'logs'),
                    };
                }
                getLog().warn({ codebaseName: codebase.name }, 'codebase_name_not_owner_repo_format');
            }
        }
        catch (error) {
            getLog().error({ err: error, codebaseId }, 'project_paths_resolve_failed_using_fallback');
        }
    }
    return {
        artifactsDir: (0, path_1.join)(cwd, '.chimera', 'artifacts', 'runs', workflowRunId),
        logDir: (0, path_1.join)(cwd, '.chimera', 'logs'),
    };
}
/**
 * Hydrate an already-located resumable `WorkflowRun` candidate into the form
 * {@link executeWorkflow} expects. Returns `null` when the candidate has no
 * completed nodes and no interactive-loop gate state — nothing worth resuming.
 *
 * The return shape is spread-compatible with {@link ExecuteWorkflowOptions}
 * so callers can write `executeWorkflow(..., { ...hydrated, codebaseId })`.
 *
 * Throws on database errors; callers decide whether to surface or fall
 * through. The executor itself never performs this lookup — silent fallback
 * inside the executor was the cross-invocation auto-resume bug, so it stays
 * at the call site.
 */
async function hydrateResumableRun(deps, candidate) {
    const priorCompletedNodes = await deps.store.getCompletedDagNodeOutputs(candidate.id);
    const hasInteractiveLoopState = candidate.metadata?.approval !== undefined &&
        candidate.metadata.approval.type === 'interactive_loop';
    if (priorCompletedNodes.size === 0 && !hasInteractiveLoopState) {
        getLog().info({ resumableRunId: candidate.id }, 'workflow.dag_resume_skipped_no_completed_nodes');
        return null;
    }
    const preCreatedRun = await deps.store.resumeWorkflowRun(candidate.id);
    getLog().info({ workflowRunId: preCreatedRun.id, priorCompletedCount: priorCompletedNodes.size }, 'workflow.dag_resuming');
    return { preCreatedRun, priorCompletedNodes };
}
/**
 * Execute a complete DAG-based workflow.
 *
 * Required positional args carry identity and dependencies. Everything else
 * lives in `opts` ({@link ExecuteWorkflowOptions}). To resume a prior run,
 * call {@link hydrateResumableRun} first and spread its result into `opts` —
 * the executor does not perform resume detection on its own.
 */
async function executeWorkflow(deps, platform, conversationId, cwd, workflow, userMessage, conversationDbId, opts = {}) {
    const { codebaseId, issueContext, isolationContext, parentConversationId, preCreatedRun, priorCompletedNodes, userId, source, } = opts;
    // Load config once for the entire workflow execution
    let fileConfig;
    try {
        fileConfig = await deps.loadConfig(cwd);
    }
    catch (configErr) {
        getLog().error({ err: configErr, cwd }, 'workflow.config_load_failed');
        return { success: false, error: `Failed to load config: ${configErr.message}` };
    }
    const dbEnvVars = codebaseId
        ? await deps.store.getCodebaseEnvVars(codebaseId).catch((dbErr) => {
            getLog().warn({ err: dbErr, codebaseId }, 'workflow.db_env_vars_load_failed');
            return {};
        })
        : {};
    // Resolve a fresh bot GitHub token once at workflow start when:
    //   (a) the codebase URL is a github.com repo, and
    //   (b) deps.resolveBotGitHubToken is registered (App mode).
    // Injected into envVars so bash/script subprocesses authenticate `gh` and
    // initial `git push` via inherited GH_TOKEN. Workflows that run >1h still
    // need the credential helper for live token rotation (handled at clone
    // time in the GitHub adapter), but the env injection is enough for the
    // typical <1h workflow.
    const botGitHubEnv = await resolveBotGitHubEnvForWorkflow(deps, codebaseId);
    const userGitHubEnv = await resolveUserGithubEnvForWorkflow(deps, userId);
    const config = {
        ...fileConfig,
        // Order: file < db < bot-token < per-user. Per-codebase env vars are
        // operator-set; the injected bot token is system-set; the per-user override
        // wins last so a run routes through the originating human's token (or scrubs
        // the org/bot token when they haven't connected). Empty-string values from
        // the per-user policy scrub the corresponding key via the subprocess merge.
        envVars: { ...fileConfig.envVars, ...dbEnvVars, ...botGitHubEnv, ...userGitHubEnv },
    };
    const configuredCommandFolder = config.commands?.folder;
    // Auto-detect base branch when not configured. Config takes priority.
    // If detection fails, leave empty — substituteWorkflowVariables throws only if $BASE_BRANCH is referenced.
    let baseBranch;
    if (config.baseBranch) {
        baseBranch = config.baseBranch;
    }
    else {
        try {
            baseBranch = await getDefaultBranch(toRepoPath(cwd));
        }
        catch (error) {
            // Intentional fallback: auto-detection failure is non-fatal.
            // substituteWorkflowVariables throws if $BASE_BRANCH is actually referenced in a prompt.
            getLog().warn({ err: error, errorType: error.constructor.name, cwd }, 'workflow.base_branch_auto_detect_failed');
            baseBranch = '';
        }
    }
    const docsDir = config.docsPath ?? 'docs/';
    // Per-user AI prefs (Phase 3): the originating user's tiers/aliases/default-
    // assistant override install config (highest precedence). The dep contract is
    // non-throwing, but a third-party deps impl might throw anyway — guard so a
    // prefs failure can never abort a run; `{}` keeps config-only behavior.
    let userAiPrefs = {};
    if (userId && deps.getUserAiPrefs) {
        try {
            userAiPrefs = await deps.getUserAiPrefs(userId);
        }
        catch (error) {
            getLog().warn({ err: error, userId }, 'workflow.user_ai_prefs_resolve_failed');
        }
    }
    if (userAiPrefs?.tiers || userAiPrefs?.aliases || userAiPrefs?.defaultProvider) {
        getLog().debug({
            userId,
            tierKeys: Object.keys(userAiPrefs.tiers ?? {}),
            aliasKeys: Object.keys(userAiPrefs.aliases ?? {}),
            defaultProvider: userAiPrefs.defaultProvider,
        }, 'workflow.user_ai_prefs_applied');
    }
    let aiProfile;
    try {
        aiProfile = (0, model_validation_1.buildAiProfile)(userAiPrefs.defaultProvider ?? config.assistant, {
            repoTiers: config.tiers,
            repoAliases: config.aliases,
            userTiers: userAiPrefs.tiers,
            userAliases: userAiPrefs.aliases,
        });
    }
    catch (error) {
        // Structurally invalid STORED prefs (corrupt DB row) must not kill the run
        // before its record exists — degrade to config-only. A broken config layer
        // still fails fast: the rebuild below rethrows the same error.
        getLog().error({ err: error, userId }, 'workflow.user_ai_prefs_profile_invalid');
        aiProfile = (0, model_validation_1.buildAiProfile)(config.assistant, {
            repoTiers: config.tiers,
            repoAliases: config.aliases,
        });
    }
    // Resolve provider and model once (used by all nodes). Literal model strings
    // keep the existing workflow/provider/config chain; tier and @alias refs use
    // the resolved preset provider/model so bundled workflows are portable.
    let resolvedProvider = workflow.provider ?? config.assistant;
    let resolvedModel;
    let workflowPreset;
    let providerSource = workflow.provider ? 'workflow definition' : 'config';
    if (workflow.model) {
        const workflowModelSpec = (0, model_validation_1.resolveModelSpec)(aiProfile, workflow.model);
        if ((0, model_validation_1.isLiteralSpec)(workflowModelSpec)) {
            resolvedModel = workflowModelSpec.literal;
        }
        else {
            workflowPreset = workflowModelSpec;
            if (workflow.provider && workflow.provider !== workflowModelSpec.provider) {
                getLog().warn({
                    workflowName: workflow.name,
                    configuredProvider: workflow.provider,
                    resolvedProvider: workflowModelSpec.provider,
                    modelRef: workflow.model,
                }, 'workflow.model_provider_conflict');
                const delivered = await (0, executor_shared_1.safeSendMessage)(platform, conversationId, `Warning: Workflow '${workflow.name}' sets provider '${workflow.provider}' but model '${workflow.model}' resolves to provider '${workflowModelSpec.provider}' — using '${workflowModelSpec.provider}'.`);
                if (!delivered) {
                    getLog().error({ workflowName: workflow.name, conversationId }, 'workflow.model_provider_conflict_warning_delivery_failed');
                }
            }
            resolvedProvider = workflowModelSpec.provider;
            resolvedModel = workflowModelSpec.model;
            providerSource = `model preset '${workflow.model}'`;
        }
    }
    if (!isRegisteredProvider(resolvedProvider)) {
        throw new Error(`Workflow '${workflow.name}': unknown provider '${resolvedProvider}'. ` +
            `Registered: ${getRegisteredProviders()
                .map(p => p.id)
                .join(', ')}`);
    }
    const assistantDefaults = config.assistants[resolvedProvider];
    resolvedModel ??= assistantDefaults?.model;
    getLog().info({
        workflowName: workflow.name,
        provider: resolvedProvider,
        providerSource,
        model: resolvedModel,
    }, 'workflow_provider_resolved');
    if (configuredCommandFolder) {
        getLog().debug({ configuredCommandFolder }, 'command_folder_configured');
    }
    // Workflow run + resume state. Caller decides whether to resume by passing
    // preCreatedRun (from hydrateResumableRun) + priorCompletedNodes via opts.
    // When both are absent the executor creates a fresh row below.
    const dagPriorCompletedNodes = priorCompletedNodes;
    let workflowRun = preCreatedRun;
    if (preCreatedRun && priorCompletedNodes !== undefined) {
        const resumeMsg = priorCompletedNodes.size > 0
            ? `▶️ **Resuming** workflow \`${workflow.name}\` — skipping ${String(priorCompletedNodes.size)} already-completed node(s).\n\nNote: AI session context from prior nodes is not restored. Nodes that depend on prior context may need to re-read artifacts.`
            : `▶️ **Resuming** workflow \`${workflow.name}\` — continuing interactive loop.`;
        await (0, executor_shared_1.safeSendMessage)(platform, conversationId, resumeMsg);
    }
    if (!workflowRun) {
        // Create workflow run record
        try {
            workflowRun = await deps.store.createWorkflowRun({
                workflow_name: workflow.name,
                conversation_id: conversationDbId,
                codebase_id: codebaseId,
                user_message: userMessage,
                working_path: cwd,
                metadata: issueContext ? { github_context: issueContext } : {},
                parent_conversation_id: parentConversationId,
                user_id: userId,
            });
        }
        catch (error) {
            const err = error;
            getLog().error({ err, workflowName: workflow.name, conversationId }, 'db_create_workflow_run_failed');
            await sendCriticalMessage(platform, conversationId, '❌ **Workflow failed**: Unable to start workflow (database error). Please try again later.');
            return { success: false, error: 'Database error creating workflow run' };
        }
    }
    // Path-lock guard: ensure no other workflow run holds this working_path.
    //
    // Skipped when `workflow.mutates_checkout` is false — the author asserts
    // that concurrent runs will not race (e.g. all writes are per-run-scoped).
    //
    // Runs after workflowRun is finalized (pre-created, resumed, or freshly
    // created) so we always have self-ID + started_at for the deterministic
    // older-wins tiebreaker. The query treats `pending` rows older than 5 min
    // as orphaned, so leaks from crashed dispatches or resume orphans don't
    // permanently block the path.
    if (workflow.mutates_checkout !== false) {
        try {
            const startedAtMs = (0, duration_1.parseDbTimestamp)(workflowRun.started_at);
            const activeWorkflow = await deps.store.getActiveWorkflowRunByPath(cwd, {
                id: workflowRun.id,
                startedAt: new Date(Number.isNaN(startedAtMs) ? Date.now() : startedAtMs),
            });
            if (activeWorkflow) {
                // The lock query found another active row that wins the older-wins
                // tiebreaker. Mark our own row terminal so it falls out of the
                // active set immediately — without this, our row sits as
                // pending/running and blocks the path until the 5-min stale window
                // (or never, if we'd already promoted it to running via resume).
                await deps.store
                    .updateWorkflowRun(workflowRun.id, { status: 'cancelled' })
                    .catch((cleanupErr) => {
                    getLog().warn({ err: cleanupErr, workflowRunId: workflowRun?.id, cwd }, 'workflow.guard_self_cancel_failed');
                });
                const activeStartedMs = (0, duration_1.parseDbTimestamp)(activeWorkflow.started_at);
                const elapsedMs = Date.now() - (Number.isNaN(activeStartedMs) ? Date.now() : activeStartedMs);
                const duration = (0, duration_1.formatDuration)(elapsedMs);
                const shortId = activeWorkflow.id.slice(0, 8);
                // Status-aware copy. The lock query returns running, paused, and
                // fresh-pending rows — telling the user to "wait for it to finish"
                // is wrong for `paused` (waiting on user action via approve/reject).
                let stateLine;
                let actionLines;
                if (activeWorkflow.status === 'paused') {
                    stateLine = `paused waiting for user input (${duration} since started, run \`${shortId}\`)`;
                    actionLines =
                        `• Approve it: \`/workflow approve ${shortId}\`\n` +
                            `• Reject it: \`/workflow reject ${shortId}\`\n` +
                            `• Cancel it: \`/workflow cancel ${shortId}\`\n` +
                            '• Use a different branch: `--branch <other>`';
                }
                else {
                    const verb = activeWorkflow.status === 'pending' ? 'starting' : 'running';
                    stateLine = `${verb} ${duration}, run \`${shortId}\``;
                    actionLines =
                        '• Wait for it to finish: `/workflow status`\n' +
                            `• Cancel it: \`/workflow cancel ${shortId}\`\n` +
                            '• Use a different branch: `--branch <other>`';
                }
                await sendCriticalMessage(platform, conversationId, `❌ **This worktree is in use** by \`${activeWorkflow.workflow_name}\` ` +
                    `(${stateLine}).\n${actionLines}`);
                return {
                    success: false,
                    error: `Workflow already active on this path (${activeWorkflow.status}): ${activeWorkflow.workflow_name}`,
                };
            }
        }
        catch (error) {
            const err = error;
            getLog().error({ err, conversationId, cwd, pendingRunId: workflowRun.id }, 'db_active_workflow_check_failed');
            // Release the lock token. workflowRun is finalized at this point
            // (pre-created or resumed or freshly created) and would otherwise sit
            // as pending/running, blocking the path. For pending the 5-min stale
            // window would clear it eventually; for a row already promoted to
            // running (e.g., resumed), nothing would clear it without manual
            // intervention.
            await deps.store
                .updateWorkflowRun(workflowRun.id, { status: 'cancelled' })
                .catch((cleanupErr) => {
                getLog().warn({ err: cleanupErr, workflowRunId: workflowRun?.id }, 'workflow.guard_query_failure_cleanup_failed');
            });
            await sendCriticalMessage(platform, conversationId, '❌ **Workflow blocked**: Unable to verify if another workflow is running (database error). Please try again in a moment.');
            return { success: false, error: 'Database error checking for active workflow' };
        }
    }
    // Resolve external artifact and log directories
    const { artifactsDir, logDir } = await resolveProjectPaths(deps, cwd, workflowRun.id, codebaseId);
    // Pre-create the artifacts directory so commands can write to it immediately
    try {
        await (0, promises_1.mkdir)(artifactsDir, { recursive: true });
    }
    catch (error) {
        const err = error;
        getLog().error({ err, artifactsDir, workflowRunId: workflowRun.id }, 'workflow.artifacts_dir_create_failed');
        await deps.store
            .failWorkflowRun(workflowRun.id, `Artifacts directory creation failed: ${err.message}`)
            .catch((dbErr) => {
            getLog().error({ err: dbErr, workflowRunId: workflowRun.id }, 'workflow.artifacts_dir_fail_db_record_failed');
        });
        await sendCriticalMessage(platform, conversationId, `❌ **Workflow failed**: Could not create artifacts directory \`${artifactsDir}\`: ${err.message}`);
        return {
            success: false,
            workflowRunId: workflowRun.id,
            error: `Artifacts directory creation failed: ${err.message}`,
        };
    }
    getLog().debug({ artifactsDir, logDir }, 'workflow_paths_resolved');
    // Per-user AI-provider credentials (Phase 2). Resolved AFTER artifactsDir is
    // created because file-based deliveries (Codex `CODEX_HOME/auth.json`) live
    // under it. Merged LAST into config.envVars so the originating user's keys
    // win over file/db/bot-github env — preserves the GitHub merge order and
    // keeps the no-key path byte-for-byte unchanged (resolveUserProviderEnvForWorkflow
    // returns {} when the feature is disabled or no userId is present).
    const userProviderEnv = await resolveUserProviderEnvForWorkflow(deps, userId, artifactsDir);
    config.envVars = { ...config.envVars, ...userProviderEnv };
    // Wrap execution in try-catch to ensure workflow is marked as failed on any error
    try {
        getLog().info({
            workflowName: workflow.name,
            workflowRunId: workflowRun.id,
            hasIssueContext: !!issueContext,
            issueContextLength: issueContext?.length ?? 0,
        }, 'workflow_starting');
        await (0, logger_1.logWorkflowStart)(logDir, workflowRun.id, workflow.name, userMessage);
        // Register run with emitter and emit workflow_started
        const emitter = (0, event_emitter_1.getWorkflowEventEmitter)();
        emitter.registerRun(workflowRun.id, conversationId);
        emitter.emit({
            type: 'workflow_started',
            runId: workflowRun.id,
            workflowName: workflow.name,
            conversationId: conversationDbId,
        });
        // Fire-and-forget anonymous usage telemetry. Categorical only: bundled
        // workflows report their real name, custom ones report "custom". No PII —
        // descriptions/prompts/paths are never sent. Machine context + version ride
        // along as super-properties. Opt out: ARCHON_TELEMETRY_DISABLED=1 / DO_NOT_TRACK=1.
        captureWorkflowInvoked({
            workflowName: workflow.name,
            workflowSource: source,
            platform: platform.getPlatformType(),
            provider: resolvedProvider,
            model: resolvedModel,
            nodeCount: workflow.nodes.length,
            usesLoop: workflow.nodes.some(dag_node_1.isLoopNode),
            usesApproval: workflow.nodes.some(dag_node_1.isApprovalNode),
            usesScript: workflow.nodes.some(dag_node_1.isScriptNode),
            usesBash: workflow.nodes.some(dag_node_1.isBashNode),
            usesOutputFormat: workflow.nodes.some(n => n.output_format !== undefined),
            usesOutputType: workflow.nodes.some(n => n.output_type !== undefined),
            usedIsolation: isolationContext !== undefined,
            isResume: dagPriorCompletedNodes !== undefined,
        });
        deps.store
            .createWorkflowEvent({
            workflow_run_id: workflowRun.id,
            event_type: 'workflow_started',
            data: { workflowName: workflow.name },
        })
            .catch((err) => {
            getLog().error({ err, workflowRunId: workflowRun.id, eventType: 'workflow_started' }, 'workflow_event_persist_failed');
        });
        // Set status to running now that execution has started (skip for resumed runs — already running)
        if (!dagPriorCompletedNodes) {
            try {
                await deps.store.updateWorkflowRun(workflowRun.id, { status: 'running' });
            }
            catch (dbError) {
                getLog().error({ err: dbError, workflowRunId: workflowRun.id }, 'db_workflow_status_update_failed');
                await sendCriticalMessage(platform, conversationId, 'Workflow blocked: Unable to update status. Please try again.');
                return { success: false, error: 'Database error setting workflow to running' };
            }
        }
        // Context for error logging
        const workflowContext = {
            workflowId: workflowRun.id,
        };
        // Build startup message
        let startupMessage = '';
        // Add isolation context to startup message
        if (isolationContext) {
            const { isPrReview, prSha, prBranch, branchName } = isolationContext;
            if (isPrReview && prSha && prBranch) {
                startupMessage += `Reviewing PR at commit \`${prSha.substring(0, 7)}\` (branch: \`${prBranch}\`)\n\n`;
            }
            else if (branchName) {
                const repoName = cwd.split(/[/\\]/).pop() || 'repository';
                await sendCriticalMessage(platform, conversationId, `📍 ${repoName} @ \`${branchName}\``, workflowContext, 2, { category: 'isolation_context', segment: 'new' });
            }
            else {
                getLog().warn({
                    workflowId: workflowRun.id,
                    hasFields: {
                        isPrReview: !!isPrReview,
                        prSha: !!prSha,
                        prBranch: !!prBranch,
                        branchName: !!branchName,
                    },
                }, 'isolation_context_incomplete');
            }
        }
        // Add workflow start message (step details omitted from text notification)
        // Strip routing metadata from description (Use when:, Handles:, NOT for:, Capability:, Triggers:)
        const cleanDescription = (workflow.description ?? '')
            .split('\n')
            .filter(line => !/^\s*(Use when|Handles|NOT for|Capability|Triggers)[:\s]/i.test(line) && line.trim())
            .join('\n')
            .trim();
        const descriptionText = cleanDescription || workflow.name;
        startupMessage += `🚀 **Starting workflow**: \`${workflow.name}\`\n\n> ${descriptionText}`;
        // Send consolidated message - use critical send with limited retries (1 retry max)
        // to avoid blocking workflow execution while still catching transient failures
        const startupSent = await sendCriticalMessage(platform, conversationId, startupMessage, workflowContext, 2, // maxRetries=2 means 2 total attempts (1 initial + 1 retry), 1s max delay
        { category: 'workflow_status', segment: 'new' });
        if (!startupSent) {
            getLog().error({ workflowId: workflowRun.id, conversationId }, 'startup_message_delivery_failed');
            // Continue anyway - workflow is already recorded in database
        }
        // Execute the DAG workflow
        const dagSummary = await (0, dag_executor_1.executeDagWorkflow)(deps, platform, conversationId, cwd, workflow, workflowRun, resolvedProvider, resolvedModel, artifactsDir, logDir, baseBranch, docsDir, config, configuredCommandFolder, issueContext, dagPriorCompletedNodes, source, aiProfile, workflowPreset);
        // executeDagWorkflow throws on fatal errors; check DB status for result.
        // Wrap in try-catch so a transient DB failure doesn't mask workflow success.
        try {
            const finalStatus = await deps.store.getWorkflowRun(workflowRun.id);
            if (finalStatus?.status === 'completed') {
                return { success: true, workflowRunId: workflowRun.id, summary: dagSummary };
            }
            else if (finalStatus?.status === 'paused') {
                return { success: true, paused: true, workflowRunId: workflowRun.id };
            }
            else if (finalStatus === null && dagSummary !== undefined) {
                // Run was deleted from DB (e.g. cleanup job) but executor reports success — treat as success
                getLog().warn({ workflowRunId: workflowRun.id }, 'workflow.run_not_found_but_dag_succeeded');
                return { success: true, workflowRunId: workflowRun.id, summary: dagSummary };
            }
            else {
                return {
                    success: false,
                    workflowRunId: workflowRun.id,
                    error: 'Workflow did not complete successfully',
                };
            }
        }
        catch (dbError) {
            // Database query failed — assume success since executeDagWorkflow didn't throw.
            // The DAG executor handles its own failure paths (failWorkflowRun + events).
            getLog().error({ err: dbError, workflowRunId: workflowRun.id }, 'workflow.final_status_query_failed');
            if (dagSummary !== undefined) {
                return { success: true, workflowRunId: workflowRun.id, summary: dagSummary };
            }
            else {
                return { success: false, workflowRunId: workflowRun.id, error: 'Workflow status unknown (DB query failed)' };
            }
        }
    }
    catch (error) {
        // Top-level error handler: ensure workflow is marked as failed
        const err = error;
        const runId = workflowRun?.id;
        getLog().error({ err, workflowName: workflow.name, workflowId: runId }, 'workflow_execution_unhandled_error');
        // Record failure in database (non-blocking - log but don't re-throw on DB error)
        if (runId) {
            try {
                await deps.store.failWorkflowRun(runId, err.message);
            }
            catch (dbError) {
                getLog().error({ err: dbError, workflowId: runId, originalError: err.message }, 'db_record_failure_failed');
            }
            // Log to file (separate from database - non-blocking)
            try {
                await (0, logger_1.logWorkflowError)(logDir, runId, err.message);
            }
            catch (logError) {
                getLog().error({ err: logError, workflowId: runId }, 'workflow_error_log_write_failed');
            }
            // Emit workflow_failed event
            const emitter = (0, event_emitter_1.getWorkflowEventEmitter)();
            emitter.emit({
                type: 'workflow_failed',
                runId,
                workflowName: workflow.name,
                error: err.message,
            });
            // Anonymous telemetry for the unhandled-throw failure path. The DAG-internal
            // failure paths (no/partial completion) fire their own captureWorkflowCompleted
            // and return without throwing, so this only covers genuine unhandled errors —
            // no double-count. Duration/node-counts are not in scope here.
            captureWorkflowCompleted({
                outcome: 'failed',
                workflowName: workflow.name,
                workflowSource: source,
                provider: resolvedProvider,
                exitReason: 'unhandled_error',
                // Categorical class only (fatal/transient/unknown) — err.message never leaves.
                errorClass: (0, executor_shared_1.toTelemetryErrorClass)((0, executor_shared_1.classifyError)(err)),
            });
            deps.store
                .createWorkflowEvent({
                workflow_run_id: runId,
                event_type: 'workflow_failed',
                data: { error: err.message },
            })
                .catch((evtErr) => {
                getLog().error({ err: evtErr, workflowRunId: runId, eventType: 'workflow_failed' }, 'workflow_event_persist_failed');
            });
            emitter.unregisterRun(runId);
            // Notify user about the failure
            const delivered = await sendCriticalMessage(platform, conversationId, `❌ **Workflow failed**: ${err.message}`);
            if (!delivered) {
                getLog().error({ workflowId: runId, originalError: err.message }, 'user_failure_notification_failed');
            }
        }
        // Return failure result instead of re-throwing
        return { success: false, workflowRunId: runId, error: err.message };
    }
    finally {
        // Defensive backstop: if the workflow run is still 'running' after all
        // normal and exceptional code paths, flip it to 'failed' to prevent zombie
        // accumulation. Guards against any future code path that exits without
        // calling failWorkflowRun (e.g. a generator cleanup that exits without
        // throwing). Only fires when the process stays alive long enough to run
        // this finally — see #1561 for the originating zombie-state incident.
        if (workflowRun) {
            const runId = workflowRun.id;
            const backstopStatus = await deps.store.getWorkflowRunStatus(runId).catch(() => null);
            if (backstopStatus === 'running') {
                getLog().warn({ workflowRunId: runId }, 'executor.backstop_triggered');
                await deps.store
                    .failWorkflowRun(runId, 'Workflow exited without finalizing — see logs')
                    .catch((err) => {
                    getLog().error({ err, workflowRunId: runId }, 'executor.backstop_fail_failed');
                });
            }
        }
    }
}
//# sourceMappingURL=executor.js.map