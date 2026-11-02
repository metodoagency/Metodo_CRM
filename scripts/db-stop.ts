import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
if (existsSync('.local/postgres/postmaster.pid')) {
  const pid = Number(readFileSync('.local/postgres/postmaster.pid', 'utf8').split('\n')[0]);
  if (pid > 0) process.kill(pid, 'SIGTERM');
} else spawnSync('docker', ['compose', 'stop', 'db'], { stdio: 'inherit' });
