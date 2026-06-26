"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillLoadTool = void 0;
const zod_1 = require("zod");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const SkillLoadParamsSchema = zod_1.z.object({
    skillName: zod_1.z.string().min(1),
    args: zod_1.z.record(zod_1.z.unknown()).optional(),
});
const SkillLoadReturnsSchema = zod_1.z.object({
    content: zod_1.z.string(),
    skillName: zod_1.z.string(),
});
exports.skillLoadTool = {
    name: 'skill',
    description: 'Load a specialized skill and return its content',
    parameters: SkillLoadParamsSchema,
    returns: SkillLoadReturnsSchema,
    category: 'mcp',
    permissionLevel: 'read',
    execute: async (params, context) => {
        const skillPath = path_1.default.join(context.workspaceRoot, '.kilo', 'skills', `${params.skillName}.md`);
        // Resolve user home portably: USERPROFILE on Windows, HOME on POSIX.
        const homeDir = process.env.USERPROFILE || process.env.HOME || '';
        const globalPath = path_1.default.join(homeDir, '.config', 'kilo', 'skills', `${params.skillName}.md`);
        const loadPath = (0, fs_1.existsSync)(skillPath) ? skillPath : (0, fs_1.existsSync)(globalPath) ? globalPath : null;
        if (!loadPath) {
            throw new Error(`Skill '${params.skillName}' not found`);
        }
        const content = (0, fs_1.readFileSync)(loadPath, 'utf-8');
        return { content, skillName: params.skillName };
    },
};
//# sourceMappingURL=skill.js.map