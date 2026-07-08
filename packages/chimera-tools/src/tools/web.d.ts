import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const WebFetchParamsSchema: z.ZodObject<{
    url: z.ZodString;
    format: z.ZodDefault<z.ZodEnum<["markdown", "text", "html"]>>;
    timeout: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    format: "text" | "markdown" | "html";
    timeout: number;
    url: string;
}, {
    url: string;
    format?: "text" | "markdown" | "html" | undefined;
    timeout?: number | undefined;
}>;
declare const WebFetchReturnsSchema: z.ZodObject<{
    content: z.ZodString;
    url: z.ZodString;
    format: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
    format: string;
    url: string;
}, {
    content: string;
    format: string;
    url: string;
}>;
export declare const webFetchTool: ToolDefinition<typeof WebFetchParamsSchema, typeof WebFetchReturnsSchema>;
declare const WebSearchParamsSchema: z.ZodObject<{
    query: z.ZodString;
    numResults: z.ZodDefault<z.ZodNumber>;
    type: z.ZodDefault<z.ZodEnum<["fast", "deep", "auto"]>>;
}, "strip", z.ZodTypeAny, {
    type: "auto" | "fast" | "deep";
    query: string;
    numResults: number;
}, {
    query: string;
    type?: "auto" | "fast" | "deep" | undefined;
    numResults?: number | undefined;
}>;
declare const WebSearchReturnsSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        url: z.ZodString;
        snippet: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        url: string;
        title: string;
        snippet: string;
    }, {
        url: string;
        title: string;
        snippet: string;
    }>, "many">;
    total: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    total: number;
    results: {
        url: string;
        title: string;
        snippet: string;
    }[];
}, {
    total: number;
    results: {
        url: string;
        title: string;
        snippet: string;
    }[];
}>;
export declare const webSearchTool: ToolDefinition<typeof WebSearchParamsSchema, typeof WebSearchReturnsSchema>;
export {};
//# sourceMappingURL=web.d.ts.map