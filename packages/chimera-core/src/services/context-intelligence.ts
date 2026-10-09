// =============================================================================
// ContextIntelligence — wraps and extends ContextEngine with LSP integration,
// semantic search, impact analysis, test discovery, and smart context packing.
// =============================================================================

import type { ContextEngine } from '@chimera/context';

export interface LSPDiagnostic {
  severity: string;
  message: string;
  line?: number;
  column?: number;
}

export interface SymbolLocation {
  file: string;
  line: number;
  kind: string;
}

export interface ImpactAnalysis {
  directDependents: string[];
  transitiveDependents: string[];
  affectedTests: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface ContextIntelligenceConfig {
  /** Enable LSP diagnostics integration */
  enableLSP?: boolean;
  /** Enable semantic search */
  enableSemanticSearch?: boolean;
  /** Max files to include in context pack */
  maxFiles?: number;
  /** Max tokens for context pack */
  maxTokens?: number;
}

const DEFAULT_CONFIG: ContextIntelligenceConfig = {
  enableLSP: true,
  enableSemanticSearch: true,
  maxFiles: 20,
  maxTokens: 16000,
};

/**
 * ContextIntelligence — extends ContextEngine with advanced features.
 */
export class ContextIntelligence {
  private config: ContextIntelligenceConfig;
  private lspDiagnosticsFn?: (file: string) => Promise<LSPDiagnostic[]>;

  constructor(config?: ContextIntelligenceConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the LSP diagnostics function.
   */
  setLSPDiagnostics(fn: (file: string) => Promise<LSPDiagnostic[]>): void {
    this.lspDiagnosticsFn = fn;
  }

  /**
   * Get LSP diagnostics for a file.
   */
  async getDiagnostics(file: string): Promise<LSPDiagnostic[]> {
    if (!this.lspDiagnosticsFn || !this.config.enableLSP) {
      return [];
    }
    try {
      return await this.lspDiagnosticsFn(file);
    } catch {
      return [];
    }
  }

  /**
   * Get diagnostics for multiple files.
   */
  async getDiagnosticsForFiles(files: string[]): Promise<Map<string, LSPDiagnostic[]>> {
    const result = new Map<string, LSPDiagnostic[]>();
    if (!this.lspDiagnosticsFn) {
      return result;
    }
    for (const file of files) {
      const diags = await this.getDiagnostics(file);
      if (diags.length > 0) {
        result.set(file, diags);
      }
    }
    return result;
  }

  /**
   * Analyze the impact of changing a file.
   * Uses the import graph to find dependents.
   */
  analyzeImpact(
    filePath: string,
    indexedFiles: Map<string, { imports: string[] }>,
  ): ImpactAnalysis {
    const directDependents = this.findDirectDependents(filePath, indexedFiles);
    const transitiveDependents = this.findTransitiveDependents(
      directDependents,
      indexedFiles,
      new Set([filePath]),
    );
    const affectedTests = this.findAffectedTests(
      [filePath, ...directDependents, ...transitiveDependents],
      indexedFiles,
    );

    const totalAffected = directDependents.length + transitiveDependents.length;
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (totalAffected > 10 || affectedTests.length > 5) {
      riskLevel = 'high';
    } else if (totalAffected > 3 || affectedTests.length > 2) {
      riskLevel = 'medium';
    }

    return {
      directDependents,
      transitiveDependents,
      affectedTests,
      riskLevel,
    };
  }

  /**
   * Find test files related to the given source files.
   */
  findRelatedTests(
    sourceFiles: string[],
    indexedFiles: Map<string, { imports: string[] }>,
  ): string[] {
    const testFiles: string[] = [];
    const testPatterns = ['.test.', '.spec.', '_test.', 'test_', '/tests/', '/__tests__/'];

    for (const [filePath] of indexedFiles) {
      const isTest = testPatterns.some((pattern) => filePath.includes(pattern));
      if (isTest) {
        // Check if this test imports any of the source files
        const fileInfo = indexedFiles.get(filePath);
        if (fileInfo) {
          for (const src of sourceFiles) {
            const srcBase = src.replace(/\.(ts|js|tsx|jsx|py)$/, '');
            if (fileInfo.imports.some((imp) => imp.includes(srcBase) || src.includes(imp))) {
              testFiles.push(filePath);
              break;
            }
          }
        }
      }
    }

    return testFiles;
  }

  /**
   * Build an optimized context pack for a task.
   * Prioritizes files by relevance and fits within token budget.
   */
  buildContextPack(
    task: string,
    relevantFiles: Array<{ path: string; content: string; tokens: number; reason: string }>,
  ): { files: string[]; content: string; totalTokens: number } {
    // Sort by relevance (tokens ascending to fit more files)
    const sorted = [...relevantFiles].sort((a, b) => a.tokens - b.tokens);

    const selected: string[] = [];
    let totalTokens = 0;
    let content = '';

    for (const file of sorted) {
      if (selected.length >= this.config.maxFiles) break;
      if (totalTokens + file.tokens > this.config.maxTokens) continue;

      selected.push(file.path);
      totalTokens += file.tokens;
      content += `[${file.path}] (${file.reason})\n${file.content}\n\n---\n\n`;
    }

    return { files: selected, content, totalTokens };
  }

  /**
   * Extract symbols mentioned in a task description.
   */
  extractSymbolsFromTask(task: string): string[] {
    const symbols: string[] = [];
    // Match PascalCase identifiers (e.g., UserAuth, MyClass)
    const pascalMatches = task.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]*)+\b/g);
    if (pascalMatches) {
      symbols.push(...pascalMatches);
    }
    // Match camelCase identifiers (e.g., getUserById, myFunction)
    const camelMatches = task.match(/\b[a-z]+[A-Z][a-zA-Z]*\b/g);
    if (camelMatches) {
      symbols.push(...camelMatches);
    }
    return [...new Set(symbols)];
  }

  private findDirectDependents(
    filePath: string,
    indexedFiles: Map<string, { imports: string[] }>,
  ): string[] {
    const dependents: string[] = [];
    const filePathNormalized = filePath.replace(/\\/g, '/');
    // Get the base path without extension for matching
    const basePath = filePathNormalized.replace(/\.(ts|js|tsx|jsx|py)$/, '');

    for (const [file, info] of indexedFiles) {
      if (file === filePath) continue;
      for (const imp of info.imports) {
        const impNormalized = imp.replace(/^\.\//, '').replace(/^\.\.\//, '');
        // Check if the import matches the file path
        if (basePath.endsWith(impNormalized) || impNormalized.endsWith(basePath.split('/').pop() || '')) {
          dependents.push(file);
          break;
        }
      }
    }
    return dependents;
  }

  private findTransitiveDependents(
    directDependents: string[],
    indexedFiles: Map<string, { imports: string[] }>,
    visited: Set<string>,
  ): string[] {
    const transitive: string[] = [];
    for (const dep of directDependents) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      const nextLevel = this.findDirectDependents(dep, indexedFiles);
      transitive.push(...nextLevel);
      // Recurse one more level
      for (const next of nextLevel) {
        if (!visited.has(next)) {
          visited.add(next);
          transitive.push(...this.findDirectDependents(next, indexedFiles));
        }
      }
    }
    return [...new Set(transitive)];
  }

  private findAffectedTests(
    changedFiles: string[],
    indexedFiles: Map<string, { imports: string[] }>,
  ): string[] {
    return this.findRelatedTests(changedFiles, indexedFiles);
  }
}
