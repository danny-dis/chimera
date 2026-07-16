import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const LspParamsSchema: z.ZodObject<{
    operation: z.ZodEnum<["goToDefinition", "findReferences", "hover", "documentSymbol", "workspaceSymbol"]>;
    filePath: z.ZodString;
    line: z.ZodOptional<z.ZodNumber>;
    character: z.ZodOptional<z.ZodNumber>;
    query: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    line?: number;
    filePath?: string;
    query?: string;
    operation?: "goToDefinition" | "findReferences" | "hover" | "documentSymbol" | "workspaceSymbol";
    character?: number;
}, {
    line?: number;
    filePath?: string;
    query?: string;
    operation?: "goToDefinition" | "findReferences" | "hover" | "documentSymbol" | "workspaceSymbol";
    character?: number;
}>;
declare const LspReturnsSchema: z.ZodObject<{
    operation: z.ZodString;
    results: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>, "many">;
    formatted: z.ZodString;
}, "strip", z.ZodTypeAny, {
    results?: Record<string, unknown>[];
    operation?: string;
    formatted?: string;
}, {
    results?: Record<string, unknown>[];
    operation?: string;
    formatted?: string;
}>;
export declare const lspTool: ToolDefinition<typeof LspParamsSchema, typeof LspReturnsSchema>;
export {};
//# sourceMappingURL=lsp.d.ts.map