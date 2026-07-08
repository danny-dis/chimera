"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverWorkflows = discoverWorkflows;
const fast_glob_1 = require("fast-glob");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const workflow_js_1 = require("./schemas/workflow.js");
const paths_1 = require("@chimera/paths");
const log = (0, paths_1.createLogger)('workflows.discovery');
const MAX_DISCOVERY_DEPTH = 1;
async function discoverWorkflows(projectRoot) {
    const workflows = {};
    // Search for .yaml or .yml files in examples/workflows/
    const workflowFiles = await (0, fast_glob_1.glob)('examples/workflows/*.{yaml,yml}', {
        cwd: projectRoot,
        deep: MAX_DISCOVERY_DEPTH,
    });
    for (const file of workflowFiles) {
        try {
            const fullPath = (0, node_path_1.join)(projectRoot, file);
            const content = await (0, promises_1.readFile)(fullPath, 'utf-8');
            // Simple YAML parsing for now (validated by zod below).
            // TODO: Use a proper YAML parser with bundled types.
            const yaml = await import('js-yaml');
            const parsed = yaml.load(content);
            const validated = workflow_js_1.workflowDefinitionSchema.parse(parsed);
            const name = file.split('/').pop()?.split('.')[0] ?? 'unknown';
            workflows[name] = validated;
        }
        catch (error) {
            log.error({ file, error }, 'failed_to_load_workflow');
            // Continue loading others
        }
    }
    return workflows;
}
//# sourceMappingURL=workflow-discovery.js.map