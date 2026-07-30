#!/usr/bin/env node
/**
 * Build-output integrity check.
 *
 * A build killed partway through (Ctrl+C, OOM, a crashed terminal) can leave
 * a file that exists, has a plausible size, and is entirely NUL bytes. tsc
 * treats such a file as up-to-date and never rewrites it, so the damage is
 * sticky: `pnpm typecheck` fails with a wall of `TS1127: Invalid character`
 * pointing at a dist file nobody edited, and `turbo` will happily serve the
 * corrupt output from cache on later runs.
 *
 * This has bitten this repo before — chimera-cli/dist and chimera-tui/dist
 * were both fully NUL-filled after an interrupted session.
 *
 * Two modes:
 *   node scripts/check-build-integrity.mjs          # report + exit 1 if corrupt
 *   node scripts/check-build-integrity.mjs --fix    # also delete the bad dirs
 *
 * Exit codes: 0 = clean, 1 = corruption found (or repaired with --fix).
 */
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const FIX = process.argv.includes('--fix');
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SCAN_EXT = /\.(js|mjs|cjs|d\.ts|json|map)$/;

/** Collect every emitted artifact under packages/ * /dist. */
function collect(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.turbo') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) collect(full, out);
    else if (SCAN_EXT.test(e.name)) out.push(full);
  }
  return out;
}

const packagesDir = join(ROOT, 'packages');
let pkgs;
try {
  pkgs = readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(packagesDir, e.name, 'dist'))
    .filter((d) => {
      try {
        return statSync(d).isDirectory();
      } catch {
        return false;
      }
    });
} catch {
  console.error(`check-build-integrity: no packages/ directory at ${packagesDir}`);
  process.exit(0);
}

const corrupt = [];
let scanned = 0;

for (const dist of pkgs) {
  for (const file of collect(dist)) {
    scanned++;
    let buf;
    try {
      buf = readFileSync(file);
    } catch {
      continue;
    }
    // A legitimate text artifact never contains a NUL byte. Empty files are
    // fine (tsc emits empty .js for type-only modules).
    if (buf.length > 0 && buf.includes(0)) corrupt.push(file);
  }
}

if (corrupt.length === 0) {
  console.log(`check-build-integrity: OK — ${scanned} build artifacts across ${pkgs.length} packages, no corruption.`);
  process.exit(0);
}

// Report by owning package so the fix is obvious.
const byPkg = new Map();
for (const f of corrupt) {
  const rel = f.slice(ROOT.length).replace(/^[\\/]/, '');
  const pkg = rel.split(/[\\/]/).slice(0, 2).join(sep);
  if (!byPkg.has(pkg)) byPkg.set(pkg, []);
  byPkg.get(pkg).push(rel);
}

console.error(`check-build-integrity: FOUND ${corrupt.length} NUL-corrupted build artifacts (of ${scanned} scanned).`);
console.error('These are the residue of an interrupted build. tsc will not rewrite them on its own.\n');
for (const [pkg, files] of byPkg) {
  console.error(`  ${pkg}  (${files.length} files)`);
  for (const f of files.slice(0, 5)) console.error(`    ${f}`);
  if (files.length > 5) console.error(`    ... and ${files.length - 5} more`);
}

if (!FIX) {
  console.error('\nRepair with:  node scripts/check-build-integrity.mjs --fix && pnpm build');
  process.exit(1);
}

const dirs = [...byPkg.keys()].map((p) => join(ROOT, p, 'dist'));
for (const d of dirs) {
  rmSync(d, { recursive: true, force: true });
  console.error(`  removed ${d}`);
}
// turbo would otherwise replay the corrupt outputs straight out of its cache.
rmSync(join(ROOT, '.turbo'), { recursive: true, force: true });
console.error('  removed .turbo (its cache holds the corrupt outputs)');
console.error('\nRepaired. Now run:  pnpm build');
process.exit(1);
