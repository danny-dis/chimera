import React from 'react';
import { Box, Text } from 'ink';
const formatCost = (cost) => `$${cost.toFixed(4)}`;
const BudgetBar = ({ used, total, width = 20, }) => {
    const ratio = Math.min(used / total, 1);
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    const color = ratio > 0.9 ? 'red' : ratio > 0.7 ? 'yellow' : 'green';
    return (React.createElement(Box, null,
        React.createElement(Text, { color: color }, '█'.repeat(filled)),
        React.createElement(Text, { dimColor: true }, '░'.repeat(empty)),
        React.createElement(Text, null, " "),
        React.createElement(Text, { color: color },
            Math.round(ratio * 100),
            "%")));
};
export const CostTracker = ({ data, showBreakdown = true }) => {
    const remaining = Math.max(0, data.budget - data.currentCost);
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "round", borderColor: "green", paddingX: 1 },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: "green" }, "Cost Tracker")),
        React.createElement(Box, null,
            React.createElement(Text, null, "Spent: "),
            React.createElement(Text, { bold: true, color: data.currentCost > data.budget * 0.9 ? 'red' : 'green' }, formatCost(data.currentCost)),
            React.createElement(Text, null, " / "),
            React.createElement(Text, null, formatCost(data.budget))),
        React.createElement(Box, null,
            React.createElement(Text, null, "Remaining: "),
            React.createElement(Text, { color: remaining > 0 ? 'green' : 'red' }, formatCost(remaining))),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(BudgetBar, { used: data.currentCost, total: data.budget })),
        showBreakdown && data.breakdown.length > 0 && (React.createElement(Box, { flexDirection: "column", marginTop: 1 },
            React.createElement(Text, { bold: true, dimColor: true }, "Breakdown:"),
            data.breakdown.map((item, i) => (React.createElement(Box, { key: i, marginLeft: 2 },
                React.createElement(Text, null,
                    item.provider,
                    "/",
                    item.model,
                    ":",
                    ' '),
                React.createElement(Text, { color: "green" }, formatCost(item.cost)),
                React.createElement(Text, { dimColor: true },
                    ' ',
                    "(",
                    item.inputTokens + item.outputTokens,
                    " tok)"))))))));
};
//# sourceMappingURL=cost-tracker.js.map