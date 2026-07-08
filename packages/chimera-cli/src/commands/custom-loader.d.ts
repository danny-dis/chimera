/**
 * Custom slash commands let users extend the REPL with their own markdown
 * prompts. A command file looks like:
 *
 *     ---
 *     description: Run the lint task
 *     argument-hint: <glob>
 *     allowed-tools: [Bash, Read]
 *     model: haiku
 *     ---
 *     Look at ${1} and run the project linter on it. $ARGUMENTS
 *
 * The loader walks `.chimera/commands/*.md` first (workspace overrides
 * take precedence) and then `~/.chimera/commands/*.md`. Argument
 * placeholders (`${1}`, `${2}`, ..., `$ARGUMENTS`) are substituted at
 * run time so the body is a template.
 */
export interface CustomCommand {
    /** Slash command name (file basename without `.md`). */
    name: string;
    /** Absolute path to the source file. */
    path: string;
    /** Description from frontmatter (falls back to empty string). */
    description: string;
    /** Optional hint string (e.g. "<file> <glob>"). */
    argumentHint: string;
    /** Whitelisted tool names from `allowed-tools` (empty = unrestricted). */
    allowedTools: string[];
    /** Optional preferred model id (`claude-haiku-4`, `gpt-4o-mini`, ...). */
    model: string | null;
    /** Substituted body (frontmatter stripped). */
    body: string;
    /** Whether the command came from the workspace or the user dir. */
    source: 'workspace' | 'user';
}
/**
 * Substitute `${1}` … `${N}` placeholders and `$ARGUMENTS` in `body`.
 * Whitespace-separated tokens from `args` fill in `${1}` onwards; any
 * extra tokens after the last explicit slot fold into `$ARGUMENTS`
 * alongside the explicit substitution.
 */
export declare function substituteArgs(body: string, args: string[]): string;
/**
 * Parse a single command file's raw contents into a `CustomCommand`.
 * Exported for the test suite.
 */
export declare function parseCommandFile(filePath: string, raw: string, source: 'workspace' | 'user'): CustomCommand;
export interface LoadCustomCommandsOptions {
    /** Override workspace root (defaults to `process.cwd()`). */
    workspaceRoot?: string;
    /** Override user home directory (defaults to `os.homedir()`). */
    homeDir?: string;
}
/**
 * Walk `.chimera/commands/*.md` (workspace) and `~/.chimera/commands/*.md`
 * (user). Workspace definitions take precedence on name collisions. A
 * missing user directory is not an error.
 */
export declare function loadCustomCommands(options?: LoadCustomCommandsOptions): Promise<Map<string, CustomCommand>>;
/**
 * Lightweight orchestrator handle the loader can poke while running a
 * custom command. We keep this structural so the loader doesn't need a
 * hard import of `@chimera/core`.
 */
export interface CustomCommandOrchestrator {
    execute?: (task: string) => Promise<{
        output: string;
        status: string;
    }>;
}
/**
 * Print a custom command's body to stdout. A real implementation would
 * feed the substituted body into an LLM call; for now we surface the
 * rendered prompt so users can see what the slash command expands to.
 */
export declare function runCustomCommand(name: string, args: string[], currentOrchestrator?: CustomCommandOrchestrator | null): Promise<void>;
//# sourceMappingURL=custom-loader.d.ts.map