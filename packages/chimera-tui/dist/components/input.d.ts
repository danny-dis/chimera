import React from 'react';
import type { SkillModelView } from '../types.js';
interface InputProps {
    onSubmit: (text: string) => void;
    autocomplete?: (partial: string) => string[];
    placeholder?: string;
    disabled?: boolean;
    skillModel?: SkillModelView;
}
export declare const Input: React.FC<InputProps>;
export {};
//# sourceMappingURL=input.d.ts.map