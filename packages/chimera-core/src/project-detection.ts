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

import * as fs from 'fs';
import * as path from 'path';

function readFileSyncSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function readJsonSafe<T>(filePath: string): T | null {
  const raw = readFileSyncSafe(filePath);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

interface PackageJson {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  packageManager?: string;
}

function detectFromPackageJson(pkg: PackageJson): string {
  const lines: string[] = ['Language: JavaScript/TypeScript (Node.js)'];

  if (pkg.name) lines.push(`Project: ${pkg.name}`);
  if (pkg.description) lines.push(`Description: ${pkg.description}`);

  // Detect framework from dependencies
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const frameworks: string[] = [];
  if (allDeps['react']) frameworks.push('React');
  if (allDeps['vue']) frameworks.push('Vue');
  if (allDeps['angular']) frameworks.push('Angular');
  if (allDeps['svelte']) frameworks.push('Svelte');
  if (allDeps['next']) frameworks.push('Next.js');
  if (allDeps['nuxt']) frameworks.push('Nuxt');
  if (allDeps['express']) frameworks.push('Express');
  if (allDeps['fastify']) frameworks.push('Fastify');
  if (allDeps['nestjs']) frameworks.push('NestJS');
  if (allDeps['hono']) frameworks.push('Hono');
  if (allDeps['typescript']) lines.push('TypeScript: yes');
  if (frameworks.length > 0) lines.push(`Framework: ${frameworks.join(', ')}`);

  // Detect test runner
  const testDeps = ['jest', 'vitest', 'mocha', 'ava', 'tap', 'c8', 'nyc'];
  const testFrameworks = testDeps.filter((d) => allDeps[d]);
  if (testFrameworks.length > 0) lines.push(`Test runner: ${testFrameworks.join(', ')}`);

  // Detect lint/format
  const lintDeps = ['eslint', 'prettier', 'biome', 'oxlint', 'deno_lint'];
  const lintTools = lintDeps.filter((d) => allDeps[d]);
  if (lintTools.length > 0) lines.push(`Lint/format: ${lintTools.join(', ')}`);

  // Key scripts
  const scripts = pkg.scripts ?? {};
  const importantScripts = ['build', 'test', 'lint', 'dev', 'start']
    .filter((s) => scripts[s])
    .map((s) => `${s}: ${scripts[s]}`);
  if (importantScripts.length > 0) lines.push(`Scripts: ${importantScripts.join('; ')}`);

  // Package manager hint
  if (pkg.packageManager) lines.push(`Package manager: ${pkg.packageManager}`);
  if (pkg.engines?.node) lines.push(`Node version: ${pkg.engines.node}`);

  return lines.join('\n');
}

function detectFromPyproject(content: string): string {
  const lines: string[] = ['Language: Python'];

  // Framework
  if (/\bdjango\b/i.test(content)) lines.push('Framework: Django');
  else if (/\bfastapi\b/i.test(content)) lines.push('Framework: FastAPI');
  else if (/\bflask\b/i.test(content)) lines.push('Framework: Flask');
  else if (/\bsanic\b/i.test(content)) lines.push('Framework: Sanic');

  // Test runner
  if (/\bpytest\b/.test(content)) lines.push('Test runner: pytest');
  else if (/\bunittest\b/.test(content)) lines.push('Test runner: unittest');

  // Linter
  if (/\bruff\b/.test(content)) lines.push('Linter: ruff');
  else if (/\bflake8\b/.test(content)) lines.push('Linter: flake8');
  else if (/\bpylint\b/.test(content)) lines.push('Linter: pylint');
  else if (/\bmypy\b/.test(content)) lines.push('Type checker: mypy');

  // Package manager
  if (/\bpoetry\b/.test(content)) lines.push('Package manager: Poetry');
  else if (/\bultralisk\b|\buv\b/.test(content)) lines.push('Package manager: uv');
  else if (/\bpipenv\b/.test(content)) lines.push('Package manager: Pipenv');

  return lines.join('\n');
}

/**
 * Detect project metadata from the workspace root.
 * Returns a concise string suitable for injection into the system prompt.
 * Returns empty string if no manifest files are found.
 */
export function detectProjectContext(workspaceRoot: string): string {
  // Node.js
  const pkg = readJsonSafe<PackageJson>(path.join(workspaceRoot, 'package.json'));
  if (pkg) return detectFromPackageJson(pkg);

  // Python
  const pyproject = readFileSyncSafe(path.join(workspaceRoot, 'pyproject.toml'));
  if (pyproject) return detectFromPyproject(pyproject);

  // Rust
  if (readFileSyncSafe(path.join(workspaceRoot, 'Cargo.toml'))) {
    const cargoToml = readFileSyncSafe(path.join(workspaceRoot, 'Cargo.toml')) ?? '';
    const nameMatch = cargoToml.match(/^name\s*=\s*"([^"]+)"/m);
    const lines = ['Language: Rust'];
    if (nameMatch) lines.push(`Crate: ${nameMatch[1]}`);
    lines.push('Build: cargo build; Test: cargo test; Lint: cargo clippy');
    return lines.join('\n');
  }

  // Go
  if (readFileSyncSafe(path.join(workspaceRoot, 'go.mod'))) {
    const goMod = readFileSyncSafe(path.join(workspaceRoot, 'go.mod')) ?? '';
    const moduleMatch = goMod.match(/^module\s+(.+)/m);
    const lines = ['Language: Go'];
    if (moduleMatch) lines.push(`Module: ${moduleMatch[1].trim()}`);
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
