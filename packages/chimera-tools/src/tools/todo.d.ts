import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const TodoWriteParamsSchema: z.ZodObject<{
    todos: z.ZodArray<z.ZodObject<{
        content: z.ZodString;
        status: z.ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
        priority: z.ZodOptional<z.ZodEnum<["high", "medium", "low"]>>;
    }, "strip", z.ZodTypeAny, {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }, {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    todos: {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }[];
}, {
    todos: {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }[];
}>;
declare const TodoWriteReturnsSchema: z.ZodObject<{
    todos: z.ZodArray<z.ZodObject<{
        content: z.ZodString;
        status: z.ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
        priority: z.ZodOptional<z.ZodEnum<["high", "medium", "low"]>>;
    }, "strip", z.ZodTypeAny, {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }, {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }>, "many">;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    todos: {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }[];
    count: number;
}, {
    todos: {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }[];
    count: number;
}>;
export declare const todoWriteTool: ToolDefinition<typeof TodoWriteParamsSchema, typeof TodoWriteReturnsSchema>;
declare const TodoReadReturnsSchema: z.ZodObject<{
    todos: z.ZodArray<z.ZodObject<{
        content: z.ZodString;
        status: z.ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
        priority: z.ZodOptional<z.ZodEnum<["high", "medium", "low"]>>;
    }, "strip", z.ZodTypeAny, {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }, {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    todos: {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }[];
}, {
    todos: {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        content: string;
        priority?: "high" | "low" | "medium" | undefined;
    }[];
}>;
export declare const todoReadTool: ToolDefinition<z.ZodTypeAny, typeof TodoReadReturnsSchema>;
declare const QuestionParamsSchema: z.ZodObject<{
    question: z.ZodString;
    header: z.ZodString;
    options: z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        description: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        description: string;
        label: string;
    }, {
        description: string;
        label: string;
    }>, "many">;
    multiple: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    options: {
        description: string;
        label: string;
    }[];
    multiple: boolean;
    question: string;
    header: string;
}, {
    options: {
        description: string;
        label: string;
    }[];
    question: string;
    header: string;
    multiple?: boolean | undefined;
}>;
declare const QuestionReturnsSchema: z.ZodObject<{
    answer: z.ZodString;
}, "strip", z.ZodTypeAny, {
    answer: string;
}, {
    answer: string;
}>;
export declare const questionTool: ToolDefinition<typeof QuestionParamsSchema, typeof QuestionReturnsSchema>;
export {};
//# sourceMappingURL=todo.d.ts.map