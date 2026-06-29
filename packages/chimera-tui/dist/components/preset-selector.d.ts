import React from 'react';
import type { DeliberationMode } from '@chimera/core';
interface PresetSelectorProps {
    currentPreset: DeliberationMode;
    onPresetChange?: (preset: DeliberationMode) => void;
    focused?: boolean;
    compact?: boolean;
    contentWidth?: number;
}
export declare const PresetSelector: React.FC<PresetSelectorProps>;
export {};
//# sourceMappingURL=preset-selector.d.ts.map