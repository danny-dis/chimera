import { describe, it, expect, beforeEach } from 'vitest';
import { RoleComposer, ROLE_CONTRACTS, ROLE_COMPOSITIONS } from './role-composition.js';
import type { AgentRole } from '@chimera/domain';

describe('RoleComposer', () => {
  let composer: RoleComposer;

  beforeEach(() => {
    composer = new RoleComposer();
  });

  describe('getComposition', () => {
    it('returns composition for known strategies', () => {
      expect(composer.getComposition('solo')).toBeDefined();
      expect(composer.getComposition('duo')).toBeDefined();
      expect(composer.getComposition('trio')).toBeDefined();
      expect(composer.getComposition('fusion')).toBeDefined();
      expect(composer.getComposition('hive')).toBeDefined();
      expect(composer.getComposition('swarm')).toBeDefined();
    });

    it('returns undefined for unknown strategy', () => {
      expect(composer.getComposition('unknown')).toBeUndefined();
    });
  });

  describe('getContract', () => {
    it('returns contract for all roles', () => {
      const roles: AgentRole[] = [
        'planner', 'explorer', 'implementer', 'debugger', 'tester',
        'reviewer', 'security-reviewer', 'synthesizer', 'researcher', 'summarizer',
      ];
      for (const role of roles) {
        expect(composer.getContract(role)).toBeDefined();
      }
    });

    it('returns correct permission levels for implementer', () => {
      const contract = composer.getContract('implementer');
      expect(contract?.permissionLevels).toContain('read');
      expect(contract?.permissionLevels).toContain('write');
      expect(contract?.permissionLevels).toContain('execute');
    });

    it('returns correct permission levels for reviewer', () => {
      const contract = composer.getContract('reviewer');
      expect(contract?.permissionLevels).toEqual(['read']);
    });
  });

  describe('canCollapse', () => {
    it('solo can collapse', () => {
      expect(composer.canCollapse('solo')).toBe(true);
    });

    it('duo can collapse', () => {
      expect(composer.canCollapse('duo')).toBe(true);
    });

    it('trio can collapse', () => {
      expect(composer.canCollapse('trio')).toBe(true);
    });

    it('hive cannot collapse', () => {
      expect(composer.canCollapse('hive')).toBe(false);
    });

    it('swarm cannot collapse', () => {
      expect(composer.canCollapse('swarm')).toBe(false);
    });
  });

  describe('collapse', () => {
    it('solo collapses to implementer', () => {
      expect(composer.collapse('solo')).toEqual(['implementer']);
    });

    it('duo collapses to implementer', () => {
      expect(composer.collapse('duo')).toEqual(['implementer']);
    });

    it('trio collapses to implementer + reviewer', () => {
      expect(composer.collapse('trio')).toEqual(['implementer', 'reviewer']);
    });

    it('fusion collapses to implementer + reviewer', () => {
      expect(composer.collapse('fusion')).toEqual(['implementer', 'reviewer']);
    });

    it('hive does not collapse', () => {
      expect(composer.collapse('hive')).toEqual(['planner', 'implementer', 'synthesizer']);
    });

    it('swarm does not collapse', () => {
      expect(composer.collapse('swarm')).toEqual(['implementer', 'synthesizer']);
    });
  });

  describe('canModelFulfillRole', () => {
    it('model with toolCalling can fulfill implementer', () => {
      expect(composer.canModelFulfillRole('implementer', { toolCalling: true })).toBe(true);
    });

    it('model without toolCalling cannot fulfill implementer', () => {
      expect(composer.canModelFulfillRole('implementer', { toolCalling: false })).toBe(false);
    });

    it('model with structuredOutput can fulfill reviewer', () => {
      expect(composer.canModelFulfillRole('reviewer', { structuredOutput: true })).toBe(true);
    });

    it('model without structuredOutput cannot fulfill reviewer', () => {
      expect(composer.canModelFulfillRole('reviewer', { structuredOutput: false })).toBe(false);
    });

    it('model with reasoning can fulfill security-reviewer', () => {
      expect(composer.canModelFulfillRole('security-reviewer', {
        structuredOutput: true,
        reasoning: true,
      })).toBe(true);
    });

    it('model without reasoning cannot fulfill security-reviewer', () => {
      expect(composer.canModelFulfillRole('security-reviewer', {
        structuredOutput: true,
        reasoning: false,
      })).toBe(false);
    });

    it('any model can fulfill explorer', () => {
      expect(composer.canModelFulfillRole('explorer', {})).toBe(true);
    });
  });

  describe('getRolesForStrategy', () => {
    it('returns full roles when not collapsed', () => {
      expect(composer.getRolesForStrategy('trio')).toEqual([
        'implementer', 'reviewer', 'security-reviewer',
      ]);
    });

    it('returns collapsed roles when collapsed', () => {
      expect(composer.getRolesForStrategy('trio', true)).toEqual([
        'implementer', 'reviewer',
      ]);
    });
  });

  describe('getAvailableStrategies', () => {
    it('returns all strategy IDs', () => {
      const strategies = composer.getAvailableStrategies();
      expect(strategies).toContain('solo');
      expect(strategies).toContain('duo');
      expect(strategies).toContain('trio');
      expect(strategies).toContain('fusion');
      expect(strategies).toContain('hive');
      expect(strategies).toContain('swarm');
    });
  });
});

describe('ROLE_CONTRACTS', () => {
  it('has contracts for all roles', () => {
    const roles: AgentRole[] = [
      'planner', 'explorer', 'implementer', 'debugger', 'tester',
      'reviewer', 'security-reviewer', 'synthesizer', 'researcher', 'summarizer',
    ];
    for (const role of roles) {
      expect(ROLE_CONTRACTS[role]).toBeDefined();
    }
  });

  it('implementer requires toolCalling', () => {
    expect(ROLE_CONTRACTS.implementer.requiredCapabilities).toContain('toolCalling');
  });

  it('reviewer requires structuredOutput', () => {
    expect(ROLE_CONTRACTS.reviewer.requiredCapabilities).toContain('structuredOutput');
  });

  it('security-reviewer requires reasoning', () => {
    expect(ROLE_CONTRACTS['security-reviewer'].requiredCapabilities).toContain('reasoning');
  });
});

describe('ROLE_COMPOSITIONS', () => {
  it('has compositions for all strategies', () => {
    expect(ROLE_COMPOSITIONS.solo).toBeDefined();
    expect(ROLE_COMPOSITIONS.duo).toBeDefined();
    expect(ROLE_COMPOSITIONS.trio).toBeDefined();
    expect(ROLE_COMPOSITIONS.fusion).toBeDefined();
    expect(ROLE_COMPOSITIONS.hive).toBeDefined();
    expect(ROLE_COMPOSITIONS.swarm).toBeDefined();
  });

  it('solo has single implementer role', () => {
    expect(ROLE_COMPOSITIONS.solo.roles).toEqual(['implementer']);
    expect(ROLE_COMPOSITIONS.solo.minModels).toBe(1);
  });

  it('hive requires 3 models', () => {
    expect(ROLE_COMPOSITIONS.hive.minModels).toBe(3);
  });

  it('swarm requires 2 models', () => {
    expect(ROLE_COMPOSITIONS.swarm.minModels).toBe(2);
  });
});
