import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const TaskListParamsSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
declare const TaskListReturnsSchema: z.ZodObject<{
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        subject: z.ZodString;
        description: z.ZodString;
        activeForm: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        id: string;
        description: string;
        createdAt: string;
        subject: string;
        updatedAt: string;
        metadata?: Record<string, unknown> | undefined;
        activeForm?: string | undefined;
    }, {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        id: string;
        description: string;
        createdAt: string;
        subject: string;
        updatedAt: string;
        metadata?: Record<string, unknown> | undefined;
        activeForm?: string | undefined;
    }>, "many">;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    tasks: {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        id: string;
        description: string;
        createdAt: string;
        subject: string;
        updatedAt: string;
        metadata?: Record<string, unknown> | undefined;
        activeForm?: string | undefined;
    }[];
    count: number;
}, {
    tasks: {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        id: string;
        description: string;
        createdAt: string;
        subject: string;
        updatedAt: string;
        metadata?: Record<string, unknown> | undefined;
        activeForm?: string | undefined;
    }[];
    count: number;
}>;
export declare const taskListTool: ToolDefinition<typeof TaskListParamsSchema, typeof TaskListReturnsSchema>;
export {};
//# sourceMappingURL=task-list.d.ts.map