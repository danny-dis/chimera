"use strict";
/**
 * `runToolCalls` — single shared helper that executes a batch of LLM-emitted
 * tool calls against the orchestrator's `ToolExecutorInterface`.
 *
 * This is the reused tool loop from the orchestrator's `executeToolCalls`
 * (session-orchestrator.ts). It is intentionally provider-agnostic: the
 * executors pass in an optional `toolExecutor`/`toolRegistry` and optional
 * `checkToolOutput` security check + `lintFile` edit-tool hook. The
 * orchestrator wires its real implementations; executors may pass `undefined`.
 *
 * Determinism / scope:
 *   - No new LLM calls. Pure tool side effects + events.
 *   - Security (`checkToolOutput`) and edit-tool linting are OPTIONAL and
 *     ported from session-orchestrator.ts (not copied — the real functions
 *     are injected by the orchestrator).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.countSourceFiles = exports.runAgentToolLoop = void 0;
exports.runToolCalls = runToolCalls;
// Re-export the shared agent tool loop so callers can import from a single
// helper module (tool-execution-helper.js) if they prefer.
var agent_tool_loop_js_1 = require("./agent-tool-loop.js");
Object.defineProperty(exports, "runAgentToolLoop", { enumerable: true, get: function () { return agent_tool_loop_js_1.runAgentToolLoop; } });
Object.defineProperty(exports, "countSourceFiles", { enumerable: true, get: function () { return agent_tool_loop_js_1.countSourceFiles; } });
/**
 * Execute each tool call and return a parallel-shaped result list, matching
 * the orchestrator's `executeToolCalls` contract exactly so results can be
 * handed to `buildToolResultMessages` downstream.
 */
async function runToolCalls(params) {
    const { toolCalls, toolExecutor, eventStream, workspaceRoot, sessionId, signal, checkToolOutput, lintFile, } = params;
    if (!toolExecutor || toolCalls.length === 0) {
        return toolCalls.map((tc) => ({
            toolName: tc.name,
            args: tc.arguments,
            result: {
                toolCallId: tc.id,
                toolName: tc.name,
                result: {
                    success: false,
                    error: toolExecutor ? 'No tool calls to execute' : 'No tool executor configured',
                    duration: 0,
                },
            },
        }));
    }
    const EDIT_TOOLS = new Set(['edit', 'write', 'create_file']);
    // Write-side tools whose transient failure should get one bounded retry.
    // A single retry turns a flaky `writeErrors=1` (transient FS/executor
    // hiccup, no retry before) into a success without masking a real, repeatable
    // failure — the second failure is surfaced as the result error.
    const WRITE_TOOLS = new Set(['write_file', 'write', 'create_file', 'edit_file', 'edit']);
    const results = [];
    for (const tc of toolCalls) {
        if (!tc || typeof tc.name !== 'string')
            continue;
        eventStream.append({
            type: 'tool_call_requested',
            call: { tool: tc.name, args: tc.arguments },
            policy: 'allow',
        });
        let result = await toolExecutor.execute(tc.name, tc.arguments, {
            workspaceRoot,
            sessionId,
            eventStream,
            signal,
        });
        // ── Single bounded retry on write failure ──────────────────────────
        // Only retry write-side tools, only once, and only when not aborted.
        if (!result.success && WRITE_TOOLS.has(tc.name) && !signal?.aborted) {
            eventStream.append({
                type: 'tool_call_retry',
                tool: tc.name,
                error: result.error ?? 'unknown write error',
            });
            result = await toolExecutor.execute(tc.name, tc.arguments, {
                workspaceRoot,
                sessionId,
                eventStream,
                signal,
            });
        }
        // ── Security check (optional) ───────────────────────────────────
        if (result.success && result.data && checkToolOutput) {
            const outputCheck = checkToolOutput(JSON.stringify(result.data), tc.name);
            if (!outputCheck.safe && outputCheck.confidence > 0.8) {
                result.success = false;
                result.error = `Tool output sanitized: potential injection detected (${outputCheck.flags.join(', ')})`;
                result.data = undefined;
            }
        }
        // ── Edit-tool lint (optional) ───────────────────────────────────
        if (result.success && EDIT_TOOLS.has(tc.name)) {
            const filePath = tc.arguments?.filePath;
            if (filePath && lintFile) {
                try {
                    const lintResult = await lintFile(filePath);
                    if (!lintResult.passed && lintResult.errors.length > 0) {
                        eventStream.append({
                            type: 'lint_warning',
                            tool: tc.name,
                            file: filePath,
                            errors: lintResult.errors,
                        });
                    }
                }
                catch {
                    // Lint is best-effort
                }
            }
        }
        results.push({
            toolName: tc.name,
            args: tc.arguments,
            result: {
                toolCallId: tc.id,
                toolName: tc.name,
                result,
            },
        });
    }
    return results;
}
//# sourceMappingURL=tool-execution-helper.js.map