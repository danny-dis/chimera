import { z } from 'zod';
declare const PermissionDecisionSchema: z.ZodEnum<["allow", "deny", "ask"]>;
declare const PermissionModeSchema: z.ZodEnum<["readOnly", "editFiles", "fullAccess", "custom"]>;
declare const PermissionConditionSchema: z.ZodObject<{
    type: z.ZodEnum<["path", "command", "env"]>;
    match: z.ZodString;
    action: z.ZodEnum<["allow", "deny"]>;
}, "strip", z.ZodTypeAny, {
    type: "path" | "command" | "env";
    match: string;
    action: "allow" | "deny";
}, {
    type: "path" | "command" | "env";
    match: string;
    action: "allow" | "deny";
}>;
declare const PermissionRuleSchema: z.ZodObject<{
    toolPattern: z.ZodString;
    decision: z.ZodEnum<["allow", "deny", "ask"]>;
    conditions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["path", "command", "env"]>;
        match: z.ZodString;
        action: z.ZodEnum<["allow", "deny"]>;
    }, "strip", z.ZodTypeAny, {
        type: "path" | "command" | "env";
        match: string;
        action: "allow" | "deny";
    }, {
        type: "path" | "command" | "env";
        match: string;
        action: "allow" | "deny";
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    toolPattern: string;
    decision: "allow" | "ask" | "deny";
    conditions?: {
        type: "path" | "command" | "env";
        match: string;
        action: "allow" | "deny";
    }[] | undefined;
}, {
    toolPattern: string;
    decision: "allow" | "ask" | "deny";
    conditions?: {
        type: "path" | "command" | "env";
        match: string;
        action: "allow" | "deny";
    }[] | undefined;
}>;
declare const PermissionProfileSchema: z.ZodObject<{
    name: z.ZodString;
    mode: z.ZodEnum<["readOnly", "editFiles", "fullAccess", "custom"]>;
    rules: z.ZodArray<z.ZodObject<{
        toolPattern: z.ZodString;
        decision: z.ZodEnum<["allow", "deny", "ask"]>;
        conditions: z.ZodOptional<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["path", "command", "env"]>;
            match: z.ZodString;
            action: z.ZodEnum<["allow", "deny"]>;
        }, "strip", z.ZodTypeAny, {
            type: "path" | "command" | "env";
            match: string;
            action: "allow" | "deny";
        }, {
            type: "path" | "command" | "env";
            match: string;
            action: "allow" | "deny";
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        toolPattern: string;
        decision: "allow" | "ask" | "deny";
        conditions?: {
            type: "path" | "command" | "env";
            match: string;
            action: "allow" | "deny";
        }[] | undefined;
    }, {
        toolPattern: string;
        decision: "allow" | "ask" | "deny";
        conditions?: {
            type: "path" | "command" | "env";
            match: string;
            action: "allow" | "deny";
        }[] | undefined;
    }>, "many">;
    commandAllowlist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    commandBlocklist: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    pathRestrictions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    mode: "custom" | "readOnly" | "editFiles" | "fullAccess";
    rules: {
        toolPattern: string;
        decision: "allow" | "ask" | "deny";
        conditions?: {
            type: "path" | "command" | "env";
            match: string;
            action: "allow" | "deny";
        }[] | undefined;
    }[];
    commandAllowlist?: string[] | undefined;
    commandBlocklist?: string[] | undefined;
    pathRestrictions?: string[] | undefined;
}, {
    name: string;
    mode: "custom" | "readOnly" | "editFiles" | "fullAccess";
    rules: {
        toolPattern: string;
        decision: "allow" | "ask" | "deny";
        conditions?: {
            type: "path" | "command" | "env";
            match: string;
            action: "allow" | "deny";
        }[] | undefined;
    }[];
    commandAllowlist?: string[] | undefined;
    commandBlocklist?: string[] | undefined;
    pathRestrictions?: string[] | undefined;
}>;
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;
export type PermissionMode = z.infer<typeof PermissionModeSchema>;
export type PermissionRule = z.infer<typeof PermissionRuleSchema>;
export type PermissionCondition = z.infer<typeof PermissionConditionSchema>;
export type PermissionProfile = z.infer<typeof PermissionProfileSchema>;
export declare const readOnlyProfile: PermissionProfile;
export declare const editFilesProfile: PermissionProfile;
export declare const fullAccessProfile: PermissionProfile;
export declare const customProfile: PermissionProfile;
export declare class PermissionEngine {
    private mode;
    private rules;
    constructor(initialProfile?: PermissionProfile);
    loadProfile(profile: PermissionProfile): void;
    setMode(mode: PermissionMode): void;
    getMode(): PermissionMode;
    addRule(rule: PermissionRule): void;
    removeRule(toolPattern: string): void;
    check(toolName: string, params?: Record<string, unknown>): PermissionDecision;
    private matchesPattern;
    private evaluateConditions;
}
export {};
//# sourceMappingURL=policy.d.ts.map