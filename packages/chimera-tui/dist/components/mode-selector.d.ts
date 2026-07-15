import React from 'react';
import type { Mode } from '@chimera/core';
import type { SkillModelView } from '../types.js';
interface ModeSelectorProps {
    mode: Mode;
    onSelect?: (mode: Mode) => void;
    focused?: boolean;
    compact?: boolean;
    contentWidth?: number;
    skillModel?: SkillModelView;
}
export declare const ModeSelector: React.FC<ModeSelectorProps>;
export {};
//# sourceMappingURL=mode-selector.d.ts.map