import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { RuntimePg } from './runtime-adapter.js';
process.env.DATABASE_URL ??= 'postgresql://metodo:metodo_local_only@127.0.0.1:5432/metodo';
export const db = new PrismaClient({ adapter: new RuntimePg({ connectionString: process.env.DATABASE_URL }) });
