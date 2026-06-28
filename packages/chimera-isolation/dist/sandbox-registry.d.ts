/**
 * Sandbox Registry
 *
 * Registry for cloud sandbox providers (E2B, Modal, etc.).
 * Allows dynamic registration and selection of sandbox providers.
 */
import type { IIsolationProvider, IsolationProviderType } from './types.js';
export interface SandboxProviderRegistration {
    id: string;
    providerType: IsolationProviderType;
    factory: () => IIsolationProvider;
    displayName: string;
    description?: string;
    /** Whether this provider requires API keys */
    requiresAuth: boolean;
    /** Estimated cost per hour in USD (0 = free/local) */
    costPerHour?: number;
}
export declare class SandboxRegistry {
    private providers;
    /**
     * Register a sandbox provider.
     */
    register(registration: SandboxProviderRegistration): void;
    /**
     * Get a sandbox provider by ID.
     */
    get(id: string): IIsolationProvider | undefined;
    /**
     * Get a provider registration by ID.
     */
    getRegistration(id: string): SandboxProviderRegistration | undefined;
    /**
     * List all registered providers.
     */
    list(): SandboxProviderRegistration[];
    /**
     * List providers by type.
     */
    listByType(type: IsolationProviderType): SandboxProviderRegistration[];
    /**
     * Check if a provider is registered.
     */
    has(id: string): boolean;
    /**
     * Remove a provider.
     */
    unregister(id: string): boolean;
    /**
     * Get the default provider (cheapest or local).
     */
    getDefault(): SandboxProviderRegistration | undefined;
}
/**
 * Create a default sandbox registry with common providers.
 */
export declare function createDefaultSandboxRegistry(): SandboxRegistry;
//# sourceMappingURL=sandbox-registry.d.ts.map