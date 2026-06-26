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

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

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

// ── Built-in styles ──────────────────────────────────────────────────────────

const BUILT_IN_STYLES: OutputStyle[] = [
  {
    name: 'concise',
    description: 'Brief, high-signal responses',
    keepCodingInstructions: true,
    instructions: [
      '# Concise Style',
      '- Use short, direct sentences',
      '- Skip preamble and postamble',
      '- Lead with the answer',
      '- Code-first, explain after',
      '- No filler words',
    ].join('\n'),
    sourcePath: '(built-in)',
  },
  {
    name: 'detailed',
    description: 'Thorough explanations with context',
    keepCodingInstructions: true,
    instructions: [
      '# Detailed Style',
      '- Provide comprehensive explanations',
      '- Include context and rationale',
      '- Show alternatives when relevant',
      '- Explain trade-offs',
      '- Use examples to illustrate points',
    ].join('\n'),
    sourcePath: '(built-in)',
  },
  {
    name: 'verbose',
    description: 'Maximum detail, step-by-step',
    keepCodingInstructions: true,
    instructions: [
      '# Verbose Style',
      '- Explain every step in detail',
      '- Include background context',
      '- Walk through reasoning process',
      '- Show all relevant details',
      '- Document edge cases and assumptions',
      '- Provide extensive examples',
    ].join('\n'),
    sourcePath: '(built-in)',
  },
  {
    name: 'casual',
    description: 'Friendly, conversational tone',
    keepCodingInstructions: true,
    instructions: [
      '# Casual Style',
      '- Use a friendly, conversational tone',
      '- Use contractions',
      '- Be approachable and helpful',
      '- Keep it natural',
    ].join('\n'),
    sourcePath: '(built-in)',
  },
  {
    name: 'professional',
    description: 'Formal, business-appropriate',
    keepCodingInstructions: true,
    instructions: [
      '# Professional Style',
      '- Use formal language',
      '- Be precise and accurate',
      '- Avoid slang and colloquialisms',
      '- Structure responses clearly',
    ].join('\n'),
    sourcePath: '(built-in)',
  },
];

// ── Loader ───────────────────────────────────────────────────────────────────

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length > 0) {
      meta[key.trim()] = rest.join(':').trim();
    }
  }
  return { meta, body: match[2] };
}

async function loadStyleFromFile(filePath: string): Promise<OutputStyle | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { meta, body } = parseFrontmatter(content);

    if (!meta.name) return null;

    return {
      name: meta.name,
      description: meta.description ?? '',
      keepCodingInstructions: meta['keep-coding-instructions'] !== 'false',
      instructions: body.trim(),
      sourcePath: filePath,
    };
  } catch {
    return null;
  }
}

async function loadStylesFromDir(dirPath: string): Promise<OutputStyle[]> {
  const styles: OutputStyle[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const style = await loadStyleFromFile(path.join(dirPath, entry.name));
        if (style) styles.push(style);
      }
    }
  } catch {
    // Directory doesn't exist — skip
  }
  return styles;
}

/**
 * Load all available output styles (built-in + user-defined).
 */
export async function loadOutputStyles(workspaceRoot?: string): Promise<OutputStyle[]> {
  const styles = [...BUILT_IN_STYLES];

  // User-global styles
  const globalDir = path.join(os.homedir(), '.chimera', 'output-styles');
  const globalStyles = await loadStylesFromDir(globalDir);
  styles.push(...globalStyles);

  // Project-local styles
  if (workspaceRoot) {
    const projectDir = path.join(workspaceRoot, '.chimera', 'output-styles');
    const projectStyles = await loadStylesFromDir(projectDir);
    styles.push(...projectStyles);
  }

  return styles;
}

/**
 * Get a specific style by name.
 */
export async function getOutputStyle(
  name: string,
  workspaceRoot?: string,
): Promise<OutputStyle | undefined> {
  const styles = await loadOutputStyles(workspaceRoot);
  return styles.find((s) => s.name === name);
}

/**
 * Get style instructions as a system prompt suffix.
 */
export function buildStylePrompt(style: OutputStyle): string {
  return `\n\n## Output Style: ${style.name}\n${style.instructions}\n`;
}
