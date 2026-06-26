"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskRouter = void 0;
const COMPLEXITY_KEYWORDS = {
    high: ['architecture', 'system', 'framework', 'distributed', 'concurrent', 'async', 'websocket', 'microservice', 'database', 'migration'],
    medium: ['component', 'module', 'service', 'api', 'function', 'class', 'interface', 'refactor'],
    low: ['fix', 'typo', 'comment', 'test', 'lint', 'format', 'small', 'single'],
};
class TaskRouter {
    eventStream;
    providers = [];
    constructor(eventStream) {
        this.eventStream = eventStream;
    }
    setProviders(providers) {
        this.providers = providers;
    }
    classifyTask(task) {
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
        return complexity * 5; // $5 max for high complexity
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
        // Simple heuristic: break on common patterns
        const parts = task.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        for (const part of parts) {
            const subtask = part.replace(/^(and|then|also)\s+/i, '');
            if (subtask)
                subtasks.push(subtask);
        }
        // If no decomposition found, return the original task
        if (subtasks.length === 0) {
            subtasks.push(task);
        }
        // Create simple DAG (linear dependency)
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