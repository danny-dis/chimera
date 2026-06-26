import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
declare const SkillLoadParamsSchema: z.ZodObject<{
    skillName: z.ZodString;
    args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    skillName: string;
    args?: Record<string, unknown> | undefined;
}, {
    skillName: string;
    args?: Record<string, unknown> | undefined;
}>;
declare const SkillLoadReturnsSchema: z.ZodObject<{
    content: z.ZodString;
    skillName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
    skillName: string;
}, {
    content: string;
    skillName: string;
}>;
export declare const skillLoadTool: ToolDefinition<typeof SkillLoadParamsSchema, typeof SkillLoadReturnsSchema>;
export {};
//# sourceMappingURL=skill.d.ts.map