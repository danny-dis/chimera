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
exports.initAgentsMd = initAgentsMd;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
/**
 * Generate an `AGENTS.md` for the project at `workspaceRoot`. The file
 * is intentionally short — a project map, a build/test/lint cheatsheet,
 * and the top 20 entries from the workspace tree. It is written once
 * and then left for the human to edit; passing `force: true` will
 * overwrite an existing file.
 */
const MAX_DEPTH = 3;
const TOP_ENTRIES = 20;
const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.turbo',
    '.next',
    '.cache',
    'coverage',
    'out',
    '.chimera-worktrees',
    '.worktrees',
]);
async function readJsonSafe(file) {
    try {
        return JSON.parse(await fs.readFile(file, 'utf-8'));
    }
    catch {
        return null;
    }
}
async function readTextSafe(file) {
    try {
        return await fs.readFile(file, 'utf-8');
    }
    catch {
        return null;
    }
}
async function fileExists(file) {
    try {
        await fs.access(file);
        return true;
    }
    catch {
        return false;
    }
}
function pickScript(pkg, names) {
    for (const n of names) {
        const v = pkg.scripts?.[n];
        if (v)
            return v;
    }
    return '';
}
function firstDep(deps, key) {
    return Object.prototype.hasOwnProperty.call(deps, key);
}
function detectFromPackageJson(pkg) {
    const testScript = pickScript(pkg, ['test', 'test:unit']);
    const testCommand = testScript ? 'npm test' : pickScript(pkg, ['vitest', 'jest', 'mocha']);
    const buildCommand = pickScript(pkg, ['build', 'compile', 'tsc']);
    const lintCommand = pickScript(pkg, ['lint', 'eslint', 'biome']);
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    // Framework preference order: meta-frameworks first, then libraries.
    const framework = firstDep(deps, 'next') ? 'Next.js' :
        firstDep(deps, 'nuxt') ? 'Nuxt' :
            firstDep(deps, '@sveltejs/kit') ? 'SvelteKit' :
                firstDep(deps, 'remix') || firstDep(deps, '@remix-run/react') ? 'Remix' :
                    firstDep(deps, 'astro') ? 'Astro' :
                        firstDep(deps, 'react') ? 'React' :
                            firstDep(deps, 'vue') ? 'Vue' :
                                firstDep(deps, 'svelte') ? 'Svelte' :
                                    firstDep(deps, 'express') ? 'Express' :
                                        firstDep(deps, 'fastify') ? 'Fastify' :
                                            firstDep(deps, 'hono') ? 'Hono' :
                                                '(none detected)';
    const testRunner = firstDep(deps, 'vitest') ? 'vitest' :
        firstDep(deps, 'jest') ? 'jest' :
            firstDep(deps, '@playwright/test') ? 'playwright' :
                firstDep(deps, 'cypress') ? 'cypress' :
                    firstDep(deps, 'mocha') ? 'mocha' :
                        '(none detected)';
    const linter = firstDep(deps, 'eslint') ? 'eslint' :
        firstDep(deps, '@biomejs/biome') ? 'biome' :
            firstDep(deps, 'prettier') ? 'prettier' :
                firstDep(deps, 'oxlint') ? 'oxlint' :
                    '(none detected)';
    return {
        framework,
        packageManager: '(detect from lockfile)',
        testRunner,
        linter,
        buildCommand: buildCommand || '(no build script)',
        testCommand: testCommand || '(no test script)',
        lintCommand: lintCommand || '(no lint script)',
    };
}
async function detectManifestSummary(workspaceRoot) {
    // Node
    const pkg = await readJsonSafe(path.join(workspaceRoot, 'package.json'));
    if (pkg)
        return detectFromPackageJson(pkg);
    // Python
    const pyproject = await readTextSafe(path.join(workspaceRoot, 'pyproject.toml'));
    if (pyproject) {
        const testRunner = /\bpytest\b/.test(pyproject) ? 'pytest' : '(unknown)';
        const linter = /\bruff\b/.test(pyproject)
            ? 'ruff'
            : /\bflake8\b/.test(pyproject)
                ? 'flake8'
                : '(unknown)';
        const framework = /\bdjango\b/i.test(pyproject)
            ? 'Django'
            : /\bfastapi\b/i.test(pyproject)
                ? 'FastAPI'
                : /\bflask\b/i.test(pyproject)
                    ? 'Flask'
                    : '(unknown)';
        return {
            framework,
            packageManager: 'pip / poetry / uv',
            testRunner,
            linter,
            buildCommand: '(no build script)',
            testCommand: 'pytest',
            lintCommand: linter === '(unknown)' ? '(no lint script)' : linter,
        };
    }
    // Rust
    if (await fileExists(path.join(workspaceRoot, 'Cargo.toml'))) {
        return {
            framework: '(rust crate)',
            packageManager: 'cargo',
            testRunner: 'cargo test',
            linter: 'cargo clippy',
            buildCommand: 'cargo build',
            testCommand: 'cargo test',
            lintCommand: 'cargo clippy',
        };
    }
    // Go
    if (await fileExists(path.join(workspaceRoot, 'go.mod'))) {
        return {
            framework: '(go module)',
            packageManager: 'go',
            testRunner: 'go test',
            linter: 'go vet',
            buildCommand: 'go build ./...',
            testCommand: 'go test ./...',
            lintCommand: 'go vet ./...',
        };
    }
    // Java (Maven)
    if (await fileExists(path.join(workspaceRoot, 'pom.xml'))) {
        return {
            framework: '(java/maven)',
            packageManager: 'maven',
            testRunner: 'mvn test',
            linter: 'mvn checkstyle:check',
            buildCommand: 'mvn package',
            testCommand: 'mvn test',
            lintCommand: '(none detected)',
        };
    }
    // Java (Gradle)
    if (await fileExists(path.join(workspaceRoot, 'build.gradle'))) {
        return {
            framework: '(java/gradle)',
            packageManager: 'gradle',
            testRunner: 'gradle test',
            linter: 'gradle check',
            buildCommand: 'gradle build',
            testCommand: 'gradle test',
            lintCommand: 'gradle check',
        };
    }
    return {
        framework: '(unknown)',
        packageManager: '(unknown)',
        testRunner: '(unknown)',
        linter: '(unknown)',
        buildCommand: '(unknown)',
        testCommand: '(unknown)',
        lintCommand: '(unknown)',
    };
}
async function listTopEntries(workspaceRoot) {
    const collected = [];
    async function walk(dir, depth) {
        if (depth > MAX_DEPTH)
            return;
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (entry.name.startsWith('.') && entry.name !== '.github')
                continue;
            if (SKIP_DIRS.has(entry.name))
                continue;
            const rel = path.relative(workspaceRoot, path.join(dir, entry.name)) || entry.name;
            collected.push(rel.split(path.sep).join('/'));
            if (entry.isDirectory() && collected.length < TOP_ENTRIES * 4) {
                await walk(path.join(dir, entry.name), depth + 1);
            }
            if (collected.length >= TOP_ENTRIES * 4)
                return;
        }
    }
    await walk(workspaceRoot, 0);
    // Deduplicate and sort for stability.
    const unique = Array.from(new Set(collected)).sort();
    return unique.slice(0, TOP_ENTRIES);
}
function renderMarkdown(workspaceRoot, summary, entries) {
    const projectName = path.basename(workspaceRoot) || 'project';
    const now = new Date().toISOString().slice(0, 10);
    const conventions = [];
    if (summary.testRunner !== '(unknown)' && summary.testRunner !== '(none detected)') {
        conventions.push(`Tests are run with \`${summary.testRunner}\`.`);
    }
    if (summary.linter !== '(unknown)' && summary.linter !== '(none detected)') {
        conventions.push(`Lint with \`${summary.linter}\`.`);
    }
    if (summary.framework !== '(unknown)' && summary.framework !== '(none detected)' && summary.framework !== '(none detected)') {
        conventions.push(`Framework: ${summary.framework}.`);
    }
    conventions.push('Review AGENTS.md after generation; it is a starting point, not a contract.');
    const fileMap = entries.length === 0
        ? '_no top-level files detected_'
        : entries.map((e) => `- \`${e}\``).join('\n');
    return [
        `# Project`,
        ``,
        `Auto-generated \`AGENTS.md\` for \`${projectName}\` on ${now}.`,
        `Edit freely — this file is a starting point for AI agents working in this repo.`,
        ``,
        `# Build`,
        ``,
        `- Package manager: \`${summary.packageManager}\``,
        `- Build command: \`${summary.buildCommand}\``,
        ``,
        `# Test`,
        ``,
        `- Test runner: \`${summary.testRunner}\``,
        `- Test command: \`${summary.testCommand}\``,
        ``,
        `# Lint`,
        ``,
        `- Linter: \`${summary.linter}\``,
        `- Lint command: \`${summary.lintCommand}\``,
        ``,
        `# Conventions`,
        ``,
        ...conventions.map((c) => `- ${c}`),
        ``,
        `# File Map`,
        ``,
        `Top ${TOP_ENTRIES} entries (depth ${MAX_DEPTH}, skipping \`node_modules\`, \`.git\`, \`dist\`, \`build\`, \`.turbo\`):`,
        ``,
        fileMap,
        ``,
    ].join('\n');
}
/**
 * Detect project metadata and write `AGENTS.md` at the workspace root.
 * Returns the file path and the number of bytes written. If the file
 * already exists and `force` is not set, returns `bytesWritten: 0` and
 * does not touch the file.
 */
async function initAgentsMd(workspaceRoot, opts = {}) {
    const outPath = path.join(workspaceRoot, 'AGENTS.md');
    if ((await fileExists(outPath)) && !opts.force) {
        return { path: outPath, bytesWritten: 0 };
    }
    const [summary, entries] = await Promise.all([
        detectManifestSummary(workspaceRoot),
        listTopEntries(workspaceRoot),
    ]);
    const md = renderMarkdown(workspaceRoot, summary, entries);
    await fs.writeFile(outPath, md, 'utf-8');
    return { path: outPath, bytesWritten: Buffer.byteLength(md, 'utf-8') };
}
//# sourceMappingURL=init.js.map