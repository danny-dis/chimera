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
    // Imported lazily to avoid a circular dependency with @chimera/providers.
    const makeOpenAIProvider = async (config, fallbackBaseUrl) => {
        const { OpenAICompatibleProvider } = await import('@chimera/providers');
        return new OpenAICompatibleProvider({
            baseUrl: config.baseUrl ?? fallbackBaseUrl,
            apiKey: config.apiKey ?? '',
            model: config.model ?? 'gpt-4o',
        });
    };
    // Chimera native harness
    registry.register({
        id: 'chimera',
        displayName: 'Chimera Native',
        description: 'Chimera\'s built-in multi-agent orchestrator',
        supportsSessionResume: true,
        supportsMcp: true,
        supportsHooks: true,
        factory: (config) => makeOpenAIProvider(config, 'https://api.openai.com/v1'),
    });
    // Hermes local gateway (OpenAI-compatible). Lets Chimera run on the same
    // backend this profile uses — the registry advertised it, now it exists.
    registry.register({
        id: 'hermes',
        displayName: 'Hermes Gateway',
        description: 'OpenAI-compatible Hermes gateway (custom provider)',
        requiresCli: 'hermes-gateway',
        supportsSessionResume: false,
        supportsMcp: false,
        supportsHooks: false,
        // ponytail: baseUrl default points at the local gateway; the harness is
        // HTTP-only. codex/claude-code/opencode need a subprocess provider and
        // sandbox — out of scope here, so they stay unregistered + honest errors.
        factory: (config) => makeOpenAIProvider(config, 'http://127.0.0.1:3000/v1'),
    });
    return registry;
}
//# sourceMappingURL=harness-registry.js.map