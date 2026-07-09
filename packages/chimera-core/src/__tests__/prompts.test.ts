import { describe, it, expect } from 'vitest';
import {
  COMPACT_CORE_IDENTITY,
  SMALL_MODEL_GUIDANCE,
  compactAgentPrompt,
  CHIMERA_CORE_IDENTITY,
  AGENT_PROMPTS,
} from '../prompts.js';

describe('compact tier prompts', () => {
  describe('COMPACT_CORE_IDENTITY', () => {
    it('anchors identity in the first 8 tokens', () => {
      const first8 = COMPACT_CORE_IDENTITY.split(/\s+/).slice(0, 8).join(' ');
      expect(first8).toContain('CHIMERA CORE PACT');
    });

    it('is shorter than the frontier CHIMERA_CORE_IDENTITY', () => {
      expect(COMPACT_CORE_IDENTITY.length).toBeLessThan(CHIMERA_CORE_IDENTITY.length);
    });

    it('drops decorative "# Section" headers used by the frontier prompt', () => {
      const frontierHasHeaders = /^#\s+\w/m.test(CHIMERA_CORE_IDENTITY);
      const compactHasHeaders = /^#\s+\w/m.test(COMPACT_CORE_IDENTITY);
      expect(frontierHasHeaders).toBe(true);
      expect(compactHasHeaders).toBe(false);
    });

    it('closes with the drift sentinel and retains the pact opener', () => {
      expect(COMPACT_CORE_IDENTITY.trimStart()).toMatch(/^\[!\] CHIMERA CORE PACT \[!\]/);
      expect(COMPACT_CORE_IDENTITY.trimEnd()).toMatch(/\[!\] AS YOU WISH \[!\]$/);
    });

    it('states a single ask-one-question rule (no proactive/ask contradiction)', () => {
      const mentionsQuestion = /ask.{0,40}question/gi.test(COMPACT_CORE_IDENTITY);
      const mentionsBeProactive = /be proactive/i.test(COMPACT_CORE_IDENTITY);
      expect(mentionsQuestion).toBe(true);
      expect(mentionsBeProactive).toBe(false);
    });
  });

  describe('compactAgentPrompt', () => {
    it('returns a writer prompt that is shorter than the frontier writer prompt', () => {
      const compact = compactAgentPrompt('writer');
      expect(compact.length).toBeLessThan(AGENT_PROMPTS.writer.system.length);
    });

    it('writer and reviewer compact prompts close with the drift sentinel', () => {
      expect(compactAgentPrompt('writer').trimEnd()).toMatch(/\[!\] AS YOU WISH \[!\]$/);
      expect(compactAgentPrompt('reviewer').trimEnd()).toMatch(/\[!\] AS YOU WISH \[!\]$/);
    });

    it('writer prompt keeps the read-before-editing mandate', () => {
      expect(compactAgentPrompt('writer').toLowerCase()).toContain('read every file before editing');
    });

    it('defers non-compacted roles to the full AGENT_PROMPTS system text', () => {
      const roles = ['challenger', 'synthesizer', 'planner', 'researcher', 'summarizer'] as const;
      for (const role of roles) {
        expect(compactAgentPrompt(role)).toBe(AGENT_PROMPTS[role].system);
      }
    });
  });

  describe('SMALL_MODEL_GUIDANCE', () => {
    it('instructs single best action and minimal valid JSON', () => {
      expect(SMALL_MODEL_GUIDANCE.toLowerCase()).toContain('one best action');
      expect(SMALL_MODEL_GUIDANCE.toLowerCase()).toContain('valid json');
    });

    it('is short enough for a small-model context window', () => {
      expect(SMALL_MODEL_GUIDANCE.length).toBeLessThan(400);
    });
  });

  describe('frontier tier integrity', () => {
    it('CHIMERA_CORE_IDENTITY and AGENT_PROMPTS remain unchanged (Stream A dependency)', () => {
      expect(CHIMERA_CORE_IDENTITY).toContain('CHIMERA CORE PACT');
      expect(AGENT_PROMPTS.writer.system).toContain('READ BEFORE WRITING');
      expect(AGENT_PROMPTS.reviewer.system).toContain('introduces tight coupling');
    });
  });
});
