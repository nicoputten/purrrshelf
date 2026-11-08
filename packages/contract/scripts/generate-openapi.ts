import { writeFileSync } from 'node:fs';
import { buildOpenApi } from '../src/openapi.js';

const doc = buildOpenApi('1.0.0');
writeFileSync(new URL('../openapi.json', import.meta.url), `${JSON.stringify(doc, null, 2)}\n`);
