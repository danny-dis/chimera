/**
 * Harness Registry
 *
 * Registry for agent harnesses (Claude Code, Codex, OpenCode, etc.).
 * Allows running the same agent definition across multiple backends.
 *
 * Modeled after Omnigent's multi-harness architecture.
 */
import type { ModelProvider } from '@chimera/providers';
export type HarnessType = 'chimera' | 'claude-code' | 'codex' | 'opencode' | 'pi' | 'hermes';
export interface HarnessRegistration {
    id: HarnessType;
    displayName: string;
    description?: string;
    /** Whether this harness requires a specific CLI to be installed */
    requiresCli?: string;
    /** Whether this harness supports session resume */
    supportsSessionResume: boolean;
    /** Whether this harness supports MCP */
    supportsMcp: boolean;
    /** Whether this harness supports hooks */
    supportsHooks: boolean;
    /** Factory to create a provider for this harness */
    factory: (config: HarnessConfig) => Promise<ModelProvider>;
}
export interface HarnessConfig {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    /** Additional harness-specific options */
    options?: Record<string, unknown>;
}
export declare class HarnessRegistry {
    private harnesses;
    /**
     * Register a harness.
     */
    register(registration: HarnessRegistration): void;
    /**
     * Get a harness by ID.
     */
    get(id: HarnessType): HarnessRegistration | undefined;
    /**
     * List all registered harnesses.
     */
    list(): HarnessRegistration[];
    /**
     * Check if a harness is registered.
     */
    has(id: HarnessType): boolean;
    /**
     * Remove a harness.
     */
    unregister(id: HarnessType): boolean;
    /**
     * Create a provider for a harness.
     */
    createProvider(harnessId: HarnessType, config: HarnessConfig): Promise<ModelProvider>;
    /**
     * Get the default harness (chimera native).
     */
    getDefault(): HarnessRegistration | undefined;
}
/**
 * Create a default harness registry with built-in harnesses.
 */
export declare function createDefaultHarnessRegistry(): HarnessRegistry;
//# sourceMappingURL=harness-registry.d.ts.map