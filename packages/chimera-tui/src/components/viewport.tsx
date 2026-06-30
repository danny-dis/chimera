import React, { useState, useEffect, useCallback } from 'react';
import { Box, useInput } from 'ink';

interface ViewportProps<T> {
  items: T[];
  height: number;
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  focused?: boolean;
  autoScroll?: boolean;
}

export function Viewport<T>({
  items,
  height,
  renderItem,
  focused = false,
  autoScroll = true,
}: ViewportProps<T>) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Auto-scroll to bottom when items change.
  // Items are multi-line (header + wrapped content), so estimate ~3 lines
  // per item to determine how many items fit in the viewport.
  useEffect(() => {
    if (autoScroll && items.length > 0) {
      const lastIndex = items.length - 1;
      setSelectedIndex(lastIndex);
      const linesPerItem = 3;
      const visibleSlots = Math.max(1, Math.floor(height / linesPerItem));
      if (lastIndex >= scrollOffset + visibleSlots) {
        setScrollOffset(Math.max(0, lastIndex - visibleSlots + 1));
      }
    }
  }, [items.length, autoScroll, height]);

  const scrollUp = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.max(0, prev - 1);
      if (next < scrollOffset) {
        setScrollOffset(next);
      }
      return next;
    });
  }, [scrollOffset]);

  const scrollDown = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.min(items.length - 1, prev + 1);
      if (next >= scrollOffset + height) {
        setScrollOffset(next - height + 1);
      }
      return next;
    });
  }, [scrollOffset, height, items.length]);

  const pageUp = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.max(0, prev - height);
      setScrollOffset((oldOffset) => Math.max(0, oldOffset - height));
      return next;
    });
  }, [height]);

  const pageDown = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.min(items.length - 1, prev + height);
      setScrollOffset((oldOffset) => 
        Math.min(Math.max(0, items.length - height), oldOffset + height)
      );
      return next;
    });
  }, [height, items.length]);

  useInput((_input, key) => {
    if (!focused) return;

    if (key.upArrow) scrollUp();
    if (key.downArrow) scrollDown();
    if (key.pageUp) pageUp();
    if (key.pageDown) pageDown();
    
    // Cast to any for home/end which might not be in the type
    const k = key as any;
    if (k.home) {
      setSelectedIndex(0);
      setScrollOffset(0);
    }
    if (k.end) {
      const lastIndex = items.length - 1;
      setSelectedIndex(lastIndex);
      setScrollOffset(Math.max(0, lastIndex - height + 1));
    }
  });

  const visibleItems = items.slice(scrollOffset, scrollOffset + height);

  return (
    <Box flexDirection="column" height={height} overflow="hidden" width="100%">
      {visibleItems.map((item, index) => {
        const actualIndex = scrollOffset + index;
        return (
          <Box key={actualIndex} width="100%">
            {renderItem(item, actualIndex, actualIndex === selectedIndex)}
          </Box>
        );
      })}
    </Box>
  );
}
