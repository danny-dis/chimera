import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

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
export function substituteArgs(body: string, args: string[]): string {
  const joined = args.join(' ');
  let out = body.replace(/\$ARGUMENTS/g, joined);
  // Substitute from the highest index down so `${10}` is not clobbered
  // by a `${1}` replacement.
  for (let i = args.length; i >= 1; i--) {
    const value = args[i - 1] ?? '';
    const re = new RegExp(`\\$\\{${i}\\}`, 'g');
    out = out.replace(re, value);
  }
  return out;
}

/**
 * Parse a single command file's raw contents into a `CustomCommand`.
 * Exported for the test suite.
 */
export function parseCommandFile(
  filePath: string,
  raw: string,
  source: 'workspace' | 'user',
): CustomCommand {
  const name = path.basename(filePath, '.md');
  const { frontmatter, body } = splitFrontmatter(raw);

  const description = String(frontmatter['description'] ?? '');
  const argumentHint = String(frontmatter['argument-hint'] ?? '');
  const allowedTools = parseStringOrArray(frontmatter['allowed-tools']) ?? [];
  const modelRaw = frontmatter['model'];
  const model = typeof modelRaw === 'string' && modelRaw.length > 0 ? modelRaw : null;

  return {
    name,
    path: filePath,
    description,
    argumentHint,
    allowedTools,
    model,
    body,
    source,
  };
}

function splitFrontmatter(raw: string): {
  frontmatter: Record<string, string | string[]>;
  body: string;
} {
  // Match `---\n...\n---\n` (or `---\r\n...\r\n---\r\n`) at the start of the
  // file. We only support the simple `key: value` and `key: [a, b]` forms
  // intentionally — this is a tiny DSL and we don't want to pull in a YAML
  // parser for it.
  const fence = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const m = raw.match(fence);
  if (!m) return { frontmatter: {}, body: raw };
  const block = m[1] ?? '';
  const body = raw.slice(m[0].length);
  const frontmatter: Record<string, string | string[]> = {};
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;
    const key = trimmed.slice(0, colon).trim();
    let value: string | string[] = trimmed.slice(colon + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      if (inner.length === 0) {
        value = [];
      } else {
        value = inner.split(',').map((s) => unquote(s.trim())).filter((s) => s.length > 0);
      }
    } else {
      value = unquote(value);
    }
    frontmatter[key] = value;
  }
  return { frontmatter, body };
}

function unquote(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function parseStringOrArray(
  v: string | string[] | undefined,
): string[] | undefined {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) return v;
  // Bare string after `allowed-tools: foo, bar` — split on commas.
  return v.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Walk a directory non-recursively, returning all `*.md` files. Missing
 * directories resolve to an empty list (we don't want a missing user
 * `~/.chimera/commands` to throw — that's a normal first-run state).
 */
async function readCommandFilesIn(dir: string): Promise<string[]> {
  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    files.push(path.join(dir, entry.name));
  }
  return files.sort();
}

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
export async function loadCustomCommands(
  options: LoadCustomCommandsOptions = {},
): Promise<Map<string, CustomCommand>> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const homeDir = options.homeDir ?? os.homedir();
  const workspaceDir = path.join(workspaceRoot, '.chimera', 'commands');
  const userDir = path.join(homeDir, '.chimera', 'commands');

  const [workspaceFiles, userFiles] = await Promise.all([
    readCommandFilesIn(workspaceDir),
    readCommandFilesIn(userDir),
  ]);

  const out = new Map<string, CustomCommand>();
  // User first, then workspace — workspace entries overwrite on collision.
  for (const file of userFiles) {
    const cmd = await loadOne(file, 'user');
    if (cmd) out.set(cmd.name, cmd);
  }
  for (const file of workspaceFiles) {
    const cmd = await loadOne(file, 'workspace');
    if (cmd) out.set(cmd.name, cmd);
  }
  return out;
}

async function loadOne(
  file: string,
  source: 'workspace' | 'user',
): Promise<CustomCommand | null> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf-8');
  } catch {
    return null;
  }
  try {
    return parseCommandFile(file, raw, source);
  } catch {
    return null;
  }
}

/**
 * Lightweight orchestrator handle the loader can poke while running a
 * custom command. We keep this structural so the loader doesn't need a
 * hard import of `@chimera/core`.
 */
export interface CustomCommandOrchestrator {
  execute?: (task: string) => Promise<{ output: string; status: string }>;
}

/**
 * Print a custom command's body to stdout. A real implementation would
 * feed the substituted body into an LLM call; for now we surface the
 * rendered prompt so users can see what the slash command expands to.
 */
export async function runCustomCommand(
  name: string,
  args: string[],
  currentOrchestrator?: CustomCommandOrchestrator | null,
): Promise<void> {
  const commands = await loadCustomCommands();
  const cmd = commands.get(name);
  if (!cmd) {
    console.log(`  Unknown custom command: /${name}`);
    return;
  }
  const rendered = substituteArgs(cmd.body, args);

  if (currentOrchestrator?.execute) {
    try {
      const result = await currentOrchestrator.execute(rendered);
      console.log(`\n/${name} ${args.join(' ')}`.trim());
      console.log(`  status: ${result.status}`);
      console.log(`  ${result.output}\n`);
      return;
    } catch (err) {
      console.error(
        `  /${name} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
  }

  console.log(`\n/${name} ${args.join(' ')}`.trim());
  if (cmd.description) console.log(`  ${cmd.description}`);
  if (cmd.argumentHint) console.log(`  args: ${cmd.argumentHint}`);
  if (cmd.allowedTools.length > 0) {
    console.log(`  tools: ${cmd.allowedTools.join(', ')}`);
  }
  if (cmd.model) console.log(`  model: ${cmd.model}`);
  console.log('');
  console.log(rendered);
  console.log('');
}
