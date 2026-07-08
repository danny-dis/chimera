import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { statusSymbols } from './tui-utils.js';
export const ToolProgress = ({ toolName, status, progress }) => {
    const getStatusIcon = () => {
        if (status === 'running') {
            return <Text color={statusSymbols.running.color}><Spinner type="dots"/></Text>;
        }
        const st = statusSymbols[status];
        return <Text color={st.color}>{st.symbol}</Text>;
    };
    return (<Box>
      <Box marginRight={1}>
        {getStatusIcon()}
      </Box>
      <Text bold>{toolName}</Text>
      {progress && (<Text dimColor> - {progress}</Text>)}
    </Box>);
};
//# sourceMappingURL=tool-progress.js.map