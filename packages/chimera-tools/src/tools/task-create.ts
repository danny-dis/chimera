import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
import { buildTool } from '../tool-builder.js';

export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  subject: z.string(),
  description: z.string(),
  activeForm: z.string().optional(),
  status: TaskStatusSchema,
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Task = z.infer<typeof TaskSchema>;

const taskStore = new Map<string, Task>();

function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getTaskStore(): Map<string, Task> {
  return taskStore;
}

const TaskCreateParamsSchema = z.object({
  subject: z.string().min(1, 'Subject must not be empty'),
  description: z.string().min(1, 'Description must not be empty'),
  activeForm: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const TaskCreateReturnsSchema = z.object({
  task: z.object({
    id: z.string(),
    subject: z.string(),
  }),
});

export const taskCreateTool: ToolDefinition<typeof TaskCreateParamsSchema, typeof TaskCreateReturnsSchema> = buildTool({
  name: 'task_create',
  description: 'Create a new task with subject, description, and optional metadata',
  parameters: TaskCreateParamsSchema,
  returns: TaskCreateReturnsSchema,
  category: 'mcp',
  permissionLevel: 'read',
  execute: async (params, _context) => {
    const id = generateTaskId();
    const now = new Date().toISOString();

    const task: Task = {
      id,
      subject: params.subject,
      description: params.description,
      activeForm: params.activeForm,
      status: 'pending',
      metadata: params.metadata,
      createdAt: now,
      updatedAt: now,
    };

    taskStore.set(id, task);

    return {
      task: { id, subject: params.subject },
    };
  },
  isReadOnly: () => false,
});
