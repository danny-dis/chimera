/**
 * Artifact tracking for workflow node outputs.
 */
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function writeNodeArtifact(
  artifactsDir: string,
  nodeId: string,
  output: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const nodesDir = join(artifactsDir, 'nodes');
  await mkdir(nodesDir, { recursive: true });

  // Write output markdown
  await writeFile(join(nodesDir, `${nodeId}.md`), output, 'utf-8');

  // Write metadata JSON if provided
  if (metadata) {
    await writeFile(join(nodesDir, `${nodeId}.meta.json`), JSON.stringify(metadata, null, 2), 'utf-8');
  }
}
