/// <reference types="bun-types" />

import fs from 'node:fs/promises';

await fs.copyFile('node_modules/file-type/supported.js', 'src/file-type-supported.ts');
console.log('Copied file-type extensions to src/file-type-supported.ts'); 