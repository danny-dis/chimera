/**
 * E2B Sandbox Provider
 *
 * Runs agent tasks in disposable E2B sandboxes.
 * E2B provides cloud-based sandboxes with filesystem, networking, and process isolation.
 *
 * @see https://e2b.dev/docs
 */
import type { IIsolationProvider, IsolationRequest, IsolatedEnvironment, IsolationProviderType, DestroyResult, WorktreeDestroyOptions, DestroyOptions } from '../types.js';
export interface E2BConfig {
    apiKey: string;
    /** Sandbox template ID (default: 'base') */
    templateId?: string;
    /** Sandbox lifetime in seconds (default: 300 = 5 minutes) */
    lifetimeSeconds?: number;
    /** Additional environment variables */
    env?: Record<string, string>;
}
export declare class E2BProvider implements IIsolationProvider {
    readonly providerType: IsolationProviderType;
    private readonly apiKey;
    private readonly templateId;
    private readonly lifetimeSeconds;
    private readonly sandboxes;
    constructor(config: E2BConfig);
    create(request: IsolationRequest): Promise<IsolatedEnvironment>;
    destroy(envId: string, _options?: DestroyOptions | WorktreeDestroyOptions): Promise<DestroyResult>;
    get(envId: string): Promise<IsolatedEnvironment | null>;
    list(_codebaseId: string): Promise<IsolatedEnvironment[]>;
    healthCheck(envId: string): Promise<boolean>;
}
//# sourceMappingURL=e2b.d.ts.map