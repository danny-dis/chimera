import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { workflowDefinitionSchema } from './schemas/workflow.js';
import { createLogger } from '@chimera/paths';

const log = createLogger('workflows.discovery');


export async function discoverWorkflows(projectRoot: string): Promise<Record<string, unknown>> {
  const workflows: Record<string, unknown> = {};
  
  let entries;
  try { entries = await readdir(join(projectRoot, 'examples/workflows'), { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return workflows;
    throw error;
  }
  const workflowFiles = entries.filter(entry => entry.isFile() && !entry.name.startsWith('.') && /\.(yaml|yml)$/.test(entry.name))
    .map(entry => `examples/workflows/${entry.name}`).sort();

  for (const file of workflowFiles) {
    try {
      const fullPath = join(projectRoot, file);
      const content = await readFile(fullPath, 'utf-8');
      
      // Simple YAML parsing for now (validated by zod below).
      // TODO: Use a proper YAML parser with bundled types.
      const yaml = await import('js-yaml');
      const parsed = yaml.load(content);
      
      const validated = workflowDefinitionSchema.parse(parsed);
      const name = file.split('/').pop()?.split('.')[0] ?? 'unknown';
      workflows[name] = validated;
    } catch (error) {
      log.error({ file, error }, 'failed_to_load_workflow');
      // Continue loading others
    }
  }

  return workflows;
}
