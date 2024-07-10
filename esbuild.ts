import esbuild, { BuildOptions } from "esbuild";
import { polyfillNode } from "esbuild-plugin-polyfill-node";

import URL from 'url';
import path from 'path'

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolve = (...args: string[]) => path.resolve(__dirname, ...args);

const DEV = !!import.meta.env.DEV;
console.log({ DEV })
const outDir = resolve('out')

function envToDefine(env: Record<string, any>): Record<`import.meta.env.${string}`, string> {
  return Object.fromEntries(Object.entries(env).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]))
}

const baseConfig = {
  entryPoints: [resolve('src/extension.ts')],
  bundle: true,
  format: 'cjs' as const,
  external: ['vscode'] as const,
  define: {
    ...envToDefine({
      VITE_VSCODE: true,
    }),
  },
} satisfies BuildOptions;

const baseWorkerConfig = {
  entryPoints: [resolve('src/worker.ts')],
  bundle: true,
  format: 'iife' as const,
  define: {
    ...envToDefine({
      VITE_VSCODE: true,
    }),
    'import.meta.url': '"file:./sqlite-viewer-core/vscode/build/assets/"',
  },
} satisfies BuildOptions;

const compileNodeMain = () =>
  esbuild.build({
    ...baseConfig,
    outfile: resolve(outDir, 'extension.js'),
    platform: 'node',
    minify: !DEV,
    sourcemap: DEV,
    define: {
      ...baseConfig.define,
      ...envToDefine({
        BROWSER_EXT: false,
      }),
    }
  });

const compileBrowserMain = () =>
  esbuild.build({
    ...baseConfig,
    outfile: resolve(outDir, 'extension-browser.js'),
    platform: 'browser',
    mainFields: ['browser', 'module', 'main'],
    external: [
      ...baseConfig.external,
      'worker_threads',
      'child_process',
      'fs',
      'path',
      'stream',
      'stream/web',
      'node-fetch',
    ],
    alias: {
      'path': resolve('src/noop.js'),
    },
    minify: !DEV,
    sourcemap: DEV,
    define: {
      ...baseConfig.define,
      ...envToDefine({
        BROWSER_EXT: true,
      }),
    },
    // plugins: [
    //   polyfillNode({
    //     polyfills: {}
    //   })
    // ],
  });

const compileNodeWorker = () =>
  esbuild.build({
    ...baseWorkerConfig,
    outfile: resolve(outDir, 'worker.js'),
    platform: 'node',
    minify: !DEV,
    sourcemap: DEV,
    define: {
      ...baseWorkerConfig.define,
      ...envToDefine({
        BROWSER_EXT: false,
      })
    },
  });

const compileBrowserWorker = () =>
  esbuild.build({
    ...baseWorkerConfig,
    outfile: resolve(outDir, 'worker-browser.js'),
    platform: 'browser',
    mainFields: ['browser', 'module', 'main'],
    external: ['fs/promises', 'path'],
    minify: !DEV,
    sourcemap: DEV,
    define: {
      ...baseWorkerConfig.define,
      ...envToDefine({
        BROWSER_EXT: true,
      })
    },
    plugins: [
      // @ts-ignore
      polyfillNode({
        polyfills: {}
      })
    ]
  });

const compileExt = async () => {
  await Promise.all([
    compileNodeMain(),
    compileBrowserMain(),
    compileNodeWorker(),
    compileBrowserWorker(),
  ]);
};

compileExt().then(() => {
  console.log('Compilation completed.');
}).catch((error) => {
  console.error('Compilation failed.');
});
