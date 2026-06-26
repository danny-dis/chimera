import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

const SkillLoadParamsSchema = z.object({
  skillName: z.string().min(1),
  args: z.record(z.unknown()).optional(),
});

const SkillLoadReturnsSchema = z.object({
  content: z.string(),
  skillName: z.string(),
});

export const skillLoadTool: ToolDefinition<typeof SkillLoadParamsSchema, typeof SkillLoadReturnsSchema> = {
  name: 'skill',
  description: 'Load a specialized skill and return its content',
  parameters: SkillLoadParamsSchema,
  returns: SkillLoadReturnsSchema,
  category: 'mcp',
  permissionLevel: 'read',
  execute: async (params, context) => {
    const skillPath = path.join(context.workspaceRoot, '.kilo', 'skills', `${params.skillName}.md`);
    // Resolve user home portably: USERPROFILE on Windows, HOME on POSIX.
    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const globalPath = path.join(homeDir, '.config', 'kilo', 'skills', `${params.skillName}.md`);
    
    const loadPath = existsSync(skillPath) ? skillPath : existsSync(globalPath) ? globalPath : null;
    
    if (!loadPath) {
      throw new Error(`Skill '${params.skillName}' not found`);
    }
    
    const content = readFileSync(loadPath, 'utf-8');
    return { content, skillName: params.skillName };
  },
};