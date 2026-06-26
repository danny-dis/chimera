import { describe, it, expect } from 'vitest';
import { SecretDetector } from '../secret-detector.js';

describe('SecretDetector', () => {
  const detector = new SecretDetector();

  it('should detect AWS Access Key', () => {
    const text = 'My key is AKIA1234567890ABCDEF';
    const matches = detector.detectSecrets(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('AWS_ACCESS_KEY');
    expect(matches[0].value).toBe('AKIA1234567890ABCDEF');
  });

  it('should detect OpenAI API Key', () => {
    const text = 'export OPENAI_API_KEY=sk-1234567890abcdef1234567890abcdef1234567890abcdef';
    const matches = detector.detectSecrets(text);
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('OPENAI_API_KEY');
  });

  it('should redact secrets', () => {
    const text = 'AWS: AKIA1234567890ABCDEF, GitHub: ghp_1234567890abcdef1234567890abcdef1234';
    const redacted = detector.redactSecrets(text);
    expect(redacted).toContain('[REDACTED AWS_ACCESS_KEY]');
    expect(redacted).toContain('[REDACTED GITHUB_PAT]');
    expect(redacted).not.toContain('AKIA');
    expect(redacted).not.toContain('ghp_');
  });

  it('should detect generic secrets in assignments', () => {
    const text = 'const db_password = "super-secret-password-123"';
    const matches = detector.detectSecrets(text);
    expect(matches.some(m => m.type === 'GENERIC_SECRET')).toBe(true);
    expect(detector.redactSecrets(text)).toContain('[REDACTED GENERIC_SECRET]');
  });
});
