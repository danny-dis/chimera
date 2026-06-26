import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const SkillLoadParamsSchema: z.ZodObject<{
    skillName: z.ZodString;
    args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    skillName?: string;
    args?: Record<string, unknown>;
}, {
    skillName?: string;
    args?: Record<string, unknown>;
}>;
declare const SkillLoadReturnsSchema: z.ZodObject<{
    content: z.ZodString;
    skillName: z.ZodString;
    parsedArgs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    content?: string;
    skillName?: string;
    parsedArgs?: Record<string, unknown>;
}, {
    content?: string;
    skillName?: string;
    parsedArgs?: Record<string, unknown>;
}>;
export declare const skillLoadTool: ToolDefinition<typeof SkillLoadParamsSchema, typeof SkillLoadReturnsSchema>;
declare const CreateSkillParamsSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    content: z.ZodString;
    modes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    overwrite: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name?: string;
    description?: string;
    content?: string;
    overwrite?: boolean;
    modes?: string[];
}, {
    name?: string;
    description?: string;
    content?: string;
    overwrite?: boolean;
    modes?: string[];
}>;
declare const CreateSkillReturnsSchema: z.ZodObject<{
    path: z.ZodString;
    skillName: z.ZodString;
    created: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    path?: string;
    created?: boolean;
    skillName?: string;
}, {
    path?: string;
    created?: boolean;
    skillName?: string;
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
        kind?: "llm" | "tool" | "parallel" | "sequence" | "gate" | "loop";
        id?: string;
        config?: Record<string, unknown>;
        required?: boolean;
    }, {
        kind?: "llm" | "tool" | "parallel" | "sequence" | "gate" | "loop";
        id?: string;
        config?: Record<string, unknown>;
        required?: boolean;
    }>, "many">;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    overwrite: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name?: string;
    description?: string;
    overwrite?: boolean;
    steps?: {
        kind?: "llm" | "tool" | "parallel" | "sequence" | "gate" | "loop";
        id?: string;
        config?: Record<string, unknown>;
        required?: boolean;
    }[];
    tags?: string[];
}, {
    name?: string;
    description?: string;
    overwrite?: boolean;
    steps?: {
        kind?: "llm" | "tool" | "parallel" | "sequence" | "gate" | "loop";
        id?: string;
        config?: Record<string, unknown>;
        required?: boolean;
    }[];
    tags?: string[];
}>;
declare const CreateWorkflowReturnsSchema: z.ZodObject<{
    path: z.ZodString;
    workflowName: z.ZodString;
    created: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    path?: string;
    created?: boolean;
    workflowName?: string;
}, {
    path?: string;
    created?: boolean;
    workflowName?: string;
}>;
export declare const createWorkflowTool: ToolDefinition<typeof CreateWorkflowParamsSchema, typeof CreateWorkflowReturnsSchema>;
export {};
//# sourceMappingURL=skill.d.ts.map