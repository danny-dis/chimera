import React from 'react';
import type { Mode } from '@chimera/core';
interface ModeSelectorProps {
    mode: Mode;
    onSelect?: (mode: Mode) => void;
    focused?: boolean;
    compact?: boolean;
    contentWidth?: number;
}
export declare const ModeSelector: React.FC<ModeSelectorProps>;
export {};
//# sourceMappingURL=mode-selector.d.ts.map