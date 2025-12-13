import type { WorkerFns } from '../sqlite-viewer-core/src/worker-db';
import type { TelemetryReporter } from '@vscode/extension-telemetry';

import * as vsc from 'vscode';
import path from 'path';

import * as Caplink from "../sqlite-viewer-core/src/caplink";
import nodeEndpoint from "../sqlite-viewer-core/src/vendor/comlink/src/node-adapter";

import { Worker } from './o/worker_threads';
import type { WorkerBundle } from './workerBundle';
import { ConfigurationSection } from './constants';
// import type { Credentials } from './credentials';

export const MB = 2 ** 20;

export function getConfiguredMaxFileSize() {
  const config = vsc.workspace.getConfiguration(ConfigurationSection);
  const maxFileSizeMB = config.get<number>('maxFileSize') ?? 200;
  const maxFileSize = maxFileSizeMB * 2 ** 20;
  return maxFileSize;
}

function roundToNearestOOM(num: number) {
  return 2 ** Math.round(Math.log2(num));
}

export async function createWebWorker(
  extensionUri: vsc.Uri,
  _reporter?: TelemetryReporter,
): Promise<WorkerBundle> {
  const workerPath = import.meta.env.VSCODE_BROWSER_EXT
    ? vsc.Uri.joinPath(extensionUri, 'out', 'worker-browser.js').toString()
    : path.resolve(__dirname, "./worker.js")

  const worker = nodeEndpoint(new Worker(workerPath));
  const workerFns = Caplink.wrap<WorkerFns>(worker, null, { owned: true });

  return {
    workerFns,
    async createWorkerDb(xUri, filename) {
      const [data, walData] = await readFile(xUri);
      // if (data == null) {
      //   throw new Error(`TooLargeError: ${TooLargeErrorMsg}`);
      // }
      const args = {
        data,
        walData,
        maxFileSize: getConfiguredMaxFileSize(),
        mappings: {
          'sqlite3.wasm': vsc.Uri.joinPath(extensionUri, 'sqlite-viewer-core', 'vscode', 'build', 'assets', 'sqlite3.wasm').toString(),
        },
        readOnly: true,
      };
      const transfer = [
        ...data ? [data.buffer as ArrayBuffer] : [],
        ...walData ? [walData.buffer as ArrayBuffer] : [],
      ];
      const dbRemote = await workerFns.importDb(filename, Caplink.transfer(args, transfer));
      return { dbRemote, readOnly: true };
    }
  }
}

async function readFile(uri: vsc.Uri): Promise<[data: Uint8Array|null, walData?: Uint8Array|null]> {
  if (uri.scheme === 'untitled') {
    return [new Uint8Array(), null];
  }

  const maxFileSize = getConfiguredMaxFileSize();

  const walUri = uri.with({ path: uri.path + '-wal' })

  const stat = await Promise.resolve(vsc.workspace.fs.stat(uri)).catch(() => ({ size: 0 }))
  if (maxFileSize !== 0 && stat.size > maxFileSize) {
    return [null, null];
  }

  return Promise.all([
    Promise.resolve(vsc.workspace.fs.readFile(uri)),
    Promise.resolve(vsc.workspace.fs.readFile(walUri)).catch(() => null),
  ]);
}
