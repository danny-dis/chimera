import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { statusSymbols } from './tui-utils.js';
export const ToolProgress = ({ toolName, status, progress }) => {
    const getStatusIcon = () => {
        if (status === 'running') {
            return React.createElement(Text, { color: statusSymbols.running.color },
                React.createElement(Spinner, { type: "dots" }));
        }
        const st = statusSymbols[status];
        return React.createElement(Text, { color: st.color }, st.symbol);
    };
    return (React.createElement(Box, null,
        React.createElement(Box, { marginRight: 1 }, getStatusIcon()),
        React.createElement(Text, { bold: true }, toolName),
        progress && (React.createElement(Text, { dimColor: true },
            " - ",
            progress))));
};
//# sourceMappingURL=tool-progress.js.map