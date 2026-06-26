/**
 * @chimera/context — output-ref strict resolver unit tests
 *
 * Tests the 3-tier resolution table from output-ref.ts. This is the
 * cornerstone of chimera's "fail loud, never silently drop" contract
 * for cross-node reads in the quality gate.
 */

import { describe, expect, it } from 'vitest';

import {
  declaredFieldsFromSchema,
  resolveNodeOutputField,
  OutputRefError,
  type NodeOutput,
} from '../output-ref.js';

function completed(output: string, opts: Partial<NodeOutput> = {}): NodeOutput {
  return { state: 'completed', output, ...opts };
}

describe('declaredFieldsFromSchema', () => {
  it('returns property names for a valid object schema', () => {
    expect(declaredFieldsFromSchema({ properties: { foo: {}, bar: {} } })).toEqual(['foo', 'bar']);
  });

  it('returns empty array for an explicit empty properties', () => {
    expect(declaredFieldsFromSchema({ properties: {} })).toEqual([]);
  });

  it('returns undefined when properties is missing', () => {
    expect(declaredFieldsFromSchema({ type: 'string' })).toBeUndefined();
  });

  it('returns undefined when schema is undefined', () => {
    expect(declaredFieldsFromSchema(undefined)).toBeUndefined();
  });

  it('returns undefined when properties is an array (invalid)', () => {
    expect(declaredFieldsFromSchema({ properties: ['foo'] })).toBeUndefined();
  });
});

describe('resolveNodeOutputField — producer-not-run', () => {
  it('throws when state is skipped', () => {
    const out: NodeOutput = { state: 'skipped', output: '' };
    expect(() => resolveNodeOutputField(out, 'plan', 'summary')).toThrow(OutputRefError);
    try {
      resolveNodeOutputField(out, 'plan', 'summary');
    } catch (e) {
      expect(e).toBeInstanceOf(OutputRefError);
      expect((e as OutputRefError).reason).toBe('producer-not-run');
    }
  });

  it('throws when state is pending', () => {
    const out: NodeOutput = { state: 'pending', output: '' };
    expect(() => resolveNodeOutputField(out, 'plan', 'summary')).toThrow(/did not run/);
  });

  it('does NOT throw for failed state (allow post-mortem access)', () => {
    const out: NodeOutput = { state: 'failed', output: '{"summary": "partial"}' };
    const result = resolveNodeOutputField(out, 'plan', 'summary');
    expect(result).toEqual({ kind: 'value', value: 'partial' });
  });
});

describe('resolveNodeOutputField — declared schema (strict)', () => {
  it('returns the value when the field is declared and present', () => {
    const out = completed('', {
      declaredFields: ['summary', 'risks'],
      structuredOutput: { summary: 'all good', risks: [] },
    });
    expect(resolveNodeOutputField(out, 'plan', 'summary')).toEqual({
      kind: 'value',
      value: 'all good',
    });
  });

  it('returns empty when the field is declared but null/undefined', () => {
    const out = completed('', {
      declaredFields: ['summary', 'risks'],
      structuredOutput: { summary: null, risks: [] },
    });
    expect(resolveNodeOutputField(out, 'plan', 'summary')).toEqual({ kind: 'empty' });
  });

  it('THROWS when the field is not in the declared schema (typo)', () => {
    const out = completed('', {
      declaredFields: ['summary'],
      structuredOutput: { summary: 'x' },
    });
    try {
      resolveNodeOutputField(out, 'plan', 'summry'); // typo
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(OutputRefError);
      expect((e as OutputRefError).reason).toBe('not-in-schema');
    }
  });

  it('falls back to parsing the text output if structuredOutput is missing', () => {
    const out = completed('{"summary": "from text"}', {
      declaredFields: ['summary'],
    });
    expect(resolveNodeOutputField(out, 'plan', 'summary')).toEqual({
      kind: 'value',
      value: 'from text',
    });
  });

  it('handles a markdown-fenced JSON output', () => {
    const out = completed('```json\n{"summary": "fenced"}\n```', {
      declaredFields: ['summary'],
    });
    expect(resolveNodeOutputField(out, 'plan', 'summary')).toEqual({
      kind: 'value',
      value: 'fenced',
    });
  });
});

describe('resolveNodeOutputField — structured payload, no declared schema (lenient)', () => {
  it('returns the value when the key is present', () => {
    const out = completed('', { structuredOutput: { foo: 'bar' } });
    expect(resolveNodeOutputField(out, 'plan', 'foo')).toEqual({ kind: 'value', value: 'bar' });
  });

  it('returns empty (not throw) when the key is absent', () => {
    const out = completed('', { structuredOutput: { foo: 'bar' } });
    // Lenient because no schema declared.
    expect(resolveNodeOutputField(out, 'plan', 'baz')).toEqual({ kind: 'empty' });
  });

  it('preserves explicit null (caller will stringify to "null")', () => {
    const out = completed('', { structuredOutput: { foo: null } });
    expect(resolveNodeOutputField(out, 'plan', 'foo')).toEqual({ kind: 'value', value: null });
  });
});

describe('resolveNodeOutputField — schemaless (strict)', () => {
  it('parses the text output as JSON when valid', () => {
    const out = completed('{"foo": 42}');
    expect(resolveNodeOutputField(out, 'plan', 'foo')).toEqual({ kind: 'value', value: 42 });
  });

  it('THROWS when the text output is not JSON (unparseable)', () => {
    const out = completed('not json at all');
    try {
      resolveNodeOutputField(out, 'plan', 'foo');
      expect.fail('expected throw');
    } catch (e) {
      expect((e as OutputRefError).reason).toBe('unparseable');
    }
  });

  it('THROWS when the JSON output lacks the key (missing-key)', () => {
    const out = completed('{"foo": 1}');
    try {
      resolveNodeOutputField(out, 'plan', 'bar');
      expect.fail('expected throw');
    } catch (e) {
      expect((e as OutputRefError).reason).toBe('missing-key');
    }
  });

  it('handles a markdown-fenced JSON output', () => {
    const out = completed('Here you go:\n```json\n{"foo": "x"}\n```\nDone.');
    expect(resolveNodeOutputField(out, 'plan', 'foo')).toEqual({ kind: 'value', value: 'x' });
  });
});

describe('OutputRefError — error messages', () => {
  it('formats not-in-schema message with the field name', () => {
    const err = new OutputRefError('plan', 'summary', 'not-in-schema');
    expect(err.message).toMatch(/not declared in node 'plan'/);
    expect(err.message).toMatch(/'summary'/);
  });

  it('formats unparseable message with helpful guidance', () => {
    const err = new OutputRefError('plan', 'summary', 'unparseable');
    expect(err.message).toMatch(/not a JSON object/);
  });

  it('formats missing-key message', () => {
    const err = new OutputRefError('plan', 'summary', 'missing-key');
    expect(err.message).toMatch(/no such key/);
  });

  it('formats producer-not-run message', () => {
    const err = new OutputRefError('plan', 'summary', 'producer-not-run');
    expect(err.message).toMatch(/did not run/);
  });
});
