import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, useInput } from 'ink';
/**
 * Build a prefix-sum of item heights so we can map between item indices
 * and terminal rows in O(log n) via binary search.
 */
function buildHeightPrefixSum(items, getItemHeight) {
    const prefix = [0];
    for (const item of items) {
        prefix.push(prefix[prefix.length - 1] + getItemHeight(item));
    }
    return prefix;
}
/** Find the last item index whose top edge is < row. */
function findItemAtRow(prefixSum, row) {
    let lo = 0;
    let hi = prefixSum.length - 2; // last valid item index
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (prefixSum[mid + 1] <= row) {
            lo = mid + 1;
        }
        else {
            hi = mid - 1;
        }
    }
    return Math.max(0, lo);
}
export function Viewport({ items, height, renderItem, getItemHeight, focused = false, autoScroll = true, }) {
    const [scrollOffset, setScrollOffset] = useState(0);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const getHeight = getItemHeight ?? (() => 3);
    // Prefix-sum of item heights for index ↔ row mapping.
    const prefixSum = useMemo(() => buildHeightPrefixSum(items, getHeight), [items, getHeight]);
    const totalHeight = prefixSum.length > 0 ? prefixSum[prefixSum.length - 1] : 0;
    // Auto-scroll to bottom when items change.
    useEffect(() => {
        if (autoScroll && items.length > 0) {
            const lastIndex = items.length - 1;
            setSelectedIndex(lastIndex);
            // Scroll so the last item is visible at the bottom.
            const lastItemTop = prefixSum[lastIndex];
            if (lastItemTop < scrollOffset || lastItemTop >= scrollOffset + height) {
                setScrollOffset(Math.max(0, lastItemTop - height + getHeight(items[lastIndex])));
            }
        }
    }, [items.length, autoScroll, height]); // eslint-disable-line react-hooks/exhaustive-deps
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
        setSelectedIndex((prev) => {
            const targetRow = Math.max(0, prefixSum[prev] - height);
            const next = findItemAtRow(prefixSum, targetRow);
            setScrollOffset(Math.max(0, targetRow));
            return next;
        });
    }, [prefixSum, height]);
    const pageDown = useCallback(() => {
        setSelectedIndex((prev) => {
            const targetRow = Math.min(totalHeight - height, prefixSum[prev] + height);
            const next = findItemAtRow(prefixSum, targetRow);
            setScrollOffset(Math.max(0, targetRow));
            return next;
        });
    }, [prefixSum, totalHeight, height]);
    useInput((_input, key) => {
        if (!focused)
            return;
        if (key.upArrow)
            scrollUp();
        if (key.downArrow)
            scrollDown();
        if (key.pageUp)
            pageUp();
        if (key.pageDown)
            pageDown();
        const k = key;
        if (k.home) {
            setSelectedIndex(0);
            setScrollOffset(0);
        }
        if (k.end) {
            const lastIndex = items.length - 1;
            setSelectedIndex(lastIndex);
            const lastItemTop = prefixSum[lastIndex];
            setScrollOffset(Math.max(0, lastItemTop - height + getHeight(items[lastIndex])));
        }
    });
    // Find which items are visible within [scrollOffset, scrollOffset + height).
    const visibleStart = findItemAtRow(prefixSum, scrollOffset);
    const visibleEnd = findItemAtRow(prefixSum, scrollOffset + height);
    // Include one extra item if it partially overlaps the visible window.
    const renderEnd = Math.min(items.length - 1, visibleEnd + 1);
    const visibleItems = [];
    for (let i = visibleStart; i <= renderEnd; i++) {
        visibleItems.push({ item: items[i], actualIndex: i });
    }
    return (React.createElement(Box, { flexDirection: "column", height: height, overflow: "hidden", width: "100%" },
        visibleStart > 0 && (React.createElement(Box, { flexShrink: 0, marginTop: Math.max(0, prefixSum[visibleStart] - scrollOffset) })),
        visibleItems.map(({ item, actualIndex }) => (React.createElement(Box, { key: actualIndex, width: "100%" }, renderItem(item, actualIndex, actualIndex === selectedIndex))))));
}
//# sourceMappingURL=viewport.js.map