import { writeFileSync } from 'node:fs';
import { openapiDocument } from '../server/openapi.js';
writeFileSync('docs/openapi.json', JSON.stringify(openapiDocument(), null, 2) + '\n');
console.log('Generated docs/openapi.json; served at /api/docs (owner session required)');
