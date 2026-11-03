import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
export function run(command: string, args: string[], env = process.env): void {
  // Windows cannot execute npm.cmd/npx.cmd with shell:false. Invoke the npm
  // JavaScript entry points directly, preserving argument boundaries.
  const npmEntry = env.npm_execpath;
  const npmCommand = (command === 'npm' || command === 'npx') && npmEntry;
  const executable = npmCommand ? process.execPath : command;
  const commandArgs = npmCommand ? [command === 'npx' ? join(dirname(npmEntry), 'npx-cli.js') : npmEntry, ...args] : args;
  const result = spawnSync(executable, commandArgs, { stdio: 'inherit', env, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
