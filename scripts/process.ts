import { spawnSync } from 'node:child_process';
export function run(command: string, args: string[], env = process.env): void {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
