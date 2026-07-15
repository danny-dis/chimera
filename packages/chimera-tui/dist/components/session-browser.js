import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { zen, tiered } from '../theme.js';
import { formatCost, formatDateTime } from './tui-utils.js';
export const SessionBrowser = ({ sessions, onSelect, onDelete, skillModel, }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [confirmDelete, setConfirmDelete] = useState(null);
    useInput((input, key) => {
        if (key.upArrow) {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
            return;
        }
        if (key.downArrow) {
            setSelectedIndex((prev) => Math.min(sessions.length - 1, prev + 1));
            return;
        }
        if (key.return && sessions[selectedIndex]) {
            if (confirmDelete === sessions[selectedIndex].id) {
                onDelete?.(sessions[selectedIndex].id);
                setConfirmDelete(null);
            }
            else {
                onSelect?.(sessions[selectedIndex].id);
            }
            return;
        }
        if (input === 'd' && sessions[selectedIndex]) {
            if (confirmDelete === sessions[selectedIndex].id) {
                onDelete?.(sessions[selectedIndex].id);
                setConfirmDelete(null);
            }
            else {
                setConfirmDelete(sessions[selectedIndex].id);
            }
            return;
        }
        if (key.escape) {
            setConfirmDelete(null);
        }
    });
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "double", borderColor: zen.agent, paddingX: 1 },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: zen.agent }, "Sessions"),
            React.createElement(Text, { dimColor: true },
                " (",
                sessions.length,
                ")")),
        sessions.length === 0 && React.createElement(Text, { dimColor: true }, tiered({
            beginner: 'No saved sessions yet — each conversation is saved automatically, so your past sessions will appear here to reopen or resume.',
            intermediate: 'No saved sessions',
            advanced: 'No saved sessions.',
        }, skillModel)),
        sessions.map((session, i) => {
            const isSelected = i === selectedIndex;
            const isConfirming = confirmDelete === session.id;
            return (React.createElement(Box, { key: session.id, flexDirection: "column" },
                React.createElement(Box, null,
                    React.createElement(Text, { inverse: isSelected }, isSelected ? '▸ ' : '  '),
                    React.createElement(Text, { bold: isSelected }, formatDateTime(session.date)),
                    React.createElement(Text, { dimColor: true }, " "),
                    React.createElement(Text, null, session.taskSummary.slice(0, 40)),
                    React.createElement(Text, { dimColor: true }, " "),
                    React.createElement(Text, { color: zen.success }, formatCost(session.cost)),
                    React.createElement(Text, { dimColor: true },
                        ' ',
                        session.messageCount,
                        "msg ",
                        session.agentCount,
                        "agents")),
                isSelected && isConfirming && (React.createElement(Box, { marginLeft: 4 },
                    React.createElement(Text, { color: zen.error }, "Press Enter to delete, Esc to cancel")))));
        }),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { dimColor: true }, "[\u2191\u2193] navigate  [Enter] select  [d] delete"))));
};
//# sourceMappingURL=session-browser.js.map