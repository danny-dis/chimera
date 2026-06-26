import React from 'react';
interface ViewportProps<T> {
    items: T[];
    height: number;
    renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
    focused?: boolean;
    autoScroll?: boolean;
}
export declare function Viewport<T>({ items, height, renderItem, focused, autoScroll, }: ViewportProps<T>): React.JSX.Element;
export {};
//# sourceMappingURL=viewport.d.ts.map