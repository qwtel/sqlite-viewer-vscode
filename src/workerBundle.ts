import type { Remote } from "../sqlite-viewer-core/src/caplink"
import type { WorkerDb, WorkerFns } from "../sqlite-viewer-core/src/worker-db"
import type { Uri } from "vscode"

export type Awaitable<T> = T | PromiseLike<T>
export type WorkerLike = { terminate(): void }

export interface WorkerBundle {
  workerFns: Remote<WorkerFns>,
  createWorkerDb(xUri: Uri, filename: string, extensionUri?: Uri): Awaitable<{ promise: Promise<Remote<WorkerDb>>, readOnly: boolean }>
}
