"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.microCompact = microCompact;
function microCompact(messages) {
    let tokensSaved = 0;
    const result = messages.map((msg) => {
        if (msg.role !== 'tool')
            return msg;
        const lines = msg.content.split('\n');
        if (lines.length <= 10)
            return msg;
        const header = lines.slice(0, 3).join('\n');
        const lineCount = lines.length;
        const truncated = `${header}\n... [${lineCount - 3} lines compressed]`;
        const saved = Math.ceil((msg.content.length - truncated.length) / 4);
        tokensSaved += saved;
        return { ...msg, content: truncated };
    });
    return { messages: result, tokensSaved };
}
//# sourceMappingURL=microcompact.js.map