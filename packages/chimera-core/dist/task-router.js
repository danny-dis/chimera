"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskRouter = void 0;
class TaskRouter {
    providers = [];
    constructor(_eventStream) { }
    setProviders(providers) {
        this.providers = providers;
    }
    classifyTask(_task) {
        const dimensions = {
            codeVolume: 0,
            architecturalDepth: 0,
            dependencyComplexity: 0,
            testCoverage: 0,
            securitySensitivity: 0,
            domainNovelty: 0,
            errorHandling: 0,
            concurrency: 0,
            externalIntegrations: 0,
            dataTransformation: 0,
            stateManagement: 0,
            algorithmicComplexity: 0,
            apiDesign: 0,
            refactoringScope: 0,
            crossCuttingConcerns: 0,
        };
        const overall = Object.values(dimensions).reduce((a, b) => a + b, 0) / Object.keys(dimensions).length;
        return { overall, dimensions };
    }
    selectProvider(_complexity, role) {
        return this.providers.find((p) => p.role === role) ?? null;
    }
    decomposeTask(_task) {
        return { subtasks: [], dag: new Map() };
    }
}
exports.TaskRouter = TaskRouter;
//# sourceMappingURL=task-router.js.map