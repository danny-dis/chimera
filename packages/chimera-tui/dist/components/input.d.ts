import React from 'react';
interface InputProps {
    onSubmit: (text: string) => void;
    autocomplete?: (partial: string) => string[];
    placeholder?: string;
    disabled?: boolean;
}
export declare const Input: React.FC<InputProps>;
export {};
//# sourceMappingURL=input.d.ts.map