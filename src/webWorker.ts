import type { WorkerFns } from '../sqlite-viewer-core/src/worker-db';

import * as vsc from 'vscode';
import path from 'path';

import * as Caplink from "../sqlite-viewer-core/src/caplink";
import nodeEndpoint from "../sqlite-viewer-core/src/vendor/comlink/src/node-adapter";

import { Worker } from './o/worker_threads';
import { WorkerBundle } from './workerBundle';
import { ConfigurationSection } from './constants';
// import type { Credentials } from './credentials';

export const TooLargeErrorMsg = "File too large. You can increase this limit in the settings under 'Sqlite Viewer: Max File Size'."

export function getConfiguredMaxFileSize() {
  const config = vsc.workspace.getConfiguration(ConfigurationSection);
  const maxFileSizeMB = config.get<number>('maxFileSize') ?? 200;
  const maxFileSize = maxFileSizeMB * 2 ** 20;
  return maxFileSize;
}

export async function createWebWorker(
  extensionUri: vsc.Uri,
  _filename: string,
  _uri: vsc.Uri,
): Promise<WorkerBundle> {
  const workerPath = import.meta.env.BROWSER_EXT
    ? vsc.Uri.joinPath(extensionUri, 'out', 'worker-browser.js').toString()
    : path.resolve(__dirname, "./worker.js")

  const worker = new Worker(workerPath);
  const workerEndpoint = nodeEndpoint(worker);
  const workerFns = Caplink.wrap<WorkerFns>(workerEndpoint);

  return {
    workerFns,
    workerLike: worker,
    async importDbWrapper(xUri, filename) {
      const [data, walData] = await readFile(xUri);
      if (data == null) return { promise: Promise.reject(Error(TooLargeErrorMsg)) }
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
      const workerDbPromise = workerFns.importDb(filename, Caplink.transfer(args, transfer));
      workerDbPromise.catch(() => {}) // prevent unhandled rejection warning (caught elsewhere)
      return { promise: workerDbPromise }
    }
  }
}

async function readFile(uri: vsc.Uri): Promise<[data: Uint8Array|null, walData?: Uint8Array|null]> {
  if (uri.scheme === 'untitled') {
    return [new Uint8Array(), null];
  }

  const maxFileSize = getConfiguredMaxFileSize();

  const walUri = uri.with({ path: uri.path + '-wal' })

  const stat = await vsc.workspace.fs.stat(uri)
  if (maxFileSize !== 0 && stat.size > maxFileSize)
    return [null, null];

  return Promise.all([
    vsc.workspace.fs.readFile(uri),
    vsc.workspace.fs.readFile(walUri).then(x => x, () => null)
  ]);
}
