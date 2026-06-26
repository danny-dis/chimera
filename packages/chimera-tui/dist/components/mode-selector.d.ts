import React from 'react';
import type { Mode } from '@chimera/core';
interface ModeSelectorProps {
    currentMode: Mode;
    onModeChange?: (mode: Mode) => void;
    focused?: boolean;
    compact?: boolean;
}
export declare const ModeSelector: React.FC<ModeSelectorProps>;
export {};
//# sourceMappingURL=mode-selector.d.ts.map