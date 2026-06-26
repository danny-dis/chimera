import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const ApplyPatchParamsSchema: z.ZodObject<{
    patch: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
    dryRun: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    patch: string;
    dryRun: boolean;
    path?: string | undefined;
}, {
    patch: string;
    path?: string | undefined;
    dryRun?: boolean | undefined;
}>;
declare const ApplyPatchReturnsSchema: z.ZodObject<{
    applied: z.ZodBoolean;
    filesChanged: z.ZodArray<z.ZodString, "many">;
    hunksApplied: z.ZodNumber;
    hunksFailed: z.ZodNumber;
    rejectFiles: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    filesChanged: string[];
    applied: boolean;
    hunksApplied: number;
    hunksFailed: number;
    rejectFiles: string[];
}, {
    filesChanged: string[];
    applied: boolean;
    hunksApplied: number;
    hunksFailed: number;
    rejectFiles: string[];
}>;
export declare const applyPatchTool: ToolDefinition<typeof ApplyPatchParamsSchema, typeof ApplyPatchReturnsSchema>;
declare const EditBlockParamsSchema: z.ZodObject<{
    path: z.ZodString;
    oldText: z.ZodString;
    newText: z.ZodString;
    replaceAll: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path: string;
    replaceAll: boolean;
    oldText: string;
    newText: string;
}, {
    path: string;
    oldText: string;
    newText: string;
    replaceAll?: boolean | undefined;
}>;
declare const EditBlockReturnsSchema: z.ZodObject<{
    applied: z.ZodBoolean;
    path: z.ZodString;
    replacements: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    path: string;
    applied: boolean;
    replacements: number;
}, {
    path: string;
    applied: boolean;
    replacements: number;
}>;
export declare const editBlockTool: ToolDefinition<typeof EditBlockParamsSchema, typeof EditBlockReturnsSchema>;
declare const SearchReplaceParamsSchema: z.ZodEffects<z.ZodObject<{
    path: z.ZodString;
    blocks: z.ZodOptional<z.ZodArray<z.ZodObject<{
        search: z.ZodString;
        replace: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        search: string;
        replace: string;
    }, {
        search: string;
        replace: string;
    }>, "many">>;
    text: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    path: string;
    blocks?: {
        search: string;
        replace: string;
    }[] | undefined;
    text?: string | undefined;
}, {
    path: string;
    blocks?: {
        search: string;
        replace: string;
    }[] | undefined;
    text?: string | undefined;
}>, {
    path: string;
    blocks?: {
        search: string;
        replace: string;
    }[] | undefined;
    text?: string | undefined;
}, {
    path: string;
    blocks?: {
        search: string;
        replace: string;
    }[] | undefined;
    text?: string | undefined;
}>;
declare const SearchReplaceReturnsSchema: z.ZodObject<{
    applied: z.ZodBoolean;
    path: z.ZodString;
    replacements: z.ZodNumber;
    failures: z.ZodArray<z.ZodObject<{
        search: z.ZodString;
        reason: z.ZodString;
        similarLines: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        search: string;
        reason: string;
        similarLines: string[];
    }, {
        search: string;
        reason: string;
        similarLines: string[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    path: string;
    applied: boolean;
    replacements: number;
    failures: {
        search: string;
        reason: string;
        similarLines: string[];
    }[];
}, {
    path: string;
    applied: boolean;
    replacements: number;
    failures: {
        search: string;
        reason: string;
        similarLines: string[];
    }[];
}>;
export declare const searchReplaceTool: ToolDefinition<typeof SearchReplaceParamsSchema, typeof SearchReplaceReturnsSchema>;
export {};
//# sourceMappingURL=edit.d.ts.map