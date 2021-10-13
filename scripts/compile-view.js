#!/usr/bin/env node
const esbuild = require('esbuild');
const alias = require('esbuild-plugin-alias');
const path = require('path');
const cssModulesPlugin = require('esbuild-css-modules-plugin');

esbuild.build({
  entryPoints: ['./sqlite-viewer-app/src/index.js'],
  loader: { '.js': 'jsx' },
  bundle: true,
  define: {
    'process.env.NODE_ENV': "'production'"
  },
  external: ['worker-loader!./worker.js'],
  outfile: './sqlite-viewer-app/public/bundle.js',
  minify: true,
  tsconfig: './sqlite-viewer-app/tsconfig.json',
  plugins: [
    alias({
      './index.css': path.resolve('./sqlite-viewer-app/src/vscode.css'),
      './uilib': path.resolve('./sqlite-viewer-app/src/uilib20.js'),
    }),
    cssModulesPlugin({})
  ]
}).catch(() => process.exit(1));