import React from 'react';
import { Box, Text } from 'ink';
import { formatCost, budgetColor } from './tui-utils.js';
import { zen, tiered } from '../theme.js';
const BudgetBar = ({ used, total, width = 20, }) => {
    const ratio = Math.min(used / total, 1);
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const color = budgetColor(ratio);
    return (React.createElement(Box, null,
        React.createElement(Text, { color: color }, '█'.repeat(filled)),
        React.createElement(Text, { dimColor: true }, '░'.repeat(empty)),
        React.createElement(Text, null, " "),
        React.createElement(Text, { color: color },
            Math.round(ratio * 100),
            "%")));
};
/** Full panel version (used as overlay). */
export const CostTracker = ({ data, showBreakdown = true, contentWidth, skillModel }) => {
    const remaining = Math.max(0, data.budget - data.currentCost);
    const isNarrow = contentWidth !== undefined && contentWidth < 30;
    if (isNarrow) {
        return (React.createElement(Box, { borderStyle: "round", borderColor: zen.success, paddingX: 1 },
            React.createElement(Text, { bold: true, color: zen.success }, "Cost "),
            React.createElement(Text, { bold: true }, formatCost(data.currentCost)),
            React.createElement(Text, { dimColor: true },
                " / ",
                formatCost(data.budget))));
    }
    if (data.currentCost === 0 && data.breakdown.length === 0) {
        return (React.createElement(Box, { flexDirection: "column", borderStyle: "round", borderColor: zen.success, paddingX: 1 },
            React.createElement(Box, { marginBottom: 1 },
                React.createElement(Text, { bold: true, color: zen.success }, "Cost Tracker")),
            React.createElement(Text, { dimColor: true }, tiered({
                beginner: 'No costs yet — once you start a task, Chimera tracks token usage and spend here so you can watch your budget.',
                intermediate: 'No costs yet. Start a task to see usage.',
                advanced: 'No costs yet.',
            }, skillModel))));
    }
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "round", borderColor: zen.success, paddingX: 1 },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: zen.success }, "Cost Tracker")),
        React.createElement(Box, null,
            React.createElement(Text, null, "Spent: "),
            React.createElement(Text, { bold: true, color: budgetColor(data.budget > 0 ? data.currentCost / data.budget : 0) }, formatCost(data.currentCost)),
            React.createElement(Text, null, " / "),
            React.createElement(Text, null, formatCost(data.budget))),
        React.createElement(Box, null,
            React.createElement(Text, null, "Remaining: "),
            React.createElement(Text, { color: remaining > 0 ? zen.success : zen.error }, formatCost(remaining))),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(BudgetBar, { used: data.currentCost, total: data.budget })),
        showBreakdown && data.breakdown.length > 0 && (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
            React.createElement(Text, { bold: true, dimColor: true }, "Breakdown:"),
            data.breakdown.map((item, i) => {
                const label = `${item.provider}/${item.model}`;
                const cost = formatCost(item.cost);
                const tokens = item.inputTokens + item.outputTokens;
                const maxLabelLen = contentWidth ? Math.max(8, contentWidth - 16) : 30;
                const truncatedLabel = label.length > maxLabelLen ? label.slice(0, maxLabelLen - 1) + '…' : label;
                return (React.createElement(Box, { key: i, marginLeft: 2 },
                    React.createElement(Text, null,
                        truncatedLabel,
                        ": "),
                    React.createElement(Text, { color: zen.success }, cost),
                    React.createElement(Text, { dimColor: true },
                        " (",
                        tokens,
                        " tok)")));
            })))));
};
/** Compact single-line version (used in status bar). */
export const CostStatusLine = ({ data }) => {
    const ratio = data.budget > 0 ? data.currentCost / data.budget : 0;
    const color = budgetColor(ratio);
    return (React.createElement(Box, null,
        React.createElement(Text, { color: color, bold: true }, formatCost(data.currentCost)),
        React.createElement(Text, { dimColor: true },
            " / ",
            formatCost(data.budget))));
};
//# sourceMappingURL=cost-tracker.js.map