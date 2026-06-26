"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const bootstrap_js_1 = require("../bootstrap.js");
(0, vitest_1.describe)('WorkflowRegistry', () => {
    (0, vitest_1.it)('starts empty', () => {
        const registry = new bootstrap_js_1.WorkflowRegistry();
        (0, vitest_1.expect)(registry.list()).toEqual([]);
    });
    (0, vitest_1.it)('registers and retrieves workflows', () => {
        const registry = new bootstrap_js_1.WorkflowRegistry();
        const wf = { name: 'test', steps: [] };
        registry.register('test', wf);
        (0, vitest_1.expect)(registry.get('test')).toBe(wf);
    });
    (0, vitest_1.it)('returns undefined for unknown workflow', () => {
        const registry = new bootstrap_js_1.WorkflowRegistry();
        (0, vitest_1.expect)(registry.get('nonexistent')).toBeUndefined();
    });
    (0, vitest_1.it)('lists all registered workflow names', () => {
        const registry = new bootstrap_js_1.WorkflowRegistry();
        registry.register('alpha', {});
        registry.register('beta', {});
        (0, vitest_1.expect)(registry.list()).toEqual(['alpha', 'beta']);
    });
    (0, vitest_1.it)('overwrites existing workflow with same name', () => {
        const registry = new bootstrap_js_1.WorkflowRegistry();
        registry.register('wf', { v: 1 });
        registry.register('wf', { v: 2 });
        (0, vitest_1.expect)(registry.get('wf').v).toBe(2);
    });
});
(0, vitest_1.describe)('bootstrap', () => {
    (0, vitest_1.it)('returns a workflowRegistry with built-in workflows', () => {
        const { workflowRegistry } = (0, bootstrap_js_1.bootstrap)();
        const names = workflowRegistry.list();
        (0, vitest_1.expect)(names).toContain('quality-gate');
        (0, vitest_1.expect)(names).toContain('standard-draft');
    });
    (0, vitest_1.it)('quality-gate workflow has expected structure', () => {
        const { workflowRegistry } = (0, bootstrap_js_1.bootstrap)();
        const qualityGate = workflowRegistry.get('quality-gate');
        (0, vitest_1.expect)(qualityGate.name).toBe('quality-gate');
        (0, vitest_1.expect)(qualityGate.steps).toBeDefined();
        (0, vitest_1.expect)(qualityGate.steps.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('standard-draft workflow has expected structure', () => {
        const { workflowRegistry } = (0, bootstrap_js_1.bootstrap)();
        const standardDraft = workflowRegistry.get('standard-draft');
        (0, vitest_1.expect)(standardDraft.name).toBe('standard-draft');
        (0, vitest_1.expect)(standardDraft.steps).toHaveLength(1);
        (0, vitest_1.expect)(standardDraft.steps[0].kind).toBe('llm');
        (0, vitest_1.expect)(standardDraft.steps[0].role).toBe('writer');
    });
});
//# sourceMappingURL=bootstrap.test.js.map