import esbuild, { BuildOptions } from "esbuild";
import { polyfillNode } from "esbuild-plugin-polyfill-node";

import URL from 'url';
import path from 'path'

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolve = (...args: string[]) => path.resolve(__dirname, '..', ...args);

const DEV = !!import.meta.env.DEV;
console.log({ DEV })
const outDir = resolve('out')

function envToDefine(env: Record<string, any>): Record<`import.meta.env.${string}`, string> {
  const res =  Object.fromEntries(Object.entries(env).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]))
  console.log(res)
  return res;
}

const config = {
  bundle: true,
  minify: !DEV,
  sourcemap: DEV,
} satisfies BuildOptions;

const baseConfig = {
  ...config,
  entryPoints: [resolve('src/extension.ts')],
  format: 'cjs' as const,
  target: 'es2022',
  external: ['vscode'] as const,
  define: {
    ...envToDefine({
      DEV,
      VITE_VSCODE: true,
    }),
  },
} satisfies BuildOptions;

const baseWorkerConfig = {
  ...config,
  entryPoints: [resolve('src/worker.ts')],
  format: 'esm' as const,
  target: 'es2022',
  define: {
    ...envToDefine({
      DEV,
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
    alias: {
      '@workers/v8-value-serializer/v8': 'node:v8',
    },
    define: {
      ...baseConfig.define,
      ...envToDefine({
        DEV,
        VSCODE_BROWSER_EXT: false,
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
      'process',
      'worker_threads',
      'child_process',
      'os',
      'fs',
      'path',
      'stream',
      'stream/web',
      'node-fetch',
    ],
    alias: {
      'path': resolve('src/noop.js'),
    },
    define: {
      ...baseConfig.define,
      ...envToDefine({
        DEV,
        VSCODE_BROWSER_EXT: true,
      }),
    },
    plugins: [
      polyfillNode({
        polyfills: {
          buffer: true,
        }
      })
    ],
  });

const compileNodeWorker = () =>
  esbuild.build({
    ...baseWorkerConfig,
    outfile: resolve(outDir, 'worker.js'),
    platform: 'node',
    alias: {
      '@workers/v8-value-serializer/v8': 'node:v8',
    },
    define: {
      ...baseWorkerConfig.define,
      ...envToDefine({
        DEV,
        VSCODE_BROWSER_EXT: false,
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
    define: {
      ...baseWorkerConfig.define,
      ...envToDefine({
        DEV,
        VSCODE_BROWSER_EXT: true,
      })
    },
    plugins: [
      polyfillNode({
        polyfills: {}
      })
    ]
  });

const compileExt = async (target?: string) => {
  const isWeb = target === 'web';
  await Promise.all([
    ...isWeb ? [] : [compileNodeMain()],
    ...[compileBrowserMain()],
    ...isWeb ? [] : [compileNodeWorker()],
    ...[compileBrowserWorker()],
  ]);
};

if (import.meta.main) {
  const target = process.env.VSCODE_EXT_TARGET
  compileExt(target).then(() => {
    console.log('Compilation completed.');
  }).catch((error) => {
    console.error('Compilation failed.');
  });
}
