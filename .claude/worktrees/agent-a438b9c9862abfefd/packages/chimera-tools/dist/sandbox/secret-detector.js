"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretDetector = void 0;
const zod_1 = require("zod");
const SecretDetectionResultSchema = zod_1.z.object({
    found: zod_1.z.boolean(),
    secrets: zod_1.z.array(zod_1.z.object({
        type: zod_1.z.string(),
        location: zod_1.z.string(),
        maskedValue: zod_1.z.string(),
    })),
});
class SecretDetector {
    patterns;
    constructor() {
        this.patterns = new Map();
        this.registerBuiltInPatterns();
    }
    scan(text) {
        const secrets = [];
        for (const [name, pattern] of this.patterns) {
            const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
            let match;
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
    maskSecrets(text) {
        const result = this.scan(text);
        if (!result.found)
            return text;
        let masked = text;
        const sortedSecrets = [...result.secrets].sort((a, b) => parseInt(b.location.split(':')[1], 10) - parseInt(a.location.split(':')[1], 10));
        for (const secret of sortedSecrets) {
            const index = parseInt(secret.location.split(':')[1], 10);
            const originalValue = text.slice(index, index + secret.maskedValue.length + 4);
            masked = masked.replace(originalValue, secret.maskedValue);
        }
        return masked;
    }
    addPattern(name, pattern) {
        this.patterns.set(name, pattern);
    }
    registerBuiltInPatterns() {
        this.patterns.set('aws_access_key', /AKIA[0-9A-Z]{16}/g);
        this.patterns.set('aws_secret_key', /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g);
        this.patterns.set('github_token', /ghp_[a-zA-Z0-9]{36}/g);
        this.patterns.set('generic_api_key', /api[_-]?key[\s:=]+['"]?[a-zA-Z0-9]{20,}/gi);
        this.patterns.set('private_key', /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/g);
        this.patterns.set('password_env', /(?:PASSWORD|PASSWD|PWD)[\s:=]+['"]?[^\s'"]{4,}/gi);
        this.patterns.set('connection_string', /(?:mongodb|postgres|mysql|redis):\/\/[^\s]+:[^\s]+@[^\s]+/gi);
        this.patterns.set('generic_secret', /(?:secret|token|credential)[\s:=]+['"]?[a-zA-Z0-9+/=]{16,}/gi);
    }
    maskValue(value, type) {
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
    deduplicateSecrets(secrets) {
        const seen = new Set();
        return secrets.filter((s) => {
            if (seen.has(s.index))
                return false;
            seen.add(s.index);
            return true;
        });
    }
}
exports.SecretDetector = SecretDetector;
//# sourceMappingURL=secret-detector.js.map