import { z } from 'zod';
import type { ToolDefinition } from '../tool-schema.js';
import { existsSync, readFileSync, promises as fs } from 'fs';
import path from 'path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveAndValidate(basePath: string, workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot, basePath);
  if (!resolved.startsWith(path.resolve(workspaceRoot) + path.sep) &&
      resolved !== path.resolve(workspaceRoot)) {
    throw new Error(`Path escapes workspace root: ${basePath}`);
  }
  return resolved;
}

function validateSkillName(name: string): void {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
    throw new Error(
      `Invalid skill name '${name}'. Use lowercase letters, numbers, and hyphens only.`
    );
  }
}

function validateWorkflowName(name: string): void {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
    throw new Error(
      `Invalid workflow name '${name}'. Use lowercase letters, numbers, and hyphens only.`
    );
  }
}

function serializeSkillFrontmatter(
  name: string,
  description: string,
  modes: string[],
): string {
  const doc: Record<string, unknown> = { name, description };
  if (modes.length > 0 && !(modes.length === 1 && modes[0] === 'all')) {
    doc.modes = modes;
  }
  return `---\n${stringifyYaml(doc).trimEnd()}\n---\n\n`;
}

/**
 * Parse YAML frontmatter from skill content.
 * Returns the parsed frontmatter object and the body content.
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const [, yamlStr, body] = match;
  const frontmatter = parseYaml(yamlStr) as Record<string, unknown>;
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
function validateArgs(
  args: Record<string, unknown> | undefined,
  inputs: Record<string, string> | undefined,
): Record<string, unknown> | undefined {
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

  const result: Record<string, unknown> = {};
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
const warnedLegacyPaths = new Set<string>();

// ---------------------------------------------------------------------------
// skill (load) — read-only, existing tool
// ---------------------------------------------------------------------------

const SkillLoadParamsSchema = z.object({
  skillName: z.string().min(1),
  args: z.record(z.unknown()).optional(),
});

const SkillLoadReturnsSchema = z.object({
  content: z.string(),
  skillName: z.string(),
  parsedArgs: z.record(z.unknown()).optional(),
});

export const skillLoadTool: ToolDefinition<typeof SkillLoadParamsSchema, typeof SkillLoadReturnsSchema> = {
  name: 'skill',
  description: 'Load a specialized skill and return its content',
  parameters: SkillLoadParamsSchema,
  returns: SkillLoadReturnsSchema,
  category: 'mcp',
  permissionLevel: 'read',
  execute: async (params, context) => {
    // Primary: .chimera/skills/
    const chimeraPath = path.join(context.workspaceRoot, '.chimera', 'skills', `${params.skillName}.md`);
    // Legacy: .kilo/skills/ (deprecated, emits warning)
    const kiloPath = path.join(context.workspaceRoot, '.kilo', 'skills', `${params.skillName}.md`);
    // Global: ~/.config/chimera/skills/
    const homeDir = process.env.USERPROFILE || process.env.HOME || '';
    const globalChimeraPath = path.join(homeDir, '.config', 'chimera', 'skills', `${params.skillName}.md`);
    // Legacy global: ~/.config/kilo/skills/ (deprecated)
    const globalKiloPath = path.join(homeDir, '.config', 'kilo', 'skills', `${params.skillName}.md`);

    // Resolution order: .chimera > .kilo (warn) > global chimera > global kilo (warn)
    let loadPath: string | null = null;
    let isLegacy = false;

    if (existsSync(chimeraPath)) {
      loadPath = chimeraPath;
    } else if (existsSync(kiloPath)) {
      loadPath = kiloPath;
      isLegacy = true;
    } else if (existsSync(globalChimeraPath)) {
      loadPath = globalChimeraPath;
    } else if (existsSync(globalKiloPath)) {
      loadPath = globalKiloPath;
      isLegacy = true;
    }

    if (!loadPath) {
      throw new Error(`Skill '${params.skillName}' not found`);
    }

    // Emit deprecation warning for legacy paths (once per path)
    if (isLegacy && !warnedLegacyPaths.has(loadPath)) {
      warnedLegacyPaths.add(loadPath);
      process.stderr.write(
        `[DEPRECATION] Skill '${params.skillName}' loaded from legacy path: ${loadPath}\n` +
        `  → Move to .chimera/skills/ for future compatibility.\n`
      );
    }

    const rawContent = readFileSync(loadPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(rawContent);

    // Validate typed args if the skill declares inputs
    const inputs = frontmatter.inputs as Record<string, string> | undefined;
    const parsedArgs = validateArgs(params.args, inputs);

    return { content: body, skillName: params.skillName, parsedArgs };
  },
};

// ---------------------------------------------------------------------------
// create_skill — write a new skill file to .chimera/skills/
// ---------------------------------------------------------------------------

const CreateSkillParamsSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  content: z.string().min(1),
  modes: z.array(z.string()).default(['all']),
  overwrite: z.boolean().default(false),
});

const CreateSkillReturnsSchema = z.object({
  path: z.string(),
  skillName: z.string(),
  created: z.boolean(),
});

export const createSkillTool: ToolDefinition<typeof CreateSkillParamsSchema, typeof CreateSkillReturnsSchema> = {
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
    if (existsSync(absPath) && !params.overwrite) {
      throw new Error(
        `Skill '${params.name}' already exists at ${relPath}. Use overwrite: true to replace.`
      );
    }

    // Build full file content: frontmatter + body
    const frontmatter = serializeSkillFrontmatter(params.name, params.description, params.modes);
    const fullContent = frontmatter + params.content;

    // Ensure directory exists
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, fullContent, 'utf-8');

    const created = !existsSync(absPath) || params.overwrite;
    return { path: relPath, skillName: params.name, created };
  },
};

// ---------------------------------------------------------------------------
// create_workflow — write a new workflow YAML to .chimera/workflows/
// ---------------------------------------------------------------------------

const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['llm', 'tool', 'parallel', 'sequence', 'gate', 'loop']),
  config: z.record(z.unknown()).default({}),
  required: z.boolean().optional(),
});

const CreateWorkflowParamsSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  steps: z.array(WorkflowStepSchema).min(1),
  tags: z.array(z.string()).default([]),
  overwrite: z.boolean().default(false),
});

const CreateWorkflowReturnsSchema = z.object({
  path: z.string(),
  workflowName: z.string(),
  created: z.boolean(),
});

export const createWorkflowTool: ToolDefinition<typeof CreateWorkflowParamsSchema, typeof CreateWorkflowReturnsSchema> = {
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
    if (existsSync(absPath) && !params.overwrite) {
      throw new Error(
        `Workflow '${params.name}' already exists at ${relPath}. Use overwrite: true to replace.`
      );
    }

    // Build workflow document
    const doc: Record<string, unknown> = {
      name: params.name,
      description: params.description,
      tags: params.tags,
      steps: params.steps.map(s => {
        const step: Record<string, unknown> = {
          id: s.id,
          kind: s.kind,
          config: s.config,
        };
        if (s.required !== undefined) step.required = s.required;
        return step;
      }),
    };

    const yamlContent = stringifyYaml(doc).trimEnd();

    // Ensure directory exists
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, yamlContent, 'utf-8');

    const created = !existsSync(absPath) || params.overwrite;
    return { path: relPath, workflowName: params.name, created };
  },
};