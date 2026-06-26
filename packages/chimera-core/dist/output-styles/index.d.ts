/**
 * Output styles system for chimera.
 *
 * Loads markdown-based output style definitions from:
 * - `.chimera/output-styles/` (project-local)
 * - `~/.chimera/output-styles/` (user-global)
 *
 * Each style is a markdown file with frontmatter:
 * ---
 * name: concise
 * description: Brief, high-signal responses
 * keep-coding-instructions: true
 * ---
 * # Concise Style
 * - Use short sentences
 * - Skip preamble
 * - Code-first
 */
export interface OutputStyle {
    /** Unique name */
    name: string;
    /** Human description */
    description: string;
    /** Whether to keep coding instructions in output */
    keepCodingInstructions: boolean;
    /** The style instructions (markdown body) */
    instructions: string;
    /** Source file path */
    sourcePath: string;
}
/**
 * Load all available output styles (built-in + user-defined).
 */
export declare function loadOutputStyles(workspaceRoot?: string): Promise<OutputStyle[]>;
/**
 * Get a specific style by name.
 */
export declare function getOutputStyle(name: string, workspaceRoot?: string): Promise<OutputStyle | undefined>;
/**
 * Get style instructions as a system prompt suffix.
 */
export declare function buildStylePrompt(style: OutputStyle): string;
//# sourceMappingURL=index.d.ts.map