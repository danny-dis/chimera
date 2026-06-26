/**
 * sideQuery — cheap LLM side-channel for background classification, memory
 * recall, and other LLM-shaped work that should not consume a frontier model.
 *
 * Inspired by `src/utils/sideQuery.ts` in the upstream target repo. Three
 * properties distinguish this from a regular `provider.complete()` call:
 *
 *   1. Default model is a cheap (Haiku-class) tier, not the frontier tier
 *      used by the main orchestrator.
 *   2. A lockfile prevents concurrent sideQueries within the same process,
 *      mirroring the runForkedAgent isolation pattern.
 *   3. A no-leak marker is injected at the start of the system prompt so
 *      the LLM is reminded it must not echo file paths, code, or secrets.
 *
 * Output is validated against a caller-provided Zod schema. On validation
 * failure a single repair retry is attempted before giving up.
 */
import type { ZodSchema } from 'zod';
/**
 * A no-leak marker prefixed to the system prompt. The string is intentionally
 * long and self-describing so a frontier LLM, when surfacing the system
 * prompt back to the user, surfaces the marker too — making any leak visible.
 */
export declare const SIDEQUERY_NO_LEAK_MARKER = "// SIDEQUERY_PAYLOAD: I have verified this prompt does not contain file paths, code, or secrets.";
/**
 * Shape for the LLMProvider that sideQuery requires. Matches the LLMProvider
 * interface in session-orchestrator.ts. Re-declared here to keep this module
 * decoupled from any internal orchestrator type.
 */
export interface SideQueryProvider {
    complete(messages: Array<{
        role: string;
        content: string;
    }>, options?: {
        temperature?: number;
        maxTokens?: number;
        responseFormat?: 'text' | 'json_object';
    }): Promise<{
        content: string;
        usage: {
            inputTokens: number;
            outputTokens: number;
        };
    }>;
}
export interface SideQueryOptions<T> {
    /** The prompt to send (becomes the user-role message). */
    prompt: string;
    /** Zod schema used to validate the parsed JSON response. */
    schema: ZodSchema<T>;
    /** Optional provider override. Defaults to the channel's configured provider. */
    provider?: SideQueryProvider;
    /** Optional model override. Defaults to the channel's configured model. */
    model?: string;
    /** Optional max output tokens. Default: 1024. */
    maxTokens?: number;
    /** Optional timeout in ms. Default: 30_000. */
    timeoutMs?: number;
    /** Optional system-prompt override. Default: built-in marker + JSON instructions. */
    systemPrompt?: string;
}
export type SideQueryResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: string;
};
/**
 * `SideQueryChannel` is the DI-friendly class. The standalone `sideQuery`
 * function delegates here.
 */
export declare class SideQueryChannel {
    private readonly lockfilePath;
    private readonly processLock;
    private readonly defaultProvider;
    private readonly defaultModel;
    private readonly defaultMaxTokens;
    private readonly defaultTimeoutMs;
    constructor(opts?: {
        provider?: SideQueryProvider;
        model?: string;
        maxTokens?: number;
        timeoutMs?: number;
        lockfilePath?: string;
    });
    /**
     * Run a side query. Schema-validated, repair-on-fail, lockfile-guarded.
     */
    query<T>(opts: SideQueryOptions<T>): Promise<SideQueryResult<T>>;
    private runWithTimeout;
    private callOnce;
}
export declare function setSideQueryChannel(channel: SideQueryChannel | null): void;
/**
 * Function-form sideQuery. Requires a provider either per-call (via
 * `opts.provider`) or pre-configured via `setSideQueryChannel`.
 */
export declare function sideQuery<T>(opts: SideQueryOptions<T>): Promise<SideQueryResult<T>>;
/**
 * Helper: hash a payload to log a fingerprint alongside any LLM call. Mirrors
 * the fingerprint pattern in sideQuery.ts of the target repo.
 */
export declare function fingerprintPayload(prompt: string): string;
//# sourceMappingURL=side-query.d.ts.map