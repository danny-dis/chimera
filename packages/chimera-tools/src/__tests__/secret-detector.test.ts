import { describe, it, expect } from 'vitest';
import { SecretDetector } from '../sandbox/secret-detector.js';

describe('SecretDetector', () => {
  describe('AWS keys', () => {
    it('detects AWS access keys', () => {
      const detector = new SecretDetector();
      const result = detector.scan('config: AKIAIOSFODNN7EXAMPLE');

      expect(result.found).toBe(true);
      expect(result.secrets.some((s) => s.type === 'aws_access_key')).toBe(true);
    });

    it('masks AWS access keys', () => {
      const detector = new SecretDetector();
      const masked = detector.maskSecrets('key=AKIAIOSFODNN7EXAMPLE');

      expect(masked).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(masked).toContain('AKIA');
    });
  });

  describe('GitHub tokens', () => {
    it('detects GitHub tokens', () => {
      const detector = new SecretDetector();
      const result = detector.scan('token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');

      expect(result.found).toBe(true);
      expect(result.secrets.some((s) => s.type === 'github_token')).toBe(true);
    });

    it('masks GitHub tokens', () => {
      const detector = new SecretDetector();
      const masked = detector.maskSecrets('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');

      expect(masked).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
      expect(masked).toContain('ghp_');
    });
  });

  describe('private keys', () => {
    it('detects RSA private keys', () => {
      const detector = new SecretDetector();
      const result = detector.scan('-----BEGIN RSA PRIVATE KEY-----');

      expect(result.found).toBe(true);
      expect(result.secrets.some((s) => s.type === 'private_key')).toBe(true);
    });

    it('detects EC private keys', () => {
      const detector = new SecretDetector();
      const result = detector.scan('-----BEGIN EC PRIVATE KEY-----');

      expect(result.found).toBe(true);
      expect(result.secrets.some((s) => s.type === 'private_key')).toBe(true);
    });

    it('masks private keys', () => {
      const detector = new SecretDetector();
      const masked = detector.maskSecrets('-----BEGIN RSA PRIVATE KEY-----\ndata\n-----END RSA PRIVATE KEY-----');

      expect(masked).toContain('[REDACTED]');
    });
  });

  describe('generic API keys', () => {
    it('detects API keys in various formats', () => {
      const detector = new SecretDetector();

      expect(detector.scan('api_key = abcdefghijklmnopqrstuvwx').found).toBe(true);
      expect(detector.scan('apikey: abcdefghijklmnopqrstuvwx').found).toBe(true);
      expect(detector.scan('API-KEY=abcdefghijklmnopqrstuvwx').found).toBe(true);
    });
  });

  describe('passwords in env vars', () => {
    it('detects password assignments', () => {
      const detector = new SecretDetector();

      expect(detector.scan('PASSWORD=mysecretpassword123').found).toBe(true);
      expect(detector.scan('DB_PASSWD = secret').found).toBe(true);
    });
  });

  describe('connection strings', () => {
    it('detects MongoDB connection strings with credentials', () => {
      const detector = new SecretDetector();
      const result = detector.scan('mongodb://user:password@host:27017/db');

      expect(result.found).toBe(true);
      expect(result.secrets.some((s) => s.type === 'connection_string')).toBe(true);
    });

    it('detects PostgreSQL connection strings', () => {
      const detector = new SecretDetector();
      const result = detector.scan('postgres://admin:secret@localhost:5432/mydb');

      expect(result.found).toBe(true);
    });

    it('masks connection string credentials', () => {
      const detector = new SecretDetector();
      const masked = detector.maskSecrets('mongodb://user:password@host:27017/db');

      expect(masked).toContain('mongodb://');
      expect(masked).not.toContain('user:password@');
      expect(masked).toContain('***:***@');
    });
  });

  describe('maskSecrets', () => {
    it('returns original text when no secrets found', () => {
      const detector = new SecretDetector();
      const text = 'This is safe text with no secrets';

      expect(detector.maskSecrets(text)).toBe(text);
    });

    it('masks multiple secrets', () => {
      const detector = new SecretDetector();
      const text = 'AKIAIOSFODNN7EXAMPLE and ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';

      const masked = detector.maskSecrets(text);
      expect(masked).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(masked).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
    });
  });

  describe('custom patterns', () => {
    it('adds and detects custom patterns', () => {
      const detector = new SecretDetector();
      detector.addPattern('custom_secret', /MY_CUSTOM_SECRET_[A-Z]{10}/);

      const result = detector.scan('MY_CUSTOM_SECRET_ABCDEFGHIJ');
      expect(result.found).toBe(true);
      expect(result.secrets.some((s) => s.type === 'custom_secret')).toBe(true);
    });
  });

  describe('no false positives', () => {
    it('does not flag safe text', () => {
      const detector = new SecretDetector();
      const result = detector.scan('Hello world, this is a normal string');

      expect(result.found).toBe(false);
      expect(result.secrets).toHaveLength(0);
    });
  });
});
