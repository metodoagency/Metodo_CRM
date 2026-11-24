import { db } from '../server/db.js';
import { protectLegacyContractLinks } from '../server/contract-evidence.js';
try { console.log(JSON.stringify(await protectLegacyContractLinks(db))); } finally { await db.$disconnect(); }
