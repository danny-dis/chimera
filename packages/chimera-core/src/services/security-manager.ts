// =============================================================================
// SecurityManager — capability permissions, command policy, secret isolation,
// and sandbox configuration for secure agent execution.
// =============================================================================

export interface CapabilityPermission {
  capability: string;
  allowed: boolean;
  reason?: string;
}

export interface CommandPolicy {
  command: string;
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
}

export interface SecretIsolationConfig {
  /** Whether to isolate secrets from agent context */
  enabled: boolean;
  /** Patterns to redact from output */
  redactionPatterns: RegExp[];
  /** Replacement string for redacted content */
  replacement: string;
}

export interface SandboxConfig {
  /** Whether sandboxing is enabled */
  enabled: boolean;
  /** Allowed file paths (glob patterns) */
  allowedPaths: string[];
  /** Denied file paths (glob patterns) */
  deniedPaths: string[];
  /** Allowed shell commands */
  allowedCommands: string[];
  /** Network access allowed */
  networkAccess: boolean;
}

export interface SecurityConfig {
  capabilities?: Record<string, CapabilityPermission>;
  commands?: CommandPolicy[];
  secrets?: Partial<SecretIsolationConfig>;
  sandbox?: Partial<SandboxConfig>;
}

const DEFAULT_SECRET_CONFIG: SecretIsolationConfig = {
  enabled: true,
  redactionPatterns: [
    /(?:api[_-]?key|apikey|token|password|secret|credential)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi,
    /(?:Bearer|Basic)\s+[a-zA-Z0-9\-._~+/]+/g,
    /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
  ],
  replacement: '[REDACTED]',
};

const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  enabled: false,
  allowedPaths: ['**/*'],
  deniedPaths: ['**/node_modules/**', '**/.git/**', '**/secrets/**'],
  allowedCommands: ['npm', 'node', 'git', 'ls', 'cat', 'grep', 'find'],
  networkAccess: true,
};

/**
 * SecurityManager — manages security policies for agent execution.
 */
export class SecurityManager {
  private config: SecurityConfig;
  private redactionPatterns: RegExp[];

  constructor(config?: SecurityConfig) {
    this.config = config || {};
    this.redactionPatterns = this.config.secrets?.redactionPatterns ?? DEFAULT_SECRET_CONFIG.redactionPatterns;
  }

  /**
   * Check if a capability is allowed.
   */
  isCapabilityAllowed(capability: string): boolean {
    const permission = this.config.capabilities?.[capability];
    return permission?.allowed ?? true;
  }

  /**
   * Get all capability permissions.
   */
  getCapabilityPermissions(): CapabilityPermission[] {
    const capabilities = this.config.capabilities ?? {};
    return Object.entries(capabilities).map(([capability, permission]) => ({
      capability,
      ...permission,
    }));
  }

  /**
   * Check if a command is allowed.
   */
  isCommandAllowed(command: string): { allowed: boolean; requiresApproval: boolean; reason?: string } {
    const policies = this.config.commands ?? [];
    // Find the most specific matching policy
    const matchingPolicy = policies.find((p) => command.startsWith(p.command) || p.command === '*');
    if (matchingPolicy) {
      return {
        allowed: matchingPolicy.allowed,
        requiresApproval: matchingPolicy.requiresApproval,
        reason: matchingPolicy.reason,
      };
    }
    // Default: allow without approval
    return { allowed: true, requiresApproval: false };
  }

  /**
   * Validate a shell command before execution.
   */
  validateCommand(command: string): { valid: boolean; reason?: string } {
    const { allowed, requiresApproval, reason } = this.isCommandAllowed(command);
    if (!allowed) {
      return { valid: false, reason: reason || 'Command not allowed by policy' };
    }
    // Check for dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,
      /:\(\)\s*{\s*:\|:\s*&\s*}\s*;/,  // Fork bomb
      />\/dev\/sda/,
      /dd\s+if=.*of=\/dev\/sda/,
    ];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return { valid: false, reason: 'Dangerous command pattern detected' };
      }
    }
    return { valid: true, requiresApproval };
  }

  /**
   * Redact secrets from output.
   */
  redactSecrets(output: string): string {
    const enabled = this.config.secrets?.enabled ?? DEFAULT_SECRET_CONFIG.enabled;
    if (!enabled) {
      return output;
    }
    let result = output;
    for (const pattern of this.redactionPatterns) {
      result = result.replace(pattern, DEFAULT_SECRET_CONFIG.replacement);
    }
    return result;
  }

  /**
   * Check if a file path is allowed by sandbox policy.
   */
  isPathAllowed(filePath: string): boolean {
    const sandbox = this.config.sandbox ?? DEFAULT_SANDBOX_CONFIG;
    if (!sandbox.enabled) {
      return true;
    }
    // Check denied paths first
    for (const pattern of sandbox.deniedPaths) {
      if (this.matchGlob(filePath, pattern)) {
        return false;
      }
    }
    // Check allowed paths
    for (const pattern of sandbox.allowedPaths) {
      if (this.matchGlob(filePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if network access is allowed.
   */
  isNetworkAccessAllowed(): boolean {
    return this.config.sandbox?.networkAccess ?? DEFAULT_SANDBOX_CONFIG.networkAccess;
  }

  /**
   * Get sandbox configuration.
   */
  getSandboxConfig(): SandboxConfig {
    return { ...DEFAULT_SANDBOX_CONFIG, ...this.config.sandbox };
  }

  /**
   * Create a security context for an agent run.
   */
  createContext(agentId: string): SecurityContext {
    return {
      agentId,
      allowedCapabilities: Object.entries(this.config.capabilities ?? {})
        .filter(([, p]) => p.allowed)
        .map(([c]) => c),
      redactionEnabled: this.config.secrets?.enabled ?? DEFAULT_SECRET_CONFIG.enabled,
      sandboxEnabled: this.config.sandbox?.enabled ?? DEFAULT_SANDBOX_CONFIG.enabled,
    };
  }

  private matchGlob(path: string, pattern: string): boolean {
    // Simple glob matching
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(path);
  }
}

export interface SecurityContext {
  agentId: string;
  allowedCapabilities: string[];
  redactionEnabled: boolean;
  sandboxEnabled: boolean;
}
