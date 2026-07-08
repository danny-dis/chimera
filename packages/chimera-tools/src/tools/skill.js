"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWorkflowTool = exports.createSkillTool = exports.skillLoadTool = void 0;
const zod_1 = require("zod");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const yaml_1 = require("yaml");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resolveAndValidate(basePath, workspaceRoot) {
    const resolved = path_1.default.resolve(workspaceRoot, basePath);
    if (!resolved.startsWith(path_1.default.resolve(workspaceRoot) + path_1.default.sep) &&
        resolved !== path_1.default.resolve(workspaceRoot)) {
        throw new Error(`Path escapes workspace root: ${basePath}`);
    }
    return resolved;
}
function validateSkillName(name) {
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
        throw new Error(`Invalid skill name '${name}'. Use lowercase letters, numbers, and hyphens only.`);
    }
}
function validateWorkflowName(name) {
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
        throw new Error(`Invalid workflow name '${name}'. Use lowercase letters, numbers, and hyphens only.`);
    }
}
function serializeSkillFrontmatter(name, description, modes) {
    const doc = { name, description };
    if (modes.length > 0 && !(modes.length === 1 && modes[0] === 'all')) {
        doc.modes = modes;
    }
    return `---\n${(0, yaml_1.stringify)(doc).trimEnd()}\n---\n\n`;
}
/**
 * Parse YAML frontmatter from skill content.
 * Returns the parsed frontmatter object and the body content.
 */
function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
        return { frontmatter: {}, body: content };
    }
    const [, yamlStr, body] = match;
    const frontmatter = (0, yaml_1.parse)(yamlStr);
    return { frontmatter, body };
}
/**
 * Validate args against a skill's declared inputs schema.
 * Inputs format in frontmatter:
 *   inputs:
 *     topic: string
 *     depth: number?
 *     options: object?
 *
 * Type syntax: "type" or "type?" (optional)
 *
 * Returns parsedArgs or undefined if no args were provided.
 */
function validateArgs(args, inputs) {
    // If no inputs declared, skill accepts no args
    if (!inputs || Object.keys(inputs).length === 0) {
        if (args && Object.keys(args).length > 0) {
            throw new Error('rejected args: skill declares no inputs but args were provided');
        }
        return undefined;
    }
    // If no args provided at all (undefined), skip validation and return undefined
    if (args === undefined) {
        return undefined;
    }
    const result = {};
    for (const [key, typeDef] of Object.entries(inputs)) {
        const isOptional = typeDef.endsWith('?');
        const baseType = isOptional ? typeDef.slice(0, -1) : typeDef;
        if (!(key in args)) {
            if (!isOptional) {
                throw new Error(`rejected args: missing required field '${key}'`);
            }
            continue;
        }
        const value = args[key];
        // Type validation (loose — we accept the value if it's the right JS type)
        switch (baseType) {
            case 'string':
                if (typeof value !== 'string') {
                    throw new Error(`rejected args: field '${key}' must be a string, got ${typeof value}`);
                }
                break;
            case 'number':
                if (typeof value !== 'number') {
                    throw new Error(`rejected args: field '${key}' must be a number, got ${typeof value}`);
                }
                break;
            case 'boolean':
                if (typeof value !== 'boolean') {
                    throw new Error(`rejected args: field '${key}' must be a boolean, got ${typeof value}`);
                }
                break;
            case 'object':
                if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                    throw new Error(`rejected args: field '${key}' must be an object, got ${typeof value}`);
                }
                break;
            default:
                // Unknown type — accept as-is
                break;
        }
        result[key] = value;
    }
    // Check for unexpected args
    for (const key of Object.keys(args)) {
        if (!(key in inputs)) {
            throw new Error(`rejected args: unexpected field '${key}'`);
        }
    }
    return result;
}
// Track which legacy paths have already warned (module-level)
const warnedLegacyPaths = new Set();
// ---------------------------------------------------------------------------
// skill (load) — read-only, existing tool
// ---------------------------------------------------------------------------
const SkillLoadParamsSchema = zod_1.z.object({
    skillName: zod_1.z.string().min(1),
    args: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const SkillLoadReturnsSchema = zod_1.z.object({
    content: zod_1.z.string(),
    skillName: zod_1.z.string(),
    parsedArgs: zod_1.z.record(zod_1.z.unknown()).optional(),
});
exports.skillLoadTool = {
    name: 'skill',
    description: 'Load a specialized skill and return its content',
    parameters: SkillLoadParamsSchema,
    returns: SkillLoadReturnsSchema,
    category: 'mcp',
    permissionLevel: 'read',
    execute: async (params, context) => {
        // Primary: .chimera/skills/
        const chimeraPath = path_1.default.join(context.workspaceRoot, '.chimera', 'skills', `${params.skillName}.md`);
        // Legacy: .kilo/skills/ (deprecated, emits warning)
        const kiloPath = path_1.default.join(context.workspaceRoot, '.kilo', 'skills', `${params.skillName}.md`);
        // Global: ~/.config/chimera/skills/
        const homeDir = process.env.USERPROFILE || process.env.HOME || '';
        const globalChimeraPath = path_1.default.join(homeDir, '.config', 'chimera', 'skills', `${params.skillName}.md`);
        // Legacy global: ~/.config/kilo/skills/ (deprecated)
        const globalKiloPath = path_1.default.join(homeDir, '.config', 'kilo', 'skills', `${params.skillName}.md`);
        // Resolution order: .chimera > .kilo (warn) > global chimera > global kilo (warn)
        let loadPath = null;
        let isLegacy = false;
        if ((0, fs_1.existsSync)(chimeraPath)) {
            loadPath = chimeraPath;
        }
        else if ((0, fs_1.existsSync)(kiloPath)) {
            loadPath = kiloPath;
            isLegacy = true;
        }
        else if ((0, fs_1.existsSync)(globalChimeraPath)) {
            loadPath = globalChimeraPath;
        }
        else if ((0, fs_1.existsSync)(globalKiloPath)) {
            loadPath = globalKiloPath;
            isLegacy = true;
        }
        if (!loadPath) {
            throw new Error(`Skill '${params.skillName}' not found`);
        }
        // Emit deprecation warning for legacy paths (once per path)
        if (isLegacy && !warnedLegacyPaths.has(loadPath)) {
            warnedLegacyPaths.add(loadPath);
            process.stderr.write(`[DEPRECATION] Skill '${params.skillName}' loaded from legacy path: ${loadPath}\n` +
                `  → Move to .chimera/skills/ for future compatibility.\n`);
        }
        const rawContent = (0, fs_1.readFileSync)(loadPath, 'utf-8');
        const { frontmatter, body } = parseFrontmatter(rawContent);
        // Validate typed args if the skill declares inputs
        const inputs = frontmatter.inputs;
        const parsedArgs = validateArgs(params.args, inputs);
        return { content: body, skillName: params.skillName, parsedArgs };
    },
};
// ---------------------------------------------------------------------------
// create_skill — write a new skill file to .chimera/skills/
// ---------------------------------------------------------------------------
const CreateSkillParamsSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().min(1),
    content: zod_1.z.string().min(1),
    modes: zod_1.z.array(zod_1.z.string()).default(['all']),
    overwrite: zod_1.z.boolean().default(false),
});
const CreateSkillReturnsSchema = zod_1.z.object({
    path: zod_1.z.string(),
    skillName: zod_1.z.string(),
    created: zod_1.z.boolean(),
});
exports.createSkillTool = {
    name: 'create_skill',
    description: 'Create a skill file in .chimera/skills/ with YAML frontmatter and markdown body',
    parameters: CreateSkillParamsSchema,
    returns: CreateSkillReturnsSchema,
    category: 'mcp',
    permissionLevel: 'write',
    execute: async (params, context) => {
        validateSkillName(params.name);
        const relPath = `.chimera/skills/${params.name}.md`;
        const absPath = resolveAndValidate(relPath, context.workspaceRoot);
        // Check if file already exists
        if ((0, fs_1.existsSync)(absPath) && !params.overwrite) {
            throw new Error(`Skill '${params.name}' already exists at ${relPath}. Use overwrite: true to replace.`);
        }
        // Build full file content: frontmatter + body
        const frontmatter = serializeSkillFrontmatter(params.name, params.description, params.modes);
        const fullContent = frontmatter + params.content;
        // Ensure directory exists
        await fs_1.promises.mkdir(path_1.default.dirname(absPath), { recursive: true });
        await fs_1.promises.writeFile(absPath, fullContent, 'utf-8');
        const created = !(0, fs_1.existsSync)(absPath) || params.overwrite;
        return { path: relPath, skillName: params.name, created };
    },
};
// ---------------------------------------------------------------------------
// create_workflow — write a new workflow YAML to .chimera/workflows/
// ---------------------------------------------------------------------------
const WorkflowStepSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    kind: zod_1.z.enum(['llm', 'tool', 'parallel', 'sequence', 'gate', 'loop']),
    config: zod_1.z.record(zod_1.z.unknown()).default({}),
    required: zod_1.z.boolean().optional(),
});
const CreateWorkflowParamsSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().default(''),
    steps: zod_1.z.array(WorkflowStepSchema).min(1),
    tags: zod_1.z.array(zod_1.z.string()).default([]),
    overwrite: zod_1.z.boolean().default(false),
});
const CreateWorkflowReturnsSchema = zod_1.z.object({
    path: zod_1.z.string(),
    workflowName: zod_1.z.string(),
    created: zod_1.z.boolean(),
});
exports.createWorkflowTool = {
    name: 'create_workflow',
    description: 'Create a workflow YAML file in .chimera/workflows/',
    parameters: CreateWorkflowParamsSchema,
    returns: CreateWorkflowReturnsSchema,
    category: 'mcp',
    permissionLevel: 'write',
    execute: async (params, context) => {
        validateWorkflowName(params.name);
        const relPath = `.chimera/workflows/${params.name}.yaml`;
        const absPath = resolveAndValidate(relPath, context.workspaceRoot);
        // Check if file already exists
        if ((0, fs_1.existsSync)(absPath) && !params.overwrite) {
            throw new Error(`Workflow '${params.name}' already exists at ${relPath}. Use overwrite: true to replace.`);
        }
        // Build workflow document
        const doc = {
            name: params.name,
            description: params.description,
            tags: params.tags,
            steps: params.steps.map(s => {
                const step = {
                    id: s.id,
                    kind: s.kind,
                    config: s.config,
                };
                if (s.required !== undefined)
                    step.required = s.required;
                return step;
            }),
        };
        const yamlContent = (0, yaml_1.stringify)(doc).trimEnd();
        // Ensure directory exists
        await fs_1.promises.mkdir(path_1.default.dirname(absPath), { recursive: true });
        await fs_1.promises.writeFile(absPath, yamlContent, 'utf-8');
        const created = !(0, fs_1.existsSync)(absPath) || params.overwrite;
        return { path: relPath, workflowName: params.name, created };
    },
};
//# sourceMappingURL=skill.js.map