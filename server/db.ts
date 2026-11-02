import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
process.env.DATABASE_URL ??= 'postgresql://metodo:metodo_local_only@127.0.0.1:5432/metodo';
export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
