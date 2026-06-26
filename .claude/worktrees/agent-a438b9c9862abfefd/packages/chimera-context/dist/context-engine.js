"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextEngine = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
class ContextEngine {
    workspaceRoot;
    instructionsFile;
    repoIndex = { files: new Map(), symbols: new Map() };
    importGraph = new Map();
    constructor(workspaceRoot, instructionsFile) {
        this.workspaceRoot = workspaceRoot;
        this.instructionsFile = instructionsFile;
    }
    // ─── Indexing ────────────────────────────────────────────────────────────
    async indexRepo() {
        this.repoIndex = { files: new Map(), symbols: new Map() };
        this.importGraph = new Map();
        const files = this.walk(this.workspaceRoot);
        for (const file of files) {
            const relativePath = path_1.default.relative(this.workspaceRoot, file);
            const ext = path_1.default.extname(file);
            if (['.ts', '.js', '.tsx', '.jsx', '.py', '.rs', '.go'].includes(ext)) {
                try {
                    const content = (0, fs_1.readFileSync)(file, 'utf-8');
                    const tokens = Math.ceil(content.length / 4);
                    const imports = this.extractImports(content, ext);
                    this.repoIndex.files.set(relativePath, {
                        tokensEstimate: tokens,
                        imports,
                    });
                    this.importGraph.set(relativePath, imports);
                    this.extractSymbols(content, relativePath, ext);
                }
                catch {
                    // Skip unreadable files
                }
            }
        }
    }
    walk(dir) {
        const files = [];
        try {
            const entries = (0, fs_1.readdirSync)(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path_1.default.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
                        files.push(...this.walk(fullPath));
                    }
                }
                else {
                    files.push(fullPath);
                }
            }
        }
        catch {
            // Skip inaccessible directories
        }
        return files;
    }
    // ─── Symbol Extraction ──────────────────────────────────────────────────
    extractSymbols(content, filePath, ext) {
        if (ext !== '.ts' && ext !== '.js' && ext !== '.tsx' && ext !== '.jsx')
            return;
        const patterns = [
            { regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, kind: 'function' },
            { regex: /(?:export\s+)?class\s+(\w+)/g, kind: 'class' },
            { regex: /(?:export\s+)?interface\s+(\w+)/g, kind: 'interface' },
            { regex: /(?:export\s+)?type\s+(\w+)/g, kind: 'type' },
            { regex: /(?:export\s+)?enum\s+(\w+)/g, kind: 'enum' },
            { regex: /(?:export\s+)(?:const|let|var)\s+(\w+)/g, kind: 'variable' },
        ];
        for (const { regex, kind } of patterns) {
            let match;
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
    extractImports(content, ext) {
        const imports = [];
        if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
            const matches = content.match(/import\s+.*from\s+['"]([^'"]+)['"]/g);
            if (matches) {
                for (const m of matches) {
                    const importMatch = m.match(/from\s+['"]([^'"]+)['"]/);
                    if (importMatch)
                        imports.push(importMatch[1]);
                }
            }
        }
        else if (ext === '.py') {
            const matches = content.match(/import\s+(\w+)|from\s+(\w+)\s+import/g);
            if (matches) {
                for (const m of matches) {
                    const match = m.match(/(?:import\s+|from\s+)(\w+)/);
                    if (match)
                        imports.push(match[1]);
                }
            }
        }
        return imports;
    }
    // ─── Basic Accessors ────────────────────────────────────────────────────
    getIndexedFiles() {
        return Array.from(this.repoIndex.files.keys());
    }
    getFileTokens(filePath) {
        return this.repoIndex.files.get(filePath)?.tokensEstimate;
    }
    getTotalTokens() {
        let total = 0;
        for (const file of this.repoIndex.files.values()) {
            total += file.tokensEstimate;
        }
        return total;
    }
    // ─── File Discovery ─────────────────────────────────────────────────────
    findRelatedFiles(imports) {
        const related = [];
        for (const file of this.repoIndex.files.keys()) {
            const fileImports = this.repoIndex.files.get(file)?.imports ?? [];
            if (imports.some(i => fileImports.includes(i))) {
                related.push(file);
            }
        }
        return related;
    }
    findRelatedFilesBySymbol(symbolName) {
        const symbolFiles = this.repoIndex.symbols.get(symbolName);
        if (!symbolFiles)
            return [];
        const directFiles = new Set(symbolFiles.map(s => s.file));
        const related = new Set();
        for (const f of directFiles) {
            related.add(f);
        }
        // Also find files that import from files defining this symbol
        for (const [file, fileImports] of this.importGraph.entries()) {
            for (const df of directFiles) {
                const importPath = df.replace(/\.(ts|tsx|js|jsx)$/, '');
                if (fileImports.includes(df) ||
                    fileImports.includes(importPath) ||
                    fileImports.includes('./' + importPath) ||
                    fileImports.includes('../' + importPath)) {
                    related.add(file);
                }
            }
        }
        return Array.from(related);
    }
    // ─── Import Centrality ──────────────────────────────────────────────────
    computeImportCentrality() {
        const scores = new Map();
        for (const file of this.repoIndex.files.keys()) {
            scores.set(file, 0);
        }
        for (const [, imports] of this.importGraph) {
            for (const imp of imports) {
                const normalized = imp.replace(/^\.\//, '');
                for (const file of this.repoIndex.files.keys()) {
                    if (file === normalized ||
                        file.endsWith('/' + normalized) ||
                        file === normalized + '.ts' ||
                        file === normalized + '.tsx' ||
                        file === normalized + '.js' ||
                        file === normalized + '.jsx') {
                        scores.set(file, (scores.get(file) ?? 0) + 1);
                    }
                }
            }
        }
        return scores;
    }
    // ─── Instruction Hierarchy ──────────────────────────────────────────────
    static SYSTEM_POLICY = `# Chimera Core Rules
- All code must be modular and reusable.
- Single responsibility: each module does one thing well.
- Interface-first: define contracts before implementations.
- Dependency injection: pass dependencies as parameters.
- Pure functions where possible.
- Composable over monolithic.
- No circular dependencies.`;
    async getInstructionsHierarchy(params = {}) {
        const sections = [];
        // Layer 1: System policy
        sections.push(`## System Policy\n\n${ContextEngine.SYSTEM_POLICY}`);
        // Layer 2: User request (from existing instructions file)
        const userInstructions = await this.getAgentInstructions();
        if (userInstructions) {
            sections.push(`## User Request\n\n${userInstructions}`);
        }
        // Layer 3: Mode policy
        if (params.mode) {
            const modeFile = path_1.default.join(this.workspaceRoot, '.chimera', 'modes', `${params.mode}.md`);
            if ((0, fs_1.existsSync)(modeFile)) {
                try {
                    const modeContent = (0, fs_1.readFileSync)(modeFile, 'utf-8');
                    sections.push(`## Mode: ${params.mode}\n\n${modeContent}`);
                }
                catch {
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
        const prefsFile = path_1.default.join(this.workspaceRoot, '.chimera', 'preferences.md');
        if ((0, fs_1.existsSync)(prefsFile)) {
            try {
                const prefs = (0, fs_1.readFileSync)(prefsFile, 'utf-8');
                sections.push(`## User Preferences\n\n${prefs}`);
            }
            catch {
                // Skip unreadable prefs
            }
        }
        // Layer 6: Generated memory
        const memoryDir = path_1.default.join(this.workspaceRoot, '.chimera', 'memory');
        if ((0, fs_1.existsSync)(memoryDir)) {
            try {
                const memoryFiles = (0, fs_1.readdirSync)(memoryDir, { withFileTypes: true })
                    .filter(e => e.isFile() && e.name.endsWith('.md'))
                    .map(e => path_1.default.join(memoryDir, e.name));
                for (const mf of memoryFiles) {
                    const content = (0, fs_1.readFileSync)(mf, 'utf-8');
                    sections.push(`## Memory: ${path_1.default.basename(mf, '.md')}\n\n${content}`);
                }
            }
            catch {
                // Skip unreadable memory
            }
        }
        return sections.join('\n\n---\n\n');
    }
    findNearbyInstructions(touchedFiles) {
        const seen = new Set();
        const parts = [];
        for (const tf of touchedFiles) {
            let dir = path_1.default.dirname(tf);
            while (dir !== '.' && dir !== '/') {
                const candidates = ['AGENTS.md', 'CLAUDE.md', 'instructions.md'];
                for (const name of candidates) {
                    const p = path_1.default.join(this.workspaceRoot, dir, name);
                    if ((0, fs_1.existsSync)(p) && !seen.has(p)) {
                        seen.add(p);
                        try {
                            parts.push(`### ${path_1.default.join(dir, name)}\n\n${(0, fs_1.readFileSync)(p, 'utf-8')}`);
                        }
                        catch {
                            // Skip
                        }
                    }
                }
                dir = path_1.default.dirname(dir);
            }
        }
        return parts.join('\n\n');
    }
    async getAgentInstructions() {
        const candidates = [
            this.instructionsFile,
            path_1.default.join(this.workspaceRoot, 'AGENTS.md'),
            path_1.default.join(this.workspaceRoot, 'CLAUDE.md'),
            path_1.default.join(this.workspaceRoot, '.chimera', 'instructions.md'),
        ].filter(Boolean);
        for (const file of candidates) {
            if ((0, fs_1.existsSync)(file)) {
                try {
                    return (0, fs_1.readFileSync)(file, 'utf-8');
                }
                catch {
                    continue;
                }
            }
        }
        return '';
    }
    async setInstructions(content) {
        if (!this.instructionsFile)
            return;
        const { writeFile } = await import('fs/promises');
        await writeFile(this.instructionsFile, content, 'utf-8');
    }
    // ─── Repo Map ───────────────────────────────────────────────────────────
    getRepoMap() {
        const centrality = this.computeImportCentrality();
        const dirs = new Map();
        const maxTokens = Math.max(...Array.from(this.repoIndex.files.values()).map(f => f.tokensEstimate), 1);
        for (const file of this.repoIndex.files.keys()) {
            const dir = path_1.default.dirname(file);
            if (!dirs.has(dir))
                dirs.set(dir, []);
            dirs.get(dir).push(file);
        }
        const lines = [`# Repository Map (${this.repoIndex.files.size} files, ~${this.getTotalTokens()} tokens)\n`];
        const sortedDirs = Array.from(dirs.keys()).sort();
        for (const dir of sortedDirs) {
            lines.push(`📂 ${dir}/`);
            const files = dirs.get(dir).sort();
            for (const file of files) {
                const meta = this.repoIndex.files.get(file);
                const score = centrality.get(file) ?? 0;
                const bar = this.importanceBar(score, maxTokens);
                const filename = path_1.default.basename(file);
                const symbolCount = this.countFileSymbols(file);
                lines.push(`  ${bar} ${filename} (~${meta.tokensEstimate} tok)${symbolCount > 0 ? ` [${symbolCount} symbols]` : ''}`);
            }
        }
        return lines.join('\n');
    }
    importanceBar(score, max) {
        const level = Math.min(4, Math.floor((score / Math.max(max, 1)) * 5));
        return ['.', '*', '+', '**', '***'][level] ?? '***';
    }
    countFileSymbols(filePath) {
        let count = 0;
        for (const [, entries] of this.repoIndex.symbols) {
            for (const e of entries) {
                if (e.file === filePath)
                    count++;
            }
        }
        return count;
    }
    // ─── Context Packing ────────────────────────────────────────────────────
    async buildContextPack(params) {
        const { task, maxTokens, includeFiles = [], excludePatterns = [] } = params;
        const centrality = this.computeImportCentrality();
        const packed = [];
        let totalTokens = 0;
        const shouldExclude = (f) => excludePatterns.some(p => f.includes(p));
        const tryAdd = (f, reason) => {
            if (shouldExclude(f))
                return false;
            if (packed.some(p => p.path === f))
                return false;
            const tokens = this.repoIndex.files.get(f)?.tokensEstimate ?? 0;
            if (totalTokens + tokens > maxTokens)
                return false;
            try {
                const content = (0, fs_1.readFileSync)(path_1.default.join(this.workspaceRoot, f), 'utf-8');
                packed.push({ path: f, content, tokens, reason });
                totalTokens += tokens;
                return true;
            }
            catch {
                return false;
            }
        };
        // Step 1: Directly relevant files (from task keyword matching)
        const taskWords = task
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 2);
        const scored = [];
        for (const file of this.repoIndex.files.keys()) {
            let relevance = 0;
            const lower = file.toLowerCase();
            for (const w of taskWords) {
                if (lower.includes(w))
                    relevance += 10;
            }
            for (const [symbol, entries] of this.repoIndex.symbols) {
                if (taskWords.some(w => symbol.toLowerCase().includes(w))) {
                    if (entries.some(e => e.file === file))
                        relevance += 5;
                }
            }
            relevance += (centrality.get(file) ?? 0) * 0.5;
            if (relevance > 0)
                scored.push({ file, relevance });
        }
        scored.sort((a, b) => b.relevance - a.relevance);
        for (const { file } of scored) {
            if (totalTokens >= maxTokens)
                break;
            tryAdd(file, 'task-relevant');
        }
        // Step 2: Explicitly included files
        for (const f of includeFiles) {
            if (totalTokens >= maxTokens)
                break;
            tryAdd(f, 'explicitly-included');
        }
        // Step 3: High-centrality files
        const centralitySorted = Array.from(this.repoIndex.files.keys())
            .sort((a, b) => (centrality.get(b) ?? 0) - (centrality.get(a) ?? 0));
        for (const f of centralitySorted) {
            if (totalTokens >= maxTokens)
                break;
            tryAdd(f, 'high-centrality');
        }
        const summary = `Context pack: ${packed.length} files, ${totalTokens} tokens, for task: "${task.slice(0, 60)}"`;
        return { files: packed, totalTokens, summary };
    }
}
exports.ContextEngine = ContextEngine;
//# sourceMappingURL=context-engine.js.map