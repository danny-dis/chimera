"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logWorkflowStart = logWorkflowStart;
exports.logWorkflowError = logWorkflowError;
exports.logNodeStart = logNodeStart;
exports.logNodeComplete = logNodeComplete;
exports.logNodeSkip = logNodeSkip;
exports.logNodeError = logNodeError;
exports.logAssistant = logAssistant;
exports.logTool = logTool;
exports.logWorkflowComplete = logWorkflowComplete;
/**
 * Stub logger for workflow execution.
 * In the full archon codebase, this writes structured logs to files.
 * For chimera, this delegates to @chimera/paths createLogger.
 */
const paths_1 = require("@chimera/paths");
const log = (0, paths_1.createLogger)('workflow');
async function logWorkflowStart(logDir, runId, workflowName, userMessage) {
    log.info({ runId, workflowName }, 'workflow_started');
}
async function logWorkflowError(logDir, runId, error) {
    log.error({ runId, error }, 'workflow_failed');
}
function logNodeStart(runId, nodeId, nodeName) {
    log.info({ runId, nodeId, nodeName }, 'node_started');
}
function logNodeComplete(runId, nodeId, nodeName, duration) {
    log.info({ runId, nodeId, nodeName, duration }, 'node_completed');
}
function logNodeSkip(runId, nodeId, nodeName, reason) {
    log.info({ runId, nodeId, nodeName, reason }, 'node_skipped');
}
function logNodeError(runId, nodeId, nodeName, error) {
    log.error({ runId, nodeId, nodeName, error }, 'node_failed');
}
function logAssistant(runId, nodeId, content) {
    log.debug({ runId, nodeId, contentLength: content.length }, 'assistant_output');
}
function logTool(runId, nodeId, toolName) {
    log.debug({ runId, nodeId, toolName }, 'tool_call');
}
function logWorkflowComplete(logDir, runId) {
    log.info({ runId }, 'workflow_completed');
}
//# sourceMappingURL=logger.js.map