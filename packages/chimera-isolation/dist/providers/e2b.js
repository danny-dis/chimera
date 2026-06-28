"use strict";
/**
 * E2B Sandbox Provider
 *
 * Runs agent tasks in disposable E2B sandboxes.
 * E2B provides cloud-based sandboxes with filesystem, networking, and process isolation.
 *
 * @see https://e2b.dev/docs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.E2BProvider = void 0;
class E2BProvider {
    providerType = 'remote';
    apiKey;
    templateId;
    lifetimeSeconds;
    sandboxes = new Map();
    constructor(config) {
        this.apiKey = config.apiKey;
        this.templateId = config.templateId ?? 'base';
        this.lifetimeSeconds = config.lifetimeSeconds ?? 300;
    }
    async create(request) {
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
        const data = await response.json();
        const sandbox = {
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
            branchName: request.identifier,
            metadata: { adopted: false, request },
        };
    }
    async destroy(envId, _options) {
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
            workingPath: `/home/user`,
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
                    workingPath: `/home/user`,
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
            const response = await fetch(`https://api.e2b.dev/sandboxes/${envId}/health`, {
                headers: {
                    'X-API-Key': this.apiKey,
                },
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
}
exports.E2BProvider = E2BProvider;
//# sourceMappingURL=e2b.js.map