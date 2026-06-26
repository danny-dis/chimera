import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { ContextEngine } from '../context-engine.js';

describe('ContextEngine', () => {
  let tmpDir: string;
  let engine: ContextEngine;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'chimera-ctx-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('indexRepo', () => {
    it('indexes files in a temp directory', async () => {
      writeFileSync(path.join(tmpDir, 'main.ts'), 'export function hello() { return "hi"; }');
      writeFileSync(path.join(tmpDir, 'util.js'), 'module.exports = { add: (a, b) => a + b };');

      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();

      const files = engine.getIndexedFiles();
      expect(files).toContain('main.ts');
      expect(files).toContain('util.js');
    });

    it('skips node_modules', async () => {
      mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });
      writeFileSync(path.join(tmpDir, 'node_modules', 'pkg.ts'), 'export const x = 1;');
      writeFileSync(path.join(tmpDir, 'app.ts'), 'export const y = 2;');

      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();

      expect(engine.getIndexedFiles()).not.toContain('node_modules/pkg.ts');
      expect(engine.getIndexedFiles()).toContain('app.ts');
    });
  });

  describe('extractSymbols', () => {
    it('extracts functions, classes, interfaces, types', async () => {
      const code = `
export function doWork() {}
export class MyService {}
export interface Config {}
export type ID = string;
export enum Status { Active, Inactive }
export const VERSION = "1.0";
`;
      writeFileSync(path.join(tmpDir, 'symbols.ts'), code);

      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();

      const related = engine.findRelatedFilesBySymbol('doWork');
      expect(related).toContain('symbols.ts');

      const clsRelated = engine.findRelatedFilesBySymbol('MyService');
      expect(clsRelated).toContain('symbols.ts');
    });
  });

  describe('getIndexedFiles', () => {
    it('returns list of indexed files', async () => {
      writeFileSync(path.join(tmpDir, 'a.ts'), 'const a = 1;');
      writeFileSync(path.join(tmpDir, 'b.ts'), 'const b = 2;');

      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();

      const files = engine.getIndexedFiles();
      expect(files).toHaveLength(2);
    });
  });

  describe('getFileTokens / getTotalTokens', () => {
    it('estimates token counts', async () => {
      const content = 'x'.repeat(400);
      writeFileSync(path.join(tmpDir, 't.ts'), content);

      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();

      expect(engine.getFileTokens('t.ts')).toBe(100);
      expect(engine.getTotalTokens()).toBe(100);
    });

    it('returns undefined for unknown file', async () => {
      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();
      expect(engine.getFileTokens('nope.ts')).toBeUndefined();
    });
  });

  describe('findRelatedFiles', () => {
    it('finds files by import', async () => {
      writeFileSync(path.join(tmpDir, 'dep.ts'), 'export const x = 1;');
      writeFileSync(path.join(tmpDir, 'consumer.ts'), `import { x } from './dep';\nconsole.log(x);`);

      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();

      const related = engine.findRelatedFiles(['./dep']);
      expect(related).toContain('consumer.ts');
    });
  });

  describe('findRelatedFilesBySymbol', () => {
    it('finds files by symbol name', async () => {
      writeFileSync(path.join(tmpDir, 'defs.ts'), 'export function helper() {}');
      writeFileSync(path.join(tmpDir, 'uses.ts'), `import { helper } from './defs';\nhelper();`);

      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();

      const related = engine.findRelatedFilesBySymbol('helper');
      expect(related).toContain('defs.ts');
    });

    it('returns empty array for unknown symbol', async () => {
      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();
      expect(engine.findRelatedFilesBySymbol('unknown')).toEqual([]);
    });
  });

  describe('getAgentInstructions', () => {
    it('reads AGENTS.md', async () => {
      writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Agent Rules\nBe helpful.');

      engine = new ContextEngine(tmpDir);
      const instructions = await engine.getAgentInstructions();
      expect(instructions).toContain('Agent Rules');
    });

    it('returns empty string when no instructions file', async () => {
      engine = new ContextEngine(tmpDir);
      const instructions = await engine.getAgentInstructions();
      expect(instructions).toBe('');
    });
  });

  describe('getRepoMap', () => {
    it('generates a repo map', async () => {
      writeFileSync(path.join(tmpDir, 'index.ts'), 'export function main() {}');
      writeFileSync(path.join(tmpDir, 'helper.ts'), 'export function assist() {}');

      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();

      const map = engine.getRepoMap();
      expect(map).toContain('Repository Map');
      expect(map).toContain('index.ts');
      expect(map).toContain('helper.ts');
      expect(map).toContain('files');
    });
  });

  describe('buildContextPack', () => {
    it('builds a context pack with token budget', async () => {
      writeFileSync(path.join(tmpDir, 'auth.ts'), 'export function login() {}');
      writeFileSync(path.join(tmpDir, 'db.ts'), 'export function query() {}');

      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();

      const pack = await engine.buildContextPack({
        task: 'auth login',
        maxTokens: 1000,
      });

      expect(pack.files.length).toBeGreaterThan(0);
      expect(pack.totalTokens).toBeGreaterThan(0);
      expect(pack.summary).toContain('auth');
    });

    it('respects token budget', async () => {
      const bigContent = 'x'.repeat(8000);
      writeFileSync(path.join(tmpDir, 'big.ts'), bigContent);
      writeFileSync(path.join(tmpDir, 'small.ts'), 'const x = 1;');

      engine = new ContextEngine(tmpDir);
      await engine.indexRepo();

      const pack = await engine.buildContextPack({
        task: 'everything',
        maxTokens: 500,
      });

      expect(pack.totalTokens).toBeLessThanOrEqual(500);
    });
  });
});
