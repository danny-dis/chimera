import React from 'react';
import type { DeliberationMode } from '@chimera/core';
import type { SkillModelView } from '../types.js';
interface PresetSelectorProps {
    preset: DeliberationMode;
    onSelect?: (preset: DeliberationMode) => void;
    focused?: boolean;
    compact?: boolean;
    contentWidth?: number;
    skillModel?: SkillModelView;
}
export declare const PresetSelector: React.FC<PresetSelectorProps>;
export {};
//# sourceMappingURL=preset-selector.d.ts.map