import { createInterface } from 'node:readline';
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

export type PermissionChecker = (
  tool: string,
  params: Record<string, unknown>,
) => PermissionDecision;

/**
 * Run pre-tool-use hooks. Returns the (possibly mutated) params and a block
 * decision. Hooks never throw into the tool path — failures are logged and
 * ignored so the agent keeps working (mirrors grok-build's suppressErrors).
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
  return process.env.NONINTERACTIVE === '1' || autoApprove;
}

let autoApprove = false;
/** Force auto-approval for headless/automation contexts (e.g. CLI --yes). */
export function setAutoApprove(value: boolean): void {
  autoApprove = value;
}

function promptAsk(toolName: string): Promise<PermissionDecision> {
  if (isAutoApproveEnabled()) return Promise.resolve('allow');
  if (!process.stdin.isTTY) return Promise.resolve('deny');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`Allow tool "${toolName}" to run? [y/N]: `, (line) => {
      rl.close();
      resolve(/^(y|yes)$/i.test(line.trim()) ? 'allow' : 'deny');
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

    // Pre-tool-use hooks — gate or mutate before validation/execution.
    // Lazily load workspace hooks on first call (no-op if none configured).
    if (this.hooks && context.workspaceRoot) {
      try {
        await this.hooks.loadFromWorkspace(context.workspaceRoot);
      } catch {
        // ignore load errors — no hooks is a valid state
      }
      const pre = await runPreHooks(this.hooks, toolName, params, context);
      if (pre.blocked) {
        return {
          success: false,
          error: `Blocked by pre-tool-use hook: ${pre.reason ?? 'no reason given'}`,
          duration: 0,
        };
      }
      params = pre.params;
    }

    // Coerce model-emitted string args into the types the schema expects
    // (small models often send booleans/numbers as JSON strings).
    const coerced = this.registry.coerceParams(toolName, params);

    // Validate params
    const validation = this.registry.validateParams(toolName, coerced);
    if (!validation.valid) {
      return {
        success: false,
        error: `Parameter validation failed: ${validation.errors?.join(', ')}`,
        duration: 0,
      };
    }

    // Check permission. A policy engine (if set) wins over the callback.
    const decision: PermissionDecision = this.permissionEngine
      ? this.permissionEngine.check(toolName, params)
      : this.permissionCheck(toolName, params);
    if (decision === 'deny') {
      return {
        success: false,
        error: `Permission denied for tool "${toolName}"`,
        duration: 0,
      };
    }

    if (decision === 'ask') {
      // Emit event requesting permission, then block on a real prompt.
      context.eventStream.append({
        type: 'tool_call_requested',
        call: { tool: toolName, args: params },
        policy: 'ask',
      });

      const granted = await promptAsk(toolName);
      if (granted !== 'allow') {
        return {
          success: false,
          error: `Permission denied for tool "${toolName}"`,
          duration: 0,
        };
      }
    }

    // Execute
    const result = await this.registry.execute(toolName, coerced, context);

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
}
