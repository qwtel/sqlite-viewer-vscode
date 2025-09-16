import { parentPort } from "./o/worker_threads";
import * as Caplink from "../sqlite-viewer-core/src/caplink";
import nodeEndpoint, { type NodeEndpoint } from "../sqlite-viewer-core/src/vendor/comlink/src/node-adapter";
import { createWASMDbWrapper } from "../sqlite-viewer-core/src/worker-db-factory"; // TODO: make a more specialized factory for vscode??
import { WorkerFns } from "../sqlite-viewer-core/src/worker-db";
const isEndpoint = (x: Caplink.Endpoint|NodeEndpoint): x is Caplink.Endpoint => 'addEventListener' in x && typeof x.addEventListener === 'function';
Caplink.expose(
  new WorkerFns(createWASMDbWrapper), 
  isEndpoint(parentPort) ? parentPort : nodeEndpoint(parentPort)
);
