import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import type { EmbeddingProvider } from './embedding-provider.js';
import { VectorStore } from './vector-store.js';

export interface ContextEngineConfig {
  alpha?: number;
  beta?: number;
  gamma?: number;
  embeddingProvider?: EmbeddingProvider;
  vectorStore?: VectorStore;
}

export interface RepoIndex {
  files: Map<string, { tokensEstimate: number; imports: string[] }>;
  symbols: Map<string, Array<{ file: string; line: number; kind: string }>>;
}

export class ContextEngine {
  private repoIndex: RepoIndex = { files: new Map(), symbols: new Map() };
  private importGraph: Map<string, string[]> = new Map();
  private embeddingProvider: EmbeddingProvider | undefined;
  private vectorStore: VectorStore;
  private alpha: number;
  private beta: number;
  private gamma: number;

  constructor(
    private workspaceRoot: string,
    private instructionsFile?: string,
    config: ContextEngineConfig = {}
  ) {
    this.embeddingProvider = config.embeddingProvider;
    this.vectorStore = config.vectorStore ?? new VectorStore();
    this.alpha = config.alpha ?? 0.4;
    this.beta = config.beta ?? 0.4;
    this.gamma = config.gamma ?? 0.2;
  }

  // ─── Indexing ────────────────────────────────────────────────────────────

  async indexRepo(): Promise<void> {
    this.repoIndex = { files: new Map(), symbols: new Map() };
    this.importGraph = new Map();
    this.vectorStore.clear();

    const files = this.walk(this.workspaceRoot);
    for (const file of files) {
      const relativePath = path.relative(this.workspaceRoot, file);
      const ext = path.extname(file);
      if (['.ts', '.js', '.tsx', '.jsx', '.py', '.rs', '.go'].includes(ext)) {
        try {
          const content = readFileSync(file, 'utf-8');
          const tokens = Math.ceil(content.length / 4);
          const imports = this.extractImports(content, ext);
          this.repoIndex.files.set(relativePath, {
            tokensEstimate: tokens,
            imports,
          });
          this.importGraph.set(relativePath, imports);
          this.extractSymbols(content, relativePath, ext);
        } catch {
          // Skip unreadable files
        }
      }
    }

    if (this.embeddingProvider) {
      await this.buildVectorIndex();
    }
  }

  private async buildVectorIndex(): Promise<void> {
    if (!this.embeddingProvider) return;
    const docs = Array.from(this.repoIndex.files.keys()).map(f => {
      try {
        return readFileSync(path.join(this.workspaceRoot, f), 'utf-8');
      } catch {
        return '';
      }
    });
    const embeddings = await this.embeddingProvider.embedBatch(docs);
    const keys = Array.from(this.repoIndex.files.keys());
    for (let i = 0; i < keys.length; i++) {
      this.vectorStore.add(keys[i], embeddings[i], { file: keys[i] });
    }
  }

  private walk(dir: string): string[] {
    const files: string[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
            files.push(...this.walk(fullPath));
          }
        } else {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip inaccessible directories
    }
    return files;
  }

  // ─── Symbol Extraction ──────────────────────────────────────────────────

  private extractSymbols(
    content: string,
    filePath: string,
    ext: string
  ): void {
    if (ext !== '.ts' && ext !== '.js' && ext !== '.tsx' && ext !== '.jsx') return;

    const patterns: Array<{ regex: RegExp; kind: string }> = [
      { regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, kind: 'function' },
      { regex: /(?:export\s+)?class\s+(\w+)/g, kind: 'class' },
      { regex: /(?:export\s+)?interface\s+(\w+)/g, kind: 'interface' },
      { regex: /(?:export\s+)?type\s+(\w+)/g, kind: 'type' },
      { regex: /(?:export\s+)?enum\s+(\w+)/g, kind: 'enum' },
      { regex: /(?:export\s+)(?:const|let|var)\s+(\w+)/g, kind: 'variable' },
    ];

    for (const { regex, kind } of patterns) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const name = match[1];
        const line = content.slice(0, match.index).split('\n').length;
        const existing = this.repoIndex.symbols.get(name) ?? [];
        existing.push({ file: filePath, line, kind });
        this.repoIndex.symbols.set(name, existing);
      }
    }
  }

  // ─── Import Extraction ──────────────────────────────────────────────────

  private extractImports(content: string, ext: string): string[] {
    const imports: string[] = [];

    if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
      const matches = content.match(/import\s+.*from\s+['"]([^'"]+)['"]/g);
      if (matches) {
        for (const m of matches) {
          const importMatch = m.match(/from\s+['"]([^'"]+)['"]/);
          if (importMatch) imports.push(importMatch[1]);
        }
      }
    } else if (ext === '.py') {
      const matches = content.match(/import\s+(\w+)|from\s+(\w+)\s+import/g);
      if (matches) {
        for (const m of matches) {
          const match = m.match(/(?:import\s+|from\s+)(\w+)/);
          if (match) imports.push(match[1]);
        }
      }
    }

    return imports;
  }

  // ─── Basic Accessors ────────────────────────────────────────────────────

  getIndexedFiles(): string[] {
    return Array.from(this.repoIndex.files.keys());
  }

  getFileTokens(filePath: string): number | undefined {
    return this.repoIndex.files.get(filePath)?.tokensEstimate;
  }

  getTotalTokens(): number {
    let total = 0;
    for (const file of this.repoIndex.files.values()) {
      total += file.tokensEstimate;
    }
    return total;
  }

  // ─── File Discovery ─────────────────────────────────────────────────────

  findRelatedFiles(imports: string[]): string[] {
    const related: string[] = [];
    for (const file of this.repoIndex.files.keys()) {
      const fileImports = this.repoIndex.files.get(file)?.imports ?? [];
      if (imports.some(i => fileImports.includes(i))) {
        related.push(file);
      }
    }
    return related;
  }

  findRelatedFilesBySymbol(symbolName: string): string[] {
    const symbolFiles = this.repoIndex.symbols.get(symbolName);
    if (!symbolFiles) return [];
    const directFiles = new Set(symbolFiles.map(s => s.file));

    const related = new Set<string>();
    for (const f of directFiles) {
      related.add(f);
    }

    // Also find files that import from files defining this symbol
    for (const [file, fileImports] of this.importGraph.entries()) {
      for (const df of directFiles) {
        const importPath = df.replace(/\.(ts|tsx|js|jsx)$/, '');
        if (
          fileImports.includes(df) ||
          fileImports.includes(importPath) ||
          fileImports.includes('./' + importPath) ||
          fileImports.includes('../' + importPath)
        ) {
          related.add(file);
        }
      }
    }

    return Array.from(related);
  }

  // ─── Import Centrality ──────────────────────────────────────────────────

  private computeImportCentrality(): Map<string, number> {
    const scores = new Map<string, number>();
    for (const file of this.repoIndex.files.keys()) {
      scores.set(file, 0);
    }
    for (const [, imports] of this.importGraph) {
      for (const imp of imports) {
        const normalized = imp.replace(/^\.\//, '');
        for (const file of this.repoIndex.files.keys()) {
          if (
            file === normalized ||
            file.endsWith('/' + normalized) ||
            file === normalized + '.ts' ||
            file === normalized + '.tsx' ||
            file === normalized + '.js' ||
            file === normalized + '.jsx'
          ) {
            scores.set(file, (scores.get(file) ?? 0) + 1);
          }
        }
      }
    }
    return scores;
  }

  // ─── Instruction Hierarchy ──────────────────────────────────────────────

  static readonly SYSTEM_POLICY = `# Chimera Core Rules
- All code must be modular and reusable.
- Single responsibility: each module does one thing well.
- Interface-first: define contracts before implementations.
- Dependency injection: pass dependencies as parameters.
- Pure functions where possible.
- Composable over monolithic.
- No circular dependencies.`;

  async getInstructionsHierarchy(
    params: { mode?: string; touchedFiles?: string[] } = {}
  ): Promise<string> {
    const sections: string[] = [];

    // Layer 1: System policy
    sections.push(`## System Policy\n\n${ContextEngine.SYSTEM_POLICY}`);

    // Layer 2: User request (from existing instructions file)
    const userInstructions = await this.getAgentInstructions();
    if (userInstructions) {
      sections.push(`## User Request\n\n${userInstructions}`);
    }

    // Layer 3: Mode policy
    if (params.mode) {
      const modeFile = path.join(
        this.workspaceRoot,
        '.chimera',
        'modes',
        `${params.mode}.md`
      );
      if (existsSync(modeFile)) {
        try {
          const modeContent = readFileSync(modeFile, 'utf-8');
          sections.push(`## Mode: ${params.mode}\n\n${modeContent}`);
        } catch {
          // Skip unreadable mode file
        }
      }
    }

    // Layer 4: Repository instructions nearest to touched files
    if (params.touchedFiles?.length) {
      const nearby = this.findNearbyInstructions(params.touchedFiles);
      if (nearby) {
        sections.push(`## Nearby Repository Instructions\n\n${nearby}`);
      }
    }

    // Layer 5: Global user preferences
    const prefsFile = path.join(this.workspaceRoot, '.chimera', 'preferences.md');
    if (existsSync(prefsFile)) {
      try {
        const prefs = readFileSync(prefsFile, 'utf-8');
        sections.push(`## User Preferences\n\n${prefs}`);
      } catch {
        // Skip unreadable prefs
      }
    }

    // Layer 6: Generated memory
    const memoryDir = path.join(this.workspaceRoot, '.chimera', 'memory');
    if (existsSync(memoryDir)) {
      try {
        const memoryFiles = readdirSync(memoryDir, { withFileTypes: true })
          .filter(e => e.isFile() && e.name.endsWith('.md'))
          .map(e => path.join(memoryDir, e.name));
        for (const mf of memoryFiles) {
          const content = readFileSync(mf, 'utf-8');
          sections.push(`## Memory: ${path.basename(mf, '.md')}\n\n${content}`);
        }
      } catch {
        // Skip unreadable memory
      }
    }

    return sections.join('\n\n---\n\n');
  }

  private findNearbyInstructions(touchedFiles: string[]): string {
    const seen = new Set<string>();
    const parts: string[] = [];

    for (const tf of touchedFiles) {
      let dir = path.dirname(tf);
      while (dir !== '.' && dir !== '/') {
        const candidates = ['AGENTS.md', 'CLAUDE.md', 'instructions.md'];
        for (const name of candidates) {
          const p = path.join(this.workspaceRoot, dir, name);
          if (existsSync(p) && !seen.has(p)) {
            seen.add(p);
            try {
              parts.push(`### ${path.join(dir, name)}\n\n${readFileSync(p, 'utf-8')}`);
            } catch {
              // Skip
            }
          }
        }
        dir = path.dirname(dir);
      }
    }
    return parts.join('\n\n');
  }

  async getAgentInstructions(): Promise<string> {
    const candidates = [
      this.instructionsFile,
      path.join(this.workspaceRoot, 'AGENTS.md'),
      path.join(this.workspaceRoot, 'CLAUDE.md'),
      path.join(this.workspaceRoot, '.chimera', 'instructions.md'),
    ].filter(Boolean) as string[];

    for (const file of candidates) {
      if (existsSync(file)) {
        try {
          return readFileSync(file, 'utf-8');
        } catch {
          continue;
        }
      }
    }
    return '';
  }

  async setInstructions(content: string): Promise<void> {
    if (!this.instructionsFile) return;
    const { writeFile } = await import('fs/promises');
    await writeFile(this.instructionsFile, content, 'utf-8');
  }

  // ─── Repo Map ───────────────────────────────────────────────────────────

  getRepoMap(): string {
    const centrality = this.computeImportCentrality();
    const dirs = new Map<string, string[]>();
    const maxTokens = Math.max(
      ...Array.from(this.repoIndex.files.values()).map(f => f.tokensEstimate),
      1
    );

    for (const file of this.repoIndex.files.keys()) {
      const dir = path.dirname(file);
      if (!dirs.has(dir)) dirs.set(dir, []);
      dirs.get(dir)!.push(file);
    }

    const lines: string[] = [`# Repository Map (${this.repoIndex.files.size} files, ~${this.getTotalTokens()} tokens)\n`];
    const sortedDirs = Array.from(dirs.keys()).sort();

    for (const dir of sortedDirs) {
      lines.push(`📂 ${dir}/`);
      const files = dirs.get(dir)!.sort();
      for (const file of files) {
        const meta = this.repoIndex.files.get(file)!;
        const score = centrality.get(file) ?? 0;
        const bar = this.importanceBar(score, maxTokens);
        const filename = path.basename(file);
        const symbolCount = this.countFileSymbols(file);
        lines.push(`  ${bar} ${filename} (~${meta.tokensEstimate} tok)${symbolCount > 0 ? ` [${symbolCount} symbols]` : ''}`);
      }
    }

    return lines.join('\n');
  }

  private importanceBar(score: number, max: number): string {
    const level = Math.min(4, Math.floor((score / Math.max(max, 1)) * 5));
    return ['.', '*', '+', '**', '***'][level] ?? '***';
  }

  private countFileSymbols(filePath: string): number {
    let count = 0;
    for (const [, entries] of this.repoIndex.symbols) {
      for (const e of entries) {
        if (e.file === filePath) count++;
      }
    }
    return count;
  }

  // ─── Context Packing ────────────────────────────────────────────────────

  async buildContextPack(params: {
    task: string;
    maxTokens: number;
    includeFiles?: string[];
    excludePatterns?: string[];
  }): Promise<{
    files: Array<{ path: string; content: string; tokens: number; reason: string }>;
    totalTokens: number;
    summary: string;
  }> {
    const { task, maxTokens, includeFiles = [], excludePatterns = [] } = params;
    const centrality = this.computeImportCentrality();
    const packed: Array<{ path: string; content: string; tokens: number; reason: string }> = [];
    let totalTokens = 0;

    const shouldExclude = (f: string): boolean =>
      excludePatterns.some(p => f.includes(p));

    const tryAdd = (f: string, reason: string): boolean => {
      if (shouldExclude(f)) return false;
      if (packed.some(p => p.path === f)) return false;
      const tokens = this.repoIndex.files.get(f)?.tokensEstimate ?? 0;
      if (totalTokens + tokens > maxTokens) return false;
      try {
        const content = readFileSync(path.join(this.workspaceRoot, f), 'utf-8');
        packed.push({ path: f, content, tokens, reason });
        totalTokens += tokens;
        return true;
      } catch {
        return false;
      }
    };

    // Step 1: Hybrid relevance scoring (keyword + embedding + centrality)
    const taskWords = task
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);
    const keywordScores = new Map<string, number>();
    const maxCentrality = Math.max(...centrality.values(), 1);

    for (const file of this.repoIndex.files.keys()) {
      let kw = 0;
      const lower = file.toLowerCase();
      for (const w of taskWords) {
        if (lower.includes(w)) kw += 10;
      }
      for (const [symbol, entries] of this.repoIndex.symbols) {
        if (taskWords.some(w => symbol.toLowerCase().includes(w))) {
          if (entries.some(e => e.file === file)) kw += 5;
        }
      }
      keywordScores.set(file, kw);
    }

    const embeddingScores = new Map<string, number>();
    if (this.embeddingProvider) {
      const queryVec = await this.embeddingProvider.embed(task);
      const results = this.vectorStore.search(queryVec, this.repoIndex.files.size);
      const maxEmb = Math.max(...results.map(r => r.score), 1);
      for (const r of results) {
        embeddingScores.set(r.id, maxEmb > 0 ? r.score / maxEmb : 0);
      }
    }

    const maxKw = Math.max(...keywordScores.values(), 1);
    const scored: Array<{ file: string; relevance: number }> = [];
    for (const file of this.repoIndex.files.keys()) {
      const kwNorm = maxKw > 0 ? (keywordScores.get(file) ?? 0) / maxKw : 0;
      const embNorm = embeddingScores.get(file) ?? 0;
      const centNorm = ((centrality.get(file) ?? 0) / maxCentrality);
      const relevance =
        this.alpha * kwNorm + this.beta * embNorm + this.gamma * centNorm;
      if (relevance > 0) scored.push({ file, relevance });
    }
    scored.sort((a, b) => b.relevance - a.relevance);
    for (const { file } of scored) {
      if (totalTokens >= maxTokens) break;
      tryAdd(file, 'task-relevant');
    }

    // Step 2: Explicitly included files
    for (const f of includeFiles) {
      if (totalTokens >= maxTokens) break;
      tryAdd(f, 'explicitly-included');
    }

    // Step 3: High-centrality files
    const centralitySorted = Array.from(this.repoIndex.files.keys())
      .sort((a, b) => (centrality.get(b) ?? 0) - (centrality.get(a) ?? 0));
    for (const f of centralitySorted) {
      if (totalTokens >= maxTokens) break;
      tryAdd(f, 'high-centrality');
    }

    const summary = `Context pack: ${packed.length} files, ${totalTokens} tokens, for task: "${task.slice(0, 60)}"`;
    return { files: packed, totalTokens, summary };
  }
}
