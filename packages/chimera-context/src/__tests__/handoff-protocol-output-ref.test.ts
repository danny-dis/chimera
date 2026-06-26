/**
 * @chimera/context — HandoffProtocol.readOutputField / readOutputFieldWithState
 *
 * Tests the strict no-silent-drop wiring between HandoffProtocol and the
 * output-ref resolver. The resolver is the leaf that determines whether a
 * `$nodeId.output.field` reference is honored; these tests verify that
 * HandoffProtocol forwards the call faithfully and that the
 * `readOutputField` vs `readOutputFieldWithState` pair returns the contract
 * the quality gate relies on:
 *
 *   - `readOutputField`              → value | null (caller swallows empty)
 *   - `readOutputFieldWithState`     → FieldResolution (caller logs empty)
 *
 * The resolver's own behavior is exhaustively covered in output-ref.test.ts;
 * here we focus on the HandoffProtocol instance method boundary, not the
 * resolver internals.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { HandoffProtocol } from '../handoff-protocol.js';
import { OutputRefError, type NodeOutput } from '../output-ref.js';

function completed(opts: Partial<NodeOutput> = {}): NodeOutput {
  return { state: 'completed', output: '', ...opts };
}

describe('HandoffProtocol.readOutputField', () => {
  let protocol: HandoffProtocol;

  beforeEach(() => {
    protocol = new HandoffProtocol();
  });

  it('returns the value when the field is declared and present (declared-schema producer)', () => {
    const out = completed({
      output: '{"summary": "added user model", "risks": ["db schema change"]}',
      declaredFields: ['summary', 'risks'],
      structuredOutput: { summary: 'added user model', risks: ['db schema change'] },
    });

    const summary = protocol.readOutputField('draft', 'summary', out);
    expect(summary).toBe('added user model');

    const risks = protocol.readOutputField('draft', 'risks', out);
    expect(risks).toEqual(['db schema change']);
  });

  it('returns null when the field is declared but absent (declared-optional)', () => {
    const out = completed({
      declaredFields: ['summary', 'risks'],
      // `risks` is in the schema but the producer left it null
      // (producer validated post-parse: required fields are present, so a
      // null/undefined here means a declared-optional field).
      structuredOutput: { summary: 'ok', risks: null },
    });

    const result = protocol.readOutputField('draft', 'risks', out);
    expect(result).toBeNull();
  });

  it('throws OutputRefError with reason "not-in-schema" for unknown fields on a declared-schema producer', () => {
    const out = completed({
      declaredFields: ['summary'],
      structuredOutput: { summary: 'x' },
    });

    try {
      protocol.readOutputField('plan', 'summry', out); // typo
      expect.fail('expected OutputRefError');
    } catch (e) {
      expect(e).toBeInstanceOf(OutputRefError);
      const err = e as OutputRefError;
      expect(err.reason).toBe('not-in-schema');
      expect(err.nodeId).toBe('plan');
      expect(err.field).toBe('summry');
    }
  });

  it('throws OutputRefError with reason "producer-not-run" when state is "skipped"', () => {
    const out: NodeOutput = { state: 'skipped', output: '' };

    try {
      protocol.readOutputField('verify', 'findings', out);
      expect.fail('expected OutputRefError');
    } catch (e) {
      expect(e).toBeInstanceOf(OutputRefError);
      const err = e as OutputRefError;
      expect(err.reason).toBe('producer-not-run');
      expect(err.message).toMatch(/did not run/);
    }
  });

  it('throws OutputRefError with reason "unparseable" for schemaless non-JSON output', () => {
    // No declaredFields, no structuredOutput → schemaless path. The author
    // wrote `.field`, so JSON carrying that key is expected. Non-JSON
    // output is a drop the consumer must see.
    const out: NodeOutput = { state: 'completed', output: 'not json at all' };

    try {
      protocol.readOutputField('agent', 'summary', out);
      expect.fail('expected OutputRefError');
    } catch (e) {
      expect(e).toBeInstanceOf(OutputRefError);
      expect((e as OutputRefError).reason).toBe('unparseable');
    }
  });

  it('returns the value parsed from text output for a schemaless JSON producer', () => {
    // Sanity check: the schemaless path succeeds when the text is valid
    // JSON and the key is present. Distinct from the throw test above.
    const out: NodeOutput = { state: 'completed', output: '{"summary": "from text"}' };
    expect(protocol.readOutputField('agent', 'summary', out)).toBe('from text');
  });
});

describe('HandoffProtocol.readOutputFieldWithState', () => {
  let protocol: HandoffProtocol;

  beforeEach(() => {
    protocol = new HandoffProtocol();
  });

  it('returns { kind: "value", value } for present fields', () => {
    const out = completed({
      declaredFields: ['summary', 'risks'],
      structuredOutput: { summary: 'added user model', risks: ['db schema change'] },
    });

    const result = protocol.readOutputFieldWithState('draft', 'summary', out);
    expect(result).toEqual({ kind: 'value', value: 'added user model' });
  });

  it('returns { kind: "empty" } for declared-but-absent fields (distinct from value: null)', () => {
    const out = completed({
      declaredFields: ['summary', 'risks'],
      structuredOutput: { summary: 'ok', risks: null },
    });

    // `risks` is in the schema, the producer emitted it as null, so the
    // resolver treats that as a declared-optional field → empty. The shape
    // returned is `{ kind: 'empty' }` — NO `value` key — which is the
    // signal callers use to distinguish "explicitly empty" from "got null".
    const result = protocol.readOutputFieldWithState('draft', 'risks', out);
    expect(result).toEqual({ kind: 'empty' });
    expect(result).not.toHaveProperty('value');
  });

  it('propagates OutputRefError just like readOutputField (e.g. not-in-schema)', () => {
    const out = completed({
      declaredFields: ['summary'],
      structuredOutput: { summary: 'x' },
    });

    try {
      protocol.readOutputFieldWithState('plan', 'unknown', out);
      expect.fail('expected OutputRefError');
    } catch (e) {
      expect(e).toBeInstanceOf(OutputRefError);
      expect((e as OutputRefError).reason).toBe('not-in-schema');
    }
  });
});
