import { ProviderConfig } from './model-adapter.js';

export class ProviderRegistry {
  private providers: Map<string, ProviderConfig> = new Map();

  register(config: ProviderConfig): void {
    this.providers.set(config.name, config);
  }

  get(name: string): ProviderConfig | undefined {
    return this.providers.get(name);
  }

  getAll(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }
}
