import { useWindowSize } from './use-window-size.js';
import { MIN_COLUMNS, MIN_ROWS } from '../theme.js';

export interface LayoutState {
  width: number;
  height: number;
  chatWidth: number;
  sidebarWidth: number;
  sidebarVisible: boolean;
  isMinSize: boolean;
}

export function useLayout(sidebarVisible: boolean): LayoutState {
  const { columns, rows } = useWindowSize();
  const isMinSize = columns >= MIN_COLUMNS && rows >= MIN_ROWS;
  const sidebarWidth = sidebarVisible ? Math.floor(columns * 0.3) : 0;
  const chatWidth = columns - sidebarWidth;

  return {
    width: columns,
    height: rows,
    chatWidth,
    sidebarWidth,
    sidebarVisible,
    isMinSize,
  };
}
