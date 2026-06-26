"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverInstructions = discoverInstructions;
exports.buildInstructionContext = buildInstructionContext;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const INSTRUCTION_FILES = [
    'AGENTS.md',
    'CLAUDE.md',
    'GEMINI.md',
    '.chimera/rules.md',
    '.github/copilot-instructions.md',
    '.cursorrules',
    '.windsurfrules',
];
function discoverInstructions(workspaceRoot) {
    const instructions = [];
    for (let i = 0; i < INSTRUCTION_FILES.length; i++) {
        const filePath = path_1.default.join(workspaceRoot, INSTRUCTION_FILES[i]);
        if ((0, fs_1.existsSync)(filePath)) {
            try {
                const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
                if (content.trim().length > 0) {
                    instructions.push({
                        file: INSTRUCTION_FILES[i],
                        content,
                        priority: i,
                    });
                }
            }
            catch {
                // Skip unreadable files
            }
        }
    }
    return instructions.sort((a, b) => a.priority - b.priority);
}
function buildInstructionContext(instructions) {
    if (instructions.length === 0)
        return '';
    const blocks = instructions.map((inst) => `[Project instructions from ${inst.file}]\n${inst.content}`);
    return blocks.join('\n\n---\n\n');
}
//# sourceMappingURL=instruction-discovery.js.map