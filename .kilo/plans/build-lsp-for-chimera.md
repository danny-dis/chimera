# Build LSP for Chimera

## Goal

Add real Language Server Protocol support to Chimera so agents can use diagnostics, definitions, references, hover, document symbols, workspace symbols, and code actions from project language servers instead of the current mock LSP tool.

## Current state observed

- `chimera/packages/chimera-tools/src/tools/lsp.ts` is explicitly a mock placeholder and says `TODO: Replace with actual vscode-languageserver-protocol client`.
- `chimera/packages/chimera-tools/src/tools/lsp-symbol-index.ts` already has a TypeScript-only AST symbol index with tests, but it is not a general LSP implementation.
- `chimera/packages/chimera-tools/src/index.ts` exports `lspTool`, but `allTools` does not register it.
- `ToolContext` has no LSP service dependency yet, so lifecycle-aware LSP client injection needs to be added.
- `EventStream` and `ChimeraEventSchema` do not yet include LSP diagnostic/server events.
- The blueprint classifies LSP as later v1 / Phase 4 and calls out automatic server startup plus diagnostics feeding the verification quality gate.

## Recommended approach

Build a protocol-first LSP layer backed by `vscode-jsonrpc` and `vscode-languageserver-protocol`, with the existing TypeScript AST index retained as a fallback for TypeScript when no language server is available.

Do **not** make the TypeScript AST indexer the primary LSP solution. It is useful for fast local fallback and tests, but real LSP requires server lifecycle, diagnostics, code actions, formatting, and language-specific intelligence.

## Architecture

Create a new workspace package:

```text
packages/chimera-lsp
  src/
    index.ts
    types.ts
    uri.ts
    config.ts
    server-config.ts
    lsp-client.ts
    lsp-service.ts
    diagnostics.ts
    operations.ts
```

Package shape:

```json
{
  "name": "@chimera/lsp",
  "version": "0.0.1",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "execa": "^9.0.0",
    "vscode-jsonrpc": "^8.0.0",
    "vscode-languageserver-protocol": "^3.17.0",
    "vscode-uri": "^3.0.0",
    "zod": "^3.23.0"
  }
}
```

Then wire it into `@chimera/tools`:

```text
@chimera/tools
  depends on @chimera/lsp
  exposes LSP tool definitions
  invalidates/updates LSP documents after file edits
```

And wire it into `@chimera/cli`:

```text
@chimera/cli
  creates LspService per SessionOrchestrator/workspace
  passes lspService through ToolContext
  shuts it down on process exit
```

## Implementation phases

### Phase 1 — LSP types, URI conversion, and config

1. Add `packages/chimera-lsp`.
2. Define canonical LSP types:
   - `LspServerConfig`
   - `LspWorkspaceConfig`
   - `LspDiagnostic`
   - `LspLocation`
   - `LspReference`
   - `LspHover`
   - `LspSymbol`
   - `LspCodeAction`
   - `LspOperationResult`
3. Implement path/URI helpers:
   - absolute path -> `file://` URI
   - URI -> absolute path
   - Windows-safe normalization
4. Extend `.chimera/config.yaml` schema with LSP config:

```yaml
lsp:
  enabled: true
  autoStart: true
  diagnosticsLimit: 200
  servers:
    typescript:
      command: npx
      args: ["typescript-language-server", "--stdio"]
      filePatterns: ["**/*.{ts,tsx}"]
      rootFiles: ["package.json", "tsconfig.json"]
```

5. Add defaults:
   - enabled by default for `code`, `debug`, and `review` modes;
   - disabled for `ask` unless explicitly requested;
   - no network or shell access unless the language server command is explicitly configured.

### Phase 2 — LSP service and server lifecycle

Implement `LspService`:

- create one service per workspace/session;
- load server configs from `.chimera/config.yaml`;
- start only servers matching opened files;
- spawn server processes with stdio;
- create JSON-RPC connections;
- send `initialize`;
- send `initialized`;
- open documents with full content sync first;
- cache document text and version numbers;
- handle `publishDiagnostics`;
- support `shutdown`/`exit`;
- restart crashed servers with bounded retries;
- expose startup/status errors to the CLI/TUI.

Initial sync strategy: use `TextDocumentSyncKind.Full` for simplicity and correctness. Add incremental sync later only if latency requires it.

### Phase 3 — LSP operations

Expose operations through `@chimera/lsp` first, then wrap them as tools:

- `ensureServer(filePath)`
- `getDiagnostics(filePath)`
- `goToDefinition(filePath, line, character)`
- `findReferences(filePath, line, character, includeDeclaration = true)`
- `hover(filePath, line, character)`
- `documentSymbols(filePath)`
- `workspaceSymbols(query)`
- `codeActions(filePath, range, diagnostics?)`
- `formatDocument(filePath, options?)`

For MVP, keep the existing `lsp` tool operation enum, but make it call the real service. Add a dedicated `lsp_diagnostics` tool because diagnostics are central to code verification.

### Phase 4 — Replace mock `lsp.ts`

Refactor `chimera/packages/chimera-tools/src/tools/lsp.ts`:

- remove mock `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, and `workspaceSymbol` implementations;
- keep only formatting helpers and schema definitions;
- require `context.lspService`;
- return structured results plus compact formatted text for the model;
- mark the tool as read-only and concurrency-safe only if the LSP service supports concurrent calls;
- handle “no server available” with a clear message instead of fake results.

Also add `lspTool` to `allTools` in `packages/chimera-tools/src/index.ts`.

### Phase 5 — Document invalidation after edits

Wire LSP document updates into existing file/edit tools:

- `read_file`: optionally open document in LSP service;
- `write_file`: update open document or reopen it;
- `edit_block`: update open document;
- `search_replace`: update open document;
- `apply_patch`: update every changed file from the patch result.

Use full document sync:

```text
read current file -> version++ -> send textDocument/didChange -> await diagnostics if requested
```

If a tool edits a file that LSP owns, the LSP cache must be invalidated or updated immediately.

### Phase 6 — Diagnostics into reviewer quality gate

Add diagnostics support to the review flow:

1. After writer draft/patch/tool execution, run `lsp_diagnostics` for changed files.
2. Convert diagnostics into bounded evidence:
   - file path;
   - line/column;
   - severity;
   - source;
   - message;
   - optional quick fix summary.
3. Pass diagnostics to reviewer/challenger prompts as structured findings.
4. Add event types:
   - `lsp_server_started`
   - `lsp_server_failed`
   - `lsp_diagnostics_published`
   - `lsp_diagnostics_checked`

Keep token usage bounded with a configurable limit and truncation strategy.

### Phase 7 — Fallback TypeScript symbol index

Use `LspSymbolIndex` as a fallback only when:

- LSP is disabled;
- no TypeScript language server is configured;
- the language server fails to start;
- a requested file is TypeScript/TSX and the AST index is fresh enough.

Add a fallback mode to `lsp.ts`:

```text
real LSP available -> use LSP
no LSP but TS/TSX -> use LspSymbolIndex
otherwise -> return “no LSP server available”
```

Do not hide fallback status from the user/model; include it in the formatted result.

### Phase 8 — Tests

Add tests for:

- URI/path conversion on Windows and POSIX;
- LSP config parsing and validation;
- fake JSON-RPC server initialize/open/change/diagnostics flow;
- diagnostics formatting and truncation;
- fallback TypeScript symbol index behavior;
- tool return schemas;
- document invalidation after edit tools;
- shutdown cleanup.

Prefer fake in-memory JSON-RPC connections for unit tests. Add one optional integration test behind a skip flag for `typescript-language-server` if available.

### Phase 9 — Validation checklist

Manual validation in a TypeScript fixture repo:

1. Start Chimera in a TypeScript project.
2. Open a file with an intentional type error.
3. Run `lsp_diagnostics`.
4. Confirm diagnostics include file, line, severity, source, and message.
5. Run `goToDefinition` on an imported symbol.
6. Run `findReferences` on a local function.
7. Run `hover` on a function call.
8. Edit a file and confirm diagnostics update.
9. Confirm reviewer receives diagnostics after a patch.
10. Confirm process shutdown exits language server cleanly.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| LSP server startup latency | lazy-start per file; cache status; show progress events |
| Diagnostics token bloat | configurable limit, severity filtering, truncation |
| Windows path/URI bugs | centralize URI conversion and test Windows paths |
| Server crashes | bounded restarts, clear errors, fallback mode |
| Missing language server binaries | do not auto-install by default; report missing command |
| Stale document state | update LSP document after every edit/write/patch tool |
| Too many server processes | start only matching servers; share service per workspace |

## Definition of done

- No mock LSP results remain for normal operations.
- `lspTool` is registered and usable from Chimera CLI/TUI.
- LSP diagnostics can be retrieved for changed files.
- File edits update open LSP documents.
- Diagnostics can be passed into reviewer output.
- TypeScript fallback works when LSP is unavailable.
- Tests cover URI conversion, config parsing, fake LSP flow, diagnostics, and fallback index.
- Typecheck, tests, and lint pass for `@chimera/lsp` and `@chimera/tools`.

## Open decision

Choose the LSP scope for the first implementation:

1. **Diagnostics-first MVP**: diagnostics, hover, definitions, references, document/workspace symbols.
2. **Full code-action MVP**: diagnostics plus code actions, formatting, and quick fixes.
3. **Protocol foundation first**: server lifecycle/config/tests first, then tools.

Recommended: **Diagnostics-first MVP**, because it directly improves review quality with the least surface area.
