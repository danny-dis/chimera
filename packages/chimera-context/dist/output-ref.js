"use strict";
/**
 * Strict resolution for `$nodeId.output.field` references (no-silent-drop).
 *
 * Shared by both consumers — prompt/script substitution and `when:`
 * condition evaluation — so the contract is identical in both.
 *
 * Resolution table for a known producer:
 *   1. Producer HAS `declaredFields` (an `output_format` with `properties`)
 *      → enforce the schema:
 *         field ∈ declaredFields, value present      → value
 *         field ∈ declaredFields, value absent/null  → '' (declared-optional)
 *         field ∉ declaredFields                      → THROW (typo / not in
 *                                                         the contract)
 *   2. Has a `structuredOutput` object but NO `declaredFields` (legacy rows
 *      or a non-object schema) — prefer it, but stay LENIENT: with no
 *      declared schema we can't tell optional-absent from a typo, so:
 *         key present → value ;  key absent → '' (no throw — backward compat)
 *   3. Schemaless (bash/script/prose) — the author wrote `.field`, so JSON
 *      with that key is expected; anything else is a drop they must see:
 *         output not a JSON object → THROW ;  key present → value ;
 *         key absent → THROW
 *
 * The whole-text `$node.output` form (no `.field`) is never routed here —
 * it is unchanged and never throws.
 *
 * Ported from research/archon/packages/workflows/src/output-ref.ts @ 2026-06-15.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutputRefError = void 0;
exports.declaredFieldsFromSchema = declaredFieldsFromSchema;
exports.resolveNodeOutputField = resolveNodeOutputField;
/**
 * Thrown when a `$nodeId.output.field` reference cannot be honored under
 * the no-silent-drop contract. Propagates to fail the consuming node.
 */
class OutputRefError extends Error {
    nodeId;
    field;
    reason;
    constructor(nodeId, field, reason) {
        super(OutputRefError.messageFor(nodeId, field, reason));
        this.nodeId = nodeId;
        this.field = field;
        this.reason = reason;
        this.name = 'OutputRefError';
    }
    static messageFor(nodeId, field, reason) {
        const ref = `$${nodeId}.output.${field}`;
        switch (reason) {
            case 'not-in-schema':
                return `'${ref}' references field '${field}', which is not declared in node '${nodeId}'s output_format schema. Add '${field}' to the schema (and mark it optional if it can be absent), or fix the reference.`;
            case 'unparseable':
                return `'${ref}' references field '${field}', but node '${nodeId}'s output is not a JSON object, so the field cannot be read. Emit JSON containing '${field}', or reference '$${nodeId}.output' (whole text) instead.`;
            case 'missing-key':
                return `'${ref}' references field '${field}', but node '${nodeId}'s JSON output has no such key. Emit '${field}' in the output, or fix the reference.`;
            case 'producer-not-run':
                return `'${ref}' references field '${field}', but node '${nodeId}' did not run (skipped or pending), so it has no output to read. Guard this reference with a 'when:' condition, or fix the dependency.`;
        }
    }
}
exports.OutputRefError = OutputRefError;
// ---------------------------------------------------------------------------
// declaredFieldsFromSchema
// ---------------------------------------------------------------------------
/**
 * Property-name set of an `output_format` schema, stored on
 * `NodeOutput.declaredFields` when a producer completes. Returns:
 *   - the property names (possibly `[]` for an explicit empty
 *     `properties: {}`) when the schema declares an object shape — the
 *     consumer then enforces the contract;
 *   - `undefined` when there is no schema or it has no `properties` map
 *     (a non-object schema) — the consumer treats such a producer as
 *     schemaless.
 */
function declaredFieldsFromSchema(outputFormat) {
    if (!outputFormat)
        return undefined;
    const props = outputFormat.properties;
    if (props === null || typeof props !== 'object' || Array.isArray(props))
        return undefined;
    return Object.keys(props);
}
/** Strip a single markdown code fence (```json … ```) some models/scripts wrap JSON in. */
const FENCE_RE = /^[\s\S]*?```(?:json)?\s*\n([\s\S]*?)\n\s*```[\s\S]*$/;
function asPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function parseOutputObject(text) {
    if (!text)
        return undefined;
    let candidate = text;
    const fenceMatch = FENCE_RE.exec(candidate);
    if (fenceMatch?.[1])
        candidate = fenceMatch[1];
    try {
        return asPlainObject(JSON.parse(candidate));
    }
    catch {
        return undefined;
    }
}
/**
 * Resolve `field` against a producer's `NodeOutput`. Returns the raw field
 * value (callers stringify per their context), signals an intended empty,
 * or throws `OutputRefError` for the strict cases. See the module doc for
 * the full table.
 */
function resolveNodeOutputField(nodeOutput, nodeId, field) {
    // A producer that did not run (skipped) or has not settled (pending)
    // has no output to read a field from. Surface that directly rather
    // than letting it fall through to the schemaless path and throw the
    // misleading "not a JSON object" error on its empty output.
    if (nodeOutput.state === 'skipped' || nodeOutput.state === 'pending') {
        throw new OutputRefError(nodeId, field, 'producer-not-run');
    }
    const declaredFields = nodeOutput.declaredFields;
    const structuredObj = asPlainObject(nodeOutput.structuredOutput);
    // 1. Declared-schema producer — the declared property set IS the contract.
    if (declaredFields !== undefined) {
        if (!declaredFields.includes(field)) {
            throw new OutputRefError(nodeId, field, 'not-in-schema');
        }
        // Prefer the parsed payload; fall back to parsing the JSON-serialized
        // output (covers older NodeOutput rows that predate `structuredOutput`).
        const obj = structuredObj ?? parseOutputObject(nodeOutput.output);
        if (obj === undefined)
            return { kind: 'empty' };
        const value = obj[field];
        // Required fields are guaranteed present (the producer validated
        // post-parse), so a missing/explicit-null value here is a
        // declared-optional field → empty.
        if (value === undefined || value === null)
            return { kind: 'empty' };
        return { kind: 'value', value };
    }
    // 2. Structured payload without a declared schema (legacy rows /
    //    non-object schema): prefer it, but stay lenient — with no schema
    //    we cannot tell an optional-absent field from a typo, so an absent
    //    field is '' (not a throw). A present null value is kept (callers
    //    stringify it to "null"), matching the historical
    //    structuredOutput-preference behavior.
    if (structuredObj !== undefined) {
        const value = structuredObj[field];
        if (value === undefined)
            return { kind: 'empty' };
        return { kind: 'value', value };
    }
    // 3. Schemaless producer (bash/script/prose). The author wrote
    //    `.field`, so JSON carrying that key is expected; anything else is
    //    a drop they must see.
    const obj = parseOutputObject(nodeOutput.output);
    if (obj === undefined)
        throw new OutputRefError(nodeId, field, 'unparseable');
    if (!(field in obj))
        throw new OutputRefError(nodeId, field, 'missing-key');
    return { kind: 'value', value: obj[field] };
}
//# sourceMappingURL=output-ref.js.map