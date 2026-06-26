"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCompactionPipeline = runCompactionPipeline;
const tool_result_budget_js_1 = require("./tool-result-budget.js");
const snip_js_1 = require("./snip.js");
const microcompact_js_1 = require("./microcompact.js");
const context_collapse_js_1 = require("./context-collapse.js");
function estimateTokens(msgs) {
    return Math.ceil(msgs.reduce((sum, m) => sum + m.content.length, 0) / 4);
}
function runCompactionPipeline(messages) {
    const stages = [];
    let current = [...messages];
    let totalTokensSaved = 0;
    const beforeBudget = estimateTokens(current);
    const budgetResult = (0, tool_result_budget_js_1.applyToolResultBudget)(current);
    current = budgetResult.messages;
    const afterBudget = estimateTokens(current);
    const budgetSaved = Math.max(0, beforeBudget - afterBudget);
    totalTokensSaved += budgetSaved;
    stages.push({
        stage: 'tool_result_budget',
        tokensSaved: budgetSaved,
        messagesBefore: messages.length,
        messagesAfter: current.length,
    });
    const beforeSnip = estimateTokens(current);
    const snipResult = (0, snip_js_1.snipCompact)(current);
    current = snipResult.messages;
    const afterSnip = estimateTokens(current);
    const snipSaved = Math.max(0, beforeSnip - afterSnip);
    totalTokensSaved += snipSaved;
    stages.push({
        stage: 'snip',
        tokensSaved: snipSaved,
        messagesBefore: current.length,
        messagesAfter: current.length,
    });
    const beforeMicro = estimateTokens(current);
    const microResult = (0, microcompact_js_1.microCompact)(current);
    current = microResult.messages;
    const afterMicro = estimateTokens(current);
    const microSaved = Math.max(0, beforeMicro - afterMicro);
    totalTokensSaved += microSaved;
    stages.push({
        stage: 'microcompact',
        tokensSaved: microSaved,
        messagesBefore: current.length,
        messagesAfter: current.length,
    });
    const beforeCollapse = estimateTokens(current);
    const collapseResult = (0, context_collapse_js_1.contextCollapse)(current);
    current = collapseResult.messages;
    const afterCollapse = estimateTokens(current);
    const collapseSaved = Math.max(0, beforeCollapse - afterCollapse);
    totalTokensSaved += collapseSaved;
    stages.push({
        stage: 'context_collapse',
        tokensSaved: collapseSaved,
        messagesBefore: current.length,
        messagesAfter: current.length,
    });
    return {
        messages: current,
        totalTokensSaved,
        stages,
    };
}
//# sourceMappingURL=pipeline.js.map