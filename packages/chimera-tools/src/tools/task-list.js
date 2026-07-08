"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskListTool = void 0;
const zod_1 = require("zod");
const tool_builder_js_1 = require("../tool-builder.js");
const task_create_js_1 = require("./task-create.js");
const TaskListParamsSchema = zod_1.z.object({});
const TaskListReturnsSchema = zod_1.z.object({
    tasks: zod_1.z.array(task_create_js_1.TaskSchema),
    count: zod_1.z.number(),
});
exports.taskListTool = (0, tool_builder_js_1.buildTool)({
    name: 'task_list',
    description: 'List all tasks with their current status',
    parameters: TaskListParamsSchema,
    returns: TaskListReturnsSchema,
    category: 'mcp',
    permissionLevel: 'read',
    execute: async () => {
        const taskStore = (0, task_create_js_1.getTaskStore)();
        const tasks = Array.from(taskStore.values());
        return {
            tasks,
            count: tasks.length,
        };
    },
    isReadOnly: () => true,
});
//# sourceMappingURL=task-list.js.map