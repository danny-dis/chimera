import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
import { buildTool } from '../tool-builder.js';
import { TaskStatusSchema, TaskSchema, getTaskStore } from './task-create.js';

const TaskUpdateParamsSchema = z.object({
  id: z.string().min(1, 'Task ID must not be empty'),
  status: TaskStatusSchema,
});

const TaskUpdateReturnsSchema = z.object({
  task: TaskSchema,
});

export const taskUpdateTool: ToolDefinition<typeof TaskUpdateParamsSchema, typeof TaskUpdateReturnsSchema> = buildTool({
  name: 'task_update',
  description: 'Update a task status (pending, in_progress, completed, cancelled)',
  parameters: TaskUpdateParamsSchema,
  returns: TaskUpdateReturnsSchema,
  category: 'mcp',
  permissionLevel: 'read',
  execute: async (params) => {
    const taskStore = getTaskStore();
    const task = taskStore.get(params.id);

    if (!task) {
      throw new Error(`Task not found: ${params.id}`);
    }

    const updatedTask = {
      ...task,
      status: params.status,
      updatedAt: new Date().toISOString(),
    };

    taskStore.set(params.id, updatedTask);

    return { task: updatedTask };
  },
  isReadOnly: () => false,
});
