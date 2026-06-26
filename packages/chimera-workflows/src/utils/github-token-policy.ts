/**
 * Per-user GitHub token policy for workflow env resolution.
 */

/**
 * Resolve GitHub token overrides for per-user mode.
 * When per-user is enabled and a user has a token, routes through their token.
 * When per-user is enabled but no user token, scrubs the bot token.
 */
export function resolveGithubTokenOverrides(
  perUserEnabled: boolean,
  userId: string | undefined,
  userToken: string | undefined,
): Record<string, string> {
  if (!perUserEnabled) return {};
  if (userId && userToken) {
    return { GH_TOKEN: userToken, GITHUB_TOKEN: userToken };
  }
  // Per-user enabled but no token — scrub bot token
  if (perUserEnabled && !userToken) {
    return { GH_TOKEN: '', GITHUB_TOKEN: '' };
  }
  return {};
}
