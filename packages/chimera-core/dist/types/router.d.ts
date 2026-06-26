export interface ComplexityScore {
    overall: number;
    dimensions: {
        codeVolume: number;
        architecturalDepth: number;
        dependencyComplexity: number;
        testCoverage: number;
        securitySensitivity: number;
        domainNovelty: number;
        errorHandling: number;
        concurrency: number;
        externalIntegrations: number;
        dataTransformation: number;
        stateManagement: number;
        algorithmicComplexity: number;
        apiDesign: number;
        refactoringScope: number;
        crossCuttingConcerns: number;
    };
}
//# sourceMappingURL=router.d.ts.map