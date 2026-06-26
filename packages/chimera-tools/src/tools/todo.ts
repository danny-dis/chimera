import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
import { buildTool } from '../tool-builder.js';

const TodoItemSchema = z.object({
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  priority: z.enum(['high', 'medium', 'low']).optional(),
});

const TodosSchema = z.array(TodoItemSchema);

const TodoWriteParamsSchema = z.object({
  todos: TodosSchema,
});

const TodoWriteReturnsSchema = z.object({
  todos: TodosSchema,
  count: z.number(),
});

export const todoWriteTool: ToolDefinition<typeof TodoWriteParamsSchema, typeof TodoWriteReturnsSchema> = buildTool({
  name: 'todowrite',
  description: 'Create and manage a structured task list for multi-step operations',
  parameters: TodoWriteParamsSchema,
  returns: TodoWriteReturnsSchema,
  category: 'mcp',
  permissionLevel: 'read',
  execute: async (params) => {
    const validatedTodos = TodosSchema.parse(params.todos);
    return { todos: validatedTodos, count: validatedTodos.length };
  },
  isReadOnly: () => false,
});

const TodoReadReturnsSchema = z.object({
  todos: TodosSchema,
});

export const todoReadTool: ToolDefinition<z.ZodTypeAny, typeof TodoReadReturnsSchema> = {
  name: 'todoread',
  description: 'Read the current task list',
  parameters: z.object({}),
  returns: TodoReadReturnsSchema,
  category: 'mcp',
  permissionLevel: 'read',
  execute: async () => {
    return { todos: [] };
  },
};

const QuestionParamsSchema = z.object({
  question: z.string(),
  header: z.string(),
  options: z.array(z.object({
    label: z.string(),
    description: z.string(),
  })).min(1).max(10),
  multiple: z.boolean().default(false),
});

const QuestionReturnsSchema = z.object({
  answer: z.string(),
});

export const questionTool: ToolDefinition<typeof QuestionParamsSchema, typeof QuestionReturnsSchema> = {
  name: 'question',
  description: 'Ask the user a question and receive their response',
  parameters: QuestionParamsSchema,
  returns: QuestionReturnsSchema,
  category: 'mcp',
  permissionLevel: 'execute',
  execute: async (params) => {
    console.log(`\n❓ ${params.header || 'Question'}: ${params.question}\n`);
    console.log('Options:');
    params.options.forEach((opt, i) => {
      console.log(`  ${i + 1}. ${opt.label} - ${opt.description}`);
    });
    console.log('\n(Interactive mode required for actual Q&A)');
    return { answer: '' };
  },
};