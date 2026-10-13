import { join } from 'node:path';
import { SideQueryChannel, type SideQueryProvider } from '../side-query.js';
import { MemoryPersistence } from './memory-persistence.js';
import { AutoExtractService } from './auto-extract.js';
import { AutoDreamService } from './auto-dream.js';
import { RecallService } from './recall-service.js';

export async function createRuntimeMemory(workspaceRoot: string, provider?: SideQueryProvider, memoryPersistence = new MemoryPersistence({ workspaceRoot })) {
  const memory = memoryPersistence.getMemory();
  await memory.ready;
  const base = { memoryPersistence, recallService: new RecallService(memory) };
  if (!provider) return base;
  const directory = join(workspaceRoot, '.chimera', 'memory');
  const channel = new SideQueryChannel({ provider, lockfilePath: join(directory, '.side-query.lock') });
  const query = channel.query.bind(channel);
  return {
    ...base,
    autoExtract: new AutoExtractService(memory, undefined, query),
    autoDream: new AutoDreamService(memory, { lockfileDir: directory }, query),
  };
}
