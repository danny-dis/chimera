import React from 'react';
import type { Message, SkillModelView } from '../types.js';
interface ChatProps {
    messages: Message[];
    focused?: boolean;
    height?: number;
    width?: number;
    skillModel?: SkillModelView;
}
export declare const Chat: React.FC<ChatProps>;
export {};
//# sourceMappingURL=chat.d.ts.map