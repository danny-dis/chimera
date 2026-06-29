import { useWindowSize } from './use-window-size.js';
import { MIN_COLUMNS, MIN_ROWS, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_CONTENT_OVERHEAD } from '../theme.js';

export interface LayoutState {
  width: number;
  height: number;
  chatWidth: number;
  sidebarWidth: number;
  sidebarContentWidth: number;
  sidebarVisible: boolean;
  isMinSize: boolean;
}

export function useLayout(sidebarVisible: boolean): LayoutState {
  const { columns, rows } = useWindowSize();
  const isMinSize = columns >= MIN_COLUMNS && rows >= MIN_ROWS;
  const rawSidebar = Math.floor(columns * 0.3);
  const sidebarWidth = sidebarVisible
    ? Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, rawSidebar))
    : 0;
  const sidebarContentWidth = sidebarVisible ? Math.max(0, sidebarWidth - SIDEBAR_CONTENT_OVERHEAD) : 0;
  const chatWidth = columns - sidebarWidth;

  return {
    width: columns,
    height: rows,
    chatWidth,
    sidebarWidth,
    sidebarContentWidth,
    sidebarVisible,
    isMinSize,
  };
}
