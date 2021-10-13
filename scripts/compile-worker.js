#!/usr/bin/env node
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['./sqlite-viewer-app/src/worker.js'],
  bundle: true,
  define: {
    'process.env.NODE_ENV': "'production'"
  },
  external: ['fs', 'path'],
  outfile: './sqlite-viewer-app/public/bundle-worker.js',
  minify: true,
  tsconfig: './sqlite-viewer-app/tsconfig.json',
}).catch(() => process.exit(1));