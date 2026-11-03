import { run } from './process.js';
// Generation validates env references but does not open a database connection.
run('npx', ['prisma', 'generate'], { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'postgresql://metodo:metodo_local_only@127.0.0.1:5432/metodo', DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://metodo:metodo_local_only@127.0.0.1:5432/metodo' });
