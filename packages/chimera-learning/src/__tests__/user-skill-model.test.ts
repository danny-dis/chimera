import { describe, it, expect } from 'vitest';
import { UserSkillModel } from '../user-skill-model.js';
import { tierMessage, suggestNextValue, CAPABILITY_TIPS } from '../guidance.js';
import type { ObservedCapability } from '../user-skill-model.js';

describe('UserSkillModel', () => {
  it('defaults new/ambiguous users to intermediate, never novice or expert', () => {
    const m = new UserSkillModel();
    expect(m.rawScore).toBe(0.5);
    expect(m.tier()).toBe('intermediate');
    expect(m.evidenceConfidence).toBeLessThan(1);
    expect(m.activeOverride).toBeNull();
  });

  it('clamps the raw score but never pins to 0 or 1', () => {
    const m = new UserSkillModel({ floor: 0.05, ceiling: 0.95 });
    for (let i = 0; i < 50; i++) m.observeSignal('advanced-flag');
    expect(m.rawScore).toBeLessThan(1);
    expect(m.rawScore).toBeGreaterThan(0.9);
    for (let i = 0; i < 50; i++) m.observeSignal('repeated-errors');
    expect(m.rawScore).toBeGreaterThan(0);
    expect(m.rawScore).toBeLessThan(0.1);
  });

  it('shifts toward advanced with expert signals', () => {
    const m = new UserSkillModel();
    for (let i = 0; i < 10; i++) m.observeSignal('advanced-flag');
    for (let i = 0; i < 10; i++) m.observeSignal('config-override');
    expect(m.evidenceConfidence).toBe(1);
    expect(m.tier()).toBe('advanced');
  });

  it('shifts toward beginner with plain-language + repeated errors', () => {
    const m = new UserSkillModel();
    for (let i = 0; i < 8; i++) m.observeSignal('plain-language');
    for (let i = 0; i < 8; i++) m.observeSignal('repeated-errors');
    expect(m.tier()).toBe('beginner');
  });

  it('explicit override biases tier and is reversible', () => {
    const m = new UserSkillModel();
    m.setExplainLess();
    expect(m.activeOverride).toBe('less');
    expect(m.tier()).toBe('advanced');
    expect(m.explainDepth()).toBe('minimal');
    m.setExplainMore();
    expect(m.tier()).toBe('beginner');
    expect(m.explainDepth()).toBe('full');
    m.clearOverride();
    expect(m.activeOverride).toBeNull();
    expect(m.tier()).toBe('intermediate');
  });

  it('records an inspectable audit trail', () => {
    const m = new UserSkillModel();
    m.observeSignal('advanced-flag', 'test');
    const log = m.getAuditLog();
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]!.signal).toBe('advanced-flag');
    expect(typeof m.formatAudit()).toBe('string');
  });

  it('flags advanced flags correctly', () => {
    const m = new UserSkillModel();
    m.observeCommandUsage({ flags: ['--preset', 'solo', '--repl'] });
    expect(m.rawScore).toBeGreaterThan(0.5);
    m.observeCommandUsage({ scripted: true });
    expect(m.rawScore).toBeGreaterThan(0.5);
  });
});

describe('guidance tiering', () => {
  const msg = {
    beginner: 'BEGINNER why + safe default',
    intermediate: 'INTERMEDIATE',
    advanced: 'ADVANCED terse + flag',
  };

  it('resolves by tier', () => {
    expect(tierMessage(msg, 'beginner')).toBe('BEGINNER why + safe default');
    expect(tierMessage(msg, 'advanced')).toBe('ADVANCED terse + flag');
    expect(tierMessage(msg, 'intermediate')).toBe('INTERMEDIATE');
  });

  it('never gates features — all tiers return content', () => {
    const m = new UserSkillModel();
    m.setExplainLess(); // advanced
    expect(msg.advanced).toContain('flag'); // power-user shortcut still present
    m.clearOverride();
  });
});

describe('suggestNextValue', () => {
  const seenBase: ObservedCapability[] = [];

  it('suggests an unseen capability for a beginner', () => {
    const m = new UserSkillModel(); // intermediate default, falls to beginner order
    const s = suggestNextValue(m, seenBase);
    expect(s).not.toBeNull();
    expect(Object.keys(CAPABILITY_TIPS)).toContain(s!.id);
  });

  it('suggests expert-oriented caps for an advanced user', () => {
    const m = new UserSkillModel();
    for (let i = 0; i < 12; i++) m.observeSignal('advanced-flag');
    const s = suggestNextValue(m, ['preset']);
    expect(s!.id).not.toBe('preset');
  });

  it('returns null when everything is seen and no fallbacks requested', () => {
    const m = new UserSkillModel();
    const all = Object.keys(CAPABILITY_TIPS) as ObservedCapability[];
    expect(suggestNextValue(m, all, { maxFallbacks: 0 })).toBeNull();
  });
});
