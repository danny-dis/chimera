import React from 'react';
import type { Session } from '../types.js';
interface SessionBrowserProps {
    sessions: Session[];
    onSelect?: (sessionId: string) => void;
    onDelete?: (sessionId: string) => void;
}
export declare const SessionBrowser: React.FC<SessionBrowserProps>;
export {};
//# sourceMappingURL=session-browser.d.ts.map