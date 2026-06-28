/**
 * Modal Sandbox Provider
 *
 * Runs agent tasks in disposable Modal sandboxes.
 * Modal provides serverless cloud compute with automatic scaling.
 *
 * @see https://modal.com/docs
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

export interface ModalConfig {
  /** Modal token ID */
  tokenId: string;
  /** Modal token secret */
  tokenSecret: string;
  /** Container image (default: 'python:3.11-slim') */
  image?: string;
  /** CPU count (default: 1) */
  cpu?: number;
  /** Memory in MB (default: 1024) */
  memory?: number;
  /** GPU type (optional) */
  gpu?: string;
  /** Maximum runtime in seconds (default: 600) */
  timeout?: number;
}

interface ModalSandbox {
  id: string;
  appId: string;
  createdAt: Date;
  status: 'active' | 'destroyed';
}

export class ModalProvider implements IIsolationProvider {
  readonly providerType: IsolationProviderType = 'remote';

  private readonly tokenId: string;
  private readonly tokenSecret: string;
  private readonly image: string;
  private readonly cpu: number;
  private readonly memory: number;
  private readonly gpu: string | undefined;
  private readonly timeout: number;
  private readonly sandboxes = new Map<string, ModalSandbox>();

  constructor(config: ModalConfig) {
    this.tokenId = config.tokenId;
    this.tokenSecret = config.tokenSecret;
    this.image = config.image ?? 'python:3.11-slim';
    this.cpu = config.cpu ?? 1;
    this.memory = config.memory ?? 1024;
    this.gpu = config.gpu;
    this.timeout = config.timeout ?? 600;
  }

  private getAuthHeader(): string {
    return `Bearer ${this.tokenId}:${this.tokenSecret}`;
  }

  async create(request: IsolationRequest): Promise<IsolatedEnvironment> {
    const response = await fetch('https://api.modal.com/v1/sandboxes', {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: this.image,
        cpu: this.cpu,
        memory: this.memory,
        gpu: this.gpu,
        timeout: this.timeout,
        metadata: {
          chimera_task: request.identifier,
          codebase: request.codebaseName ?? 'unknown',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Modal sandbox creation failed: ${error}`);
    }

    const data = await response.json() as { sandbox_id: string; app_id: string };
    const sandbox: ModalSandbox = {
      id: data.sandbox_id,
      appId: data.app_id,
      createdAt: new Date(),
      status: 'active',
    };

    this.sandboxes.set(sandbox.id, sandbox);

    return {
      id: sandbox.id,
      workingPath: `/root/${request.identifier}`,
      status: 'active',
      createdAt: sandbox.createdAt,
      provider: 'worktree',
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
      const response = await fetch(`https://api.modal.com/v1/sandboxes/${envId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': this.getAuthHeader(),
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
      workingPath: `/root`,
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
          workingPath: `/root`,
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
      const response = await fetch(`https://api.modal.com/v1/sandboxes/${envId}/status`, {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
