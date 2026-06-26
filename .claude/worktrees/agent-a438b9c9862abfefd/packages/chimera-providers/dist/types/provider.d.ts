export interface ToolCall {
    id: string;
    name: string;
    arguments: string;
}
export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCalls?: ToolCall[];
    toolResultId?: string;
}
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
export type ResponseFormat = 'text' | 'json_object';
export interface CompletionOptions {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    stopSequences?: string[];
    tools?: ToolDefinition[];
    toolChoice?: 'auto' | 'required' | 'none' | {
        type: 'function';
        name: string;
    };
    responseFormat?: ResponseFormat;
}
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
export interface CompletionResult {
    content: string;
    toolCalls?: ToolCall[];
    finishReason: string;
    usage: TokenUsage;
}
export interface StreamChunk {
    content?: string;
    toolCalls?: ToolCall[];
    finishReason?: string;
    usage?: TokenUsage;
}
export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    maxOutputTokens: number;
    created?: Date;
}
export interface PricingInfo {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheReadPerMillion?: number;
    cacheWritePerMillion?: number;
}
/**
 * Token usage statistics attached to a `result` MessageChunk.
 *
 * Slimmer than the existing `TokenUsage` interface above (which tracks
 * cache-read/write token buckets). This shape matches the SDK result envelopes
 * chimera providers consume — see Archon for the rationale.
 */
export interface MessageTokenUsage {
    input: number;
    output: number;
    total?: number;
    cost?: number;
}
/**
 * Message chunk from an AI assistant.
 * Discriminated union with per-type required fields for type safety.
 *
 * TODO(week-3+): re-introduce the `workflow_dispatch` variant when the
 * workflow engine lands in chimera-providers. Drop the TODO once wired in.
 */
export type MessageChunk = {
    type: 'assistant';
    content: string;
    /** When true, batch-mode adapters flush pending content and this chunk
     *  to the platform immediately. Used by Pi's `notify()` so URLs the
     *  user must act on (e.g. plannotator review) surface before the node
     *  blocks for input. */
    flush?: boolean;
} | {
    type: 'system';
    content: string;
} | {
    type: 'thinking';
    content: string;
} | {
    type: 'result';
    sessionId?: string;
    tokens?: MessageTokenUsage;
    structuredOutput?: unknown;
    isError?: boolean;
    errorSubtype?: string;
    /** SDK-provided error detail strings. Populated when isError is true. */
    errors?: string[];
    cost?: number;
    stopReason?: string;
    numTurns?: number;
    modelUsage?: Record<string, unknown>;
} | {
    type: 'rate_limit';
    rateLimitInfo: Record<string, unknown>;
} | {
    type: 'tool';
    toolName: string;
    toolInput?: Record<string, unknown>;
    /** Stable per-call ID from the underlying SDK (e.g. Claude `tool_use_id`).
     *  When present, the platform adapter uses it directly instead of generating
     *  one — guarantees `tool_call`/`tool_result` pair correctly even when
     *  multiple tools with the same name run concurrently. */
    toolCallId?: string;
} | {
    type: 'tool_result';
    toolName: string;
    toolOutput: string;
    /** Matching ID for the originating `tool` chunk. See `tool` variant above. */
    toolCallId?: string;
};
/**
 * System prompt input accepted by all providers. Mirrors the Claude Agent SDK
 * preset-with-append shape so callers can opt into cacheable prefix behavior.
 * Hand-written duplicate of the SDK type — see file-header rule forbidding SDK imports here.
 */
export interface SystemPromptPreset {
    type: 'preset';
    preset: 'claude_code';
    append?: string;
    excludeDynamicSections?: boolean;
}
export type SystemPromptInput = string | string[] | SystemPromptPreset;
/**
 * A provider-neutral in-process tool. The handler runs in the host process and
 * closes over whatever live context it needs (DB, operations, conversation), so
 * `@chimera/providers` never imports runtime helpers — the tool crosses the
 * boundary as data + a function on the request options.
 *
 * `inputSchema` is canonical JSON Schema (object). Each provider converts it
 * to its SDK's schema form. The handler is expected to return a text result
 * rather than throw — provider adapters add no safety net, so an uncaught
 * throw would surface into the agent loop.
 */
export interface NativeTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (input: Record<string, unknown>) => Promise<string>;
}
/**
 * Universal request options accepted by all providers.
 * Provider-specific fields go through `nodeConfig` and `assistantConfig` in SendQueryOptions.
 */
export interface AgentRequestOptions {
    model?: string;
    abortSignal?: AbortSignal;
    systemPrompt?: SystemPromptInput;
    outputFormat?: {
        type: 'json_schema';
        schema: Record<string, unknown>;
    };
    env?: Record<string, string>;
    maxBudgetUsd?: number;
    fallbackModel?: string;
    /** Session fork flag — when true, copies prior session history before appending. */
    forkSession?: boolean;
    /** When false, skip writing session transcript to disk. */
    persistSession?: boolean;
    /**
     * In-process tools the model may call this turn. Defined once by the caller
     * and adapted per provider — Claude wraps each via `createSdkMcpServer`/`tool()`,
     * Pi via `customTools`. Providers without an in-process tool path
     * (Codex/OpenCode) ignore them. Gated on the `nativeTools` capability.
     */
    nativeTools?: NativeTool[];
}
/**
 * Raw node configuration from workflow YAML.
 * Providers translate fields they understand; unknown fields are ignored.
 *
 * Slimmed for chimera: the `agents` field (inline sub-agent definitions) is
 * omitted — chimera's DAG schema is in `chimera-workflows`, not in providers.
 * The inline sub-agent concept comes later (#1276 follow-up).
 */
export interface NodeConfig {
    /** Node ID from the workflow DAG — used by providers for per-node isolation (e.g., session dirs). */
    nodeId?: string;
    mcp?: string;
    hooks?: unknown;
    skills?: string[];
    allowed_tools?: string[];
    denied_tools?: string[];
    effort?: string;
    thinking?: unknown;
    sandbox?: unknown;
    betas?: string[];
    output_format?: Record<string, unknown>;
    maxBudgetUsd?: number;
    systemPrompt?: SystemPromptInput;
    fallbackModel?: string;
    idle_timeout?: number;
    [key: string]: unknown;
}
/**
 * Extended options for sendQuery, adding workflow-specific context.
 * The orchestrator path uses base AgentRequestOptions fields only.
 * The workflow path additionally passes nodeConfig and assistantConfig.
 */
export interface SendQueryOptions extends AgentRequestOptions {
    /** Raw YAML node config — provider translates internally to SDK-specific options. */
    nodeConfig?: NodeConfig;
    /** Per-provider defaults from .chimera/config.yaml assistants section. */
    assistantConfig?: Record<string, unknown>;
}
/**
 * Provider capability flags. The dag-executor uses these for capability
 * warnings when a node specifies features the target provider doesn't support.
 *
 * Note on `structuredOutput`: the value is a tiered union, NOT a boolean.
 *   - `'enforced'`    — SDK/backend grammar-constrains decoding (Claude,
 *     Codex, OpenCode). The request path is native; the executor still
 *     validates post-parse as a net for refusal / `max_tokens` truncation.
 *   - `'best-effort'` — prompt-augmentation + repair + post-parse validate
 *     (Pi, Copilot). No backend grammar; on a validation miss the executor
 *     re-asks up to 3x (prompt + schema errors), then fails the node.
 *   - `false`         — the provider cannot produce structured output at all.
 *
 * The boolean alternative would force either "all providers must pretend they
 * grammar-constrain" (lying about capabilities) or "losers silently degrade"
 * (silent unsafe behavior). The union makes the tier explicit at every call
 * site and forces consumers to handle the three cases.
 */
export interface ProviderCapabilities {
    sessionResume: boolean;
    mcp: boolean;
    hooks: boolean;
    skills: boolean;
    /** Whether the provider supports inline sub-agent definitions (Claude SDK's options.agents). */
    agents: boolean;
    toolRestrictions: boolean;
    /** Tiered union — see interface docstring. */
    structuredOutput: 'enforced' | 'best-effort' | false;
    envInjection: boolean;
    costControl: boolean;
    effortControl: boolean;
    thinkingControl: boolean;
    fallbackModel: boolean;
    sandbox: boolean;
    /** Whether the provider can register in-process `NativeTool`s for a turn. */
    nativeTools: boolean;
}
/**
 * Generic agent provider interface.
 * Allows supporting multiple agent providers (Claude, Codex, etc.).
 */
export interface IAgentProvider {
    /**
     * Send a message and get streaming response.
     * @param prompt - User message or prompt
     * @param cwd - Working directory for the provider
     * @param resumeSessionId - Optional session ID to resume
     * @param options - Optional request options (universal + nodeConfig + assistantConfig)
     */
    sendQuery(prompt: string, cwd: string, resumeSessionId?: string, options?: SendQueryOptions): AsyncGenerator<MessageChunk>;
    /**
     * Get the provider type identifier (e.g. 'claude', 'codex').
     */
    getType(): string;
    /**
     * Get the provider's capability flags.
     * Used by the dag-executor to warn when nodes specify unsupported features.
     */
    getCapabilities(): ProviderCapabilities;
}
export interface ModelProvider {
    complete(prompt: Message[], options?: CompletionOptions): Promise<CompletionResult>;
    stream(prompt: Message[], options?: CompletionOptions): AsyncIterable<StreamChunk>;
    getModel(): ModelInfo;
    getContextWindow(): number;
    getMaxOutputTokens(): number;
    getCost(tokens: {
        input: number;
        output: number;
    }): number;
    getPricing(): PricingInfo;
    supportsToolCalling(): boolean;
    supportsStructuredOutput(): boolean;
    supportsVision(): boolean;
    supportsReasoning(): boolean;
    countTokens(text: string): number;
    countTokensForMessages(messages: Message[]): number;
}
//# sourceMappingURL=provider.d.ts.map