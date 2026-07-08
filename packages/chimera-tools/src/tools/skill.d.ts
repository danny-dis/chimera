import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const SkillLoadParamsSchema: z.ZodObject<{
    skillName: z.ZodString;
    args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    skillName: string;
    args?: Record<string, unknown> | undefined;
}, {
    skillName: string;
    args?: Record<string, unknown> | undefined;
}>;
declare const SkillLoadReturnsSchema: z.ZodObject<{
    content: z.ZodString;
    skillName: z.ZodString;
    parsedArgs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    content: string;
    skillName: string;
    parsedArgs?: Record<string, unknown> | undefined;
}, {
    content: string;
    skillName: string;
    parsedArgs?: Record<string, unknown> | undefined;
}>;
export declare const skillLoadTool: ToolDefinition<typeof SkillLoadParamsSchema, typeof SkillLoadReturnsSchema>;
declare const CreateSkillParamsSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    content: z.ZodString;
    modes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    overwrite: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    content: string;
    description: string;
    modes: string[];
    overwrite: boolean;
}, {
    name: string;
    content: string;
    description: string;
    modes?: string[] | undefined;
    overwrite?: boolean | undefined;
}>;
declare const CreateSkillReturnsSchema: z.ZodObject<{
    path: z.ZodString;
    skillName: z.ZodString;
    created: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    path: string;
    created: boolean;
    skillName: string;
}, {
    path: string;
    created: boolean;
    skillName: string;
}>;
export declare const createSkillTool: ToolDefinition<typeof CreateSkillParamsSchema, typeof CreateSkillReturnsSchema>;
declare const CreateWorkflowParamsSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<["llm", "tool", "parallel", "sequence", "gate", "loop"]>;
        config: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        required: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "tool" | "llm" | "parallel" | "sequence" | "gate" | "loop";
        config: Record<string, unknown>;
        required?: boolean | undefined;
    }, {
        id: string;
        kind: "tool" | "llm" | "parallel" | "sequence" | "gate" | "loop";
        config?: Record<string, unknown> | undefined;
        required?: boolean | undefined;
    }>, "many">;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    overwrite: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    tags: string[];
    steps: {
        id: string;
        kind: "tool" | "llm" | "parallel" | "sequence" | "gate" | "loop";
        config: Record<string, unknown>;
        required?: boolean | undefined;
    }[];
    overwrite: boolean;
}, {
    name: string;
    steps: {
        id: string;
        kind: "tool" | "llm" | "parallel" | "sequence" | "gate" | "loop";
        config?: Record<string, unknown> | undefined;
        required?: boolean | undefined;
    }[];
    description?: string | undefined;
    tags?: string[] | undefined;
    overwrite?: boolean | undefined;
}>;
declare const CreateWorkflowReturnsSchema: z.ZodObject<{
    path: z.ZodString;
    workflowName: z.ZodString;
    created: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    path: string;
    created: boolean;
    workflowName: string;
}, {
    path: string;
    created: boolean;
    workflowName: string;
}>;
export declare const createWorkflowTool: ToolDefinition<typeof CreateWorkflowParamsSchema, typeof CreateWorkflowReturnsSchema>;
export {};
//# sourceMappingURL=skill.d.ts.map