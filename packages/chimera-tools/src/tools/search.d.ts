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
    pattern: string;
    caseSensitive: boolean;
    maxResults: number;
    path?: string | undefined;
    include?: string[] | undefined;
    exclude?: string[] | undefined;
}, {
    pattern: string;
    path?: string | undefined;
    include?: string[] | undefined;
    exclude?: string[] | undefined;
    caseSensitive?: boolean | undefined;
    maxResults?: number | undefined;
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
            before: string;
            after: string;
        }, {
            before: string;
            after: string;
        }>>;
    }, "strip", z.ZodTypeAny, {
        match: string;
        line: number;
        file: string;
        column: number;
        context?: {
            before: string;
            after: string;
        } | undefined;
    }, {
        match: string;
        line: number;
        file: string;
        column: number;
        context?: {
            before: string;
            after: string;
        } | undefined;
    }>, "many">;
    totalMatches: z.ZodNumber;
    filesSearched: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    matches: {
        match: string;
        line: number;
        file: string;
        column: number;
        context?: {
            before: string;
            after: string;
        } | undefined;
    }[];
    totalMatches: number;
    filesSearched: number;
}, {
    matches: {
        match: string;
        line: number;
        file: string;
        column: number;
        context?: {
            before: string;
            after: string;
        } | undefined;
    }[];
    totalMatches: number;
    filesSearched: number;
}>;
export declare const searchFilesTool: ToolDefinition<typeof SearchFilesParamsSchema, typeof SearchFilesReturnsSchema>;
declare const GlobFilesParamsSchema: z.ZodObject<{
    pattern: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    pattern: string;
    path?: string | undefined;
}, {
    pattern: string;
    path?: string | undefined;
}>;
declare const GlobFilesReturnsSchema: z.ZodObject<{
    files: z.ZodArray<z.ZodString, "many">;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    count: number;
    files: string[];
}, {
    count: number;
    files: string[];
}>;
export declare const globFilesTool: ToolDefinition<typeof GlobFilesParamsSchema, typeof GlobFilesReturnsSchema>;
export {};
//# sourceMappingURL=search.d.ts.map