import { parentPort } from "./o/worker_threads";
import { expose } from "../sqlite-viewer-core/src/caplink";
import nodeEndpoint from "../sqlite-viewer-core/src/vendor/comlink/src/node-adapter";
import { createWASMDbWrapper } from "../sqlite-viewer-core/src/worker-db-factory"; // TODO: make a more specialized factory for vscode??
import { WorkerFns } from "../sqlite-viewer-core/src/worker-db";
expose(new WorkerFns(createWASMDbWrapper), nodeEndpoint(parentPort!))
