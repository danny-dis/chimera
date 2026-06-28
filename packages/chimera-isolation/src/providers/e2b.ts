/**
 * E2B Sandbox Provider
 *
 * Runs agent tasks in disposable E2B sandboxes.
 * E2B provides cloud-based sandboxes with filesystem, networking, and process isolation.
 *
 * @see https://e2b.dev/docs
 */

import type {
  IIsolationProvider,
  IsolationRequest,
  IsolatedEnvironment,
  IsolationProviderType,
  DestroyResult,
  WorktreeDestroyOptions,
  DestroyOptions,
} from '../types.js';
import type { BranchName } from '../types/branded.js';

export interface E2BConfig {
  apiKey: string;
  /** Sandbox template ID (default: 'base') */
  templateId?: string;
  /** Sandbox lifetime in seconds (default: 300 = 5 minutes) */
  lifetimeSeconds?: number;
  /** Additional environment variables */
  env?: Record<string, string>;
}

interface E2BSandbox {
  id: string;
  createdAt: Date;
  status: 'active' | 'destroyed';
}

export class E2BProvider implements IIsolationProvider {
  readonly providerType: IsolationProviderType = 'remote';

  private readonly apiKey: string;
  private readonly templateId: string;
  private readonly lifetimeSeconds: number;
  private readonly sandboxes = new Map<string, E2BSandbox>();

  constructor(config: E2BConfig) {
    this.apiKey = config.apiKey;
    this.templateId = config.templateId ?? 'base';
    this.lifetimeSeconds = config.lifetimeSeconds ?? 300;
  }

  async create(request: IsolationRequest): Promise<IsolatedEnvironment> {
    const response = await fetch('https://api.e2b.dev/sandboxes', {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        templateID: this.templateId,
        timeout: this.lifetimeSeconds,
        metadata: {
          chimeraTask: request.identifier,
          codebase: request.codebaseName ?? 'unknown',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`E2B sandbox creation failed: ${error}`);
    }

    const data = await response.json() as { sandboxID: string };
    const sandbox: E2BSandbox = {
      id: data.sandboxID,
      createdAt: new Date(),
      status: 'active',
    };

    this.sandboxes.set(sandbox.id, sandbox);

    return {
      id: sandbox.id,
      workingPath: `/home/user/${request.identifier}`,
      status: 'active',
      createdAt: sandbox.createdAt,
      provider: 'worktree', // E2B doesn't use worktrees, but we reuse the interface
      branchName: request.identifier as BranchName,
      metadata: { adopted: false, request },
    };
  }

  async destroy(
    envId: string,
    _options?: DestroyOptions | WorktreeDestroyOptions,
  ): Promise<DestroyResult> {
    const sandbox = this.sandboxes.get(envId);

    try {
      const response = await fetch(`https://api.e2b.dev/sandboxes/${envId}`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': this.apiKey,
        },
      });

      if (response.ok && sandbox) {
        sandbox.status = 'destroyed';
      }
    } catch {
      // Best-effort cleanup
    }

    return {
      worktreeRemoved: true,
      branchDeleted: null,
      remoteBranchDeleted: null,
      directoryClean: true,
      warnings: [],
    };
  }

  async get(envId: string): Promise<IsolatedEnvironment | null> {
    const sandbox = this.sandboxes.get(envId);
    if (!sandbox || sandbox.status === 'destroyed') {
      return null;
    }

    return {
      id: sandbox.id,
      workingPath: `/home/user`,
      status: sandbox.status,
      createdAt: sandbox.createdAt,
      provider: 'worktree',
      branchName: sandbox.id as BranchName,
      metadata: { adopted: false },
    };
  }

  async list(_codebaseId: string): Promise<IsolatedEnvironment[]> {
    const environments: IsolatedEnvironment[] = [];

    for (const sandbox of this.sandboxes.values()) {
      if (sandbox.status === 'active') {
        environments.push({
          id: sandbox.id,
          workingPath: `/home/user`,
          status: 'active',
          createdAt: sandbox.createdAt,
          provider: 'worktree',
          branchName: sandbox.id as BranchName,
          metadata: { adopted: false },
        });
      }
    }

    return environments;
  }

  async healthCheck(envId: string): Promise<boolean> {
    const sandbox = this.sandboxes.get(envId);
    if (!sandbox || sandbox.status === 'destroyed') {
      return false;
    }

    try {
      const response = await fetch(`https://api.e2b.dev/sandboxes/${envId}/health`, {
        headers: {
          'X-API-Key': this.apiKey,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
