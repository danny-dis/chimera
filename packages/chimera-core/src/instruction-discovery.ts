import { existsSync, readFileSync } from 'fs';
import path from 'path';

const INSTRUCTION_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.chimera/rules.md',
  '.github/copilot-instructions.md',
  '.cursorrules',
  '.windsurfrules',
];

export interface DiscoveredInstruction {
  file: string;
  content: string;
  priority: number;
}

export function discoverInstructions(workspaceRoot: string): DiscoveredInstruction[] {
  const instructions: DiscoveredInstruction[] = [];

  for (let i = 0; i < INSTRUCTION_FILES.length; i++) {
    const filePath = path.join(workspaceRoot, INSTRUCTION_FILES[i]);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        if (content.trim().length > 0) {
          instructions.push({
            file: INSTRUCTION_FILES[i],
            content,
            priority: i,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  return instructions.sort((a, b) => a.priority - b.priority);
}

export function buildInstructionContext(instructions: DiscoveredInstruction[]): string {
  if (instructions.length === 0) return '';

  const blocks = instructions.map(
    (inst) => `[Project instructions from ${inst.file}]\n${inst.content}`,
  );

  return blocks.join('\n\n---\n\n');
}
