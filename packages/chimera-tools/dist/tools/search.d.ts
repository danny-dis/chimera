import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const SearchFilesParamsSchema: z.ZodObject<{
    pattern: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
    include: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    exclude: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    caseSensitive: z.ZodDefault<z.ZodBoolean>;
    maxResults: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    path?: string;
    pattern?: string;
    include?: string[];
    exclude?: string[];
    caseSensitive?: boolean;
    maxResults?: number;
}, {
    path?: string;
    pattern?: string;
    include?: string[];
    exclude?: string[];
    caseSensitive?: boolean;
    maxResults?: number;
}>;
declare const SearchFilesReturnsSchema: z.ZodObject<{
    matches: z.ZodArray<z.ZodObject<{
        file: z.ZodString;
        line: z.ZodNumber;
        column: z.ZodNumber;
        match: z.ZodString;
        context: z.ZodOptional<z.ZodObject<{
            before: z.ZodString;
            after: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            before?: string;
            after?: string;
        }, {
            before?: string;
            after?: string;
        }>>;
    }, "strip", z.ZodTypeAny, {
        file?: string;
        line?: number;
        column?: number;
        match?: string;
        context?: {
            before?: string;
            after?: string;
        };
    }, {
        file?: string;
        line?: number;
        column?: number;
        match?: string;
        context?: {
            before?: string;
            after?: string;
        };
    }>, "many">;
    totalMatches: z.ZodNumber;
    filesSearched: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    matches?: {
        file?: string;
        line?: number;
        column?: number;
        match?: string;
        context?: {
            before?: string;
            after?: string;
        };
    }[];
    totalMatches?: number;
    filesSearched?: number;
}, {
    matches?: {
        file?: string;
        line?: number;
        column?: number;
        match?: string;
        context?: {
            before?: string;
            after?: string;
        };
    }[];
    totalMatches?: number;
    filesSearched?: number;
}>;
export declare const searchFilesTool: ToolDefinition<typeof SearchFilesParamsSchema, typeof SearchFilesReturnsSchema>;
declare const GlobFilesParamsSchema: z.ZodObject<{
    pattern: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    path?: string;
    pattern?: string;
}, {
    path?: string;
    pattern?: string;
}>;
declare const GlobFilesReturnsSchema: z.ZodObject<{
    files: z.ZodArray<z.ZodString, "many">;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    files?: string[];
    count?: number;
}, {
    files?: string[];
    count?: number;
}>;
export declare const globFilesTool: ToolDefinition<typeof GlobFilesParamsSchema, typeof GlobFilesReturnsSchema>;
export {};
//# sourceMappingURL=search.d.ts.map