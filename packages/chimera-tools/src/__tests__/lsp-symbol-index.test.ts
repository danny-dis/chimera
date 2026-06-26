import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { LspSymbolIndex } from '../tools/lsp-symbol-index.js';

let workspaceRoot: string;

describe('LspSymbolIndex', () => {
  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-lsp-'));
  });

  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  async function writeFixture(name: string, content: string): Promise<string> {
    const filePath = path.join(workspaceRoot, name);
    await fs.writeFile(filePath, content);
    return filePath;
  }

  it('indexes a file and exposes its declarations', async () => {
    const filePath = await writeFixture('hello.ts', [
      'export function greet(name: string): string {',
      '  return `hi ${name}`;',
      '}',
      'export const answer: number = 42;',
      'export interface Person { name: string; }',
    ].join('\n'));

    const index = new LspSymbolIndex(workspaceRoot);
    await index.indexFile(filePath);

    expect(index.size).toBe(1);

    const defs = index.findDefinition('greet');
    expect(defs).toHaveLength(1);
    expect(defs[0].filePath).toBe(filePath);
    expect(defs[0].startLine).toBe(1);

    const answerDefs = index.findDefinition('answer');
    expect(answerDefs).toHaveLength(1);
    expect(answerDefs[0].startLine).toBe(4);

    const personDefs = index.findDefinition('Person');
    expect(personDefs).toHaveLength(1);
  });

  it('skips unsupported extensions', async () => {
    const filePath = await writeFixture('hello.js', 'export function jsOnly() {}');
    const index = new LspSymbolIndex(workspaceRoot);
    await index.indexFile(filePath);
    expect(index.size).toBe(0);
  });

  it('re-indexes a changed file when called again', async () => {
    const filePath = await writeFixture('counter.ts', 'export const value = 1;');
    const index = new LspSymbolIndex(workspaceRoot);
    await index.indexFile(filePath);
    expect(index.findDefinition('value')).toHaveLength(1);

    await writeFixture('counter.ts', 'export const renamed = 2;');
    await index.indexFile(filePath);

    expect(index.findDefinition('value')).toHaveLength(0);
    expect(index.findDefinition('renamed')).toHaveLength(1);
  });

  it('drops a cached entry when the file is removed', async () => {
    const filePath = await writeFixture('transient.ts', 'export const x = 1;');
    const index = new LspSymbolIndex(workspaceRoot);
    await index.indexFile(filePath);
    expect(index.size).toBe(1);

    await fs.unlink(filePath);
    await index.indexFile(filePath);
    expect(index.size).toBe(0);
  });

  it('indexDir walks recursively and excludes noise directories', async () => {
    await writeFixture('a.ts', 'export const a = 1;');
    await fs.mkdir(path.join(workspaceRoot, 'node_modules'), { recursive: true });
    await writeFixture('node_modules/b.ts', 'export const b = 2;');
    await fs.mkdir(path.join(workspaceRoot, 'src', 'sub'), { recursive: true });
    await writeFixture('src/sub/c.ts', 'export const c = 3;');

    const index = new LspSymbolIndex(workspaceRoot);
    const total = await index.indexDir();
    expect(total).toBe(2);
    expect(index.findDefinition('a')).toHaveLength(1);
    expect(index.findDefinition('c')).toHaveLength(1);
    expect(index.findDefinition('b')).toHaveLength(0);
  });

  it('finds references across multiple files', async () => {
    const a = await writeFixture('a.ts', [
      'export function shared() { return 1; }',
      'export function callerA() { return shared(); }',
    ].join('\n'));
    const b = await writeFixture('b.ts', [
      'import { shared } from "./a.js";',
      'export function callerB() { return shared(); }',
    ].join('\n'));

    const index = new LspSymbolIndex(workspaceRoot);
    await index.indexFile(a);
    await index.indexFile(b);

    const refs = index.findReferences('shared');
    // 1 declaration in a.ts + 1 call in a.ts + 1 call in b.ts
    expect(refs.length).toBeGreaterThanOrEqual(3);
    const files = new Set(refs.map((r) => r.filePath));
    expect(files.has(a)).toBe(true);
    expect(files.has(b)).toBe(true);
  });

  it('getHover returns declaration text', async () => {
    const filePath = await writeFixture('hover.ts', [
      '/** Greets the world. */',
      'export function helloWorld(): string {',
      '  return "hi";',
      '}',
    ].join('\n'));

    const index = new LspSymbolIndex(workspaceRoot);
    await index.indexFile(filePath);

    const hover = index.getHover('helloWorld');
    expect(hover).not.toBeNull();
    expect(hover!.contents).toContain('helloWorld');
    expect(hover!.contents).toContain('Greets the world');
  });

  it('getDocumentSymbols returns the top-level symbols', async () => {
    const filePath = await writeFixture('doc.ts', [
      'export class Box {',
      '  open() { return true; }',
      '  close() { return false; }',
      '}',
      'export function helper() {}',
    ].join('\n'));

    const index = new LspSymbolIndex(workspaceRoot);
    await index.indexFile(filePath);

    const symbols = index.getDocumentSymbols(filePath);
    const names = symbols.map((s) => s.name);
    expect(names).toContain('Box');
    expect(names).toContain('helper');
    expect(symbols.find((s) => s.name === 'Box')!.kind).toBe('Class');
  });

  it('getWorkspaceSymbols does substring matching', async () => {
    await writeFixture('a.ts', 'export function makeFoo() {}\nexport function makeBar() {}');
    await writeFixture('b.ts', 'export function bakeFoo() {}');

    const index = new LspSymbolIndex(workspaceRoot);
    await index.indexDir();

    const matches = index.getWorkspaceSymbols('Foo');
    const names = matches.map((m) => m.name);
    expect(names).toContain('makeFoo');
    expect(names).toContain('bakeFoo');
    expect(names).not.toContain('makeBar');
  });

  it('clear() empties the index', async () => {
    const filePath = await writeFixture('a.ts', 'export const x = 1;');
    const index = new LspSymbolIndex(workspaceRoot);
    await index.indexFile(filePath);
    expect(index.size).toBe(1);
    index.clear();
    expect(index.size).toBe(0);
  });
});
