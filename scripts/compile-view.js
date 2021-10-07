#!/usr/bin/env node
const esbuild = require('esbuild');
const alias = require('esbuild-plugin-alias');
const cssModulesPlugin = require('esbuild-css-modules-plugin');

esbuild.build({
  entryPoints: ['./sqlite-viewer-app/src/index.js'],
  loader: { '.js': 'jsx' },
  bundle: true,
  define: {
    'process.evn.NODE_ENV': "'production'"
  },
  external: ['worker-loader!./worker.js'],
  outfile: './sqlite-viewer-app/public/bundle.js',
  minify: true,
  plugins: [
    alias({
      './uilib': require('path').resolve('./sqlite-viewer-app/src/uilib20.js'),
    }),
    cssModulesPlugin({})
  ]
}).catch(() => process.exit(1));