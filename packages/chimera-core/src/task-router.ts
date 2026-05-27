import { ComplexityScore } from './types/router.js';
import { AgentConfig } from './types/agent.js';
import { EventStream } from './event-stream.js';

export class TaskRouter {
  private providers: AgentConfig[] = [];

  constructor(_eventStream?: EventStream) {}

  setProviders(providers: AgentConfig[]): void {
    this.providers = providers;
  }

  classifyTask(_task: string): ComplexityScore {
    const dimensions: ComplexityScore['dimensions'] = {
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

    const overall = Object.values(dimensions).reduce((a: number, b: number) => a + b, 0) / Object.keys(dimensions).length;

    return { overall, dimensions };
  }

  selectProvider(_complexity: ComplexityScore, role: string): AgentConfig | null {
    return this.providers.find((p) => p.role === role) ?? null;
  }

  decomposeTask(_task: string): { subtasks: string[]; dag: Map<string, string[]> } {
    return { subtasks: [], dag: new Map() };
  }
}
