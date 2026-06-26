"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskUpdateTool = void 0;
const zod_1 = require("zod");
const tool_builder_js_1 = require("../tool-builder.js");
const task_create_js_1 = require("./task-create.js");
const TaskUpdateParamsSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, 'Task ID must not be empty'),
    status: task_create_js_1.TaskStatusSchema,
});
const TaskUpdateReturnsSchema = zod_1.z.object({
    task: task_create_js_1.TaskSchema,
});
exports.taskUpdateTool = (0, tool_builder_js_1.buildTool)({
    name: 'task_update',
    description: 'Update a task status (pending, in_progress, completed, cancelled)',
    parameters: TaskUpdateParamsSchema,
    returns: TaskUpdateReturnsSchema,
    category: 'mcp',
    permissionLevel: 'read',
    execute: async (params) => {
        const taskStore = (0, task_create_js_1.getTaskStore)();
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
//# sourceMappingURL=task-update.js.map