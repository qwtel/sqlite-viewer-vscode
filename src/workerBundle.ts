import { Uri } from "vscode"
import { Remote } from "../sqlite-viewer-core/src/caplink"
import { WorkerDb, WorkerFns } from "../sqlite-viewer-core/src/worker-db"

export type Awaitable<T> = T | PromiseLike<T>
export type WorkerLike = { terminate(): void }

export interface WorkerBundle {
  workerFns: Remote<WorkerFns>,
  createWorkerDb(xUri: Uri, filename: string, extensionUri?: Uri): Awaitable<{ promise: Promise<Remote<WorkerDb>> }>
}
