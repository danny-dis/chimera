"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateCondition = evaluateCondition;
// TODO: Import resolveNodeOutputField from chimera-context
// import { resolveNodeOutputField } from '@chimera/context'; 
/**
 * Evaluates a condition against node outputs.
 */
async function evaluateCondition(condition, context) {
    // Placeholder implementation for logic
    const leftValue = resolveValue(condition.left, context);
    switch (condition.op) {
        case '==':
            return leftValue === condition.right;
        case '!=':
            return leftValue !== condition.right;
        case 'exists':
            return leftValue !== undefined;
        default:
            return false;
    }
}
function resolveValue(path, context) {
    // Simple resolution for now
    return context[path];
}
//# sourceMappingURL=condition-evaluator.js.map