import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
import { buildTool } from '../tool-builder.js';
import { TaskSchema, getTaskStore } from './task-create.js';

const TaskListParamsSchema = z.object({});

const TaskListReturnsSchema = z.object({
  tasks: z.array(TaskSchema),
  count: z.number(),
});

export const taskListTool: ToolDefinition<typeof TaskListParamsSchema, typeof TaskListReturnsSchema> = buildTool({
  name: 'task_list',
  description: 'List all tasks with their current status',
  parameters: TaskListParamsSchema,
  returns: TaskListReturnsSchema,
  category: 'mcp',
  permissionLevel: 'read',
  execute: async () => {
    const taskStore = getTaskStore();
    const tasks = Array.from(taskStore.values());

    return {
      tasks,
      count: tasks.length,
    };
  },
  isReadOnly: () => true,
});
