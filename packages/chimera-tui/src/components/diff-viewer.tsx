import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DiffFile } from '../types.js';
import { zen } from '../theme.js';

interface DiffViewerProps {
  files: DiffFile[];
}

const DiffLineComponent: React.FC<{
  lineNum: number | undefined;
  type: 'context' | 'addition' | 'deletion';
  content: string;
}> = ({ lineNum, type, content }) => {
  const prefix =
    type === 'addition' ? '+' : type === 'deletion' ? '-' : ' ';

  const color =
    type === 'addition' ? zen.success : type === 'deletion' ? zen.error : undefined;

  return (
    <Box>
      <Text dimColor>{lineNum !== undefined ? String(lineNum).padStart(4) : '    '} </Text>
      <Text color={color} inverse={type !== 'context'}>
        {prefix}
      </Text>
      <Text color={color}>{content}</Text>
    </Box>
  );
};

const FileHeader: React.FC<{
  file: DiffFile;
  isExpanded: boolean;
  isSelected: boolean;
}> = ({ file, isExpanded, isSelected }) => {
  return (
    <Box>
      <Text inverse={isSelected}>{isSelected ? '▸ ' : '  '}</Text>
      <Text bold color={isExpanded ? zen.accent : undefined}>
        {file.path}
      </Text>
      <Text> </Text>
      <Text color={zen.success}>+{file.additions}</Text>
      <Text> </Text>
      <Text color={zen.error}>-{file.deletions}</Text>
    </Box>
  );
};

export const DiffViewer: React.FC<DiffViewerProps> = ({ files }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set([0]));

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(files.length - 1, prev + 1));
      return;
    }

    if (key.return || input === ' ') {
      setExpandedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(selectedIndex)) {
          next.delete(selectedIndex);
        } else {
          next.add(selectedIndex);
        }
        return next;
      });
      return;
    }
  });

  return (
    <Box flexDirection="column" borderStyle="double" borderColor={zen.error} paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color={zen.error}>
          Diff Viewer
        </Text>
        <Text dimColor> ({files.length} files)</Text>
      </Box>

      {files.length === 0 && <Text dimColor>No changes to display</Text>}

      {files.map((file, i) => (
        <Box key={file.path} flexDirection="column">
          <FileHeader
            file={file}
            isExpanded={expandedFiles.has(i)}
            isSelected={i === selectedIndex}
          />
          {expandedFiles.has(i) &&
            file.hunks.map((hunk, j) => (
              <Box key={j} flexDirection="column" marginLeft={2}>
                <Text dimColor>
                  @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                </Text>
                {hunk.lines.map((line, k) => (
                  <DiffLineComponent
                    key={k}
                    lineNum={line.newLineNum}
                    type={line.type}
                    content={line.content}
                  />
                ))}
              </Box>
            ))}
        </Box>
      ))}

      <Box marginTop={1}>
        <Text dimColor>[↑↓] navigate  [Enter/Space] toggle file</Text>
      </Box>
    </Box>
  );
};
