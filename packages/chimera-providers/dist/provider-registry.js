"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRegistry = void 0;
class ProviderRegistry {
    providers = new Map();
    register(config) {
        this.providers.set(config.name, config);
    }
    get(name) {
        return this.providers.get(name);
    }
    getAll() {
        return Array.from(this.providers.values());
    }
}
exports.ProviderRegistry = ProviderRegistry;
//# sourceMappingURL=provider-registry.js.map