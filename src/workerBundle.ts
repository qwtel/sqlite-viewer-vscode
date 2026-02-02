import type { Remote } from "../sqlite-viewer-core/src/caplink"
import type { WorkerDb, WorkerFns } from "../sqlite-viewer-core/src/worker-db"
import type { Uri } from "vscode"

export type Awaitable<T> = T | PromiseLike<T>
export type WorkerLike = { terminate(): void }

export interface WorkerBundle {
  workerFns: Remote<WorkerFns>,
  importDb(xUri: Uri, filename: string, readOnly?: boolean, instantCommit?: boolean): Awaitable<{
    dbRemote: Remote<WorkerDb>, 
    readOnly?: boolean,
  }>
}
