import { run } from './process.js';
run('npx', ['tsc', '--noEmit']);
// A development .env must not select React's development runtime in a release.
run('npx', ['vite', 'build'], { ...process.env, NODE_ENV: 'production' });
run('npx', ['tsc', '-p', 'tsconfig.server.json']);
