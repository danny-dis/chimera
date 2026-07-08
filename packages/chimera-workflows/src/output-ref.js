"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveNodeOutputField = resolveNodeOutputField;
exports.declaredFieldsFromSchema = declaredFieldsFromSchema;
/**
 * Resolve a field reference from a node's output.
 */
function resolveNodeOutputField(nodeOutput, nodeId, field) {
    // Try structuredOutput first
    if (nodeOutput.structuredOutput && typeof nodeOutput.structuredOutput === 'object') {
        const obj = nodeOutput.structuredOutput;
        if (field in obj) {
            return { kind: 'value', value: obj[field] };
        }
    }
    // Try parsing output as JSON
    if (nodeOutput.output) {
        try {
            const parsed = JSON.parse(nodeOutput.output);
            if (typeof parsed === 'object' && parsed !== null && field in parsed) {
                return { kind: 'value', value: parsed[field] };
            }
        }
        catch {
            // Output is not JSON
        }
    }
    // Field not found — check if it's an optional field
    return { kind: 'empty' };
}
/**
 * Get declared fields from a node's output schema.
 */
function declaredFieldsFromSchema(node) {
    if (!node.output_format)
        return [];
    return Object.keys(node.output_format);
}
//# sourceMappingURL=output-ref.js.map