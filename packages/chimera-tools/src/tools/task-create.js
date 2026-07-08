"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskCreateTool = exports.TaskSchema = exports.TaskStatusSchema = void 0;
exports.getTaskStore = getTaskStore;
const zod_1 = require("zod");
const tool_builder_js_1 = require("../tool-builder.js");
exports.TaskStatusSchema = zod_1.z.enum(['pending', 'in_progress', 'completed', 'cancelled']);
exports.TaskSchema = zod_1.z.object({
    id: zod_1.z.string(),
    subject: zod_1.z.string(),
    description: zod_1.z.string(),
    activeForm: zod_1.z.string().optional(),
    status: exports.TaskStatusSchema,
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
const taskStore = new Map();
function generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
function getTaskStore() {
    return taskStore;
}
const TaskCreateParamsSchema = zod_1.z.object({
    subject: zod_1.z.string().min(1, 'Subject must not be empty'),
    description: zod_1.z.string().min(1, 'Description must not be empty'),
    activeForm: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const TaskCreateReturnsSchema = zod_1.z.object({
    task: zod_1.z.object({
        id: zod_1.z.string(),
        subject: zod_1.z.string(),
    }),
});
exports.taskCreateTool = (0, tool_builder_js_1.buildTool)({
    name: 'task_create',
    description: 'Create a new task with subject, description, and optional metadata',
    parameters: TaskCreateParamsSchema,
    returns: TaskCreateReturnsSchema,
    category: 'mcp',
    permissionLevel: 'read',
    execute: async (params, _context) => {
        const id = generateTaskId();
        const now = new Date().toISOString();
        const task = {
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
//# sourceMappingURL=task-create.js.map