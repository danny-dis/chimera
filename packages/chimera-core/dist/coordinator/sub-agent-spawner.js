"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubAgentSpawner = void 0;
const async_semaphore_js_1 = require("../agent/async-semaphore.js");
const DEFAULT_LAUNCH_STAGGER_MS = 100;
const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CONFIG = {
    maxConcurrency: 4,
    taskTimeoutMs: 60_000,
    conflictResolution: 'auto',
    staggerDelayMs: 0,
};
/**
 * Executes sub-tasks in parallel with dynamic concurrency control,
 * rate-limit backoff, and timeout handling.
 */
class SubAgentSpawner {
    config;
    eventStream;
    concurrencyEngine;
    rateLimitStates = new Map();
    baseBackoffMs;
    maxBackoffMs;
    maxRetries;
    constructor(eventStreamOrConfig, config, concurrencyEngine, backoffConfig) {
        if (eventStreamOrConfig && typeof eventStreamOrConfig.append === 'function') {
            this.eventStream = eventStreamOrConfig;
            this.config = { ...DEFAULT_CONFIG, ...config };
        }
        else {
            this.config = { ...DEFAULT_CONFIG, ...eventStreamOrConfig };
        }
        this.concurrencyEngine = concurrencyEngine;
        this.baseBackoffMs = backoffConfig?.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
        this.maxBackoffMs = backoffConfig?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
        this.maxRetries = backoffConfig?.maxRetries ?? DEFAULT_MAX_RETRIES;
    }
    /**
     * Execute all sub-tasks respecting dependencies and concurrency limits.
     */
    async executeAll(subTasks, options) {
        const results = [];
        const concurrency = this.concurrencyEngine
            ? this.concurrencyEngine.getSuggestedConcurrency(options?.providerConfig, options?.overrides, subTasks.length)
            : this.config.maxConcurrency;
        const semaphore = new async_semaphore_js_1.AsyncSemaphore(concurrency);
        const completed = new Set();
        const launched = new Set();
        const tasks = [...subTasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        const runTask = async (task) => {
            while (!task.dependencies.every((dep) => completed.has(dep))) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
            await semaphore.acquire();
            try {
                if (this.config.staggerDelayMs && this.config.staggerDelayMs > 0) {
                    await new Promise((resolve) => setTimeout(resolve, this.config.staggerDelayMs));
                }
                const result = await this.executeWithBackoff(task);
                results.push(result);
            }
            finally {
                semaphore.release();
                completed.add(task.id);
            }
        };
        while (launched.size < tasks.length) {
            const ready = tasks.filter((t) => !launched.has(t.id));
            for (let i = 0; i < ready.length; i++) {
                const task = ready[i];
                launched.add(task.id);
                runTask(task);
                if (i < ready.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, DEFAULT_LAUNCH_STAGGER_MS));
                }
            }
            if (ready.length === 0) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
        const MAX_WAIT_MS = 5 * 60 * 1000;
        const startTime = Date.now();
        while (completed.size < tasks.length) {
            if (Date.now() - startTime > MAX_WAIT_MS) {
                throw new Error(`Sub-agent execution timed out after ${MAX_WAIT_MS / 1000}s. ` +
                    `${completed.size}/${tasks.length} tasks completed.`);
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return results;
    }
    async executeWithBackoff(task) {
        let lastError;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            if (attempt > 0) {
                const backoff = this.calculateBackoff(task, attempt);
                await new Promise((resolve) => setTimeout(resolve, backoff));
            }
            const result = await this.executeOne(task);
            if (result.status !== 'error' || !this.isRateLimitError(result.error)) {
                return result;
            }
            lastError = new Error(result.error);
            this.handleRateLimit(task, attempt);
        }
        return {
            subTaskId: task.id,
            status: 'error',
            output: '',
            tokensUsed: 0,
            error: `Rate limited after ${this.maxRetries} retries: ${lastError?.message}`,
            durationMs: 0,
        };
    }
    async executeOne(task) {
        const start = Date.now();
        try {
            const result = await this.withTimeout(task.provider.complete([
                {
                    role: 'system',
                    content: '[!] #CORE SUB-AGENT DIRECTIVE# [!]\n>>> FOCUS: ATOMIC TASK EXECUTION <<<\n\nIDENTITY: You are a specialized sub-agent. Your existence is dedicated to the precise execution of the assigned sub-task.\n\n# MANDATES #\n1. PRECISION: Complete the sub-task EXACTLY as described. \n2. BREVITY: Output ONLY the result. NO preamble. NO filler. NO explanations. \n3. INTEGRITY: If the context is insufficient, state "INSUFFICIENT CONTEXT" and list requirements.\n\n[!] AS YOU WISH [!]',
                },
                {
                    role: 'user',
                    content: task.context
                        ? `TASK: ${task.description}\n\n<CONTEXT_RESOURCES>\n${task.context}\n</CONTEXT_RESOURCES>`
                        : `TASK: ${task.description}`,
                },
            ], { temperature: 0.3 }), this.config.taskTimeoutMs);
            return {
                subTaskId: task.id,
                status: 'success',
                output: result.content,
                tokensUsed: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
                durationMs: Date.now() - start,
            };
        }
        catch (err) {
            return {
                subTaskId: task.id,
                status: err instanceof TimeoutError ? 'timeout' : 'error',
                output: '',
                tokensUsed: 0,
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    }
    isRateLimitError(error) {
        if (!error)
            return false;
        const lower = error.toLowerCase();
        return lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests');
    }
    handleRateLimit(task, attempt) {
        const providerId = task.provider.constructor?.name ?? 'unknown';
        const state = this.rateLimitStates.get(providerId);
        const backoffMs = state
            ? Math.min(state.backoffMs * 2, this.maxBackoffMs)
            : this.baseBackoffMs * Math.pow(2, attempt);
        this.rateLimitStates.set(providerId, {
            retryAfterMs: backoffMs,
            backoffMs,
            resetsAt: Date.now() + backoffMs,
        });
        this.eventStream?.append({
            type: 'provider_rate_limited',
            providerId,
            retryAfterMs: backoffMs,
            remainingRpm: 0,
        });
    }
    calculateBackoff(task, attempt) {
        const providerId = task.provider.constructor?.name ?? 'unknown';
        const state = this.rateLimitStates.get(providerId);
        if (state && Date.now() < state.resetsAt) {
            return state.resetsAt - Date.now();
        }
        return Math.min(this.baseBackoffMs * Math.pow(2, attempt - 1), this.maxBackoffMs);
    }
    withTimeout(promise, ms) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new TimeoutError(`Task timed out after ${ms}ms`)), ms);
            promise.then((val) => { clearTimeout(timer); resolve(val); }, (err) => { clearTimeout(timer); reject(err); });
        });
    }
}
exports.SubAgentSpawner = SubAgentSpawner;
class TimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TimeoutError';
    }
}
//# sourceMappingURL=sub-agent-spawner.js.map