"use strict";
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
exports.detectProjectContext = detectProjectContext;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function readFileSyncSafe(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    }
    catch {
        return null;
    }
}
function readJsonSafe(filePath) {
    const raw = readFileSyncSafe(filePath);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function detectFromPackageJson(pkg) {
    const lines = ['Language: JavaScript/TypeScript (Node.js)'];
    if (pkg.name)
        lines.push(`Project: ${pkg.name}`);
    if (pkg.description)
        lines.push(`Description: ${pkg.description}`);
    // Detect framework from dependencies
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const frameworks = [];
    if (allDeps['react'])
        frameworks.push('React');
    if (allDeps['vue'])
        frameworks.push('Vue');
    if (allDeps['angular'])
        frameworks.push('Angular');
    if (allDeps['svelte'])
        frameworks.push('Svelte');
    if (allDeps['next'])
        frameworks.push('Next.js');
    if (allDeps['nuxt'])
        frameworks.push('Nuxt');
    if (allDeps['express'])
        frameworks.push('Express');
    if (allDeps['fastify'])
        frameworks.push('Fastify');
    if (allDeps['nestjs'])
        frameworks.push('NestJS');
    if (allDeps['hono'])
        frameworks.push('Hono');
    if (allDeps['typescript'])
        lines.push('TypeScript: yes');
    if (frameworks.length > 0)
        lines.push(`Framework: ${frameworks.join(', ')}`);
    // Detect test runner
    const testDeps = ['jest', 'vitest', 'mocha', 'ava', 'tap', 'c8', 'nyc'];
    const testFrameworks = testDeps.filter((d) => allDeps[d]);
    if (testFrameworks.length > 0)
        lines.push(`Test runner: ${testFrameworks.join(', ')}`);
    // Detect lint/format
    const lintDeps = ['eslint', 'prettier', 'biome', 'oxlint', 'deno_lint'];
    const lintTools = lintDeps.filter((d) => allDeps[d]);
    if (lintTools.length > 0)
        lines.push(`Lint/format: ${lintTools.join(', ')}`);
    // Key scripts
    const scripts = pkg.scripts ?? {};
    const importantScripts = ['build', 'test', 'lint', 'dev', 'start']
        .filter((s) => scripts[s])
        .map((s) => `${s}: ${scripts[s]}`);
    if (importantScripts.length > 0)
        lines.push(`Scripts: ${importantScripts.join('; ')}`);
    // Package manager hint
    if (pkg.packageManager)
        lines.push(`Package manager: ${pkg.packageManager}`);
    if (pkg.engines?.node)
        lines.push(`Node version: ${pkg.engines.node}`);
    return lines.join('\n');
}
function detectFromPyproject(content) {
    const lines = ['Language: Python'];
    // Framework
    if (/\bdjango\b/i.test(content))
        lines.push('Framework: Django');
    else if (/\bfastapi\b/i.test(content))
        lines.push('Framework: FastAPI');
    else if (/\bflask\b/i.test(content))
        lines.push('Framework: Flask');
    else if (/\bsanic\b/i.test(content))
        lines.push('Framework: Sanic');
    // Test runner
    if (/\bpytest\b/.test(content))
        lines.push('Test runner: pytest');
    else if (/\bunittest\b/.test(content))
        lines.push('Test runner: unittest');
    // Linter
    if (/\bruff\b/.test(content))
        lines.push('Linter: ruff');
    else if (/\bflake8\b/.test(content))
        lines.push('Linter: flake8');
    else if (/\bpylint\b/.test(content))
        lines.push('Linter: pylint');
    else if (/\bmypy\b/.test(content))
        lines.push('Type checker: mypy');
    // Package manager
    if (/\bpoetry\b/.test(content))
        lines.push('Package manager: Poetry');
    else if (/\bultralisk\b|\buv\b/.test(content))
        lines.push('Package manager: uv');
    else if (/\bpipenv\b/.test(content))
        lines.push('Package manager: Pipenv');
    return lines.join('\n');
}
/**
 * Detect project metadata from the workspace root.
 * Returns a concise string suitable for injection into the system prompt.
 * Returns empty string if no manifest files are found.
 */
function detectProjectContext(workspaceRoot) {
    // Node.js
    const pkg = readJsonSafe(path.join(workspaceRoot, 'package.json'));
    if (pkg)
        return detectFromPackageJson(pkg);
    // Python
    const pyproject = readFileSyncSafe(path.join(workspaceRoot, 'pyproject.toml'));
    if (pyproject)
        return detectFromPyproject(pyproject);
    // Rust
    if (readFileSyncSafe(path.join(workspaceRoot, 'Cargo.toml'))) {
        const cargoToml = readFileSyncSafe(path.join(workspaceRoot, 'Cargo.toml')) ?? '';
        const nameMatch = cargoToml.match(/^name\s*=\s*"([^"]+)"/m);
        const lines = ['Language: Rust'];
        if (nameMatch)
            lines.push(`Crate: ${nameMatch[1]}`);
        lines.push('Build: cargo build; Test: cargo test; Lint: cargo clippy');
        return lines.join('\n');
    }
    // Go
    if (readFileSyncSafe(path.join(workspaceRoot, 'go.mod'))) {
        const goMod = readFileSyncSafe(path.join(workspaceRoot, 'go.mod')) ?? '';
        const moduleMatch = goMod.match(/^module\s+(.+)/m);
        const lines = ['Language: Go'];
        if (moduleMatch)
            lines.push(`Module: ${moduleMatch[1].trim()}`);
        lines.push('Build: go build ./...; Test: go test ./...; Lint: go vet ./...');
        return lines.join('\n');
    }
    // Java (Maven)
    if (readFileSyncSafe(path.join(workspaceRoot, 'pom.xml'))) {
        return 'Language: Java (Maven)\nBuild: mvn package; Test: mvn test';
    }
    // Java (Gradle)
    if (readFileSyncSafe(path.join(workspaceRoot, 'build.gradle'))) {
        return 'Language: Java (Gradle)\nBuild: gradle build; Test: gradle test';
    }
    // Elixir
    if (readFileSyncSafe(path.join(workspaceRoot, 'mix.exs'))) {
        return 'Language: Elixir (Mix)\nBuild: mix compile; Test: mix test';
    }
    // Ruby
    if (readFileSyncSafe(path.join(workspaceRoot, 'Gemfile'))) {
        return 'Language: Ruby (Bundler)\nBuild: bundle exec rake; Test: bundle exec rspec';
    }
    // C# (.csproj)
    const csprojFiles = fs.readdirSync(workspaceRoot).filter((f) => f.endsWith('.csproj'));
    if (csprojFiles.length > 0) {
        return 'Language: C# (.NET)\nBuild: dotnet build; Test: dotnet test';
    }
    return '';
}
//# sourceMappingURL=project-detection.js.map