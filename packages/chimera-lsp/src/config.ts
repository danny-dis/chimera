import { promises as fs } from 'fs';
import path from 'path';
import YAML from 'yaml';
import { z } from 'zod';
import type { LspWorkspaceConfig } from './types.js';

export const LspServerConfigSchema = z.object({
  name: z.string().optional(),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  filePatterns: z.array(z.string()).default([]),
  rootFiles: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
  diagnosticsLimit: z.number().int().positive().optional(),
});

export const LspConfigSchema = z.object({
  enabled: z.boolean().default(true),
  autoStart: z.boolean().default(true),
  diagnosticsLimit: z.number().int().positive().default(200),
  servers: z.record(LspServerConfigSchema).default({}),
});

export const DEFAULT_LSP_CONFIG: LspWorkspaceConfig = {
  enabled: true,
  autoStart: true,
  diagnosticsLimit: 200,
  servers: {},
};

export async function loadLspConfig(
  workspaceRoot: string,
  configPath = path.join(workspaceRoot, '.chimera', 'config.yaml'),
): Promise<LspWorkspaceConfig> {
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = YAML.parse(raw) as { lsp?: unknown } | null;
    const value = parsed?.lsp ?? parsed ?? {};
    return LspConfigSchema.parse(value);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return DEFAULT_LSP_CONFIG;
    }
    throw err;
  }
}

export function mergeLspConfig(base: LspWorkspaceConfig, override?: Partial<LspWorkspaceConfig>): LspWorkspaceConfig {
  return LspConfigSchema.parse({
    ...base,
    ...override,
    servers: {
      ...base.servers,
      ...(override?.servers ?? {}),
    },
  });
}
