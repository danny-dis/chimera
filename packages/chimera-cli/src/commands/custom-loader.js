"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.substituteArgs = substituteArgs;
exports.parseCommandFile = parseCommandFile;
exports.loadCustomCommands = loadCustomCommands;
exports.runCustomCommand = runCustomCommand;
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
/**
 * Substitute `${1}` … `${N}` placeholders and `$ARGUMENTS` in `body`.
 * Whitespace-separated tokens from `args` fill in `${1}` onwards; any
 * extra tokens after the last explicit slot fold into `$ARGUMENTS`
 * alongside the explicit substitution.
 */
function substituteArgs(body, args) {
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
function parseCommandFile(filePath, raw, source) {
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
function splitFrontmatter(raw) {
    // Match `---\n...\n---\n` (or `---\r\n...\r\n---\r\n`) at the start of the
    // file. We only support the simple `key: value` and `key: [a, b]` forms
    // intentionally — this is a tiny DSL and we don't want to pull in a YAML
    // parser for it.
    const fence = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
    const m = raw.match(fence);
    if (!m)
        return { frontmatter: {}, body: raw };
    const block = m[1] ?? '';
    const body = raw.slice(m[0].length);
    const frontmatter = {};
    for (const line of block.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const colon = trimmed.indexOf(':');
        if (colon === -1)
            continue;
        const key = trimmed.slice(0, colon).trim();
        let value = trimmed.slice(colon + 1).trim();
        if (value.startsWith('[') && value.endsWith(']')) {
            const inner = value.slice(1, -1).trim();
            if (inner.length === 0) {
                value = [];
            }
            else {
                value = inner.split(',').map((s) => unquote(s.trim())).filter((s) => s.length > 0);
            }
        }
        else {
            value = unquote(value);
        }
        frontmatter[key] = value;
    }
    return { frontmatter, body };
}
function unquote(s) {
    if ((s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }
    return s;
}
function parseStringOrArray(v) {
    if (v === undefined)
        return undefined;
    if (Array.isArray(v))
        return v;
    // Bare string after `allowed-tools: foo, bar` — split on commas.
    return v.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}
/**
 * Walk a directory non-recursively, returning all `*.md` files. Missing
 * directories resolve to an empty list (we don't want a missing user
 * `~/.chimera/commands` to throw — that's a normal first-run state).
 */
async function readCommandFilesIn(dir) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return [];
        throw err;
    }
    const files = [];
    for (const entry of entries) {
        if (!entry.isFile())
            continue;
        if (!entry.name.endsWith('.md'))
            continue;
        files.push(path.join(dir, entry.name));
    }
    return files.sort();
}
/**
 * Walk `.chimera/commands/*.md` (workspace) and `~/.chimera/commands/*.md`
 * (user). Workspace definitions take precedence on name collisions. A
 * missing user directory is not an error.
 */
async function loadCustomCommands(options = {}) {
    const workspaceRoot = options.workspaceRoot ?? process.cwd();
    const homeDir = options.homeDir ?? os.homedir();
    const workspaceDir = path.join(workspaceRoot, '.chimera', 'commands');
    const userDir = path.join(homeDir, '.chimera', 'commands');
    const [workspaceFiles, userFiles] = await Promise.all([
        readCommandFilesIn(workspaceDir),
        readCommandFilesIn(userDir),
    ]);
    const out = new Map();
    // User first, then workspace — workspace entries overwrite on collision.
    for (const file of userFiles) {
        const cmd = await loadOne(file, 'user');
        if (cmd)
            out.set(cmd.name, cmd);
    }
    for (const file of workspaceFiles) {
        const cmd = await loadOne(file, 'workspace');
        if (cmd)
            out.set(cmd.name, cmd);
    }
    return out;
}
async function loadOne(file, source) {
    let raw;
    try {
        raw = await fs.readFile(file, 'utf-8');
    }
    catch {
        return null;
    }
    try {
        return parseCommandFile(file, raw, source);
    }
    catch {
        return null;
    }
}
/**
 * Print a custom command's body to stdout. A real implementation would
 * feed the substituted body into an LLM call; for now we surface the
 * rendered prompt so users can see what the slash command expands to.
 */
async function runCustomCommand(name, args, currentOrchestrator) {
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
        }
        catch (err) {
            console.error(`  /${name} failed: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
    }
    console.log(`\n/${name} ${args.join(' ')}`.trim());
    if (cmd.description)
        console.log(`  ${cmd.description}`);
    if (cmd.argumentHint)
        console.log(`  args: ${cmd.argumentHint}`);
    if (cmd.allowedTools.length > 0) {
        console.log(`  tools: ${cmd.allowedTools.join(', ')}`);
    }
    if (cmd.model)
        console.log(`  model: ${cmd.model}`);
    console.log('');
    console.log(rendered);
    console.log('');
}
//# sourceMappingURL=custom-loader.js.map