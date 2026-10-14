import { z } from 'zod';
import type { ToolDefinition, ToolContext } from '../tool-schema.js';
import { buildTool } from '../tool-builder.js';
import type { LspLocation, LspHover, LspDocumentSymbol, LspWorkspaceSymbol } from '@chimera/lsp';

import { PathRestrictionEngine } from '../permission/path-restrictions.js';
import { getOrCreateLspService } from '../lsp-registry.js';

// ── Schemas ───────────────────────────────────────────────────────────────────

const LspOperationSchema = z.enum([
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
]);

const LspParamsSchema = z.object({
  operation: LspOperationSchema,
  filePath: z.string().min(1, 'filePath is required'),
  line: z.number().int().positive().optional(),
  character: z.number().int().positive().optional(),
  query: z.string().optional(),
});

const LspReturnsSchema = z.object({
  operation: z.string(),
  results: z.array(z.record(z.unknown())),
  formatted: z.string(),
});

// ── Formatters ────────────────────────────────────────────────────────────────

function formatLocations(locations: LspLocation[]): string {
  if (locations.length === 0) return 'No results found.';
  return locations
    .map((loc) => `${loc.filePath}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`)
    .join('\n');
}

function formatHover(hover: LspHover | null): string {
  if (!hover) return 'No hover information.';
  return hover.contents;
}

function formatDocumentSymbols(symbols: LspDocumentSymbol[], indent = 0): string {
  if (symbols.length === 0) return 'No symbols found.';
  const lines: string[] = [];
  for (const sym of symbols) {
    const prefix = '  '.repeat(indent);
    lines.push(`${prefix}${sym.kind} ${sym.name} (line ${sym.range.range.start.line + 1})`);
    if (sym.children && sym.children.length > 0) {
      lines.push(formatDocumentSymbols(sym.children, indent + 1));
    }
  }
  return lines.join('\n');
}

function formatWorkspaceSymbols(symbols: LspWorkspaceSymbol[]): string {
  if (symbols.length === 0) return 'No symbols found.';
  return symbols
    .map((sym) => {
      const container = sym.containerName ? ` in ${sym.containerName}` : '';
      return `${sym.kind} ${sym.name}${container} — ${sym.location.filePath}:${sym.location.range.start.line + 1}:${sym.location.range.start.character + 1}`;
    })
    .join('\n');
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

// ── Tool ──────────────────────────────────────────────────────────────────────

export const lspTool: ToolDefinition<typeof LspParamsSchema, typeof LspReturnsSchema> = buildTool({
  name: 'lsp',
  description:
    'Code intelligence via Language Server Protocol: go-to-definition, find-references, hover, document symbols, workspace symbols',
  parameters: LspParamsSchema,
  returns: LspReturnsSchema,
  category: 'lsp',
  permissionLevel: 'read',
  execute: async (params, context: ToolContext) => {
    // Canonical containment at the tool boundary — before any service
    // startup or read. Reuses the existing PathRestrictionEngine (same
    // package, no new helper, no circular dep); file: URIs are decoded
    // first so URI-outside is contained too. The service seam re-enforces
    // with assertWorkspaceContainment (exported from @chimera/lsp src).
    // workspaceSymbol takes a query, not a path, so nothing to contain.
    if (params.operation !== 'workspaceSymbol') {
      const { uriToPath } = require('@chimera/lsp') as typeof import('@chimera/lsp');
      let decoded = params.filePath.startsWith('file:') ? uriToPath(params.filePath) : params.filePath;
      // Normalize drive-letter case on Windows (vscode-uri lowercases it)
      // so legitimate inside URIs are not false-positive escapes.
      if (process.platform === 'win32' && /^[a-z]:[\\/]/.test(decoded)) {
        decoded = decoded[0].toUpperCase() + decoded.slice(1);
      }
      const violation = new PathRestrictionEngine(context.workspaceRoot).getViolation(decoded);
      if (violation) throw new Error(`path escapes workspace: ${params.filePath} (${violation})`);
    }
    const service = await getOrCreateLspService(context.workspaceRoot);

    switch (params.operation) {
      case 'goToDefinition': {
        if (params.line == null || params.character == null) {
          throw new Error('line and character are required for goToDefinition');
        }
        const locations = await service.goToDefinition(params.filePath, params.line, params.character);
        return {
          operation: 'goToDefinition',
          results: locations.map(toRecord),
          formatted: formatLocations(locations),
        };
      }

      case 'findReferences': {
        if (params.line == null || params.character == null) {
          throw new Error('line and character are required for findReferences');
        }
        const locations = await service.findReferences(params.filePath, params.line, params.character);
        return {
          operation: 'findReferences',
          results: locations.map(toRecord),
          formatted: formatLocations(locations),
        };
      }

      case 'hover': {
        if (params.line == null || params.character == null) {
          throw new Error('line and character are required for hover');
        }
        const hover = await service.hover(params.filePath, params.line, params.character);
        return {
          operation: 'hover',
          results: hover ? [toRecord(hover)] : [],
          formatted: formatHover(hover),
        };
      }

      case 'documentSymbol': {
        const symbols = await service.documentSymbols(params.filePath);
        return {
          operation: 'documentSymbol',
          results: symbols.map(toRecord),
          formatted: formatDocumentSymbols(symbols),
        };
      }

      case 'workspaceSymbol': {
        if (params.query == null) {
          throw new Error('query is required for workspaceSymbol');
        }
        const symbols = await service.workspaceSymbols(params.query);
        return {
          operation: 'workspaceSymbol',
          results: symbols.map(toRecord),
          formatted: formatWorkspaceSymbols(symbols),
        };
      }
    }
  },
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
});
