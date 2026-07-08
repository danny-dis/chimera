import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const TaskUpdateParamsSchema: z.ZodObject<{
    id: z.ZodString;
    status: z.ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
}, "strip", z.ZodTypeAny, {
    status: "cancelled" | "completed" | "pending" | "in_progress";
    id: string;
}, {
    status: "cancelled" | "completed" | "pending" | "in_progress";
    id: string;
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
    }>;
}, "strip", z.ZodTypeAny, {
    task: {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        id: string;
        description: string;
        createdAt: string;
        subject: string;
        updatedAt: string;
        metadata?: Record<string, unknown> | undefined;
        activeForm?: string | undefined;
    };
}, {
    task: {
        status: "cancelled" | "completed" | "pending" | "in_progress";
        id: string;
        description: string;
        createdAt: string;
        subject: string;
        updatedAt: string;
        metadata?: Record<string, unknown> | undefined;
        activeForm?: string | undefined;
    };
}>;
export declare const taskUpdateTool: ToolDefinition<typeof TaskUpdateParamsSchema, typeof TaskUpdateReturnsSchema>;
export {};
//# sourceMappingURL=task-update.d.ts.map