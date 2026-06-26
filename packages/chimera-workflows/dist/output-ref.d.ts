/**
 * Output reference resolution for DAG node output substitution.
 * Resolves $node_id.output.field references.
 */
import type { NodeOutput } from './schemas/dag-node';
export interface OutputRefResolution {
    kind: 'value' | 'empty';
    value?: unknown;
}
/**
 * Resolve a field reference from a node's output.
 */
export declare function resolveNodeOutputField(nodeOutput: NodeOutput, nodeId: string, field: string): OutputRefResolution;
/**
 * Get declared fields from a node's output schema.
 */
export declare function declaredFieldsFromSchema(node: {
    output_format?: Record<string, unknown>;
}): string[];
//# sourceMappingURL=output-ref.d.ts.map