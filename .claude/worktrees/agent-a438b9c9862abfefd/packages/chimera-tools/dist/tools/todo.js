"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.questionTool = exports.todoReadTool = exports.todoWriteTool = void 0;
const zod_1 = require("zod");
const tool_builder_js_1 = require("../tool-builder.js");
const TodoItemSchema = zod_1.z.object({
    content: zod_1.z.string(),
    status: zod_1.z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
    priority: zod_1.z.enum(['high', 'medium', 'low']).optional(),
});
const TodosSchema = zod_1.z.array(TodoItemSchema);
const TodoWriteParamsSchema = zod_1.z.object({
    todos: TodosSchema,
});
const TodoWriteReturnsSchema = zod_1.z.object({
    todos: TodosSchema,
    count: zod_1.z.number(),
});
exports.todoWriteTool = (0, tool_builder_js_1.buildTool)({
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
const TodoReadReturnsSchema = zod_1.z.object({
    todos: TodosSchema,
});
exports.todoReadTool = {
    name: 'todoread',
    description: 'Read the current task list',
    parameters: zod_1.z.object({}),
    returns: TodoReadReturnsSchema,
    category: 'mcp',
    permissionLevel: 'read',
    execute: async () => {
        return { todos: [] };
    },
};
const QuestionParamsSchema = zod_1.z.object({
    question: zod_1.z.string(),
    header: zod_1.z.string(),
    options: zod_1.z.array(zod_1.z.object({
        label: zod_1.z.string(),
        description: zod_1.z.string(),
    })).min(1).max(10),
    multiple: zod_1.z.boolean().default(false),
});
const QuestionReturnsSchema = zod_1.z.object({
    answer: zod_1.z.string(),
});
exports.questionTool = {
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
//# sourceMappingURL=todo.js.map