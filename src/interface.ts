import { Uri } from "vscode"
import { Remote } from "../sqlite-viewer-core/src/comlink"
import { WorkerDB, WorkerFns } from "../sqlite-viewer-core/src/worker-db"

export type Awaitable<T> = T | PromiseLike<T>
export type WorkerLike = { terminate(): void }

export interface WorkerMeta {
  workerFns: Remote<WorkerFns>,
  workerLike: WorkerLike,
  importDb(xUri: Uri, filename: string, extensionUri?: Uri): Awaitable<{ promise: Promise<Remote<WorkerDB>> }>
}
