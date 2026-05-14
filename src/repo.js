import { promises as fs } from 'node:fs';
import path from 'node:path';

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache']);
const INSTRUCTION_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.cursorrules', '.windsurfrules']);

export async function scanRepository(root) {
  const files = await walk(root);
  const instructions = files.filter((file) => INSTRUCTION_FILES.has(path.basename(file)) || file === '.github/copilot-instructions.md' || /^\.chimera\/(rules\.md|config\.(json|yaml|yml|toml))$/.test(file));
  const packageFiles = files.filter((file) => /(^|\/)(package.json|pyproject.toml|Cargo.toml|go.mod|pom.xml|build.gradle|requirements.txt)$/.test(file));
  const docs = files.filter((file) => /^docs\//.test(file) || /README\.md$/i.test(file));
  const sourceFiles = files.filter((file) => isSourceFile(file));
  const tests = files.filter((file) => /(^|\/)(test|tests|spec)|\.(test|spec)\./i.test(file));
  const languages = detectLanguages(files);

  return {
    root,
    files,
    instructions,
    packageFiles,
    docs,
    sourceFiles,
    tests,
    languages,
    summary: summarize({ files, instructions, packageFiles, docs, sourceFiles, tests, languages }),
    evidence: buildEvidence({ files, instructions, packageFiles, docs, sourceFiles, tests, languages }),
  };
}

async function walk(root, dir = '') {
  const absolute = path.join(root, dir);
  let entries = [];
  try {
    entries = await fs.readdir(absolute, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github' && entry.name !== '.chimera') continue;
    const relative = path.join(dir, entry.name).replaceAll(path.sep, '/');
    if (entry.isDirectory() && (IGNORE_DIRS.has(entry.name) || relative === '.chimera/sessions')) continue;
    if (entry.isDirectory()) results.push(...await walk(root, relative));
    else if (entry.isFile()) results.push(relative);
  }
  return results.sort();
}

function isSourceFile(file) {
  return /\.(js|mjs|cjs|ts|tsx|jsx|py|rs|go|java|kt|rb|php|cs|cpp|c|h|hpp|swift)$/i.test(file);
}

function detectLanguages(files) {
  const counts = new Map();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const lang = {
      '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.ts': 'TypeScript', '.tsx': 'TypeScript', '.jsx': 'JavaScript',
      '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.java': 'Java', '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.cpp': 'C++', '.c': 'C',
      '.md': 'Markdown', '.json': 'JSON', '.toml': 'TOML', '.yml': 'YAML', '.yaml': 'YAML',
    }[ext];
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([language, count]) => ({ language, count }));
}

function summarize({ files, instructions, packageFiles, docs, sourceFiles, tests, languages }) {
  const languageSummary = languages.slice(0, 5).map(({ language, count }) => `${language} (${count})`).join(', ') || 'unknown';
  return `Scanned ${files.length} files. Detected languages: ${languageSummary}. Found ${sourceFiles.length} source files, ${tests.length} test-like files, ${docs.length} docs, ${packageFiles.length} package/build manifests, and ${instructions.length} instruction/config files.`;
}

function buildEvidence({ instructions, packageFiles, docs, sourceFiles, tests }) {
  return [
    `Instruction files: ${formatList(instructions)}`,
    `Package/build manifests: ${formatList(packageFiles)}`,
    `Documentation files: ${formatList(docs.slice(0, 10))}`,
    `Source file count: ${sourceFiles.length}`,
    `Test-like file count: ${tests.length}`,
  ];
}

function formatList(items) {
  return items.length ? items.join(', ') : 'none detected';
}
