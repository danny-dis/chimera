/**
 * Per-user GitHub token policy for workflow env resolution.
 */
/**
 * Resolve GitHub token overrides for per-user mode.
 * When per-user is enabled and a user has a token, routes through their token.
 * When per-user is enabled but no user token, scrubs the bot token.
 */
export declare function resolveGithubTokenOverrides(perUserEnabled: boolean, userId: string | undefined, userToken: string | undefined): Record<string, string>;
//# sourceMappingURL=github-token-policy.d.ts.map