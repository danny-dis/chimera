export type Condition = {
    left: string;
    op: '==' | '!=' | 'exists';
    right?: string;
};
/**
 * Evaluates a condition against node outputs.
 */
export declare function evaluateCondition(condition: Condition, context: Record<string, any>): Promise<boolean>;
//# sourceMappingURL=condition-evaluator.d.ts.map