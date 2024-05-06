import { parentPort } from "worker_threads";
import * as Comlink from "../sqlite-viewer-core/src/comlink";
import nodeEndpoint from "../sqlite-viewer-core/src/vendor/comlink/src/node-adapter";
import { WorkerDB } from "../sqlite-viewer-core/src/worker-db";
const thisFetch = globalThis.fetch
Object.assign(globalThis, 'fetch', { value: (input: any, ...args: any[]) => {
  if (input.startsWith('file:')) console.log("GOTCHA");
  return thisFetch(input, ...args);
}})
Comlink.expose(WorkerDB, nodeEndpoint(parentPort!))
