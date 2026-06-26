import { describe, it, expect } from 'vitest';
import { EnvironmentFilter } from '../sandbox/env-filter.js';

describe('EnvironmentFilter', () => {
  describe('default blocking', () => {
    it('blocks secret-containing variable names', () => {
      const filter = new EnvironmentFilter();

      expect(filter.isSecretVar('PASSWORD')).toBe(true);
      expect(filter.isSecretVar('MY_SECRET')).toBe(true);
      expect(filter.isSecretVar('API_TOKEN')).toBe(true);
      expect(filter.isSecretVar('PRIVATE_KEY')).toBe(true);
      expect(filter.isSecretVar('DB_CREDENTIAL')).toBe(true);
      expect(filter.isSecretVar('AUTH_HEADER')).toBe(true);
    });

    it('allows safe variable names', () => {
      const filter = new EnvironmentFilter();

      expect(filter.isSecretVar('PATH')).toBe(false);
      expect(filter.isSecretVar('HOME')).toBe(false);
      expect(filter.isSecretVar('USER')).toBe(false);
      expect(filter.isSecretVar('LANG')).toBe(false);
      expect(filter.isSecretVar('TERM')).toBe(false);
    });
  });

  describe('filter', () => {
    it('removes blocked variables from env', () => {
      const filter = new EnvironmentFilter();
      const env = {
        PATH: '/usr/bin',
        HOME: '/home/user',
        PASSWORD: 'secret123',
        API_TOKEN: 'token123',
        USER: 'user',
      };

      const filtered = filter.filter(env);

      expect(filtered).toHaveProperty('PATH');
      expect(filtered).toHaveProperty('HOME');
      expect(filtered).toHaveProperty('USER');
      expect(filtered).not.toHaveProperty('PASSWORD');
      expect(filtered).not.toHaveProperty('API_TOKEN');
    });

    it('preserves allowed variables', () => {
      const filter = new EnvironmentFilter();
      const env = {
        NODE_ENV: 'production',
        CI: 'true',
        DEBUG: 'app:*',
      };

      const filtered = filter.filter(env);

      expect(filtered).toEqual(env);
    });
  });

  describe('custom allowlist', () => {
    it('filters variables matching custom blocked patterns while keeping safe ones', () => {
      const filter = new EnvironmentFilter({
        blockedPatterns: [/^SECRET_/i, /^PRIVATE_/i],
      });

      const env = {
        PATH: '/usr/bin',
        HOME: '/home/user',
        SECRET_VAR: 'should_be_filtered',
        PRIVATE_KEY: 'should_be_filtered',
        NORMAL_VAR: 'value',
      };

      const filtered = filter.filter(env);

      expect(filtered).toHaveProperty('PATH');
      expect(filtered).toHaveProperty('HOME');
      expect(filtered).toHaveProperty('NORMAL_VAR');
      expect(filtered).not.toHaveProperty('SECRET_VAR');
      expect(filtered).not.toHaveProperty('PRIVATE_KEY');
    });
  });

  describe('custom blocklist', () => {
    it('blocks additional variables', () => {
      const filter = new EnvironmentFilter({
        blockedVars: ['CUSTOM_SECRET', 'INTERNAL_KEY'],
      });

      expect(filter.isSecretVar('CUSTOM_SECRET')).toBe(true);
      expect(filter.isSecretVar('INTERNAL_KEY')).toBe(true);
      expect(filter.isSecretVar('SAFE_VAR')).toBe(false);
    });
  });

  describe('custom patterns', () => {
    it('blocks variables matching custom patterns', () => {
      const filter = new EnvironmentFilter({
        blockedPatterns: [/^INTERNAL_/i, /_PRIVATE$/i],
      });

      expect(filter.isSecretVar('INTERNAL_CONFIG')).toBe(true);
      expect(filter.isSecretVar('MY_PRIVATE')).toBe(true);
      expect(filter.isSecretVar('NORMAL_VAR')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty env', () => {
      const filter = new EnvironmentFilter();
      const filtered = filter.filter({});

      expect(filtered).toEqual({});
    });

    it('handles case-insensitive matching', () => {
      const filter = new EnvironmentFilter();

      expect(filter.isSecretVar('password')).toBe(true);
      expect(filter.isSecretVar('Password')).toBe(true);
      expect(filter.isSecretVar('PASSWORD')).toBe(true);
    });

    it('handles partial matches in variable names', () => {
      const filter = new EnvironmentFilter();

      expect(filter.isSecretVar('MY_PASSWORD_HASH')).toBe(true);
      expect(filter.isSecretVar('DB_SECRET_KEY')).toBe(true);
      expect(filter.isSecretVar('AUTH_TOKEN_VALUE')).toBe(true);
    });
  });
});
