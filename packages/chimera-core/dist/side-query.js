"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SideQueryChannel = exports.SIDEQUERY_NO_LEAK_MARKER = void 0;
exports.setSideQueryChannel = setSideQueryChannel;
exports.sideQuery = sideQuery;
exports.fingerprintPayload = fingerprintPayload;
const fs_1 = require("fs");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
/**
 * A no-leak marker prefixed to the system prompt. The string is intentionally
 * long and self-describing so a frontier LLM, when surfacing the system
 * prompt back to the user, surfaces the marker too — making any leak visible.
 */
exports.SIDEQUERY_NO_LEAK_MARKER = '// SIDEQUERY_PAYLOAD: I have verified this prompt does not contain file paths, code, or secrets.';
/**
 * Default lockfile path. Lives in os.tmpdir() so it is local to the host
 * (not shared across machines). Per-process — not for distributed locks.
 */
const DEFAULT_LOCKFILE_PATH = path_1.default.join(os_1.default.tmpdir(), 'chimera-sidequery.lock');
/**
 * Stale threshold: if the lockfile's mtime is older than this, the holder is
 * considered dead (e.g. crashed before releasing) and we reclaim. Mirrors the
 * HOLDER_STALE_MS pattern in consolidationLock.ts of the target repo.
 */
const LOCK_STALE_MS = 5 * 60 * 1000;
/**
 * Default cheap-model system prompt. Combines the no-leak marker with
 * explicit JSON-only instructions. Short and deterministic.
 */
function buildDefaultSystemPrompt() {
    return [
        exports.SIDEQUERY_NO_LEAK_MARKER,
        'You are a background classifier. Respond with strict JSON only — no prose, no markdown, no code fences.',
        'Never include file paths, source code, or secrets in your response.',
    ].join('\n');
}
/**
 * Build a deterministic "repair" prompt for the single retry on validation
 * failure. It re-states the JSON-only requirement and names the original
 * failure reason so the model can self-correct.
 */
function buildRepairPrompt(originalPrompt, failureReason) {
    return [
        'Your previous response failed schema validation. Respond with valid JSON only.',
        `Validation error: ${failureReason}`,
        'Original request:',
        originalPrompt,
    ].join('\n');
}
/**
 * Try to extract a JSON object from a free-form LLM response. Mirrors the
 * parseJSON helper in session-orchestrator.ts but kept private to this module
 * to avoid coupling.
 */
function extractJsonObject(raw) {
    const trimmed = raw.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start)
        return null;
    try {
        return JSON.parse(trimmed.slice(start, end + 1));
    }
    catch {
        return null;
    }
}
/**
 * In-memory mutex. The lockfile is the durable, cross-process-safe surface;
 * the mutex is the fast in-process check. We hold both for the duration of a
 * single sideQuery call.
 */
function createInProcessLock() {
    return { held: false, waiters: [] };
}
async function acquireInProcess(lock) {
    if (!lock.held) {
        lock.held = true;
        return;
    }
    await new Promise((resolve) => {
        lock.waiters.push(resolve);
    });
    lock.held = true;
}
function releaseInProcess(lock) {
    const next = lock.waiters.shift();
    if (next) {
        // Pass the held flag forward — don't release, hand off.
        next();
    }
    else {
        lock.held = false;
    }
}
async function tryAcquireLockfile(lockfilePath) {
    let priorMtime = 0;
    let body = '';
    try {
        const stat = await fs_1.promises.stat(lockfilePath);
        priorMtime = stat.mtimeMs;
        body = await fs_1.promises.readFile(lockfilePath, 'utf8');
    }
    catch {
        // ENOENT — no prior lock.
    }
    const heldBy = body.trim();
    const isStale = heldBy.length > 0 && Date.now() - priorMtime >= LOCK_STALE_MS;
    if (heldBy.length > 0 && !isStale && heldBy !== String(process.pid)) {
        return { acquired: false, priorMtime };
    }
    // Reclaim stale lock or write fresh.
    await fs_1.promises.mkdir(path_1.default.dirname(lockfilePath), { recursive: true });
    await fs_1.promises.writeFile(lockfilePath, String(process.pid), 'utf8');
    return { acquired: true, priorMtime };
}
async function releaseLockfile(lockfilePath, priorMtime) {
    try {
        if (priorMtime === 0) {
            await fs_1.promises.unlink(lockfilePath);
            return;
        }
        // Rewind mtime so a future acquisition can detect staleness.
        await fs_1.promises.writeFile(lockfilePath, '', 'utf8');
    }
    catch {
        // Lock release is best-effort.
    }
}
/**
 * `SideQueryChannel` is the DI-friendly class. The standalone `sideQuery`
 * function delegates here.
 */
class SideQueryChannel {
    lockfilePath;
    processLock = createInProcessLock();
    defaultProvider;
    defaultModel;
    defaultMaxTokens;
    defaultTimeoutMs;
    constructor(opts) {
        this.defaultProvider = opts?.provider ?? throwNoProvider();
        this.defaultModel = opts?.model ?? 'anthropic/claude-haiku-3.5';
        this.defaultMaxTokens = opts?.maxTokens ?? 1024;
        this.defaultTimeoutMs = opts?.timeoutMs ?? 30_000;
        this.lockfilePath = opts?.lockfilePath ?? DEFAULT_LOCKFILE_PATH;
    }
    /**
     * Run a side query. Schema-validated, repair-on-fail, lockfile-guarded.
     */
    async query(opts) {
        const provider = opts.provider ?? this.defaultProvider;
        const model = opts.model ?? this.defaultModel;
        const maxTokens = opts.maxTokens ?? this.defaultMaxTokens;
        const timeoutMs = opts.timeoutMs ?? this.defaultTimeoutMs;
        const systemPrompt = opts.systemPrompt ?? buildDefaultSystemPrompt();
        // Acquire both locks (in-process first, then lockfile). Order matters:
        // the in-process queue prevents a thundering herd from spamming the
        // filesystem.
        await acquireInProcess(this.processLock);
        const lockResult = await tryAcquireLockfile(this.lockfilePath);
        if (!lockResult.acquired) {
            releaseInProcess(this.processLock);
            return { ok: false, error: `sideQuery lock held at ${this.lockfilePath}` };
        }
        try {
            return await this.runWithTimeout(opts, {
                provider,
                model,
                maxTokens,
                timeoutMs,
                systemPrompt,
            });
        }
        finally {
            await releaseLockfile(this.lockfilePath, lockResult.priorMtime);
            releaseInProcess(this.processLock);
        }
    }
    async runWithTimeout(opts, ctx) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);
        try {
            const first = await this.callOnce(opts, ctx, controller.signal);
            if (!first.ok) {
                // Single repair retry.
                const errorMsg = first.error;
                const repair = await this.callOnce({ ...opts, prompt: buildRepairPrompt(opts.prompt, errorMsg) }, ctx, controller.signal);
                return repair;
            }
            return first;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, error: `sideQuery transport error: ${message}` };
        }
        finally {
            clearTimeout(timer);
        }
    }
    async callOnce(opts, ctx, signal) {
        if (signal.aborted) {
            return { ok: false, error: 'sideQuery timed out' };
        }
        let result;
        try {
            result = await ctx.provider.complete([
                { role: 'system', content: ctx.systemPrompt },
                { role: 'user', content: opts.prompt },
            ], { temperature: 0, maxTokens: ctx.maxTokens, responseFormat: 'json_object' });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, error: `provider call failed: ${message}` };
        }
        const parsed = extractJsonObject(result.content);
        if (parsed === null) {
            return { ok: false, error: 'response was not valid JSON' };
        }
        const validated = opts.schema.safeParse(parsed);
        if (!validated.success) {
            return { ok: false, error: validated.error.message };
        }
        return { ok: true, data: validated.data };
    }
}
exports.SideQueryChannel = SideQueryChannel;
function throwNoProvider() {
    throw new Error('SideQueryChannel requires a default provider. Pass `{ provider }` at construction or per-call.');
}
/**
 * Module-level holder for the function-form `sideQuery` to delegate to.
 * Configure once at app startup, then call `sideQuery` without DI plumbing.
 * Tests should construct `SideQueryChannel` directly instead.
 */
let defaultChannel = null;
function setSideQueryChannel(channel) {
    defaultChannel = channel;
}
/**
 * Function-form sideQuery. Requires a provider either per-call (via
 * `opts.provider`) or pre-configured via `setSideQueryChannel`.
 */
async function sideQuery(opts) {
    if (opts.provider) {
        const channel = new SideQueryChannel({ provider: opts.provider });
        return channel.query(opts);
    }
    if (!defaultChannel) {
        return {
            ok: false,
            error: 'sideQuery requires a provider. Pass `provider` in opts or call setSideQueryChannel() at startup.',
        };
    }
    return defaultChannel.query(opts);
}
/**
 * Helper: hash a payload to log a fingerprint alongside any LLM call. Mirrors
 * the fingerprint pattern in sideQuery.ts of the target repo.
 */
function fingerprintPayload(prompt) {
    return (0, crypto_1.createHash)('sha256').update(prompt).digest('hex').slice(0, 16);
}
//# sourceMappingURL=side-query.js.map