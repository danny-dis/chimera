/**
 * Modal Sandbox Provider
 *
 * Runs agent tasks in disposable Modal sandboxes.
 * Modal provides serverless cloud compute with automatic scaling.
 *
 * @see https://modal.com/docs
 */
import type { IIsolationProvider, IsolationRequest, IsolatedEnvironment, IsolationProviderType, DestroyResult, WorktreeDestroyOptions, DestroyOptions } from '../types.js';
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
export declare class ModalProvider implements IIsolationProvider {
    readonly providerType: IsolationProviderType;
    private readonly tokenId;
    private readonly tokenSecret;
    private readonly image;
    private readonly cpu;
    private readonly memory;
    private readonly gpu;
    private readonly timeout;
    private readonly sandboxes;
    constructor(config: ModalConfig);
    private getAuthHeader;
    create(request: IsolationRequest): Promise<IsolatedEnvironment>;
    destroy(envId: string, _options?: DestroyOptions | WorktreeDestroyOptions): Promise<DestroyResult>;
    get(envId: string): Promise<IsolatedEnvironment | null>;
    list(_codebaseId: string): Promise<IsolatedEnvironment[]>;
    healthCheck(envId: string): Promise<boolean>;
}
//# sourceMappingURL=modal.d.ts.map