export type PermissionSource = 'global' | 'project' | 'session' | 'user-prompt' | 'system';
export interface PermissionRule {
    id: string;
    tool: string;
    pattern?: string;
    behavior: 'allow' | 'deny' | 'ask';
    source: PermissionSource;
    createdAt: Date;
    expiresAt?: Date;
}
export interface PermissionContext {
    tool: string;
    input: unknown;
    workspaceRoot: string;
    sessionId: string;
}
export interface PermissionResult {
    behavior: 'allow' | 'deny' | 'ask';
    source: PermissionSource;
    rule?: PermissionRule;
}
export declare class PermissionManager {
    private rules;
    addRule(rule: PermissionRule): void;
    removeRule(id: string): boolean;
    checkPermission(context: PermissionContext): Promise<PermissionResult>;
    matchesRule(rule: PermissionRule, tool: string, input: unknown): boolean;
    specificityScore(rule: PermissionRule): number;
}
//# sourceMappingURL=permission-manager.d.ts.map