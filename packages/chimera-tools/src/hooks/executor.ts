/**
 * HookExecutor — runs hook scripts and manages hook lifecycle.
 *
 * Supports both inline scripts and external commands. Handles timeouts,
 * error suppression, and param modification.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import type { HookDefinition, HookContext, HookResult } from './schema.js';

export interface HookExecutorOptions {
  /** Default timeout for hooks in ms */
  defaultTimeout?: number;
  /** Whether to suppress hook errors (default: true) */
  suppressErrors?: boolean;
  /** Working directory fallback */
  defaultCwd?: string;
}

export class HookExecutor {
  private hooks: HookDefinition[] = [];
  private options: Required<HookExecutorOptions>;

  constructor(options?: HookExecutorOptions) {
    this.options = {
      defaultTimeout: options?.defaultTimeout ?? 30_000,
      suppressErrors: options?.suppressErrors ?? true,
      defaultCwd: options?.defaultCwd ?? process.cwd(),
    };
  }

  /**
   * Register a hook definition.
   */
  register(hook: HookDefinition): void {
    this.hooks.push(hook);
    // Sort by priority
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Register multiple hooks.
   */
  registerAll(hooks: HookDefinition[]): void {
    for (const hook of hooks) {
      this.register(hook);
    }
  }

  /**
   * Load hooks from a YAML config file.
   */
  async loadFromFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let parsed: unknown;
      try {
        const yaml = await import('yaml');
        parsed = yaml.parse(content);
      } catch {
        try {
          const jsYaml = await import('js-yaml');
          parsed = jsYaml.load(content);
        } catch {
          parsed = JSON.parse(content);
        }
      }

      const hooks = (parsed as { hooks?: HookDefinition[] })?.hooks ?? [];
      this.registerAll(hooks);
    } catch {
      // File not found or parse error — skip
    }
  }

  /**
   * Load hooks from .chimera/hooks.yaml in the workspace.
   */
  async loadFromWorkspace(workspaceRoot: string): Promise<void> {
    const hooksPath = path.join(workspaceRoot, '.chimera', 'hooks.yaml');
    await this.loadFromFile(hooksPath);
  }

  /**
   * Execute all hooks for a given event.
   * Returns results in priority order.
   */
  async executeHooks(
    event: string,
    context: HookContext,
  ): Promise<HookResult[]> {
    const matching = this.hooks.filter(
      (h) => h.enabled && h.event === event && this.matchesFilter(h, context),
    );

    const results: HookResult[] = [];

    for (const hook of matching) {
      const result = await this.executeOne(hook, context);
      results.push(result);

      // If hook returned modified params, update context
      if (result.modifiedParams) {
        context.params = result.modifiedParams;
      }
    }

    return results;
  }

  /**
   * Get all registered hooks.
   */
  getHooks(): HookDefinition[] {
    return [...this.hooks];
  }

  /**
   * Get hooks for a specific event.
   */
  getHooksForEvent(event: string): HookDefinition[] {
    return this.hooks.filter((h) => h.event === event && h.enabled);
  }

  /**
   * Remove a hook by id.
   */
  removeHook(id: string): boolean {
    const idx = this.hooks.findIndex((h) => h.id === id);
    if (idx >= 0) {
      this.hooks.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all hooks.
   */
  clear(): void {
    this.hooks = [];
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async executeOne(
    hook: HookDefinition,
    context: HookContext,
  ): Promise<HookResult> {
    const startTime = Date.now();
    const timeout = hook.timeout ?? this.options.defaultTimeout;

    try {
      let output: string | undefined;

      if (hook.script) {
        output = await this.executeInlineScript(hook.script, context, timeout);
      } else if (hook.command) {
        output = await this.executeCommand(hook.command, context, timeout, hook.cwd);
      } else {
        return {
          success: false,
          error: 'Hook has neither "command" nor "script"',
          duration: Date.now() - startTime,
        };
      }

      // Parse output for param modifications
      let modifiedParams: Record<string, unknown> | undefined;
      let modifiedResult: unknown;

      if (output && hook.canModify) {
        try {
          const parsed = JSON.parse(output);
          if (parsed.params) modifiedParams = parsed.params;
          if (parsed.result) modifiedResult = parsed.result;
        } catch {
          // Output is not JSON — use as-is
        }
      }

      return {
        success: true,
        output,
        modifiedParams,
        modifiedResult,
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (this.options.suppressErrors) {
        return {
          success: false,
          error: error.message,
          duration: Date.now() - startTime,
        };
      }
      throw error;
    }
  }

  private executeInlineScript(
    script: string,
    context: HookContext,
    timeout: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ...context.data,
        CHIMERA_EVENT: context.event,
        CHIMERA_TOOL: context.toolName ?? '',
        CHIMERA_SESSION: context.sessionId,
        CHIMERA_WORKSPACE: context.workspaceRoot,
      };

      const child = spawn('node', ['-e', script], {
        env,
        cwd: context.workspaceRoot || this.options.defaultCwd,
        timeout,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Hook script exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', reject);
    });
  }

  private executeCommand(
    command: string,
    context: HookContext,
    timeout: number,
    cwd?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ...context.data,
        CHIMERA_EVENT: context.event,
        CHIMERA_TOOL: context.toolName ?? '',
        CHIMERA_SESSION: context.sessionId,
        CHIMERA_WORKSPACE: context.workspaceRoot,
      };

      const child = spawn(command, {
        env,
        cwd: cwd || context.workspaceRoot || this.options.defaultCwd,
        timeout,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Hook command exited with code ${code}: ${stderr}`));
        }
      });

      child.on('error', reject);
    });
  }

  private matchesFilter(hook: HookDefinition, context: HookContext): boolean {
    // Tool filter
    if (hook.toolFilter && context.toolName) {
      const pattern = hook.toolFilter.replace(/\*/g, '.*');
      if (!new RegExp(`^${pattern}$`).test(context.toolName)) {
        return false;
      }
    }

    // Data filter
    if (hook.dataFilter && context.data) {
      try {
        const filter = JSON.parse(hook.dataFilter);
        for (const [key, value] of Object.entries(filter)) {
          if (context.data[key] !== value) return false;
        }
      } catch {
        // Invalid filter — skip
      }
    }

    return true;
  }
}
