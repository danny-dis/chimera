import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import type { ToolRegistry } from './tool-registry.js';
import type { ToolContext, ToolResult, PermissionDecision } from './tool-schema.js';
import type { PermissionEngine } from './permission/policy.js';
import { HookExecutor } from './hooks/executor.js';
import type { FileDiff } from './diff-util.js';

/**
 * Pull any unified diffs off a tool result so they can ride along on the
 * `tool_call_result` event.
 *
 * The mutating file tools expose a single `diff`; `apply_patch` exposes a
 * per-file `diffs` array. Both are optional and purely additive, so anything
 * unrecognized yields no `diffs` key at all.
 */
interface EventFileDiff {
  path: string;
  patch: string;
  unchanged: boolean;
  binary: boolean;
  truncated: boolean;
  additions: number;
  deletions: number;
}

function toEventDiff(d: FileDiff): EventFileDiff {
  // Project onto exactly the fields the event carries, so tool-local additions
  // to FileDiff never silently widen the event contract.
  return {
    path: d.path,
    patch: d.patch,
    unchanged: d.unchanged,
    binary: d.binary,
    truncated: d.truncated,
    additions: d.additions,
    deletions: d.deletions,
  };
}

function extractDiffs(data: unknown): { diffs?: EventFileDiff[] } {
  if (data === null || typeof data !== 'object') return {};
  const d = data as { diff?: unknown; diffs?: unknown };

  const isDiff = (v: unknown): v is FileDiff =>
    v !== null && typeof v === 'object' && typeof (v as FileDiff).path === 'string';

  if (isDiff(d.diff)) return { diffs: [toEventDiff(d.diff)] };

  if (Array.isArray(d.diffs)) {
    // apply_patch nests each FileDiff alongside a `previewApplied` flag.
    const collected = d.diffs
      .map((entry) => {
        if (isDiff(entry)) return entry;
        const nested = (entry as { diff?: unknown } | null)?.diff;
        return isDiff(nested) ? nested : null;
      })
      .filter((v): v is FileDiff => v !== null)
      .map(toEventDiff);
    if (collected.length > 0) return { diffs: collected };
  }

  return {};
}

/**
 * Deep-copy tool params at the trust boundary so a permission callback, a
 * hook, or a concurrent caller still holding the original reference cannot
 * change the values that were authorized before they reach execution.
 */
function cloneParams(params: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(params);
}

const cancelledResult = (): ToolResult => ({
  success: false,
  error: 'Execution cancelled',
  duration: 0,
});

const deniedResult = (toolName: string): ToolResult => ({
  success: false,
  error: `Permission denied for tool "${toolName}"`,
  duration: 0,
});

export type PermissionChecker = (
  tool: string,
  params: Record<string, unknown>,
) => PermissionDecision;

/**
 * Run pre-tool-use hooks. Returns the (possibly mutated) params and a block
 * decision. Hooks never throw into the tool path — failures are logged and
 * ignored so the agent keeps working (mirrors grok-build's suppressErrors).
 * `canModify` gating lives inside HookExecutor: it only surfaces
 * `modifiedParams` for hooks that are allowed to rewrite the call.
 */
async function runPreHooks(
  hooks: HookExecutor | undefined,
  toolName: string,
  params: Record<string, unknown>,
  context: ToolContext,
): Promise<{ params: Record<string, unknown>; blocked: boolean; reason?: string }> {
  if (!hooks) return { params, blocked: false };
  let effective = params;
  const results = await hooks.executeHooks('pre-tool-use', {
    event: 'pre-tool-use',
    toolName,
    params: effective,
    // Surface args to hook command/inline-script env as ARGS (JSON) so
    // a gate hook can inspect the call (e.g. veto `rm -rf`).
    data: { args: JSON.stringify(effective), tool: toolName, session: context.sessionId },
    workspaceRoot: context.workspaceRoot ?? '',
    sessionId: context.sessionId,
  });
  for (const r of results) {
    if (r.modifiedParams) effective = r.modifiedParams;
    if (r.block) {
      return { params: effective, blocked: true, reason: r.reason };
    }
  }
  return { params: effective, blocked: false };
}

/**
 * Blocking prompt for an 'ask' decision. Returns 'allow' or 'deny'.
 *
 * In non-interactive contexts (no TTY) the historic default was 'deny' so
 * automation never silently approved a side-effecting action. But that made
 * headless builds (background runs, CI) unable to ever write to disk: the
 * agents could read the repo but every destructive tool was auto-denied, so
 * deliverables never landed. We now honor an explicit opt-in headless signal
 * (NONINTERACTIVE=1, or setAutoApprove()) and auto-ALLOW when it is set —
 * the caller must opt in deliberately, so an accidental non-TTY pipe still
 * defaults to 'deny'.
 */
function isAutoApproveEnabled(): boolean {
  // Headless/auto-approval: NONINTERACTIVE=1, --yolo (autoApprove flag), or
  // explicit CHIMERA_AUTOAPPROVE=1 all enable auto-approval. The check is
  // deliberately permissive so background/CI runs never stall on a prompt.
  return process.env.NONINTERACTIVE === '1' 
    || process.env.CHIMERA_AUTOAPPROVE === '1'
    || autoApprove;
}

let autoApprove = false;
/** Force auto-approval for headless/automation contexts (e.g. CLI --yes). */
export function setAutoApprove(value: boolean): void {
  autoApprove = value;
}

function promptAsk(toolName: string, signal?: AbortSignal): Promise<PermissionDecision> {
  if (signal?.aborted) return Promise.resolve('deny');
  if (isAutoApproveEnabled()) return Promise.resolve('allow');
  if (!process.stdin.isTTY) return Promise.resolve('deny');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (decision: PermissionDecision) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', deny);
      rl.removeListener('close', deny);
      rl.close();
      resolve(decision);
    };
    const deny = () => finish('deny');
    signal?.addEventListener('abort', deny, { once: true });
    rl.once('close', deny);
    if (signal?.aborted) { deny(); return; }
    rl.question(`Allow tool "${toolName}" to run? [y/N]: `, (line) => {
      finish(/^(y|yes)$/i.test(line.trim()) ? 'allow' : 'deny');
    });
  });
}

export class ToolExecutor {
  private registry: ToolRegistry;
  private permissionCheck: PermissionChecker;
  private permissionEngine?: PermissionEngine;
  private hooks?: HookExecutor;

  constructor(
    registry: ToolRegistry,
    permissionCheck: PermissionChecker,
    permissionEngine?: PermissionEngine,
    hooks?: HookExecutor,
  ) {
    this.registry = registry;
    this.permissionCheck = permissionCheck;
    this.permissionEngine = permissionEngine;
    this.hooks = hooks;
  }

  /** Attach a hook executor; hooks are loaded lazily per workspace. */
  setHookExecutor(hooks: HookExecutor): void {
    this.hooks = hooks;
  }

  /** Swap in a policy engine at startup (e.g. read-only mode toggle). */
  setPermissionEngine(engine: PermissionEngine): void {
    this.permissionEngine = engine;
  }

  /**
   * Single authorization seam. Every decision routes through the same
   * evaluator (a policy engine wins over the callback) and fails CLOSED if
   * the evaluator throws — a policy exception must never be read as an allow.
   */
  private evaluate(toolName: string, params: Record<string, unknown>): PermissionDecision {
    try {
      return this.permissionEngine
        ? this.permissionEngine.check(toolName, params)
        : this.permissionCheck(toolName, params);
    } catch {
      return 'deny';
    }
  }

  /**
   * Coerce model-emitted string scalars and apply the schema's defaults using
   * the registry's existing logic, so the values we authorize are exactly the
   * values the tool will execute. Authorizing the RAW args let a coerced
   * boolean (`'true'` -> `true`) or a schema default (`overwrite: true`) slip
   * past the policy and reach execution. Returns the same validation-error
   * shape callers already expect when the params cannot be parsed.
   */
  private normalize(
    toolName: string,
    params: Record<string, unknown>,
  ): { ok: true; params: Record<string, unknown> } | { ok: false; error: string } {
    const coerced = this.registry.coerceParams(toolName, params);
    try {
      // parseParams == tool.parameters.parse: applies defaults and is
      // idempotent for these schemas (none use .transform()). The registry
      // re-parses the same values at execution, so what we check here is
      // exactly what runs — no second validation path is introduced.
      return { ok: true, params: this.registry.parseParams(toolName, coerced) };
    } catch (err: unknown) {
      const zodErrors = (err as { errors?: Array<{ path: Array<string | number>; message: string }> }).errors;
      const message = Array.isArray(zodErrors)
        ? zodErrors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
        : err instanceof Error
          ? err.message
          : String(err);
      return { ok: false, error: `Parameter validation failed: ${message}` };
    }
  }

  async execute(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    // Check tool exists
    const tool = this.registry.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${toolName}" not found`,
        duration: 0,
      };
    }

    // Pre-aborted signal: refuse to execute
    if (context.signal?.aborted) {
      return cancelledResult();
    }

    // Normalize (coerce + schema defaults) BEFORE authorization. The policy
    // must see the exact values the tool will execute — not the raw model
    // args, which can differ once coerced or defaulted.
    const normalized = this.normalize(toolName, params);
    if (normalized.ok === false) {
      return { success: false, error: normalized.error, duration: 0 };
    }

    // Snapshot the exact authorized values. A callback, a hook, or a caller
    // holding the original object can no longer change what we execute.
    let execParams: Record<string, unknown>;
    try { execParams = cloneParams(normalized.params); }
    catch { return deniedResult(toolName); }

    // Authorize on the normalized values BEFORE hooks run, so a hook cannot
    // downgrade a deny/ask into an allow.
    const originalDecision = this.evaluate(toolName, cloneParams(execParams));
    if (originalDecision === 'deny') return deniedResult(toolName);
    if (context.signal?.aborted) return cancelledResult();

    if (originalDecision === 'ask') {
      const outcome = await this.promptForApproval(tool, toolName, execParams, context);
      if (outcome === 'aborted') return cancelledResult();
      if (outcome === 'deny') return deniedResult(toolName);
    }

    // Pre-tool-use hooks — gate or mutate before execution.
    // Lazily load workspace hooks on first call (no-op if none configured).
    if (this.hooks && context.workspaceRoot) {
      try {
        await this.hooks.loadFromWorkspace(context.workspaceRoot);
      } catch {
        // ignore load errors — no hooks is a valid state
      }
      if (context.signal?.aborted) {
        return cancelledResult();
      }

      const pre = await runPreHooks(this.hooks, toolName, cloneParams(execParams), context);
      if (context.signal?.aborted) {
        return cancelledResult();
      }
      if (pre.blocked) {
        return {
          success: false,
          error: `Blocked by pre-tool-use hook: ${pre.reason ?? 'no reason given'}`,
          duration: 0,
        };
      }

      if (pre.params !== execParams) {
        // A hook rewrote the args. Re-normalize and re-authorize ONLY if the
        // normalized values actually changed (deep equality) — a legitimate
        // rewrite must still pass policy, but an unchanged call must not ask
        // twice. The re-check uses the same evaluator contract as the first.
        const rewritten = this.normalize(toolName, pre.params);
        if (rewritten.ok === false) {
          return { success: false, error: rewritten.error, duration: 0 };
        }
        if (!isDeepStrictEqual(rewritten.params, execParams)) {
          let rewrittenParams: Record<string, unknown>;
          try { rewrittenParams = cloneParams(rewritten.params); }
          catch { return deniedResult(toolName); }
          const decision = this.evaluate(toolName, cloneParams(rewrittenParams));
          if (decision === 'deny') return deniedResult(toolName);
          if (context.signal?.aborted) return cancelledResult();
          if (decision === 'ask') {
            const outcome = await this.promptForApproval(tool, toolName, rewrittenParams, context);
            if (outcome === 'aborted') return cancelledResult();
            if (outcome === 'deny') return deniedResult(toolName);
          }
          execParams = rewrittenParams;
        }
      }
    }

    // Execute
    if (context.signal?.aborted) {
      return cancelledResult();
    }
    let result = await this.registry.execute(toolName, execParams, context);

    // ── Self-healing overwrite retry (edit-path reliability) ─────────────
    // Models routinely emit `write_file` WITHOUT `overwrite` when their intent
    // is clearly to modify an existing file (they just produced the complete
    // new content). The tool's default of `overwrite:false` then refuses the
    // write ("File already exists..."), the generic retry replays identical
    // args into the same wall, and the run ends needs_user while claiming
    // success in prose. When the ONLY failure reason is that missing flag,
    // retry once with `overwrite:true` injected — the model's full-content
    // rewrite IS the user-visible intent; all other guards (truncation check,
    // sandbox, lint) still run inside the tool. The changed args are routed
    // through the same authorization boundary (deny/ask/allow) as the initial
    // dispatch — never a direct registry bypass.
    if (
      !result.success &&
      toolName === 'write_file' &&
      typeof (result.error ?? '') === 'string' &&
      /File already exists and overwrite is false/i.test(result.error ?? '')
    ) {
      if (context.signal?.aborted) {
        return cancelledResult();
      }
      const retryParams = { ...execParams, overwrite: true };
      const retryDecision = this.evaluate(toolName, cloneParams(retryParams));
      // The evaluator (or its callback) may abort the owned signal as a side
      // effect — honor it before dispatching the retry.
      if (context.signal?.aborted) {
        return cancelledResult();
      }
      if (retryDecision === 'deny') return result;
      if (retryDecision === 'ask') {
        const outcome = await this.promptForApproval(tool, toolName, retryParams, context);
        if (outcome === 'aborted') return cancelledResult();
        if (outcome === 'deny') return result;
      }
      context.eventStream.append({
        type: 'tool_call_retry',
        tool: toolName,
        error: 'missing overwrite flag — retrying with overwrite:true',
      } as any);
      result = await this.registry.execute(toolName, retryParams, context);
    }

    // Emit result event. Mutating file tools attach a unified diff of what
    // they wrote; lift it onto the event so the UI can show the user the
    // actual change instead of a raw JSON blob.
    context.eventStream.append({
      type: 'tool_call_result',
      result: {
        tool: toolName,
        output: result.success
          ? JSON.stringify(result.data)
          : result.error ?? 'unknown error',
        exitCode: result.success ? 0 : 1,
        ...(result.success ? extractDiffs(result.data) : {}),
      },
    });

    return result;
  }

  /**
   * Shared approval gate for 'ask' decisions. Computes a pre-write diff
   * preview (best-effort), emits the tool_call_requested event, then blocks
   * on a real prompt. Returns 'allow', 'deny', or 'aborted'. Reused by the
   * initial dispatch, the post-hook re-check, and the overwrite retry so all
   * three route through the same boundary.
   */
  private async promptForApproval(
    tool: { name: string; previewDiff?: (params: Record<string, unknown>, context: ToolContext) => Promise<FileDiff[] | null> },
    toolName: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<'allow' | 'deny' | 'aborted'> {
    let preview: EventFileDiff[] | undefined;
    if (tool.previewDiff) {
      try {
        const diffs = await tool.previewDiff(cloneParams(params), context);
        preview = diffs && diffs.length > 0 ? diffs.map(toEventDiff) : undefined;
      } catch {
        preview = undefined;
      }
    }

    context.eventStream.append({
      type: 'tool_call_requested',
      call: { tool: toolName, args: cloneParams(params) },
      policy: 'ask',
      ...(preview ? { diffs: preview } : {}),
    } as Parameters<typeof context.eventStream.append>[0]);

    const granted = await promptAsk(toolName, context.signal);
    if (context.signal?.aborted) return 'aborted';
    return granted === 'allow' ? 'allow' : 'deny';
  }
}
