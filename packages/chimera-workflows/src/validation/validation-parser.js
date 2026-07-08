"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseValidationResults = parseValidationResults;
const HEADER_REGEX = /^#\s+Validation Results\s*$/m;
const TABLE_HEADER_REGEX = /^\|\s*Check\s*\|\s*Result\s*\|$/;
const SEPARATOR_ROW_REGEX = /^\|?\s*[-:]+\s*\|\s*[-:]+\s*\|?/;
function normalizeCheckName(raw) {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
}
function parseResultCell(raw) {
    const trimmed = raw.trim();
    const hasPass = trimmed.includes('✅');
    const hasFail = trimmed.includes('❌');
    const hasWarn = trimmed.includes('⚠️');
    const hasSkip = trimmed.includes('⏭️') || /not run|skipped/i.test(trimmed);
    let result = 'unknown';
    if (hasPass)
        result = 'pass';
    else if (hasFail)
        result = 'fail';
    else if (hasWarn || hasSkip)
        result = 'warn';
    const cleaned = trimmed.replace(/✅|❌|⚠️|⏭️/g, '').trim();
    const error = cleaned ? cleaned.replace(/^[-–—]\s*/, '') : undefined;
    return { result, ...(error ? { error } : {}) };
}
function parseValidationResults(content) {
    if (!HEADER_REGEX.test(content))
        return [];
    const lines = content.split(/\r?\n/);
    const headerIndex = lines.findIndex(line => TABLE_HEADER_REGEX.test(line.trim()));
    if (headerIndex === -1)
        return [];
    const results = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('|'))
            break;
        if (SEPARATOR_ROW_REGEX.test(line))
            continue;
        const cells = line
            .split('|')
            .map(cell => cell.trim())
            .filter(Boolean);
        if (cells.length < 2)
            continue;
        const check = normalizeCheckName(cells[0]);
        if (!check)
            continue;
        const parsed = parseResultCell(cells[1]);
        results.push({ check, ...parsed });
    }
    return results;
}
//# sourceMappingURL=validation-parser.js.map