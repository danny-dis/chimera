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
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>, "many">;
    count: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    count: number;
    tasks: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
}, {
    count: number;
    tasks: {
        status: "pending" | "in_progress" | "completed" | "cancelled";
        description: string;
        id: string;
        subject: string;
        createdAt: string;
        updatedAt: string;
        activeForm?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }[];
}>;
export declare const taskListTool: ToolDefinition<typeof TaskListParamsSchema, typeof TaskListReturnsSchema>;
export {};
//# sourceMappingURL=task-list.d.ts.map