/**
 * Prompt injection defense — detects and blocks injection attempts
 * in user input and tool outputs before they reach the LLM.
 */
export interface InjectionCheck {
    safe: boolean;
    confidence: number;
    flags: InjectionFlag[];
    sanitized?: string;
}
export type InjectionFlag = 'instruction_override' | 'role_hijack' | 'delimiter_injection' | 'data_exfil' | 'encoded_payload' | 'system_prompt_leak';
/**
 * Check user input for prompt injection attempts.
 */
export declare function checkUserInput(input: string): InjectionCheck;
/**
 * Check tool output for injection attempts.
 * Some tools (web fetch, shell output) are higher risk.
 */
export declare function checkToolOutput(output: string, toolName?: string): InjectionCheck;
/**
 * PromptGuard class — wraps injection detection functions for DI.
 */
export declare class PromptGuard {
    checkUserInput(input: string): InjectionCheck;
    checkToolOutput(output: string, toolName?: string): InjectionCheck;
    sanitizeForPrompt(text: string): string;
}
/**
 * Sanitize text by removing potential injection patterns.
 * Returns cleaned text safe for inclusion in prompts.
 */
export declare function sanitizeForPrompt(text: string): string;
//# sourceMappingURL=prompt-guard.d.ts.map