import React from 'react';
import { Box, Text } from 'ink';

export const TUI: React.FC = () => {
  return (
    <Box flexDirection="column">
      <Text bold>Chimera</Text>
      <Text>Terminal-native parallel multi-agent coding platform</Text>
      <Text dimColor>v0.0.1</Text>
    </Box>
  );
};
