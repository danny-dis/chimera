"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretDetector = exports.SECRET_PATTERNS = void 0;
/**
 * Patterns for common secrets and credentials.
 * Based on common formats for major cloud providers and tools.
 */
exports.SECRET_PATTERNS = {
    // Cloud Providers
    AWS_ACCESS_KEY: /AKIA[0-9A-Z]{16}/g,
    AWS_SECRET_KEY: /[0-9a-zA-Z/+]{40}/g, // Note: This can be noisy, might need context
    GOOGLE_API_KEY: /AIza[0-9A-Za-z-_]{35}/g,
    AZURE_STORAGE_KEY: /[0-9a-zA-Z+/]{86}==/g,
    // Services
    OPENAI_API_KEY: /sk-[a-zA-Z0-9]{48}/g,
    ANTHROPIC_API_KEY: /sk-ant-api03-[a-zA-Z0-9-_]{93}AA/g,
    GITHUB_PAT: /ghp_[a-zA-Z0-9]{36}/g,
    GITHUB_OAUTH: /gho_[a-zA-Z0-9]{36}/g,
    STRIPE_SK: /sk_live_[0-9a-zA-Z]{24}/g,
    SLACK_TOKEN: /xox[baprs]-[0-9a-zA-Z]{10,48}/g,
    // General
    PRIVATE_KEY: /-----BEGIN (RSA|OPENSSH|EC|PGP) PRIVATE KEY-----[\s\S]+?-----END (RSA|OPENSSH|EC|PGP) PRIVATE KEY-----/g,
    GENERIC_SECRET: /(password|secret|key|token|auth|pwd)\s*[:=]\s*["']([^"']+)["']/gi,
};
/**
 * SecretDetector identifies and redacts sensitive information from strings.
 */
class SecretDetector {
    /**
     * Detects secrets in the given text.
     */
    detectSecrets(text) {
        const rawMatches = [];
        for (const [type, pattern] of Object.entries(exports.SECRET_PATTERNS)) {
            pattern.lastIndex = 0; // Reset regex state
            let match;
            while ((match = pattern.exec(text)) !== null) {
                // For generic secrets, we want the captured value (group 2)
                const value = type === 'GENERIC_SECRET' ? match[2] : match[0];
                const index = type === 'GENERIC_SECRET' ? match.index + match[0].indexOf(match[2]) : match.index;
                // Basic entropy check or length check to reduce false positives for generic keys
                if (type === 'GENERIC_SECRET' && value.length < 8)
                    continue;
                rawMatches.push({
                    type,
                    value,
                    index,
                });
            }
        }
        // Filter out matches that are entirely contained within another match
        // This handles cases like a broad AWS_SECRET_KEY pattern matching part of an OPENAI_API_KEY
        return rawMatches.filter((m1, i) => {
            const isContained = rawMatches.some((m2, j) => {
                if (i === j)
                    return false;
                const m1End = m1.index + m1.value.length;
                const m2End = m2.index + m2.value.length;
                // m1 is contained in m2 if m2 starts before or at m1 and ends after or at m1
                const contained = m1.index >= m2.index && m1End <= m2End;
                if (contained) {
                    // If they are exactly the same, keep the one with a more specific type (not AWS_SECRET_KEY)
                    if (m1.index === m2.index && m1.value.length === m2.value.length) {
                        if (m1.type === 'AWS_SECRET_KEY' && m2.type !== 'AWS_SECRET_KEY')
                            return true;
                        return i > j; // Deduplicate by index in array if types are equally specific
                    }
                    return true;
                }
                return false;
            });
            return !isContained;
        });
    }
    /**
     * Redacts secrets from the given text.
     */
    redactSecrets(text) {
        let redactedText = text;
        const matches = this.detectSecrets(text);
        // Sort matches by index descending to redact from end to start to avoid shifting issues
        matches.sort((a, b) => b.index - a.index);
        for (const match of matches) {
            const replacement = `[REDACTED ${match.type}]`;
            redactedText =
                redactedText.slice(0, match.index) +
                    replacement +
                    redactedText.slice(match.index + match.value.length);
        }
        return redactedText;
    }
}
exports.SecretDetector = SecretDetector;
//# sourceMappingURL=secret-detector.js.map