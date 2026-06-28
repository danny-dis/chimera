import { z } from 'zod';
/**
 * Agent YAML Schema — Declarative agent definitions.
 * Modeled after Omnigent's agent.yaml spec, adapted for Chimera's
 * provider-agnostic, multi-agent architecture.
 *
 * Usage:
 *   name: code-reviewer
 *   prompt: |
 *     You are a code reviewer. Review diffs for correctness,
 *     security, and maintainability. Return structured findings.
 *   executor:
 *     provider: anthropic
 *     model: claude-sonnet-4-20250514
 *   tools:
 *     git_diff: inherit
 *     read_file: inherit
 *     linter:
 *       type: function
 *       callable: chimera-tools.linter.run
 */
declare const FunctionToolSchema: z.ZodObject<{
    type: z.ZodLiteral<"function">;
    callable: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type?: "function";
    description?: string;
    callable?: string;
}, {
    type?: "function";
    description?: string;
    callable?: string;
}>;
declare const McpToolSchema: z.ZodObject<{
    type: z.ZodLiteral<"mcp">;
    url: z.ZodUnion<[z.ZodString, z.ZodString]>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type?: "mcp";
    description?: string;
    url?: string;
}, {
    type?: "mcp";
    description?: string;
    url?: string;
}>;
declare const AgentToolSchema: z.ZodObject<{
    type: z.ZodLiteral<"agent">;
    prompt: z.ZodString;
    tools: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodLiteral<"inherit">, z.ZodObject<{
        type: z.ZodLiteral<"function">;
        callable: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type?: "function";
        description?: string;
        callable?: string;
    }, {
        type?: "function";
        description?: string;
        callable?: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"mcp">;
        url: z.ZodUnion<[z.ZodString, z.ZodString]>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type?: "mcp";
        description?: string;
        url?: string;
    }, {
        type?: "mcp";
        description?: string;
        url?: string;
    }>]>>>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type?: "agent";
    description?: string;
    prompt?: string;
    tools?: Record<string, {
        type?: "function";
        description?: string;
        callable?: string;
    } | {
        type?: "mcp";
        description?: string;
        url?: string;
    } | "inherit">;
}, {
    type?: "agent";
    description?: string;
    prompt?: string;
    tools?: Record<string, {
        type?: "function";
        description?: string;
        callable?: string;
    } | {
        type?: "mcp";
        description?: string;
        url?: string;
    } | "inherit">;
}>;
declare const ToolSchema: z.ZodUnion<[z.ZodObject<{
    type: z.ZodLiteral<"function">;
    callable: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type?: "function";
    description?: string;
    callable?: string;
}, {
    type?: "function";
    description?: string;
    callable?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"mcp">;
    url: z.ZodUnion<[z.ZodString, z.ZodString]>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type?: "mcp";
    description?: string;
    url?: string;
}, {
    type?: "mcp";
    description?: string;
    url?: string;
}>, z.ZodObject<{
    type: z.ZodLiteral<"agent">;
    prompt: z.ZodString;
    tools: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodLiteral<"inherit">, z.ZodObject<{
        type: z.ZodLiteral<"function">;
        callable: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type?: "function";
        description?: string;
        callable?: string;
    }, {
        type?: "function";
        description?: string;
        callable?: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"mcp">;
        url: z.ZodUnion<[z.ZodString, z.ZodString]>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type?: "mcp";
        description?: string;
        url?: string;
    }, {
        type?: "mcp";
        description?: string;
        url?: string;
    }>]>>>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type?: "agent";
    description?: string;
    prompt?: string;
    tools?: Record<string, {
        type?: "function";
        description?: string;
        callable?: string;
    } | {
        type?: "mcp";
        description?: string;
        url?: string;
    } | "inherit">;
}, {
    type?: "agent";
    description?: string;
    prompt?: string;
    tools?: Record<string, {
        type?: "function";
        description?: string;
        callable?: string;
    } | {
        type?: "mcp";
        description?: string;
        url?: string;
    } | "inherit">;
}>]>;
declare const ExecutorSchema: z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
    harness: z.ZodOptional<z.ZodEnum<["chimera", "claude-code", "codex", "opencode", "pi"]>>;
}, "strip", z.ZodTypeAny, {
    provider?: string;
    model?: string;
    harness?: "chimera" | "claude-code" | "codex" | "opencode" | "pi";
}, {
    provider?: string;
    model?: string;
    harness?: "chimera" | "claude-code" | "codex" | "opencode" | "pi";
}>;
export declare const AgentYamlSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    prompt: z.ZodString;
    executor: z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        harness: z.ZodOptional<z.ZodEnum<["chimera", "claude-code", "codex", "opencode", "pi"]>>;
    }, "strip", z.ZodTypeAny, {
        provider?: string;
        model?: string;
        harness?: "chimera" | "claude-code" | "codex" | "opencode" | "pi";
    }, {
        provider?: string;
        model?: string;
        harness?: "chimera" | "claude-code" | "codex" | "opencode" | "pi";
    }>;
    tools: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodLiteral<"inherit">, z.ZodUnion<[z.ZodObject<{
        type: z.ZodLiteral<"function">;
        callable: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type?: "function";
        description?: string;
        callable?: string;
    }, {
        type?: "function";
        description?: string;
        callable?: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"mcp">;
        url: z.ZodUnion<[z.ZodString, z.ZodString]>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type?: "mcp";
        description?: string;
        url?: string;
    }, {
        type?: "mcp";
        description?: string;
        url?: string;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"agent">;
        prompt: z.ZodString;
        tools: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodLiteral<"inherit">, z.ZodObject<{
            type: z.ZodLiteral<"function">;
            callable: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type?: "function";
            description?: string;
            callable?: string;
        }, {
            type?: "function";
            description?: string;
            callable?: string;
        }>, z.ZodObject<{
            type: z.ZodLiteral<"mcp">;
            url: z.ZodUnion<[z.ZodString, z.ZodString]>;
            description: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type?: "mcp";
            description?: string;
            url?: string;
        }, {
            type?: "mcp";
            description?: string;
            url?: string;
        }>]>>>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type?: "agent";
        description?: string;
        prompt?: string;
        tools?: Record<string, {
            type?: "function";
            description?: string;
            callable?: string;
        } | {
            type?: "mcp";
            description?: string;
            url?: string;
        } | "inherit">;
    }, {
        type?: "agent";
        description?: string;
        prompt?: string;
        tools?: Record<string, {
            type?: "function";
            description?: string;
            callable?: string;
        } | {
            type?: "mcp";
            description?: string;
            url?: string;
        } | "inherit">;
    }>]>]>>>;
    role: z.ZodOptional<z.ZodEnum<["writer", "reviewer", "challenger", "synthesizer", "planner", "researcher", "summarizer"]>>;
    constraints: z.ZodOptional<z.ZodObject<{
        maxTokensPerTurn: z.ZodOptional<z.ZodNumber>;
        costCapPerTask: z.ZodOptional<z.ZodNumber>;
        costCapPerSession: z.ZodOptional<z.ZodNumber>;
        maxParallelInstances: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxTokensPerTurn?: number;
        costCapPerTask?: number;
        costCapPerSession?: number;
        maxParallelInstances?: number;
    }, {
        maxTokensPerTurn?: number;
        costCapPerTask?: number;
        costCapPerSession?: number;
        maxParallelInstances?: number;
    }>>;
    hooks: z.ZodOptional<z.ZodObject<{
        preToolCall: z.ZodOptional<z.ZodString>;
        postToolCall: z.ZodOptional<z.ZodString>;
        onError: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        preToolCall?: string;
        postToolCall?: string;
        onError?: string;
    }, {
        preToolCall?: string;
        postToolCall?: string;
        onError?: string;
    }>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    description?: string;
    role?: "challenger" | "writer" | "reviewer" | "synthesizer" | "planner" | "researcher" | "summarizer";
    name?: string;
    metadata?: Record<string, unknown>;
    prompt?: string;
    tools?: Record<string, {
        type?: "function";
        description?: string;
        callable?: string;
    } | {
        type?: "mcp";
        description?: string;
        url?: string;
    } | "inherit" | {
        type?: "agent";
        description?: string;
        prompt?: string;
        tools?: Record<string, {
            type?: "function";
            description?: string;
            callable?: string;
        } | {
            type?: "mcp";
            description?: string;
            url?: string;
        } | "inherit">;
    }>;
    executor?: {
        provider?: string;
        model?: string;
        harness?: "chimera" | "claude-code" | "codex" | "opencode" | "pi";
    };
    constraints?: {
        maxTokensPerTurn?: number;
        costCapPerTask?: number;
        costCapPerSession?: number;
        maxParallelInstances?: number;
    };
    hooks?: {
        preToolCall?: string;
        postToolCall?: string;
        onError?: string;
    };
}, {
    description?: string;
    role?: "challenger" | "writer" | "reviewer" | "synthesizer" | "planner" | "researcher" | "summarizer";
    name?: string;
    metadata?: Record<string, unknown>;
    prompt?: string;
    tools?: Record<string, {
        type?: "function";
        description?: string;
        callable?: string;
    } | {
        type?: "mcp";
        description?: string;
        url?: string;
    } | "inherit" | {
        type?: "agent";
        description?: string;
        prompt?: string;
        tools?: Record<string, {
            type?: "function";
            description?: string;
            callable?: string;
        } | {
            type?: "mcp";
            description?: string;
            url?: string;
        } | "inherit">;
    }>;
    executor?: {
        provider?: string;
        model?: string;
        harness?: "chimera" | "claude-code" | "codex" | "opencode" | "pi";
    };
    constraints?: {
        maxTokensPerTurn?: number;
        costCapPerTask?: number;
        costCapPerSession?: number;
        maxParallelInstances?: number;
    };
    hooks?: {
        preToolCall?: string;
        postToolCall?: string;
        onError?: string;
    };
}>;
export type AgentYaml = z.infer<typeof AgentYamlSchema>;
export type FunctionTool = z.infer<typeof FunctionToolSchema>;
export type McpTool = z.infer<typeof McpToolSchema>;
export type AgentTool = z.infer<typeof AgentToolSchema>;
export type ToolDefinition = z.infer<typeof ToolSchema>;
export type ExecutorConfig = z.infer<typeof ExecutorSchema>;
/**
 * Validate an agent YAML object.
 * Returns the validated agent or throws a ZodError with details.
 */
export declare function validateAgentYaml(data: unknown): AgentYaml;
/**
 * Safe validation — returns result object instead of throwing.
 */
export declare function safeValidateAgentYaml(data: unknown): {
    success: true;
    data: AgentYaml;
} | {
    success: false;
    error: z.ZodError;
};
export {};
//# sourceMappingURL=agent-schema.d.ts.map