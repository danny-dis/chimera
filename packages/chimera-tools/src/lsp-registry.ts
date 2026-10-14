import path from 'path';
import type { ChimeraLspService, LspService, LspWorkspaceConfig } from '@chimera/lsp';
import { isWorkspaceTrusted } from './hooks/trust.js';

// ── Registry ─────────────────────────────────────────────────────────────────

const services = new Map<string, ChimeraLspService>();
const startingServices = new Map<string, Promise<ChimeraLspService>>();
let generation = 0;
let disposing: Promise<void> | undefined;
const failedServices = new Map<string, ChimeraLspService>();

function resolveTypeScriptServer(workspaceRoot: string): { command: string; args: string[] } {
  const lookupPaths = [path.join(workspaceRoot, 'node_modules'), __dirname];
  // Prefer the classic bin entry, then fall back to the actual on-disk entry
  // (typescript-language-server@5 ships lib/cli.mjs with no bin/ directory).
  for (const id of ['typescript-language-server/bin/typescript-language-server', 'typescript-language-server/lib/cli.mjs']) {
    try {
      return { command: 'node', args: [require.resolve(id, { paths: lookupPaths }), '--stdio'] };
    } catch {
      // Try next candidate.
    }
  }
  return { command: 'typescript-language-server', args: ['--stdio'] };
}

/**
 * Application-installed TypeScript server only — never resolves from
 * workspace `node_modules`. Safe for untrusted workspaces: a cloned repo
 * must not influence which program executes under the LSP tool's `read`
 * permission. Exported so CLI can probe without loading project config.
 */
export function resolveAppInstalledTypeScriptServer(): { command: string; args: string[] } {
  const lookupPaths = [__dirname];
  for (const id of ['typescript-language-server/bin/typescript-language-server', 'typescript-language-server/lib/cli.mjs']) {
    try {
      return { command: process.execPath, args: [require.resolve(id, { paths: lookupPaths }), '--stdio'] };
    } catch {
      // Try next candidate.
    }
  }
  throw new Error('Application-installed TypeScript language server unavailable');
}

/**
 * Safe default config — never loads workspace `.chimera/config.yaml` and
 * never resolves servers from project packages. Used for untrusted
 * workspaces; trusted workspaces go through `resolveDefaultLspConfig`.
 * Exported as the CLI-safe contract (CLI itself not edited here).
 */
export async function resolveSafeDefaultLspConfig(): Promise<LspWorkspaceConfig> {
  const { DEFAULT_LSP_CONFIG, mergeLspConfig } = await import('@chimera/lsp');
  return mergeLspConfig(DEFAULT_LSP_CONFIG, {
    servers: {
      typescript: {
        ...resolveAppInstalledTypeScriptServer(),
        initializationOptions: {
          tsserver: { path: require.resolve('typescript/lib/tsserver.js', { paths: [__dirname] }) },
          disableAutomaticTypingAcquisition: true,
          plugins: [],
        },
        filePatterns: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
        rootFiles: ['package.json', 'tsconfig.json'],
      },
    },
  });
}

export interface TypeScriptServerAvailability {
  available: boolean;
  command: string;
  args: string[];
  reason?: string;
}

/**
 * Bounded availability probe for the installed TypeScript server.
 * No installs, no spawns, no network — only `require.resolve` against
 * the workspace and this package. Returns `available: false` (not an
 * empty success) when the server is absent so callers can report
 * "unavailable" explicitly.
 */
export function getTypeScriptServerAvailability(workspaceRoot: string): TypeScriptServerAvailability {
  const lookupPaths = [path.join(workspaceRoot, 'node_modules'), __dirname];
  for (const id of ['typescript-language-server/bin/typescript-language-server', 'typescript-language-server/lib/cli.mjs']) {
    try {
      const resolved = require.resolve(id, { paths: lookupPaths });
      return { available: true, command: 'node', args: [resolved, '--stdio'] };
    } catch {
      // Try next candidate.
    }
  }
  return {
    available: false,
    command: 'typescript-language-server',
    args: ['--stdio'],
    reason: 'typescript-language-server not found under workspace node_modules or registry package; no install attempted',
  };
}

export function isTypeScriptServerAvailable(workspaceRoot: string): boolean {
  return getTypeScriptServerAvailability(workspaceRoot).available;
}

export async function resolveDefaultLspConfig(workspaceRoot: string): Promise<LspWorkspaceConfig> {
  // Trust gate (HIGH-1): untrusted workspaces must NEVER load project
  // `.chimera/config.yaml` (arbitrary command/args/cwd/env) NOR resolve
  // language servers from project packages. No auto-trust — fall back to
  // the application-installed default server, which may run.
  const trusted = await isWorkspaceTrusted(workspaceRoot).catch(() => false);
  if (!trusted) return resolveSafeDefaultLspConfig();
  const { loadLspConfig, mergeLspConfig } = await import('@chimera/lsp');
  const loaded = await loadLspConfig(workspaceRoot);
  if (Object.keys(loaded.servers).length > 0) return loaded;
  return mergeLspConfig(loaded, {
    servers: {
      typescript: {
        ...resolveTypeScriptServer(workspaceRoot),
        filePatterns: ['**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
        rootFiles: ['package.json', 'tsconfig.json'],
      },
    },
  });
}

export async function getOrCreateLspService(workspaceRoot: string): Promise<LspService> {
  if (disposing) throw new Error('LSP registry disposal in progress');
  const root = path.resolve(workspaceRoot);
  if (failedServices.has(root)) throw new Error('LSP service cleanup failed; retry registry disposal');
  const existing = services.get(root);
  if (existing) return existing;
  const starting = startingServices.get(root);
  if (starting) return starting;
  const currentGeneration = generation;
  const pending = (async () => {
    // Trust gate continued: never pass a workspace configPath for untrusted
    // roots — otherwise ChimeraLspService.start() would silently reload the
    // blocked project config via loadLspConfig.
    const trusted = await isWorkspaceTrusted(root).catch(() => false);
    const config = trusted ? await resolveDefaultLspConfig(root) : await resolveSafeDefaultLspConfig();
    const { ChimeraLspService } = await import('@chimera/lsp');
    const service = new ChimeraLspService(root, { config });
    try {
      await service.start();
      if (currentGeneration !== generation) throw new Error('LSP registry disposed during startup');
    } catch (error) {
      try { await service.dispose(); }
      catch (cleanupError) { failedServices.set(root, service); throw cleanupError; }
      throw error;
    }
    services.set(root, service);
    return service;
  })().finally(() => {
    if (startingServices.get(root) === pending) startingServices.delete(root);
  });
  startingServices.set(root, pending);
  return pending;
}

export async function syncLspDocument(filePath: string, workspaceRoot: string): Promise<void> {
  const service = services.get(path.resolve(workspaceRoot));
  if (!service) return;
  try {
    await service.updateDocument(filePath);
  } catch {
    // LSP sync must never break a file write.
  }
}

export async function disposeAllLspServices(): Promise<void> {
  if (disposing) return disposing;
  generation++;
  disposing = (async () => {
    await Promise.allSettled([...startingServices.values()]);
    const owned = new Set([...services.values(), ...failedServices.values()]);
    for (const [root, service] of services) failedServices.set(root, service);
    const results = await Promise.allSettled([...owned].map(async service => {
      await service.dispose();
      for (const [root, failed] of failedServices) if (failed === service) failedServices.delete(root);
      for (const [root, cached] of services) if (cached === service) services.delete(root);
    }));
    if (results.some(result => result.status === 'rejected')) throw new Error('LSP shutdown failed');
  })();
  try { await disposing; } finally { disposing = undefined; }
}

process.on('beforeExit', () => { void disposeAllLspServices().catch(error => console.error(error)); });
