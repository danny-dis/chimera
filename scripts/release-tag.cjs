const { execFileSync: execute } = require('node:child_process');

module.exports = function releaseTag(version, sha, { pin = false, execFileSync = execute } = {}) {
  if (!/^[0-9A-Za-z.+-]+$/.test(version) || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('Invalid release tag or commit');
  }
  const ref = `refs/tags/v${version}`;
  const options = { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] };
  if (pin) {
    try {
      execFileSync('git', ['push', 'origin', `${sha}:${ref}`], options);
    } catch {
      // An existing annotated tag or ambiguous push failure still requires verification.
    }
  }
  let remote;
  try {
    remote = execFileSync('git', ['ls-remote', '--exit-code', '--tags', 'origin', ref, `${ref}^{}`], options);
  } catch (error) {
    if (!pin && error.status === 2) return;
    throw error;
  }
  const tags = new Map();
  for (const line of remote.trim().split(/\r?\n/)) {
    const row = /^([0-9a-f]{40})\t(.+)$/.exec(line);
    if (!row || ![ref, `${ref}^{}`].includes(row[2]) || tags.has(row[2])) {
      throw new Error('Malformed release tag response');
    }
    tags.set(row[2], row[1]);
  }
  if (!tags.has(ref) || (tags.get(`${ref}^{}`) || tags.get(ref)) !== sha) {
    throw new Error('Release tag does not match the checked-out commit');
  }
};
