import React from 'react';
interface ToolProgressProps {
    toolName: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    progress?: string;
}
export declare const ToolProgress: React.FC<ToolProgressProps>;
export {};
//# sourceMappingURL=tool-progress.d.ts.map