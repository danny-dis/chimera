import { describe, it, expect } from 'vitest';
import {
  applyDmrxRouting,
  isDmrxBackend,
  isDmrxPreset,
  ROLE_TO_DMRX_PRESET,
  DMRX_PRESETS,
} from '../dmrx-routing.js';

function cfg(backend?: 'direct' | 'dmrx') {
  return {
    providers: [
      { name: 'primary', provider: 'openai-compatible', model: 'gpt-4o', role: 'writer', base_url: 'http://127.0.0.1:3000/v1' },
      { name: 'secondary', provider: 'openai-compatible', model: 'gpt-4o-mini', role: 'reviewer', base_url: 'http://127.0.0.1:3000/v1' },
      { name: 'tertiary', provider: 'openai-compatible', model: 'gpt-4o', role: 'challenger', base_url: 'http://127.0.0.1:3000/v1' },
    ],
    ...(backend ? { backend } : {}),
  };
}

describe('applyDmrxRouting', () => {
  it('is a no-op when backend is not dmrx', () => {
    const c = cfg('direct');
    const out = applyDmrxRouting(c, c.backend);
    expect(out.providers.map((p) => p.model)).toEqual(['gpt-4o', 'gpt-4o-mini', 'gpt-4o']);
  });

  it('maps writer→auto-coding, reviewer→auto-fast, challenger→auto-agentic', () => {
    const out = applyDmrxRouting(cfg('dmrx'), 'dmrx');
    expect(out.providers.map((p) => p.model)).toEqual([
      'auto-coding',
      'auto-fast',
      'auto-agentic',
    ]);
  });

  it('biases every role to the mode preset for non-core roles but keeps core roles tuned', () => {
    const out = applyDmrxRouting(cfg('dmrx'), 'dmrx', 'code');
    const byRole = Object.fromEntries(out.providers.map((p) => [p.role, p.model]));
    // Core roles keep their optimized preset even inside a [code] run.
    expect(byRole.writer).toBe('auto-coding');
    expect(byRole.reviewer).toBe('auto-fast');
    expect(byRole.challenger).toBe('auto-agentic');
  });

  it('plan mode pushes planner→auto-smart', () => {
    const planCfg = cfg('dmrx');
    planCfg.providers.push({ name: 'planner', provider: 'openai-compatible', model: 'x', role: 'planner', base_url: 'http://127.0.0.1:3000/v1' });
    const out = applyDmrxRouting(planCfg, 'dmrx', 'plan');
    const planner = out.providers.find((p) => p.role === 'planner');
    expect(planner?.model).toBe('auto-smart');
  });

  it('does not mutate the input config', () => {
    const c = cfg('dmrx');
    applyDmrxRouting(c, 'dmrx');
    expect(c.providers[0].model).toBe('gpt-4o');
  });
});

describe('dmrx helpers', () => {
  it('isDmrxBackend only matches "dmrx"', () => {
    expect(isDmrxBackend('dmrx')).toBe(true);
    expect(isDmrxBackend('direct')).toBe(false);
    expect(isDmrxBackend(undefined)).toBe(false);
  });

  it('isDmrxPreset recognizes the five meta-models', () => {
    for (const p of DMRX_PRESETS) expect(isDmrxPreset(p)).toBe(true);
    expect(isDmrxPreset('gpt-4o')).toBe(false);
  });

  it('exposes a role→preset map covering the core + peer roles', () => {
    expect(ROLE_TO_DMRX_PRESET.writer).toBe('auto-coding');
    expect(ROLE_TO_DMRX_PRESET.reviewer).toBe('auto-fast');
    expect(ROLE_TO_DMRX_PRESET.challenger).toBe('auto-agentic');
    expect(ROLE_TO_DMRX_PRESET.thinker).toBe('auto-smart');
    expect(ROLE_TO_DMRX_PRESET.synthesizer).toBe('auto-smart');
    expect(ROLE_TO_DMRX_PRESET.researcher).toBe('auto-smart');
    expect(ROLE_TO_DMRX_PRESET.summarizer).toBe('auto');
  });

  it('maps thinker→auto-smart and synthesizer→auto-smart via applyDmrxRouting', () => {
    const c = cfg('dmrx');
    c.providers.push(
      { name: 'thinker', provider: 'openai-compatible', model: 'x', role: 'thinker', base_url: 'http://127.0.0.1:3000/v1' },
      { name: 'synthesizer', provider: 'openai-compatible', model: 'x', role: 'synthesizer', base_url: 'http://127.0.0.1:3000/v1' },
      { name: 'researcher', provider: 'openai-compatible', model: 'x', role: 'researcher', base_url: 'http://127.0.0.1:3000/v1' },
    );
    const out = applyDmrxRouting(c, 'dmrx');
    const byRole = Object.fromEntries(out.providers.map((p) => [p.role, p.model]));
    expect(byRole.thinker).toBe('auto-smart');
    expect(byRole.synthesizer).toBe('auto-smart');
    expect(byRole.researcher).toBe('auto-smart');
  });
});
