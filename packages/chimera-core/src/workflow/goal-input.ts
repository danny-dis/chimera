export function parseGoalInput(input: string): { task: string; verificationCommands: string[] } {
  const verificationCommands: string[] = [];
  const flag = /(?:^|\s)--verify\s+("(?:\\.|[^"\\])*"|'[^']*'|[^\s"']+)/g;
  const task = input.replace(flag, (_match, quoted: string) => {
    const command = quoted.startsWith('"') ? quoted.slice(1, -1).replace(/\\(["\\])/g, '$1')
      : quoted.startsWith("'") ? quoted.slice(1, -1) : quoted;
    if (!command.trim()) throw new Error('--verify requires a nonempty command');
    verificationCommands.push(command);
    return '';
  }).trim();
  if (/(?:^|\s)--verify(?:\s|$)/.test(task)) throw new Error('--verify requires a complete quoted command');
  return { task, verificationCommands };
}
