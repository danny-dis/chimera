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
export type NodeOutputState = 'completed' | 'skipped' | 'pending' | 'failed';
export interface NodeOutput {
    /** Producer's terminal state. 'skipped' / 'pending' → producer-not-run. */
    state: NodeOutputState;
    /** Whole-text output. Empty for skipped / pending nodes. */
    output: string;
    /**
     * Property names declared by the producer's `output_format` schema.
     * `undefined` when the producer has no schema or the schema has no
     * `properties` map.
     */
    declaredFields?: string[];
    /**
     * Pre-parsed structured payload (when `output_format` is in effect and
     * the producer honored it). May be set without `declaredFields` for
     * legacy rows.
     */
    structuredOutput?: unknown;
}
export type OutputRefErrorReason = 'not-in-schema' | 'unparseable' | 'missing-key' | 'producer-not-run';
/**
 * Thrown when a `$nodeId.output.field` reference cannot be honored under
 * the no-silent-drop contract. Propagates to fail the consuming node.
 */
export declare class OutputRefError extends Error {
    readonly nodeId: string;
    readonly field: string;
    readonly reason: OutputRefErrorReason;
    constructor(nodeId: string, field: string, reason: OutputRefErrorReason);
    private static messageFor;
}
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
export declare function declaredFieldsFromSchema(outputFormat: Record<string, unknown> | undefined): string[] | undefined;
export type FieldResolution = {
    kind: 'value';
    value: unknown;
} | {
    kind: 'empty';
};
/**
 * Resolve `field` against a producer's `NodeOutput`. Returns the raw field
 * value (callers stringify per their context), signals an intended empty,
 * or throws `OutputRefError` for the strict cases. See the module doc for
 * the full table.
 */
export declare function resolveNodeOutputField(nodeOutput: NodeOutput, nodeId: string, field: string): FieldResolution;
//# sourceMappingURL=output-ref.d.ts.map