/// <reference types="bun-types" />

import fs from 'node:fs/promises';

await fs.mkdir('src/vendor', { recursive: true });
await fs.copyFile('node_modules/file-type/supported.js', 'src/vendor/file-type-supported.ts');
console.log('Copied file-type extensions to src/vendor/file-type-supported.ts'); 