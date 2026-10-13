import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityManager } from './security-manager.js';

describe('SecurityManager', () => {
  let sm: SecurityManager;

  beforeEach(() => {
    sm = new SecurityManager();
  });

  describe('isCapabilityAllowed', () => {
    it('allows capabilities by default', () => {
      expect(sm.isCapabilityAllowed('filesystem.read')).toBe(true);
    });

    it('respects configured permissions', () => {
      const sm2 = new SecurityManager({
        capabilities: {
          'filesystem.write': { allowed: false, reason: 'Read-only mode' },
        },
      });
      expect(sm2.isCapabilityAllowed('filesystem.write')).toBe(false);
      expect(sm2.isCapabilityAllowed('filesystem.read')).toBe(true);
    });
  });

  describe('isCommandAllowed', () => {
    it('allows commands by default', () => {
      const result = sm.isCommandAllowed('npm test');
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });

    it('respects configured policies', () => {
      const sm2 = new SecurityManager({
        commands: [
          { command: 'rm', allowed: false, requiresApproval: false, reason: 'Dangerous' },
          { command: 'git push', allowed: true, requiresApproval: true, reason: 'Needs approval' },
        ],
      });
      expect(sm2.isCommandAllowed('rm -rf /').allowed).toBe(false);
      const pushResult = sm2.isCommandAllowed('git push origin main');
      expect(pushResult.allowed).toBe(true);
      expect(pushResult.requiresApproval).toBe(true);
    });
  });

  describe('validateCommand', () => {
    it('validates safe commands', () => {
      const result = sm.validateCommand('npm test');
      expect(result.valid).toBe(true);
    });

    it('rejects dangerous commands', () => {
      const result = sm.validateCommand('rm -rf /');
      expect(result.valid).toBe(false);
    });

    it('rejects commands not allowed by policy', () => {
      const sm2 = new SecurityManager({
        commands: [{ command: 'rm', allowed: false, requiresApproval: false }],
      });
      const result = sm2.validateCommand('rm file.txt');
      expect(result.valid).toBe(false);
    });
  });

  describe('redactSecrets', () => {
    it('redacts API keys', () => {
      const output = 'api_key=abcdefghijklmnop123456';
      const result = sm.redactSecrets(output);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('abcdefghijklmnop');
    });

    it('redacts Bearer tokens', () => {
      const output = 'Authorization: Bearer secrettoken123456';
      const result = sm.redactSecrets(output);
      expect(result).not.toContain('secrettoken123456');
    });

    it('does not modify clean output', () => {
      const output = 'Hello world';
      expect(sm.redactSecrets(output)).toBe(output);
    });
  });

  describe('isPathAllowed', () => {
    it('allows all paths when sandbox is disabled', () => {
      expect(sm.isPathAllowed('/any/path')).toBe(true);
    });

    it('respects sandbox denied paths', () => {
      const sm2 = new SecurityManager({
        sandbox: {
          enabled: true,
          allowedPaths: ['src/**'],
          deniedPaths: ['secrets/**'],
          allowedCommands: [],
          networkAccess: false,
        },
      });
      expect(sm2.isPathAllowed('src/app.ts')).toBe(true);
      expect(sm2.isPathAllowed('secrets/api-key.txt')).toBe(false);
    });
  });

  describe('isNetworkAccessAllowed', () => {
    it('allows network access by default', () => {
      expect(sm.isNetworkAccessAllowed()).toBe(true);
    });

    it('respects sandbox config', () => {
      const sm2 = new SecurityManager({
        sandbox: {
          enabled: true,
          allowedPaths: [],
          deniedPaths: [],
          allowedCommands: [],
          networkAccess: false,
        },
      });
      expect(sm2.isNetworkAccessAllowed()).toBe(false);
    });
  });

  describe('createContext', () => {
    it('creates a security context', () => {
      const sm2 = new SecurityManager({
        capabilities: {
          'filesystem.read': { allowed: true },
          'filesystem.write': { allowed: false },
        },
      });
      const ctx = sm2.createContext('agent-1');
      expect(ctx.agentId).toBe('agent-1');
      expect(ctx.allowedCapabilities).toContain('filesystem.read');
      expect(ctx.allowedCapabilities).not.toContain('filesystem.write');
    });
  });
});
