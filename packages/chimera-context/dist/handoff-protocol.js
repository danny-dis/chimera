"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandoffProtocol = void 0;
const fs_1 = require("fs");
const output_ref_js_1 = require("./output-ref.js");
class HandoffProtocol {
    proposals = new Map();
    checkpoints = [];
    addClaim(proposal) {
        this.proposals.set(proposal.claimId, proposal);
    }
    getClaim(id) {
        return this.proposals.get(id);
    }
    getAllClaims() {
        return Array.from(this.proposals.values());
    }
    addCheckpoint(index, description) {
        this.checkpoints.push({ index, description });
    }
    getCheckpoints() {
        return [...this.checkpoints];
    }
    createCompactingHandoff(events, context) {
        const firstUserRequest = events.find((e) => e.type === 'user_request');
        const lastFinalResponse = [...events].reverse().find((e) => e.type === 'final_response');
        const status = lastFinalResponse?.status === 'done'
            ? 'done'
            : lastFinalResponse?.status === 'blocked'
                ? 'blocked'
                : 'in_progress';
        return {
            goal: firstUserRequest?.text || 'Unknown goal',
            status,
            progress: this.summarizeEvents(events),
            decisions: this.extractDecisions(events),
            next: this.extractNextSteps(events),
            context: this.extractContextFacts(events),
            filesModified: this.extractFilesModified(events),
            filesRead: this.extractFilesRead(events),
            errors: this.extractErrors(events),
            meta: {
                session: context?.session || '',
                agent: context?.agent || '',
                provider: context?.provider || '',
                ts: new Date().toISOString(),
                contextFill: context?.contextFill || 0,
                claims: Array.from(this.proposals.values()).map((p) => p.claimId),
            },
        };
    }
    createDeltaHandoff(baseId, oldEvents, newEvents) {
        const diff = this.diffEvents(oldEvents, newEvents);
        return {
            base: baseId,
            progressDelta: this.summarizeEvents(diff),
            decisionsAdded: this.extractDecisions(diff),
            nextUpdated: this.extractNextSteps(diff),
            filesModifiedAdded: this.extractFilesModified(diff),
            claimsAdded: diff.filter((e) => e.type === 'provenance_claim').map((e) => e.claimId),
        };
    }
    serializeHandoff(doc) {
        const lines = ['# HANDOFF'];
        lines.push(`goal: ${doc.goal}`);
        lines.push(`status: ${doc.status}`);
        lines.push(`progress: ${doc.progress}`);
        lines.push('decisions:');
        for (const d of doc.decisions) {
            lines.push(`- ${d.decision}: ${d.rationale}, ${d.source}, ${d.confidence}`);
        }
        lines.push('next:');
        for (let i = 0; i < doc.next.length; i++) {
            const n = doc.next[i];
            lines.push(`${i + 1}. [${n.priority}] ${n.action}`);
        }
        lines.push('context:');
        for (const c of doc.context) {
            lines.push(`- ${c}`);
        }
        lines.push('files-modified:');
        for (const f of doc.filesModified) {
            lines.push(`- ${f.path} (status: ${f.status}, lines: ${f.lines})`);
        }
        lines.push('files-read:');
        for (const f of doc.filesRead) {
            lines.push(`- ${f.path}:${f.lines} (${f.reason})`);
        }
        lines.push('errors:');
        for (const e of doc.errors) {
            lines.push(`- ${e}`);
        }
        lines.push('meta:');
        lines.push(`- session: ${doc.meta.session}`);
        lines.push(`- agent: ${doc.meta.agent}`);
        lines.push(`- provider: ${doc.meta.provider}`);
        lines.push(`- ts: ${doc.meta.ts}`);
        lines.push(`- context-fill: ${doc.meta.contextFill}`);
        lines.push(`- claims: ${doc.meta.claims.join(',')}`);
        return lines.join('\n');
    }
    parseHandoff(text) {
        const lines = text.split('\n');
        let currentSection = '';
        const doc = {
            goal: '',
            status: 'in_progress',
            progress: '',
            decisions: [],
            next: [],
            context: [],
            filesModified: [],
            filesRead: [],
            errors: [],
            meta: { session: '', agent: '', provider: '', ts: '', contextFill: 0, claims: [] },
        };
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('# HANDOFF'))
                continue;
            const sectionMatch = trimmed.match(/^(goal|status|progress|decisions|next|context|files-modified|files-read|errors|meta):/);
            if (sectionMatch) {
                currentSection = sectionMatch[1];
                if (['goal', 'status', 'progress'].includes(currentSection)) {
                    const value = trimmed.substring(currentSection.length + 1).trim();
                    if (currentSection === 'goal')
                        doc.goal = value;
                    else if (currentSection === 'status')
                        doc.status = value;
                    else if (currentSection === 'progress')
                        doc.progress = value;
                }
                continue;
            }
            switch (currentSection) {
                case 'decisions': {
                    if (trimmed.startsWith('- ')) {
                        const content = trimmed.substring(2);
                        const colonIdx = content.indexOf(': ');
                        if (colonIdx > 0) {
                            const rest = content.substring(colonIdx + 2);
                            const parts = rest.split(', ');
                            doc.decisions.push({
                                decision: content.substring(0, colonIdx),
                                rationale: parts[0] || '',
                                source: parts[1] || '',
                                confidence: parts[2] || '',
                            });
                        }
                    }
                    break;
                }
                case 'next': {
                    const m = trimmed.match(/^\d+\.\s+\[(HIGH|MED|LOW)\]\s+(.+)/);
                    if (m)
                        doc.next.push({ priority: m[1], action: m[2] });
                    break;
                }
                case 'context': {
                    if (trimmed.startsWith('- '))
                        doc.context.push(trimmed.substring(2));
                    break;
                }
                case 'files-modified': {
                    if (trimmed.startsWith('- ')) {
                        const content = trimmed.substring(2);
                        const parenIdx = content.indexOf(' (');
                        if (parenIdx > 0) {
                            const attrs = content.substring(parenIdx + 2, content.length - 1);
                            const sm = attrs.match(/status:\s*(\S+)/);
                            const lm = attrs.match(/lines:\s*(\d+)/);
                            doc.filesModified.push({
                                path: content.substring(0, parenIdx),
                                status: sm?.[1] || 'modified',
                                lines: lm ? parseInt(lm[1]) : 0,
                            });
                        }
                    }
                    break;
                }
                case 'files-read': {
                    if (trimmed.startsWith('- ')) {
                        const content = trimmed.substring(2);
                        const colonIdx = content.indexOf(':');
                        const parenIdx = content.indexOf(' (');
                        if (colonIdx > 0 && parenIdx > colonIdx) {
                            doc.filesRead.push({
                                path: content.substring(0, colonIdx),
                                lines: content.substring(colonIdx + 1, parenIdx),
                                reason: content.substring(parenIdx + 2, content.length - 1),
                            });
                        }
                    }
                    break;
                }
                case 'errors': {
                    if (trimmed.startsWith('- '))
                        doc.errors.push(trimmed.substring(2));
                    break;
                }
                case 'meta': {
                    if (trimmed.startsWith('- ')) {
                        const content = trimmed.substring(2);
                        const colonIdx = content.indexOf(': ');
                        if (colonIdx > 0) {
                            const key = content.substring(0, colonIdx);
                            const value = content.substring(colonIdx + 2);
                            if (key === 'session')
                                doc.meta.session = value;
                            else if (key === 'agent')
                                doc.meta.agent = value;
                            else if (key === 'provider')
                                doc.meta.provider = value;
                            else if (key === 'ts')
                                doc.meta.ts = value;
                            else if (key === 'context-fill')
                                doc.meta.contextFill = parseInt(value) || 0;
                            else if (key === 'claims')
                                doc.meta.claims = value ? value.split(',').filter(Boolean) : [];
                        }
                    }
                    break;
                }
            }
        }
        return doc;
    }
    serializeDelta(delta) {
        const lines = ['# HANDOFF-DELTA'];
        lines.push(`base: ${delta.base}`);
        lines.push(`progress-delta: ${delta.progressDelta}`);
        lines.push('decisions-added:');
        for (const d of delta.decisionsAdded) {
            lines.push(`- ${d.decision}: ${d.rationale}, ${d.source}, ${d.confidence}`);
        }
        lines.push('next-updated:');
        for (let i = 0; i < delta.nextUpdated.length; i++) {
            const n = delta.nextUpdated[i];
            lines.push(`${i + 1}. [${n.priority}] ${n.action}`);
        }
        lines.push('files-modified-added:');
        for (const f of delta.filesModifiedAdded) {
            lines.push(`- ${f.path} (status: ${f.status}, lines: ${f.lines})`);
        }
        lines.push(`claims-added: ${delta.claimsAdded.join(',')}`);
        return lines.join('\n');
    }
    parseDelta(text) {
        const lines = text.split('\n');
        let currentSection = '';
        const delta = {
            base: '',
            progressDelta: '',
            decisionsAdded: [],
            nextUpdated: [],
            filesModifiedAdded: [],
            claimsAdded: [],
        };
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('# HANDOFF-DELTA'))
                continue;
            const sectionMatch = trimmed.match(/^(base|progress-delta|decisions-added|next-updated|files-modified-added|claims-added):/);
            if (sectionMatch) {
                currentSection = sectionMatch[1];
                if (currentSection === 'base')
                    delta.base = trimmed.substring(5).trim();
                else if (currentSection === 'progress-delta')
                    delta.progressDelta = trimmed.substring(15).trim();
                else if (currentSection === 'claims-added') {
                    const value = trimmed.substring(13).trim();
                    delta.claimsAdded = value ? value.split(',').filter(Boolean) : [];
                }
                continue;
            }
            switch (currentSection) {
                case 'decisions-added': {
                    if (trimmed.startsWith('- ')) {
                        const content = trimmed.substring(2);
                        const colonIdx = content.indexOf(': ');
                        if (colonIdx > 0) {
                            const rest = content.substring(colonIdx + 2);
                            const parts = rest.split(', ');
                            delta.decisionsAdded.push({
                                decision: content.substring(0, colonIdx),
                                rationale: parts[0] || '',
                                source: parts[1] || '',
                                confidence: parts[2] || '',
                            });
                        }
                    }
                    break;
                }
                case 'next-updated': {
                    const m = trimmed.match(/^\d+\.\s+\[(HIGH|MED|LOW)\]\s+(.+)/);
                    if (m)
                        delta.nextUpdated.push({ priority: m[1], action: m[2] });
                    break;
                }
                case 'files-modified-added': {
                    if (trimmed.startsWith('- ')) {
                        const content = trimmed.substring(2);
                        const parenIdx = content.indexOf(' (');
                        if (parenIdx > 0) {
                            const attrs = content.substring(parenIdx + 2, content.length - 1);
                            const sm = attrs.match(/status:\s*(\S+)/);
                            const lm = attrs.match(/lines:\s*(\d+)/);
                            delta.filesModifiedAdded.push({
                                path: content.substring(0, parenIdx),
                                status: sm?.[1] || 'modified',
                                lines: lm ? parseInt(lm[1]) : 0,
                            });
                        }
                    }
                    break;
                }
            }
        }
        return delta;
    }
    validateHandoff(document) {
        return {
            dataComplete: this.checkDataCompleteness(document),
            referencesGrounded: this.checkReferences(document),
            claimsVerified: this.checkClaims(document),
            capabilityMatch: this.checkCapabilities(document),
        };
    }
    summarizeEvents(events) {
        const parts = [];
        const userRequest = events.find((e) => e.type === 'user_request');
        if (userRequest)
            parts.push(`Requested: ${userRequest.text}`);
        const patches = events.filter((e) => e.type === 'patch_proposed');
        if (patches.length > 0) {
            const allFiles = patches.flatMap((p) => p.files);
            parts.push(`Modified: ${allFiles.join(', ')}`);
        }
        const verified = events.filter((e) => e.type === 'verified');
        if (verified.length > 0) {
            const last = verified[verified.length - 1];
            parts.push(`Review: ${last.verdict}`);
        }
        const toolErrors = events.filter((e) => e.type === 'tool_call_result' &&
            e.result.exitCode !== undefined &&
            e.result.exitCode !== 0);
        if (toolErrors.length > 0)
            parts.push(`Errors: ${toolErrors.length} failed command(s)`);
        return parts.join('. ') || 'No significant events';
    }
    extractNextSteps(events) {
        const steps = [];
        const recent = events.slice(-10).reverse();
        for (const event of recent) {
            if (event.type === 'verified' && event.verdict === 'needs_revision') {
                steps.push({ priority: 'HIGH', action: 'Address review feedback' });
            }
            if (event.type === 'tool_call_result' &&
                event.result.exitCode !== undefined &&
                event.result.exitCode !== 0) {
                steps.push({ priority: 'MED', action: `Investigate failed command: ${event.result.tool}` });
            }
            if (event.type === 'final_response' && event.status === 'needs_user') {
                steps.push({ priority: 'HIGH', action: 'User input required' });
            }
            if (event.type === 'context_threshold_reached') {
                steps.push({ priority: 'HIGH', action: 'Session nearing context limit' });
            }
            if (event.type === 'review_finding' && event.severity === 'blocker') {
                steps.push({ priority: 'HIGH', action: 'Address blocker' });
            }
        }
        return steps.slice(0, 5);
    }
    extractDecisions(events) {
        const decisions = [];
        for (const event of events) {
            if (event.type === 'verified') {
                decisions.push({
                    decision: `Review verdict: ${event.verdict}`,
                    rationale: event.findings?.[0]?.description || 'No findings',
                    source: event.agentId,
                    confidence: event.findings?.[0]?.severity || 'low',
                });
            }
            if (event.type === 'challenged') {
                for (const challenge of event.challenges) {
                    decisions.push({
                        decision: challenge,
                        rationale: event.alternatives.join('; ') || 'No alternatives',
                        source: event.agentId,
                        confidence: 'low',
                    });
                }
            }
        }
        return decisions;
    }
    extractContextFacts(events) {
        const facts = [];
        const userRequest = events.find((e) => e.type === 'user_request');
        if (userRequest)
            facts.push(`User requested: ${userRequest.text}`);
        const contextPack = events.find((e) => e.type === 'context_pack_created');
        if (contextPack)
            facts.push(`Packed ${contextPack.files.length} files for context`);
        const taskDecomposed = events.find((e) => e.type === 'task_decomposed');
        if (taskDecomposed)
            facts.push(`Task decomposed into ${taskDecomposed.subtasks.length} subtasks`);
        return facts;
    }
    extractFilesModified(events) {
        return events
            .filter((e) => e.type === 'patch_proposed')
            .flatMap((e) => e.files.map((p) => ({ path: p, status: 'modified', lines: 0 })));
    }
    extractFilesRead(events) {
        return events
            .filter((e) => e.type === 'context_pack_created')
            .flatMap((e) => e.files.map((p) => ({ path: p, lines: '1-100', reason: 'Context packing' })));
    }
    extractErrors(events) {
        return events
            .filter((e) => e.type === 'tool_call_result' &&
            e.result.exitCode !== undefined &&
            e.result.exitCode !== 0)
            .map((e) => `Command failed: ${e.result.tool} (exit code ${e.result.exitCode})`);
    }
    diffEvents(oldEvents, newEvents) {
        const oldSet = new Set(oldEvents.map((e) => `${e.type}-${JSON.stringify(e)}`));
        return newEvents.filter((e) => !oldSet.has(`${e.type}-${JSON.stringify(e)}`));
    }
    checkDataCompleteness(doc) {
        return !!(doc.goal && doc.status && doc.progress && doc.meta.session && doc.meta.ts);
    }
    checkReferences(doc) {
        for (const file of doc.filesModified) {
            if (!(0, fs_1.existsSync)(file.path))
                return false;
        }
        for (const file of doc.filesRead) {
            if (!(0, fs_1.existsSync)(file.path))
                return false;
        }
        return true;
    }
    checkClaims(doc) {
        return doc.decisions.every((d) => d.source.length > 0);
    }
    checkCapabilities(_doc) {
        return true;
    }
    // ── Output-ref wiring ──────────────────────────────────────────────
    /**
     * Resolve a `$nodeId.output.field` reference against a producer's output.
     * Returns the field value, or null for declared-optional absent fields.
     * Throws `OutputRefError` for strict failures (not-in-schema, producer-not-run, etc.).
     */
    readOutputField(nodeId, field, nodeOutput) {
        const resolution = (0, output_ref_js_1.resolveNodeOutputField)(nodeOutput, nodeId, field);
        if (resolution.kind === 'empty')
            return null;
        return resolution.value;
    }
    /**
     * Like `readOutputField`, but returns a `FieldResolution` object that
     * distinguishes "value present" from "explicitly empty" — useful for
     * callers that need to log the empty case rather than swallow it.
     */
    readOutputFieldWithState(nodeId, field, nodeOutput) {
        return (0, output_ref_js_1.resolveNodeOutputField)(nodeOutput, nodeId, field);
    }
}
exports.HandoffProtocol = HandoffProtocol;
//# sourceMappingURL=handoff-protocol.js.map