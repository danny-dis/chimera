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
export function resolveNodeOutputField(
  nodeOutput: NodeOutput,
  nodeId: string,
  field: string,
): OutputRefResolution {
  // Try structuredOutput first
  if (nodeOutput.structuredOutput && typeof nodeOutput.structuredOutput === 'object') {
    const obj = nodeOutput.structuredOutput as Record<string, unknown>;
    if (field in obj) {
      return { kind: 'value', value: obj[field] };
    }
  }

  // Try parsing output as JSON
  if (nodeOutput.output) {
    try {
      const parsed = JSON.parse(nodeOutput.output);
      if (typeof parsed === 'object' && parsed !== null && field in parsed) {
        return { kind: 'value', value: (parsed as Record<string, unknown>)[field] };
      }
    } catch {
      // Output is not JSON
    }
  }

  // Field not found — check if it's an optional field
  return { kind: 'empty' };
}

/**
 * Get declared fields from a node's output schema.
 */
export function declaredFieldsFromSchema(node: { output_format?: Record<string, unknown> }): string[] {
  if (!node.output_format) return [];
  return Object.keys(node.output_format);
}
