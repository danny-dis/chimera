export type Condition = {
  left: string;
  op: '==' | '!=' | 'exists';
  right?: string;
};

// TODO: Import resolveNodeOutputField from chimera-context
// import { resolveNodeOutputField } from '@chimera/context'; 

/**
 * Evaluates a condition against node outputs.
 */
export async function evaluateCondition(
  condition: Condition,
  context: Record<string, any>
): Promise<boolean> {
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

function resolveValue(path: string, context: Record<string, any>): any {
  // Simple resolution for now
  return context[path];
}
