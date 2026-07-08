import { z } from 'zod';
/**
 * Convert a Zod schema into an OpenAI-style JSON schema object the model
 * API can consume. Zod schemas have no built-in `.toJSON()`, so the previous
 * tool-def listing produced an empty `parameters: {}` — which silently broke
 * tool calling (the model narrated tool names instead of emitting structured
 * tool_calls).
 *
 * Handles the shapes Chimera's tools actually use, across Zod 3.25 internals:
 * - ZodObject / ZodEffects (refine/transform wrappers)
 * - ZodString / ZodNumber / ZodBoolean / ZodEnum
 * - ZodOptional / ZodNullable / ZodDefault (inner type is a _def property)
 * - ZodArray (element is _def.element or _def.type().element)
 * - ZodRecord
 */
export declare function zodToJsonSchema(schema: z.ZodType): Record<string, unknown>;
//# sourceMappingURL=zod-json.d.ts.map