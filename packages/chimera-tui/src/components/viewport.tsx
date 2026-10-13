import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, useInput, useStdin } from 'ink';

interface ViewportProps<T> {
  items: T[];
  height: number;
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  getItemHeight?: (item: T) => number;
  focused?: boolean;
  autoScroll?: boolean;
}

/**
 * Build a prefix-sum of item heights so we can map between item indices
 * and terminal rows in O(log n) via binary search.
 */
function buildHeightPrefixSum<T>(items: T[], getItemHeight: (item: T) => number): number[] {
  const prefix = [0];
  for (const item of items) {
    prefix.push(prefix[prefix.length - 1] + getItemHeight(item));
  }
  return prefix;
}

/** Find the last item index whose top edge is < row. */
function findItemAtRow(prefixSum: number[], row: number): number {
  let lo = 0;
  let hi = prefixSum.length - 2; // last valid item index
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (prefixSum[mid + 1] <= row) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Math.max(0, lo);
}

export function Viewport<T>({
  items,
  height,
  renderItem,
  getItemHeight,
  focused = false,
  autoScroll = true,
}: ViewportProps<T>) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [followingTail, setFollowingTail] = useState(autoScroll);
  const { stdin } = useStdin();

  const getHeight = getItemHeight ?? (() => 3);

  // Prefix-sum of item heights for index ↔ row mapping.
  const prefixSum = useMemo(() => buildHeightPrefixSum(items, getHeight), [items, getHeight]);
  const totalHeight = prefixSum.length > 0 ? prefixSum[prefixSum.length - 1] : 0;

  // Auto-scroll to bottom when items change.
  useEffect(() => {
    if (autoScroll && followingTail && items.length > 0) {
      const lastIndex = items.length - 1;
      setSelectedIndex(lastIndex);
      // Scroll so the last item is visible at the bottom.
      setScrollOffset(Math.max(0, totalHeight - height));
    }
  }, [items.length, autoScroll, followingTail, totalHeight, height]);

  useEffect(() => {
    setSelectedIndex(previous => Math.max(0, Math.min(previous, items.length - 1)));
    setScrollOffset(previous => Math.max(0, Math.min(previous, totalHeight - height)));
  }, [items.length, totalHeight, height]);

  const scrollUp = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.max(0, prev - 1);
      const itemTop = prefixSum[next];
      if (itemTop < scrollOffset) {
        setScrollOffset(itemTop);
      }
      return next;
    });
  }, [prefixSum, scrollOffset]);

  const scrollDown = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.min(items.length - 1, prev + 1);
      const itemBottom = prefixSum[next] + getHeight(items[next]);
      if (itemBottom > scrollOffset + height) {
        setScrollOffset(itemBottom - height);
      }
      return next;
    });
  }, [prefixSum, items, getHeight, scrollOffset, height]);

  const pageUp = useCallback(() => {
    const targetRow = Math.max(0, scrollOffset - height);
    setSelectedIndex(findItemAtRow(prefixSum, targetRow));
    setScrollOffset(targetRow);
  }, [prefixSum, height, scrollOffset]);

  const pageDown = useCallback(() => {
    const targetRow = Math.min(Math.max(0, totalHeight - height), scrollOffset + height);
    setSelectedIndex(findItemAtRow(prefixSum, targetRow));
    setScrollOffset(targetRow);
  }, [prefixSum, totalHeight, height, scrollOffset]);

  // `isActive` must gate the hook itself, not just the handler body. Ink
  // ref()s stdin and enables raw mode on mount for every registered useInput,
  // so returning early inside the callback still claims stdin while unfocused
  // — which double-consumes keystrokes alongside the m/l detail toggle, and
  // crashes outright under a test stdin that has no ref().
  useInput((_input, key) => {
    if (items.length === 0) return;
    if (key.upArrow || key.downArrow || key.pageUp || key.pageDown) setFollowingTail(false);
    if (key.upArrow) scrollUp();
    if (key.downArrow) scrollDown();
    if (key.pageUp) pageUp();
    if (key.pageDown) pageDown();

  }, { isActive: focused });

  useEffect(() => {
    if (!focused || items.length === 0) return;
    const navigate = (data: Buffer | string) => {
      const key = data.toString();
      if (['\x1b[H', '\x1b[1~', '\x1b[7~'].includes(key)) {
        setFollowingTail(false); setSelectedIndex(0); setScrollOffset(0);
      } else if (['\x1b[F', '\x1b[4~', '\x1b[8~'].includes(key)) {
        setFollowingTail(true); setSelectedIndex(items.length - 1); setScrollOffset(Math.max(0, totalHeight - height));
      }
    };
    stdin.on('data', navigate);
    return () => { stdin.off('data', navigate); };
  }, [stdin, focused, items.length, totalHeight, height]);

  // Find which items are visible within [scrollOffset, scrollOffset + height).
  const visibleStart = findItemAtRow(prefixSum, scrollOffset);
  const visibleEnd = findItemAtRow(prefixSum, scrollOffset + height);
  // Include one extra item if it partially overlaps the visible window.
  const renderEnd = Math.min(items.length - 1, visibleEnd + 1);

  const visibleItems: Array<{ item: T; actualIndex: number }> = [];
  for (let i = visibleStart; i <= renderEnd; i++) {
    visibleItems.push({ item: items[i], actualIndex: i });
  }

  return (
    <Box flexDirection="column" height={height} overflow="hidden" width="100%">
      <Box flexDirection="column" flexShrink={0} marginTop={(prefixSum[visibleStart] ?? 0) - scrollOffset}>
      {visibleItems.map(({ item, actualIndex }) => (
        <Box key={actualIndex} width="100%" flexShrink={0}>
          {renderItem(item, actualIndex, actualIndex === selectedIndex)}
        </Box>
      ))}
      </Box>
    </Box>
  );
}
