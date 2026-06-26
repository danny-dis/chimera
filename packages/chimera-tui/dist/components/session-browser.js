import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { formatCost, formatDateTime } from './tui-utils.js';
export const SessionBrowser = ({ sessions, onSelect, onDelete, }) => {
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
    return (React.createElement(Box, { flexDirection: "column", borderStyle: "double", borderColor: "magenta", paddingX: 1 },
        React.createElement(Box, { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: "magenta" }, "Sessions"),
            React.createElement(Text, { dimColor: true },
                " (",
                sessions.length,
                ")")),
        sessions.length === 0 && React.createElement(Text, { dimColor: true }, "No saved sessions"),
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
                    React.createElement(Text, { color: "green" }, formatCost(session.cost)),
                    React.createElement(Text, { dimColor: true },
                        ' ',
                        session.messageCount,
                        "msg ",
                        session.agentCount,
                        "agents")),
                isSelected && isConfirming && (React.createElement(Box, { marginLeft: 4 },
                    React.createElement(Text, { color: "red" }, "Press Enter to delete, Esc to cancel")))));
        }),
        React.createElement(Box, { marginTop: 1 },
            React.createElement(Text, { dimColor: true }, "[\u2191\u2193] navigate  [Enter] select  [d] delete"))));
};
//# sourceMappingURL=session-browser.js.map