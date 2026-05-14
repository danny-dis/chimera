import { execFile } from 'node:child_process';

export async function runExternalAgent(command, input, { cwd = process.cwd(), timeoutMs = 120_000 } = {}) {
  if (!command) return null;
  const [file, ...args] = splitCommand(command);
  if (!file) return null;

  return new Promise((resolve, reject) => {
    const child = execFile(file, args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 2_000_000,
      env: process.env,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`external agent command failed: ${error.message}${stderr ? `\n${stderr.slice(0, 1000)}` : ''}`));
        return;
      }
      resolve(`${stdout}${stderr ? `\n\n[stderr]\n${stderr}` : ''}`.trim());
    });
    child.stdin?.end(input);
  });
}

function splitCommand(command) {
  const tokens = [];
  let current = '';
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}
