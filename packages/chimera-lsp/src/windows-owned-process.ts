import path from 'node:path';

export function ownedWindowsProcess(command: string, args: string[], windowsVerbatimArguments = false, nodeOptions?: string) {
  return {
    command: process.execPath,
    args: [path.join(__dirname, 'windows-owned-process-host.cjs'), JSON.stringify({ command, args, windowsVerbatimArguments, nodeOptions })],
    windowsVerbatimArguments: false,
  };
}
