import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const ReadFileParamsSchema: z.ZodObject<{
    path: z.ZodString;
    startLine: z.ZodOptional<z.ZodNumber>;
    endLine: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    path: string;
    startLine?: number | undefined;
    endLine?: number | undefined;
}, {
    path: string;
    startLine?: number | undefined;
    endLine?: number | undefined;
}>;
declare const ReadFileReturnsSchema: z.ZodObject<{
    content: z.ZodString;
    totalLines: z.ZodNumber;
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    content: string;
    totalLines: number;
}, {
    path: string;
    content: string;
    totalLines: number;
}>;
export declare const readFileTool: ToolDefinition<typeof ReadFileParamsSchema, typeof ReadFileReturnsSchema>;
declare const WriteFileParamsSchema: z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
    overwrite: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path: string;
    content: string;
    overwrite: boolean;
}, {
    path: string;
    content: string;
    overwrite?: boolean | undefined;
}>;
declare const WriteFileReturnsSchema: z.ZodObject<{
    path: z.ZodString;
    bytesWritten: z.ZodNumber;
    created: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    path: string;
    bytesWritten: number;
    created: boolean;
}, {
    path: string;
    bytesWritten: number;
    created: boolean;
}>;
export declare const writeFileTool: ToolDefinition<typeof WriteFileParamsSchema, typeof WriteFileReturnsSchema>;
declare const ListDirectoryParamsSchema: z.ZodObject<{
    path: z.ZodOptional<z.ZodString>;
    depth: z.ZodDefault<z.ZodNumber>;
    includeHidden: z.ZodDefault<z.ZodBoolean>;
    gitignore: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    depth: number;
    includeHidden: boolean;
    gitignore: boolean;
    path?: string | undefined;
}, {
    path?: string | undefined;
    depth?: number | undefined;
    includeHidden?: boolean | undefined;
    gitignore?: boolean | undefined;
}>;
declare const ListDirectoryReturnsSchema: z.ZodObject<{
    entries: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        path: z.ZodString;
        type: z.ZodEnum<["file", "directory", "symlink"]>;
        size: z.ZodOptional<z.ZodNumber>;
        modified: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        type: "file" | "directory" | "symlink";
        name: string;
        size?: number | undefined;
        modified?: string | undefined;
    }, {
        path: string;
        type: "file" | "directory" | "symlink";
        name: string;
        size?: number | undefined;
        modified?: string | undefined;
    }>, "many">;
    path: z.ZodString;
    totalFiles: z.ZodNumber;
    totalDirs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    path: string;
    entries: {
        path: string;
        type: "file" | "directory" | "symlink";
        name: string;
        size?: number | undefined;
        modified?: string | undefined;
    }[];
    totalFiles: number;
    totalDirs: number;
}, {
    path: string;
    entries: {
        path: string;
        type: "file" | "directory" | "symlink";
        name: string;
        size?: number | undefined;
        modified?: string | undefined;
    }[];
    totalFiles: number;
    totalDirs: number;
}>;
export declare const listDirectoryTool: ToolDefinition<typeof ListDirectoryParamsSchema, typeof ListDirectoryReturnsSchema>;
export {};
//# sourceMappingURL=filesystem.d.ts.map