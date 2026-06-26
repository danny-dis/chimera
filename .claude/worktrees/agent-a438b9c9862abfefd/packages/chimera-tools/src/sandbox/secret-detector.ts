import { z } from 'zod';

const SecretDetectionResultSchema = z.object({
  found: z.boolean(),
  secrets: z.array(
    z.object({
      type: z.string(),
      location: z.string(),
      maskedValue: z.string(),
    }),
  ),
});

export type SecretDetectionResult = z.infer<typeof SecretDetectionResultSchema>;

interface DetectedSecret {
  type: string;
  location: string;
  value: string;
  index: number;
}

export class SecretDetector {
  private patterns: Map<string, RegExp>;

  constructor() {
    this.patterns = new Map();
    this.registerBuiltInPatterns();
  }

  scan(text: string): SecretDetectionResult {
    const secrets: DetectedSecret[] = [];

    for (const [name, pattern] of this.patterns) {
      const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        secrets.push({
          type: name,
          location: `offset:${match.index}`,
          value: match[0],
          index: match.index,
        });
      }
    }

    secrets.sort((a, b) => a.index - b.index);

    const uniqueSecrets = this.deduplicateSecrets(secrets);

    return {
      found: uniqueSecrets.length > 0,
      secrets: uniqueSecrets.map((s) => ({
        type: s.type,
        location: s.location,
        maskedValue: this.maskValue(s.value, s.type),
      })),
    };
  }

  maskSecrets(text: string): string {
    const result = this.scan(text);
    if (!result.found) return text;

    let masked = text;
    const sortedSecrets = [...result.secrets].sort(
      (a, b) => parseInt(b.location.split(':')[1], 10) - parseInt(a.location.split(':')[1], 10),
    );

    for (const secret of sortedSecrets) {
      const index = parseInt(secret.location.split(':')[1], 10);
      const originalValue = text.slice(index, index + secret.maskedValue.length + 4);
      masked = masked.replace(originalValue, secret.maskedValue);
    }

    return masked;
  }

  addPattern(name: string, pattern: RegExp): void {
    this.patterns.set(name, pattern);
  }

  private registerBuiltInPatterns(): void {
    this.patterns.set('aws_access_key', /AKIA[0-9A-Z]{16}/g);
    this.patterns.set('aws_secret_key', /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g);
    this.patterns.set('github_token', /ghp_[a-zA-Z0-9]{36}/g);
    this.patterns.set('generic_api_key', /api[_-]?key[\s:=]+['"]?[a-zA-Z0-9]{20,}/gi);
    this.patterns.set('private_key', /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/g);
    this.patterns.set('password_env', /(?:PASSWORD|PASSWD|PWD)[\s:=]+['"]?[^\s'"]{4,}/gi);
    this.patterns.set('connection_string', /(?:mongodb|postgres|mysql|redis):\/\/[^\s]+:[^\s]+@[^\s]+/gi);
    this.patterns.set('generic_secret', /(?:secret|token|credential)[\s:=]+['"]?[a-zA-Z0-9+/=]{16,}/gi);
  }

  private maskValue(value: string, type: string): string {
    if (value.length <= 8) {
      return '***';
    }

    const visible = Math.min(4, Math.floor(value.length / 4));
    const prefix = value.slice(0, visible);
    const suffix = value.slice(-visible);

    switch (type) {
      case 'aws_access_key':
        return `${prefix}...${suffix}`;
      case 'github_token':
        return `${prefix}...${suffix}`;
      case 'private_key':
        return '-----BEGIN PRIVATE KEY----- [REDACTED]';
      case 'connection_string':
        return value.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
      default:
        return `${prefix}***${suffix}`;
    }
  }

  private deduplicateSecrets(secrets: DetectedSecret[]): DetectedSecret[] {
    const seen = new Set<number>();
    return secrets.filter((s) => {
      if (seen.has(s.index)) return false;
      seen.add(s.index);
      return true;
    });
  }
}
