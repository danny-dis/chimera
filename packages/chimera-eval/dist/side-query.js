"use strict";
/**
 * Local `sideQuery` channel stub.
 *
 * The real `sideQuery` (per Phase 0.5 of port-plan.md) is being created in
 * `@chimera/core/src/side-query.ts` by a sibling agent. To keep the
 * @chimera/eval package self-contained and testable in isolation, this
 * file provides a local implementation with the same signature. Once
 * both PRs land, callers can swap this for the canonical import:
 *
 *   import { sideQuery } from '@chimera/core';
 *
 * The interface is deliberately minimal: a single cheap-LLM call with
 * optional temperature / maxTokens overrides. Returns the raw text
 * response — caller is responsible for parsing structured output.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sideQuery = sideQuery;
/**
 * Send a small LLM call (typically Haiku-class) and return the raw text.
 *
 * This is NOT a streaming call. Side-channel queries are meant to be
 * cheap, fast, and synchronous-from-the-caller's-POV. If you need
 * streaming, go through the main orchestrator.
 */
async function sideQuery(provider, messages, options = {}) {
    const result = await provider.complete(messages, {
        temperature: options.temperature ?? 0,
        maxTokens: options.maxTokens ?? 512,
    });
    return result.content;
}
//# sourceMappingURL=side-query.js.map