"use strict";
/**
 * Modal Sandbox Provider
 *
 * Runs agent tasks in disposable Modal sandboxes.
 * Modal provides serverless cloud compute with automatic scaling.
 *
 * @see https://modal.com/docs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModalProvider = void 0;
class ModalProvider {
    providerType = 'remote';
    tokenId;
    tokenSecret;
    image;
    cpu;
    memory;
    gpu;
    timeout;
    sandboxes = new Map();
    constructor(config) {
        this.tokenId = config.tokenId;
        this.tokenSecret = config.tokenSecret;
        this.image = config.image ?? 'python:3.11-slim';
        this.cpu = config.cpu ?? 1;
        this.memory = config.memory ?? 1024;
        this.gpu = config.gpu;
        this.timeout = config.timeout ?? 600;
    }
    getAuthHeader() {
        return `Bearer ${this.tokenId}:${this.tokenSecret}`;
    }
    async create(request) {
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
        const data = await response.json();
        const sandbox = {
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
            branchName: request.identifier,
            metadata: { adopted: false, request },
        };
    }
    async destroy(envId, _options) {
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
        }
        catch {
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
    async get(envId) {
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
            branchName: sandbox.id,
            metadata: { adopted: false },
        };
    }
    async list(_codebaseId) {
        const environments = [];
        for (const sandbox of this.sandboxes.values()) {
            if (sandbox.status === 'active') {
                environments.push({
                    id: sandbox.id,
                    workingPath: `/root`,
                    status: 'active',
                    createdAt: sandbox.createdAt,
                    provider: 'worktree',
                    branchName: sandbox.id,
                    metadata: { adopted: false },
                });
            }
        }
        return environments;
    }
    async healthCheck(envId) {
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
        }
        catch {
            return false;
        }
    }
}
exports.ModalProvider = ModalProvider;
//# sourceMappingURL=modal.js.map