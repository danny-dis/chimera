import path from 'path';
import { loadLspConfig, mergeLspConfig, type LspWorkspaceConfig } from '@chimera/lsp';
import { ChimeraLspService, type LspService } from '@chimera/lsp';

// ── Registry ─────────────────────────────────────────────────────────────────

const services = new Map<string, ChimeraLspService>();

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

export async function resolveDefaultLspConfig(workspaceRoot: string): Promise<LspWorkspaceConfig> {
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
  const root = path.resolve(workspaceRoot);
  let service = services.get(root);
  if (!service) {
    service = new ChimeraLspService(root, {
      configPath: path.join(root, '.chimera', 'config.yaml'),
      config: await resolveDefaultLspConfig(root),
    });
    await service.start();
    services.set(root, service);
  }
  return service;
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

export function disposeAllLspServices(): void {
  for (const service of services.values()) {
    const internal = service as unknown as {
      servers: Map<string, { child?: import('child_process').ChildProcessWithoutNullStreams }>;
    };
    for (const server of internal.servers.values()) {
      if (server.child && !server.child.killed) {
        server.child.kill();
      }
    }
  }
  services.clear();
}

process.on('exit', disposeAllLspServices);
