import { describe, it, expect } from 'vitest';
import { DiagnosisEngine } from '../diagnosisEngine.js';
import type { ComponentHealth } from '../types.js';

describe('DiagnosisEngine', () => {
  const engine = new DiagnosisEngine();

  it('diagnoses typecheck failure', async () => {
    const component: ComponentHealth = {
      id: '@argus/test',
      type: 'package',
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      details: { typecheck: false, errors: ['error TS2345: Type mismatch'] },
    };

    const diagnosis = await engine.diagnose({ component, recentEvents: [], relatedComponents: [] });
    expect(diagnosis.category).toBe('typecheck_failure');
    expect(diagnosis.confidence).toBeGreaterThan(0.8);
    expect(diagnosis.fixType).toBe('patch_code');
  });

  it('diagnoses service health failure', async () => {
    const component: ComponentHealth = {
      id: 'ingestion-core',
      type: 'service',
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      details: { healthEndpoint: false },
    };

    const diagnosis = await engine.diagnose({ component, recentEvents: [], relatedComponents: [] });
    expect(diagnosis.category).toBe('dependency_issue');
    expect(diagnosis.riskLevel).toBe('critical');
  });

  it('returns unknown for empty errors', async () => {
    const component: ComponentHealth = {
      id: '@argus/unknown',
      type: 'package',
      status: 'unknown',
      lastCheck: new Date().toISOString(),
      details: {},
    };

    const diagnosis = await engine.diagnose({ component, recentEvents: [], relatedComponents: [] });
    expect(diagnosis.confidence).toBeLessThan(0.5);
  });
});