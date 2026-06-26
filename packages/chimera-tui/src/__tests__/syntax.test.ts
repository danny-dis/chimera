import { describe, it, expect } from 'vitest';
import { tokenizeCode } from '../syntax.js';

describe('tokenizeCode', () => {
  it('returns empty array for empty string', () => {
    expect(tokenizeCode('', 'ts')).toEqual([]);
  });

  it('returns plain tokens for unknown language', () => {
    const tokens = tokenizeCode('hello world', 'unknown');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.value).toBe('hello world');
    expect(tokens[0]!.color).toBe('white');
  });

  it('tokenizes TypeScript keywords', () => {
    const tokens = tokenizeCode('const x = 42', 'ts');
    const keywordToken = tokens.find((t) => t.value === 'const');
    expect(keywordToken).toBeDefined();
    expect(keywordToken!.color).toBe('magenta');
  });

  it('tokenizes TypeScript strings', () => {
    const tokens = tokenizeCode('"hello world"', 'ts');
    const stringToken = tokens.find((t) => t.value.includes('hello'));
    expect(stringToken).toBeDefined();
    expect(stringToken!.color).toBe('green');
  });

  it('tokenizes TypeScript comments', () => {
    const tokens = tokenizeCode('// this is a comment', 'ts');
    const commentToken = tokens.find((t) => t.value.includes('comment'));
    expect(commentToken).toBeDefined();
    expect(commentToken!.color).toBe('gray');
  });

  it('tokenizes Python keywords', () => {
    const tokens = tokenizeCode('def hello():', 'py');
    const keywordToken = tokens.find((t) => t.value === 'def');
    expect(keywordToken).toBeDefined();
    expect(keywordToken!.color).toBe('magenta');
  });

  it('tokenizes Python strings', () => {
    const tokens = tokenizeCode('"hello"', 'py');
    const stringToken = tokens.find((t) => t.value.includes('hello'));
    expect(stringToken).toBeDefined();
    expect(stringToken!.color).toBe('green');
  });

  it('tokenizes Shell commands', () => {
    const tokens = tokenizeCode('echo "hello"', 'sh');
    const keywordToken = tokens.find((t) => t.value === 'echo');
    expect(keywordToken).toBeDefined();
    expect(keywordToken!.color).toBe('magenta');
  });

  it('tokenizes Rust keywords', () => {
    const tokens = tokenizeCode('fn main() {}', 'rs');
    const keywordToken = tokens.find((t) => t.value === 'fn');
    expect(keywordToken).toBeDefined();
    expect(keywordToken!.color).toBe('magenta');
  });

  it('tokenizes Go keywords', () => {
    const tokens = tokenizeCode('func main() {}', 'go');
    const keywordToken = tokens.find((t) => t.value === 'func');
    expect(keywordToken).toBeDefined();
    expect(keywordToken!.color).toBe('magenta');
  });

  it('handles multi-line code', () => {
    const code = 'const x = 1;\nconst y = 2;';
    const tokens = tokenizeCode(code, 'ts');
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('handles code with no special tokens', () => {
    const tokens = tokenizeCode('hello_world', 'ts');
    expect(tokens.length).toBeGreaterThan(0);
  });
});
