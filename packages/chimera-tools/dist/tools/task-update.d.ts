import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const TaskUpdateParamsSchema: z.ZodObject<{
    id: z.ZodString;
    status: z.ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
}, "strip", z.ZodTypeAny, {
    status?: "pending" | "in_progress" | "completed" | "cancelled";
    id?: string;
}, {
    status?: "pending" | "in_progress" | "completed" | "cancelled";
    id?: string;
}>;
declare const TaskUpdateReturnsSchema: z.ZodObject<{
    task: z.ZodObject<{
        id: z.ZodString;
        subject: z.ZodString;
        description: z.ZodString;
        activeForm: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        status?: "pending" | "in_progress" | "completed" | "cancelled";
        description?: string;
        id?: string;
        subject?: string;
        activeForm?: string;
        metadata?: Record<string, unknown>;
        createdAt?: string;
        updatedAt?: string;
    }, {
        status?: "pending" | "in_progress" | "completed" | "cancelled";
        description?: string;
        id?: string;
        subject?: string;
        activeForm?: string;
        metadata?: Record<string, unknown>;
        createdAt?: string;
        updatedAt?: string;
    }>;
}, "strip", z.ZodTypeAny, {
    task?: {
        status?: "pending" | "in_progress" | "completed" | "cancelled";
        description?: string;
        id?: string;
        subject?: string;
        activeForm?: string;
        metadata?: Record<string, unknown>;
        createdAt?: string;
        updatedAt?: string;
    };
}, {
    task?: {
        status?: "pending" | "in_progress" | "completed" | "cancelled";
        description?: string;
        id?: string;
        subject?: string;
        activeForm?: string;
        metadata?: Record<string, unknown>;
        createdAt?: string;
        updatedAt?: string;
    };
}>;
export declare const taskUpdateTool: ToolDefinition<typeof TaskUpdateParamsSchema, typeof TaskUpdateReturnsSchema>;
export {};
//# sourceMappingURL=task-update.d.ts.map