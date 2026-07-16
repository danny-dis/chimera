import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const FindFolderParamsSchema: z.ZodObject<{
    name: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
    maxResults: z.ZodDefault<z.ZodNumber>;
    depth: z.ZodDefault<z.ZodNumber>;
    caseSensitive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path?: string;
    name?: string;
    depth?: number;
    caseSensitive?: boolean;
    maxResults?: number;
}, {
    path?: string;
    name?: string;
    depth?: number;
    caseSensitive?: boolean;
    maxResults?: number;
}>;
declare const FindFolderReturnsSchema: z.ZodObject<{
    folders: z.ZodArray<z.ZodString, "many">;
    count: z.ZodNumber;
    searched: z.ZodString;
}, "strip", z.ZodTypeAny, {
    count?: number;
    folders?: string[];
    searched?: string;
}, {
    count?: number;
    folders?: string[];
    searched?: string;
}>;
export declare const findFolderTool: ToolDefinition<typeof FindFolderParamsSchema, typeof FindFolderReturnsSchema>;
export {};
//# sourceMappingURL=find-folder.d.ts.map