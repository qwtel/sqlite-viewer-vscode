import { parentPort } from "worker_threads";
import * as Comlink from "../sqlite-viewer-core/src/comlink";
import nodeEndpoint from "../sqlite-viewer-core/src/vendor/comlink/src/node-adapter";
import { WorkerDB } from "../sqlite-viewer-core/src/worker-db";

Comlink.expose(new WorkerDB(), nodeEndpoint(parentPort!))
