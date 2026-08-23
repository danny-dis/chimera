/**
 * Pin TEMP/TMP for the vitest process. Tests replace process.env wholesale
 * (`process.env = { ...originalEnv }`) before calling os.tmpdir(); in shells
 * that don't export TEMP (some CI / MSYS setups), os.tmpdir() then resolves
 * to garbage like `undefined\temp` and mkdtempSync throws ENOENT. Capturing
 * and re-pinning a sane temp dir up front keeps those tests hermetic.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function resolveSafeTmp(): string {
  const candidates = [process.env.TEMP, process.env.TMP].filter(
    (v): v is string => typeof v === 'string' && v.length > 2 && v !== 'undefined' && !v.startsWith('undefined'),
  );
  for (const c of candidates) {
    try {
      fs.accessSync(c, fs.constants.W_OK);
      return c;
    } catch {
      /* try next */
    }
  }
  const homeTmp = path.join(os.homedir(), 'AppData', 'Local', 'Temp');
  fs.mkdirSync(homeTmp, { recursive: true });
  return homeTmp;
}

const safe = resolveSafeTmp();
process.env.TEMP = safe;
process.env.TMP = safe;
