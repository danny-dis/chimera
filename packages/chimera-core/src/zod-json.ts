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
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const def: any = (schema as any)?._def ?? {};
  const typeName: string | undefined = def.typeName;

  // ZodEffects (refine/transform/superRefine) wraps another schema.
  if (typeName === 'ZodEffects' && def.schema) {
    return zodToJsonSchema(def.schema);
  }

  switch (typeName) {
    case 'ZodObject': {
      const shape = typeof def.shape === 'function' ? def.shape() : (def.shape ?? {});
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, val] of Object.entries<any>(shape)) {
        properties[key] = zodToJsonSchema(val);
        const v = val?._def;
        const isOptional =
          v?.typeName === 'ZodOptional' ||
          v?.typeName === 'ZodNullable' ||
          v?.typeName === 'ZodDefault';
        if (!isOptional) required.push(key);
      }
      return { type: 'object', properties, ...(required.length ? { required } : {}) };
    }
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodArray': {
      const element = def.element ?? def.type;
      return { type: 'array', items: element ? zodToJsonSchema(element) : { type: 'string' } };
    }
    case 'ZodEnum':
      return { type: 'string', enum: def.values };
    case 'ZodRecord':
      return { type: 'object', additionalProperties: true };
    case 'ZodOptional':
    case 'ZodNullable':
      return def.innerType ? zodToJsonSchema(def.innerType) : { type: 'string' };
    case 'ZodDefault':
      return def.innerType ? zodToJsonSchema(def.innerType) : { type: 'string' };
    default:
      return { type: 'string' };
  }
}
