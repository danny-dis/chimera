"use strict";
/**
 * Harness Registry
 *
 * Registry for agent harnesses (Claude Code, Codex, OpenCode, etc.).
 * Allows running the same agent definition across multiple backends.
 *
 * Modeled after Omnigent's multi-harness architecture.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HarnessRegistry = void 0;
exports.createDefaultHarnessRegistry = createDefaultHarnessRegistry;
class HarnessRegistry {
    harnesses = new Map();
    /**
     * Register a harness.
     */
    register(registration) {
        if (this.harnesses.has(registration.id)) {
            throw new Error(`Harness '${registration.id}' already registered`);
        }
        this.harnesses.set(registration.id, registration);
    }
    /**
     * Get a harness by ID.
     */
    get(id) {
        return this.harnesses.get(id);
    }
    /**
     * List all registered harnesses.
     */
    list() {
        return Array.from(this.harnesses.values());
    }
    /**
     * Check if a harness is registered.
     */
    has(id) {
        return this.harnesses.has(id);
    }
    /**
     * Remove a harness.
     */
    unregister(id) {
        return this.harnesses.delete(id);
    }
    /**
     * Create a provider for a harness.
     */
    async createProvider(harnessId, config) {
        const harness = this.harnesses.get(harnessId);
        if (!harness) {
            throw new Error(`Harness '${harnessId}' not found. Available: ${this.list().map(h => h.id).join(', ')}`);
        }
        return harness.factory(config);
    }
    /**
     * Get the default harness (chimera native).
     */
    getDefault() {
        return this.harnesses.get('chimera');
    }
}
exports.HarnessRegistry = HarnessRegistry;
/**
 * Create a default harness registry with built-in harnesses.
 */
function createDefaultHarnessRegistry() {
    const registry = new HarnessRegistry();
    // Chimera native harness
    registry.register({
        id: 'chimera',
        displayName: 'Chimera Native',
        description: 'Chimera\'s built-in multi-agent orchestrator',
        supportsSessionResume: true,
        supportsMcp: true,
        supportsHooks: true,
        factory: async (config) => {
            // Import dynamically to avoid circular dependencies
            const { OpenAICompatibleProvider } = await import('@chimera/providers');
            return new OpenAICompatibleProvider({
                baseUrl: config.baseUrl ?? 'https://api.openai.com/v1',
                apiKey: config.apiKey ?? '',
                model: config.model ?? 'gpt-4o',
            });
        },
    });
    return registry;
}
//# sourceMappingURL=harness-registry.js.map