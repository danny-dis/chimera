import { ProviderConfig } from './model-adapter.js';
export declare class ProviderRegistry {
    private providers;
    register(config: ProviderConfig): void;
    get(name: string): ProviderConfig | undefined;
    getAll(): ProviderConfig[];
}
//# sourceMappingURL=provider-registry.d.ts.map