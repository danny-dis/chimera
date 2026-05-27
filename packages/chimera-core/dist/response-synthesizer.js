"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseSynthesizer = void 0;
/**
 * Response Synthesizer: merges all agent outputs into a unified
 * user-facing response, resolves conflicts, produces final output.
 * Presents as a single agent — internal disagreements are hidden.
 */
class ResponseSynthesizer {
    constructor(_eventStream) { }
    /**
     * Merge outputs from multiple agents into a single unified response.
     * Resolves conflicts using structured verdicts and confidence scores.
     */
    synthesize(outputs) {
        // TODO: implement conflict resolution and synthesis
        return outputs.map((o) => o.content).join('\n');
    }
}
exports.ResponseSynthesizer = ResponseSynthesizer;
//# sourceMappingURL=response-synthesizer.js.map