import type { ComponentHealth } from './types.js';

export type DiagnosisCategory =
  | 'typecheck_failure'
  | 'test_failure'
  | 'dependency_issue'
  | 'config_drift'
  | 'performance_degradation'
  | 'missing_skill';

export interface Diagnosis {
  componentId: string;
  rootCause: string;
  confidence: number;
  category: DiagnosisCategory;
  evidence: string[];
  suggestedFix: string;
  fixType: 'patch_code' | 'add_test' | 'update_dependency' | 'fix_config' | 'add_skill' | 'optimize_algorithm';
  estimatedEffort: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface DiagnosisInput {
  component: ComponentHealth;
  recentEvents: Array<{ type: string; data: Record<string, unknown> }>;
  relatedComponents: ComponentHealth[];
}

export class DiagnosisEngine {
  async diagnose(input: DiagnosisInput): Promise<Diagnosis> {
    const { component } = input;
    const errors = component.details.errors ?? [];

    let category: DiagnosisCategory = 'config_drift';
    let rootCause = 'Unknown issue — requires investigation';
    let confidence = 0.3;
    let fixType: Diagnosis['fixType'] = 'patch_code';
    let suggestedFix = 'Investigate component logs for detailed error information';

    if (component.details.typecheck === false) {
      category = 'typecheck_failure';
      rootCause = `TypeScript compilation error in ${component.id}`;
      confidence = 0.9;
      fixType = 'patch_code';
      suggestedFix = 'Fix TypeScript compilation errors reported in output';
    } else if (errors.some(e => e.toLowerCase().includes('test') || e.toLowerCase().includes('fail'))) {
      category = 'test_failure';
      rootCause = `Test failure in ${component.id}`;
      confidence = 0.85;
      fixType = 'add_test';
      suggestedFix = 'Fix failing tests or update test assertions to match new behavior';
    } else if (component.details.healthEndpoint === false) {
      category = 'dependency_issue';
      rootCause = `Service ${component.id} health endpoint unreachable`;
      confidence = 0.95;
      fixType = 'fix_config';
      suggestedFix = 'Check service configuration, port binding, and upstream dependencies';
    } else if (component.status === 'degraded') {
      category = 'performance_degradation';
      rootCause = `${component.id} is degraded but not failing`;
      confidence = 0.6;
      fixType = 'optimize_algorithm';
      suggestedFix = 'Review recent changes and performance metrics for degradation patterns';
    }

    return {
      componentId: component.id,
      rootCause,
      confidence,
      category,
      evidence: errors,
      suggestedFix,
      fixType,
      estimatedEffort: this.estimateEffort(category, component),
      riskLevel: this.computeRiskLevel(component),
    };
  }

  private estimateEffort(category: DiagnosisCategory, component: ComponentHealth): 'low' | 'medium' | 'high' {
    if (category === 'typecheck_failure') return 'low';
    if (category === 'test_failure') return 'medium';
    if (category === 'dependency_issue') return 'high';
    if (category === 'performance_degradation') return 'high';
    return 'medium';
  }

  private computeRiskLevel(component: ComponentHealth): 'low' | 'medium' | 'high' | 'critical' {
    if (component.type === 'service' && component.status === 'unhealthy') return 'critical';
    if (component.type === 'package' && component.status === 'unhealthy') return 'high';
    if (component.status === 'degraded') return 'medium';
    return 'low';
  }
}