import { describe, it, expect, beforeEach } from 'vitest';
import { ContextIntelligence } from './context-intelligence.js';

describe('ContextIntelligence', () => {
  let ci: ContextIntelligence;

  beforeEach(() => {
    ci = new ContextIntelligence();
  });

  describe('getDiagnostics', () => {
    it('returns empty array without LSP configured', async () => {
      const result = await ci.getDiagnostics('test.ts');
      expect(result).toEqual([]);
    });

    it('returns diagnostics when LSP is configured', async () => {
      ci.setLSPDiagnostics(async (file: string) => [
        { severity: 'error', message: 'Syntax error', line: 10, column: 5 },
      ]);
      const result = await ci.getDiagnostics('test.ts');
      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('error');
    });

    it('handles LSP errors gracefully', async () => {
      ci.setLSPDiagnostics(async () => { throw new Error('LSP down'); });
      const result = await ci.getDiagnostics('test.ts');
      expect(result).toEqual([]);
    });
  });

  describe('getDiagnosticsForFiles', () => {
    it('returns diagnostics for multiple files', async () => {
      ci.setLSPDiagnostics(async (file: string) => {
        if (file === 'a.ts') {
          return [{ severity: 'warning', message: 'Unused var', line: 5 }];
        }
        return [];
      });
      const result = await ci.getDiagnosticsForFiles(['a.ts', 'b.ts']);
      expect(result.has('a.ts')).toBe(true);
      expect(result.has('b.ts')).toBe(false);
    });
  });

  describe('analyzeImpact', () => {
    it('analyzes impact of changing a file', () => {
      const indexedFiles = new Map([
        ['src/utils.ts', { imports: [] }],
        ['src/app.ts', { imports: ['./utils'] }],
        ['src/other.ts', { imports: ['./app'] }],
        ['tests/app.test.ts', { imports: ['../src/app'] }],
      ]);

      const impact = ci.analyzeImpact('src/utils.ts', indexedFiles);
      expect(impact.directDependents).toContain('src/app.ts');
      expect(impact.transitiveDependents).toContain('src/other.ts');
      expect(impact.affectedTests).toContain('tests/app.test.ts');
    });

    it('calculates risk level', () => {
      const indexedFiles = new Map<string, { imports: string[] }>();
      // Create many dependents that import from core
      for (let i = 0; i < 15; i++) {
        indexedFiles.set(`src/file${i}.ts`, { imports: ['../core'] });
      }
      indexedFiles.set('src/core.ts', { imports: [] });

      const impact = ci.analyzeImpact('src/core.ts', indexedFiles);
      expect(impact.riskLevel).toBe('high');
    });
  });

  describe('findRelatedTests', () => {
    it('finds test files related to source files', () => {
      const indexedFiles = new Map([
        ['src/app.ts', { imports: [] }],
        ['src/app.test.ts', { imports: ['../src/app'] }],
        ['src/other.test.ts', { imports: ['../src/other'] }],
      ]);

      const tests = ci.findRelatedTests(['src/app.ts'], indexedFiles);
      expect(tests).toContain('src/app.test.ts');
      expect(tests).not.toContain('src/other.test.ts');
    });
  });

  describe('buildContextPack', () => {
    it('builds context pack within token budget', () => {
      const files = [
        { path: 'a.ts', content: 'a'.repeat(100), tokens: 25, reason: 'core' },
        { path: 'b.ts', content: 'b'.repeat(200), tokens: 50, reason: 'helper' },
        { path: 'c.ts', content: 'c'.repeat(300), tokens: 75, reason: 'util' },
      ];

      const pack = ci.buildContextPack('test task', files);
      expect(pack.files).toContain('a.ts');
      expect(pack.files).toContain('b.ts');
      expect(pack.files).toContain('c.ts');
      expect(pack.totalTokens).toBe(150);
    });

    it('respects max tokens', () => {
      const ciLimited = new ContextIntelligence({ maxTokens: 50 });
      const files = [
        { path: 'a.ts', content: 'a'.repeat(100), tokens: 30, reason: 'core' },
        { path: 'b.ts', content: 'b'.repeat(200), tokens: 40, reason: 'helper' },
        { path: 'c.ts', content: 'c'.repeat(300), tokens: 50, reason: 'util' },
      ];

      const pack = ciLimited.buildContextPack('test task', files);
      // Should only include the first file (30 tokens), since adding second would exceed 50
      expect(pack.files).toHaveLength(1);
      expect(pack.totalTokens).toBe(30);
    });

    it('respects max files', () => {
      const ciLimited = new ContextIntelligence({ maxFiles: 2 });
      const files = [
        { path: 'a.ts', content: 'a', tokens: 10, reason: 'core' },
        { path: 'b.ts', content: 'b', tokens: 10, reason: 'helper' },
        { path: 'c.ts', content: 'c', tokens: 10, reason: 'util' },
      ];

      const pack = ciLimited.buildContextPack('test task', files);
      expect(pack.files).toHaveLength(2);
    });
  });

  describe('extractSymbolsFromTask', () => {
    it('extracts PascalCase symbols', () => {
      const symbols = ci.extractSymbolsFromTask('Fix the UserAuth class');
      expect(symbols).toContain('UserAuth');
    });

    it('extracts camelCase symbols', () => {
      const symbols = ci.extractSymbolsFromTask('Fix the getUserById function');
      expect(symbols).toContain('getUserById');
    });

    it('returns empty array for no symbols', () => {
      const symbols = ci.extractSymbolsFromTask('Fix the bug');
      expect(symbols).toEqual([]);
    });
  });
});
