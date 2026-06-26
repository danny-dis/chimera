import { useWindowSize } from './use-window-size.js';
import { MIN_COLUMNS, MIN_ROWS } from '../theme.js';
export function useLayout(sidebarVisible) {
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
//# sourceMappingURL=use-layout.js.map