/**
 * Auto-detect project metadata from the workspace root.
 *
 * Reads common manifest files (package.json, pyproject.toml, Cargo.toml,
 * go.mod, etc.) and returns a concise context block that helps the LLM
 * understand the project's language, framework, and tooling.
 *
 * This is used when no AGENTS.md or CLAUDE.md exists — it provides
 * baseline project context so the assistant isn't starting blind.
 */
/**
 * Detect project metadata from the workspace root.
 * Returns a concise string suitable for injection into the system prompt.
 * Returns empty string if no manifest files are found.
 */
export declare function detectProjectContext(workspaceRoot: string): string;
//# sourceMappingURL=project-detection.d.ts.map