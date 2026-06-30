"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskRouter = void 0;
const zod_1 = require("zod");
const side_query_js_1 = require("./side-query.js");
const ComplexitySchema = zod_1.z.object({
    overall: zod_1.z.number().min(0).max(1),
    dimensions: zod_1.z.record(zod_1.z.number().min(0).max(1)),
});
const COMPLEXITY_KEYWORDS = {
    high: ['architecture', 'system', 'framework', 'distributed', 'concurrent', 'async', 'websocket', 'microservice', 'database', 'migration'],
    medium: ['component', 'module', 'service', 'api', 'function', 'class', 'interface', 'refactor'],
    low: ['fix', 'typo', 'comment', 'test', 'lint', 'format', 'small', 'single'],
};
class TaskRouter {
    eventStream;
    providers = [];
    sideQueryProvider = null;
    constructor(eventStream) {
        this.eventStream = eventStream;
    }
    setProviders(providers) {
        this.providers = providers;
    }
    setSideQueryProvider(provider) {
        this.sideQueryProvider = provider;
    }
    async classifyTask(task) {
        if (this.sideQueryProvider) {
            try {
                const result = await (0, side_query_js_1.sideQuery)({
                    provider: this.sideQueryProvider,
                    prompt: `Classify the complexity of this coding task on a 0-1 scale across these dimensions. Return JSON only.
Task: "${task}"

Dimensions:
- codeVolume: How much code needs to be written/changed (0=single line, 1=large refactor)
- architecturalDepth: How deep the architectural impact (0=surface change, 1=deep restructuring)
- dependencyComplexity: How many dependencies are involved (0=none, 1=many)
- testCoverage: How much testing is needed (0=none, 1=comprehensive)
- securitySensitivity: How security-sensitive (0=not at all, 1=critical)
- concurrency: Concurrency complexity (0=none, 1=complex)

Return: {"overall": <0-1>, "dimensions": {"codeVolume": <0-1>, ...}}`,
                    schema: ComplexitySchema,
                });
                if (result.ok) {
                    const score = result.data;
                    const dims = score.dimensions;
                    const fullDimensions = {
                        codeVolume: dims.codeVolume ?? 0.5,
                        architecturalDepth: dims.architecturalDepth ?? 0.5,
                        dependencyComplexity: dims.dependencyComplexity ?? 0.5,
                        testCoverage: dims.testCoverage ?? 0.5,
                        securitySensitivity: dims.securitySensitivity ?? 0.5,
                        domainNovelty: dims.domainNovelty ?? 0.5,
                        errorHandling: dims.errorHandling ?? 0.5,
                        concurrency: dims.concurrency ?? 0.5,
                        externalIntegrations: dims.externalIntegrations ?? 0.5,
                        dataTransformation: dims.dataTransformation ?? 0.5,
                        stateManagement: dims.stateManagement ?? 0.5,
                        algorithmicComplexity: dims.algorithmicComplexity ?? 0.5,
                        apiDesign: dims.apiDesign ?? 0.5,
                        refactoringScope: dims.refactoringScope ?? 0.5,
                        crossCuttingConcerns: dims.crossCuttingConcerns ?? 0.5,
                    };
                    this.eventStream.append({
                        type: 'task_classified',
                        complexity: { score: score.overall, dimensions: fullDimensions },
                        estimatedCost: this.estimateCost(score.overall),
                    });
                    return { overall: score.overall, dimensions: fullDimensions };
                }
            }
            catch {
                // Fall through to keyword heuristic
            }
        }
        return this.classifyTaskHeuristic(task);
    }
    classifyTaskHeuristic(task) {
        const lowerTask = task.toLowerCase();
        const dimensions = {
            codeVolume: this.scoreKeyword(lowerTask, COMPLEXITY_KEYWORDS.high, COMPLEXITY_KEYWORDS.low),
            architecturalDepth: this.scoreKeyword(lowerTask, ['depth', 'layer', 'architecture'], ['simple', 'basic']),
            dependencyComplexity: this.scoreKeyword(lowerTask, ['dependency', 'import', 'package']),
            testCoverage: this.scoreKeyword(lowerTask, ['test', 'spec', 'coverage']),
            securitySensitivity: this.scoreKeyword(lowerTask, ['auth', 'security', 'password', 'token', 'secret']),
            domainNovelty: this.scoreKeyword(lowerTask, ['new', 'implement', 'create'], ['existing', 'refactor']),
            errorHandling: this.scoreKeyword(lowerTask, ['error', 'exception', 'handle', 'try']),
            concurrency: this.scoreKeyword(lowerTask, ['concurrent', 'async', 'parallel', 'race', 'mutex']),
            externalIntegrations: this.scoreKeyword(lowerTask, ['api', 'http', 'request', 'fetch', 'integrate']),
            dataTransformation: this.scoreKeyword(lowerTask, ['transform', 'convert', 'parse', 'serialize']),
            stateManagement: this.scoreKeyword(lowerTask, ['state', 'store', 'cache', 'memory']),
            algorithmicComplexity: this.scoreKeyword(lowerTask, ['algorithm', 'sort', 'search', 'tree', 'graph']),
            apiDesign: this.scoreKeyword(lowerTask, ['endpoint', 'route', 'api', 'interface']),
            refactoringScope: this.scoreKeyword(lowerTask, ['refactor', 'restructure', 'rewrite', 'migrate']),
            crossCuttingConcerns: this.scoreKeyword(lowerTask, ['logging', 'monitoring', 'config', 'shared']),
        };
        const overall = Object.values(dimensions).reduce((a, b) => a + b, 0) / Object.keys(dimensions).length;
        this.eventStream.append({
            type: 'task_classified',
            complexity: { score: overall, dimensions },
            estimatedCost: this.estimateCost(overall),
        });
        return { overall, dimensions };
    }
    scoreKeyword(text, positives, negatives = []) {
        let score = 0.1;
        for (const word of positives) {
            if (text.includes(word))
                score += 0.15;
        }
        for (const word of negatives) {
            if (text.includes(word))
                score -= 0.1;
        }
        return Math.max(0, Math.min(1, score));
    }
    estimateCost(complexity) {
        return complexity * 5;
    }
    static isConversationalTask(task) {
        const lower = task.toLowerCase().replace(/[,;!]+$/g, '').trim();
        const conversationalPatterns = [
            /^(hello|hi|hey|howdy|greetings|sup|yo|retry|again|repeat)\b/,
            /^(who|what|where|when|why|how)\s+(are|r|is|do|does|did|can|could|would|should|will|shall)\b/,
            /^(tell me about|tell me what|tell me how|tell me why|tell me if)\b/,
            /^(describe|explain|summarize|study|analyze|analyse|examine|inspect|look at|look into|tell me)\b/,
            /^(what do you|what can you|what are you)\b/,
            /^(can you|could you|would you)\b/,
            /^(thanks|thank you|please|help)\b/,
            /^(is there|are there|does|do)\s+\w+\b/,
        ];
        const hasConversationalOpener = conversationalPatterns.some((p) => p.test(lower));
        const codeSignals = [
            'fix', 'error', 'bug', 'failing', 'broken', 'crash', 'exception',
            'implement', 'create', 'build', 'add', 'write', 'develop', 'refactor',
            'migrate', 'integrate', 'setup', 'configure', 'deploy', 'commit',
            'push', 'merge', 'rebase', 'test', 'lint', 'format', 'debug',
            'review', 'audit', 'critique', 'evaluate', 'assess',
            'plan', 'design', 'strategy', 'approach',
            'the answer', 'code', 'function', 'class', 'module', 'file',
        ];
        const hasCodeSignal = codeSignals.some((s) => lower.includes(s));
        if (hasConversationalOpener && !hasCodeSignal)
            return true;
        if (hasCodeSignal)
            return false;
        const informationalVerbs = ['study', 'analyze', 'analyse', 'examine', 'inspect', 'look at', 'look into', 'tell me', 'what is', 'what are', 'describe', 'explain'];
        const hasInformationalVerb = informationalVerbs.some((v) => lower.includes(v));
        if (hasInformationalVerb)
            return true;
        return false;
    }
    suggestMode(task, complexity) {
        const lower = task.toLowerCase();
        const debugSignals = ['fix', 'error', 'bug', 'failing', 'broken', 'crash', 'exception', 'regression', 'test fail'];
        if (debugSignals.some((s) => lower.includes(s)))
            return 'debug';
        const reviewSignals = ['review', 'audit', 'check', 'critique', 'evaluate', 'assess'];
        if (reviewSignals.some((s) => lower.includes(s)))
            return 'review';
        const planSignals = ['plan', 'design', 'strategy', 'approach', 'architecture', 'decompose', 'break down'];
        if (planSignals.some((s) => lower.includes(s)))
            return 'plan';
        const codeSignals = ['implement', 'create', 'build', 'add', 'write', 'develop', 'refactor', 'migrate', 'integrate', 'setup', 'configure'];
        const hasCodeSignal = codeSignals.some((s) => lower.includes(s));
        if (complexity.overall < 0.3 && !hasCodeSignal)
            return 'ask';
        return 'code';
    }
    selectProvider(_complexity, role) {
        let candidates = this.providers.filter((p) => p.role === role);
        if (role === 'writer') {
            candidates = candidates.sort((a, b) => {
                const aTier = this.getModelTier(a.model);
                const bTier = this.getModelTier(b.model);
                return aTier - bTier;
            });
        }
        return candidates[0] ?? null;
    }
    getModelTier(model) {
        const knownTiers = ['deepseek', 'gemini', 'gpt-4o-mini', 'claude-haiku', 'qwen-2.5'];
        for (const tier of knownTiers) {
            if (model.toLowerCase().includes(tier))
                return 1;
        }
        if (model.includes('r1') || model.includes('o3'))
            return 4;
        return 2;
    }
    decomposeTask(task) {
        const subtasks = [];
        const dag = new Map();
        const parts = task.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        for (const part of parts) {
            const subtask = part.replace(/^(and|then|also)\s+/i, '');
            if (subtask)
                subtasks.push(subtask);
        }
        if (subtasks.length === 0) {
            subtasks.push(task);
        }
        for (let i = 1; i < subtasks.length; i++) {
            dag.set(subtasks[i], [subtasks[i - 1]]);
        }
        this.eventStream.append({
            type: 'task_decomposed',
            subtasks: subtasks.map((desc, i) => ({ id: `subtask-${i}`, description: desc, dependencies: [] })),
            dependencyGraph: { nodes: subtasks, edges: Array.from(dag.entries()).flatMap(([k, v]) => v.map(d => [k, d])) },
        });
        return { subtasks, dag };
    }
}
exports.TaskRouter = TaskRouter;
//# sourceMappingURL=task-router.js.map