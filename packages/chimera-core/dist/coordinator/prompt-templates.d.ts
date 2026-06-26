import type { SubTaskType } from './types.js';
export interface PromptTemplate {
    system: string;
    fewShot?: {
        input: string;
        output: string;
    }[];
}
export declare function getPromptTemplate(subTaskType: SubTaskType): PromptTemplate;
export declare function buildFewShotPrompt(base: PromptTemplate, examples: {
    input: string;
    output: string;
}[]): PromptTemplate;
export declare function renderPrompt(template: PromptTemplate, task: string): {
    role: 'system' | 'user';
    content: string;
}[];
//# sourceMappingURL=prompt-templates.d.ts.map