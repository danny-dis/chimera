import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const ReadFileParamsSchema: z.ZodEffects<z.ZodObject<{
    path: z.ZodString;
    startLine: z.ZodOptional<z.ZodNumber>;
    endLine: z.ZodOptional<z.ZodNumber>;
    startPage: z.ZodOptional<z.ZodNumber>;
    endPage: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    path?: string;
    startLine?: number;
    endLine?: number;
    startPage?: number;
    endPage?: number;
}, {
    path?: string;
    startLine?: number;
    endLine?: number;
    startPage?: number;
    endPage?: number;
}>, {
    path?: string;
    startLine?: number;
    endLine?: number;
    startPage?: number;
    endPage?: number;
}, {
    path?: string;
    startLine?: number;
    endLine?: number;
    startPage?: number;
    endPage?: number;
}>;
declare const ReadFileReturnsSchema: z.ZodObject<{
    content: z.ZodString;
    totalLines: z.ZodNumber;
    path: z.ZodString;
    media: z.ZodOptional<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"image">;
        mime: z.ZodString;
        base64: z.ZodString;
        bytes: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        kind?: "image";
        mime?: string;
        base64?: string;
        bytes?: number;
    }, {
        kind?: "image";
        mime?: string;
        base64?: string;
        bytes?: number;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"pdf">;
        mime: z.ZodLiteral<"application/pdf">;
        base64: z.ZodString;
        bytes: z.ZodNumber;
        pageCount: z.ZodNumber;
        pages: z.ZodArray<z.ZodNumber, "many">;
    }, "strip", z.ZodTypeAny, {
        kind?: "pdf";
        mime?: "application/pdf";
        base64?: string;
        bytes?: number;
        pageCount?: number;
        pages?: number[];
    }, {
        kind?: "pdf";
        mime?: "application/pdf";
        base64?: string;
        bytes?: number;
        pageCount?: number;
        pages?: number[];
    }>]>>;
}, "strip", z.ZodTypeAny, {
    path?: string;
    content?: string;
    totalLines?: number;
    media?: {
        kind?: "image";
        mime?: string;
        base64?: string;
        bytes?: number;
    } | {
        kind?: "pdf";
        mime?: "application/pdf";
        base64?: string;
        bytes?: number;
        pageCount?: number;
        pages?: number[];
    };
}, {
    path?: string;
    content?: string;
    totalLines?: number;
    media?: {
        kind?: "image";
        mime?: string;
        base64?: string;
        bytes?: number;
    } | {
        kind?: "pdf";
        mime?: "application/pdf";
        base64?: string;
        bytes?: number;
        pageCount?: number;
        pages?: number[];
    };
}>;
export declare const readFileTool: ToolDefinition<typeof ReadFileParamsSchema, typeof ReadFileReturnsSchema>;
declare const WriteFileParamsSchema: z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
    overwrite: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path?: string;
    content?: string;
    overwrite?: boolean;
}, {
    path?: string;
    content?: string;
    overwrite?: boolean;
}>;
declare const WriteFileReturnsSchema: z.ZodObject<{
    path: z.ZodString;
    bytesWritten: z.ZodNumber;
    created: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    path?: string;
    bytesWritten?: number;
    created?: boolean;
}, {
    path?: string;
    bytesWritten?: number;
    created?: boolean;
}>;
export declare const writeFileTool: ToolDefinition<typeof WriteFileParamsSchema, typeof WriteFileReturnsSchema>;
declare const ListDirectoryParamsSchema: z.ZodObject<{
    path: z.ZodOptional<z.ZodString>;
    depth: z.ZodDefault<z.ZodNumber>;
    includeHidden: z.ZodDefault<z.ZodBoolean>;
    gitignore: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path?: string;
    depth?: number;
    includeHidden?: boolean;
    gitignore?: boolean;
}, {
    path?: string;
    depth?: number;
    includeHidden?: boolean;
    gitignore?: boolean;
}>;
declare const ListDirectoryReturnsSchema: z.ZodObject<{
    entries: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        path: z.ZodString;
        type: z.ZodEnum<["file", "directory", "symlink"]>;
        size: z.ZodOptional<z.ZodNumber>;
        modified: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        path?: string;
        type?: "file" | "directory" | "symlink";
        name?: string;
        size?: number;
        modified?: string;
    }, {
        path?: string;
        type?: "file" | "directory" | "symlink";
        name?: string;
        size?: number;
        modified?: string;
    }>, "many">;
    path: z.ZodString;
    totalFiles: z.ZodNumber;
    totalDirs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    path?: string;
    entries?: {
        path?: string;
        type?: "file" | "directory" | "symlink";
        name?: string;
        size?: number;
        modified?: string;
    }[];
    totalFiles?: number;
    totalDirs?: number;
}, {
    path?: string;
    entries?: {
        path?: string;
        type?: "file" | "directory" | "symlink";
        name?: string;
        size?: number;
        modified?: string;
    }[];
    totalFiles?: number;
    totalDirs?: number;
}>;
export declare const listDirectoryTool: ToolDefinition<typeof ListDirectoryParamsSchema, typeof ListDirectoryReturnsSchema>;
export {};
//# sourceMappingURL=filesystem.d.ts.map