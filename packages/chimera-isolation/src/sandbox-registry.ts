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

export class SandboxRegistry {
  private providers = new Map<string, SandboxProviderRegistration>();

  /**
   * Register a sandbox provider.
   */
  register(registration: SandboxProviderRegistration): void {
    if (this.providers.has(registration.id)) {
      throw new Error(`Sandbox provider '${registration.id}' already registered`);
    }
    this.providers.set(registration.id, registration);
  }

  /**
   * Get a sandbox provider by ID.
   */
  get(id: string): IIsolationProvider | undefined {
    const registration = this.providers.get(id);
    if (!registration) {
      return undefined;
    }
    return registration.factory();
  }

  /**
   * Get a provider registration by ID.
   */
  getRegistration(id: string): SandboxProviderRegistration | undefined {
    return this.providers.get(id);
  }

  /**
   * List all registered providers.
   */
  list(): SandboxProviderRegistration[] {
    return Array.from(this.providers.values());
  }

  /**
   * List providers by type.
   */
  listByType(type: IsolationProviderType): SandboxProviderRegistration[] {
    return this.list().filter(p => p.providerType === type);
  }

  /**
   * Check if a provider is registered.
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * Remove a provider.
   */
  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  /**
   * Get the default provider (cheapest or local).
   */
  getDefault(): SandboxProviderRegistration | undefined {
    const providers = this.list();
    if (providers.length === 0) {
      return undefined;
    }

    // Prefer free/local providers
    const free = providers.find(p => p.costPerHour === 0 || p.costPerHour === undefined);
    if (free) {
      return free;
    }

    // Otherwise, return cheapest
    return providers.sort((a, b) => (a.costPerHour ?? 0) - (b.costPerHour ?? 0))[0];
  }
}

/**
 * Create a default sandbox registry with common providers.
 */
export function createDefaultSandboxRegistry(): SandboxRegistry {
  const registry = new SandboxRegistry();

  // Worktree is always available (local, free)
  registry.register({
    id: 'worktree',
    providerType: 'worktree',
    factory: () => {
      throw new Error('Worktree provider must be injected from chimera-isolation');
    },
    displayName: 'Git Worktree',
    description: 'Local git worktree isolation (free)',
    requiresAuth: false,
    costPerHour: 0,
  });

  return registry;
}
