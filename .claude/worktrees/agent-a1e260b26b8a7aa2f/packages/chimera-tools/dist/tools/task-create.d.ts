import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
export declare const TaskStatusSchema: z.ZodEnum<["pending", "in_progress", "completed", "cancelled"]>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export declare const TaskSchema: z.ZodObject<{
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
}>;
export type Task = z.infer<typeof TaskSchema>;
export declare function getTaskStore(): Map<string, Task>;
declare const TaskCreateParamsSchema: z.ZodObject<{
    subject: z.ZodString;
    description: z.ZodString;
    activeForm: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    description: string;
    subject: string;
    activeForm?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    description: string;
    subject: string;
    activeForm?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
declare const TaskCreateReturnsSchema: z.ZodObject<{
    task: z.ZodObject<{
        id: z.ZodString;
        subject: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        subject: string;
    }, {
        id: string;
        subject: string;
    }>;
}, "strip", z.ZodTypeAny, {
    task: {
        id: string;
        subject: string;
    };
}, {
    task: {
        id: string;
        subject: string;
    };
}>;
export declare const taskCreateTool: ToolDefinition<typeof TaskCreateParamsSchema, typeof TaskCreateReturnsSchema>;
export {};
//# sourceMappingURL=task-create.d.ts.map