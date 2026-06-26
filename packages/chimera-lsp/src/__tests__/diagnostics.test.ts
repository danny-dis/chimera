import { describe, it, expect } from 'vitest';
import path from 'path';
import { toLspDiagnostic, normalizeDiagnostics, formatDiagnostics } from '../diagnostics.js';
import type { Diagnostic } from 'vscode-languageserver-protocol';

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    range: {
      start: { line: 10, character: 5 },
      end: { line: 10, character: 15 },
    },
    message: 'Type mismatch',
    ...overrides,
  };
}

describe('toLspDiagnostic', () => {
  it('converts a basic diagnostic', () => {
    const diag = makeDiagnostic();
    const result = toLspDiagnostic(diag, 'file:///home/user/project/src/file.ts');

    expect(result.uri).toBe('file:///home/user/project/src/file.ts');
    expect(result.filePath).toContain('file.ts');
    expect(result.range).toEqual(diag.range);
    expect(result.message).toBe('Type mismatch');
  });

  it('preserves severity', () => {
    const diag = makeDiagnostic({ severity: 1 });
    const result = toLspDiagnostic(diag, 'file:///file.ts');
    expect(result.severity).toBe(1);
  });

  it('preserves source', () => {
    const diag = makeDiagnostic({ source: 'typescript' });
    const result = toLspDiagnostic(diag, 'file:///file.ts');
    expect(result.source).toBe('typescript');
  });

  it('preserves string code', () => {
    const diag = makeDiagnostic({ code: 'TS2322' });
    const result = toLspDiagnostic(diag, 'file:///file.ts');
    expect(result.code).toBe('TS2322');
  });

  it('preserves numeric code', () => {
    const diag = makeDiagnostic({ code: 2322 });
    const result = toLspDiagnostic(diag, 'file:///file.ts');
    expect(result.code).toBe(2322);
  });

  it('drops complex code objects', () => {
    const diag = makeDiagnostic({ code: { value: 2322, target: 'file:///docs' } as any });
    const result = toLspDiagnostic(diag, 'file:///file.ts');
    expect(result.code).toBeUndefined();
  });

  it('handles MarkupContent message', () => {
    const diag = makeDiagnostic({
      message: { kind: 'markdown', value: '**Type mismatch**' } as any,
    });
    const result = toLspDiagnostic(diag, 'file:///file.ts');
    expect(result.message).toBe('**Type mismatch**');
  });

  it('handles string message', () => {
    const diag = makeDiagnostic({ message: 'simple error' });
    const result = toLspDiagnostic(diag, 'file:///file.ts');
    expect(result.message).toBe('simple error');
  });
});

describe('normalizeDiagnostics', () => {
  it('returns empty array for empty input', () => {
    const result = normalizeDiagnostics([], 'file:///file.ts', '/home/user/project');
    expect(result).toEqual([]);
  });

  it('sorts by severity (errors first)', () => {
    const diags = [
      makeDiagnostic({ severity: 3, message: 'info' }),
      makeDiagnostic({ severity: 1, message: 'error' }),
      makeDiagnostic({ severity: 2, message: 'warning' }),
    ];
    const result = normalizeDiagnostics(diags, 'file:///file.ts', '/home/user/project');
    expect(result[0].message).toBe('error');
    expect(result[1].message).toBe('warning');
    expect(result[2].message).toBe('info');
  });

  it('sorts by file path when severity is equal', () => {
    const diagA = makeDiagnostic({ severity: 1, message: 'error A' });
    const diagB = makeDiagnostic({ severity: 1, message: 'error B' });
    // Both use the same documentUri so filePath will be the same
    const result = normalizeDiagnostics([diagA, diagB], 'file:///file.ts', '/home/user/project');
    expect(result).toHaveLength(2);
  });

  it('sorts by line number when file and severity match', () => {
    const diagA = makeDiagnostic({
      severity: 1,
      range: { start: { line: 20, character: 0 }, end: { line: 20, character: 5 } },
    });
    const diagB = makeDiagnostic({
      severity: 1,
      range: { start: { line: 5, character: 0 }, end: { line: 5, character: 5 } },
    });
    const result = normalizeDiagnostics([diagA, diagB], 'file:///file.ts', '/home/user/project');
    expect(result[0].range.start.line).toBe(5);
    expect(result[1].range.start.line).toBe(20);
  });

  it('applies limit', () => {
    const diags = Array.from({ length: 10 }, (_, i) =>
      makeDiagnostic({ severity: 1, message: `error ${i}` }),
    );
    const result = normalizeDiagnostics(diags, 'file:///file.ts', '/home/user/project', 5);
    expect(result).toHaveLength(5);
  });

  it('makes filePath relative to workspace root', () => {
    const diag = makeDiagnostic();
    const result = normalizeDiagnostics(
      [diag],
      'file:///home/user/project/src/file.ts',
      '/home/user/project',
    );
    expect(result[0].filePath).toBe(path.join('src', 'file.ts'));
  });
});

describe('formatDiagnostics', () => {
  it('returns message for empty diagnostics', () => {
    expect(formatDiagnostics([])).toBe('No LSP diagnostics.');
  });

  it('formats error diagnostics', () => {
    const result = formatDiagnostics([{
      uri: 'file:///file.ts',
      filePath: 'src/file.ts',
      range: { start: { line: 10, character: 5 }, end: { line: 10, character: 15 } },
      severity: 1,
      source: 'typescript',
      code: 'TS2322',
      message: 'Type mismatch',
    }]);
    expect(result).toContain('src/file.ts:11:6');
    expect(result).toContain('error');
    expect(result).toContain('[typescript]');
    expect(result).toContain('(TS2322)');
    expect(result).toContain('Type mismatch');
  });

  it('formats warning diagnostics', () => {
    const result = formatDiagnostics([{
      uri: 'file:///file.ts',
      filePath: 'file.ts',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      severity: 2,
      message: 'Unused variable',
    }]);
    expect(result).toContain('warning');
  });

  it('formats info diagnostics', () => {
    const result = formatDiagnostics([{
      uri: 'file:///file.ts',
      filePath: 'file.ts',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      severity: 3,
      message: 'Hint',
    }]);
    expect(result).toContain('information');
  });

  it('formats hint diagnostics', () => {
    const result = formatDiagnostics([{
      uri: 'file:///file.ts',
      filePath: 'file.ts',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      severity: 4,
      message: 'Consider using const',
    }]);
    expect(result).toContain('hint');
  });

  it('omits source and code when not present', () => {
    const result = formatDiagnostics([{
      uri: 'file:///file.ts',
      filePath: 'file.ts',
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
      message: 'Simple error',
    }]);
    expect(result).not.toContain('[]');
    expect(result).not.toContain('()');
  });

  it('formats multiple diagnostics separated by newlines', () => {
    const result = formatDiagnostics([
      {
        uri: 'file:///a.ts',
        filePath: 'a.ts',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        severity: 1,
        message: 'Error A',
      },
      {
        uri: 'file:///b.ts',
        filePath: 'b.ts',
        range: { start: { line: 5, character: 2 }, end: { line: 5, character: 5 } },
        severity: 2,
        message: 'Warning B',
      },
    ]);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });
});
