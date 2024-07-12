import { parentPort } from "./webWorker";
import * as Comlink from "../sqlite-viewer-core/src/comlink";
import nodeEndpoint from "../sqlite-viewer-core/src/vendor/comlink/src/node-adapter";
import { createWASMDbWrapper } from "../sqlite-viewer-core/src/worker-db-factory"; // TODO: make a more specialized factory for vscode??
import { WorkerFns } from "../sqlite-viewer-core/src/worker-db";
Comlink.expose(new WorkerFns(createWASMDbWrapper), nodeEndpoint(parentPort!))
