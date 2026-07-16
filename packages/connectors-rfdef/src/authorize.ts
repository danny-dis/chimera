/**
 * DEFENSIVE BOUNDARY.
 *
 * Every identified RF device (MAC/BSSID) MUST match an authorized prefix before
 * it can become an emitted ARGUS object. Anything else is rejected and never
 * leaves this package. This is the core safety property of the connector:
 * we only ever model the operator's OWN authorized RF environment.
 */

/** Normalize a MAC/OUI string to uppercase, trimmed, with no whitespace. */
export function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase();
}

/**
 * Case-insensitive prefix match against an allow-list of OUIs or partial/full
 * MACs. e.g. authorizedPrefixes ['DE:AD:BE', 'AA:BB'] accepts
 * 'de:ad:be:ef:00:01' and 'AA:BB:CC:DD:EE:FF' but rejects '11:22:33:44:55:66'.
 *
 * A prefix may be written with colons ('DE:AD:BE') or as raw hex ('DEADBE');
 * both are accepted and compared against the sanitized MAC.
 */
export function isAuthorizedMac(mac: string, authorizedPrefixes: string[]): boolean {
  if (!mac) return false;
  const norm = normalizeMac(mac).replace(/\s+/g, '');
  const hex = norm.replace(/:/g, '');
  return authorizedPrefixes.some((raw) => {
    const p = normalizeMac(raw).replace(/\s+/g, '');
    if (p.length === 0) return false;
    if (p.includes(':')) {
      return norm.startsWith(p);
    }
    // Raw hex OUI/prefix form.
    return hex.startsWith(p.replace(/:/g, ''));
  });
}
