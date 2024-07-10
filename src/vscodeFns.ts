import * as vsc from 'vscode';
import * as Comlink from "../sqlite-viewer-core/src/comlink";
import type { WorkerDB, Options as DbOptions, DbParams } from '../sqlite-viewer-core/src/worker-db';
import type { SQLiteDocument, SQLiteEditorProvider } from './sqliteEditor';
// import type { Credentials } from './credentials';

type Uint8ArrayLike = { buffer: ArrayBufferLike, byteOffset: number, byteLength: number };

const TooLargeErrorMsg = "File too large. You can increase this limit in the settings under 'Sqlite Viewer: Max File Size'."

export type UntitledInit = { 
  filename: string, 
  untitled: true, 
  editable?: boolean, 
  maxFileSize: number, 
};
export type RegularInit = {
  filename: string, 
  editable?: boolean, 
  maxFileSize: number, 
  value: Uint8ArrayLike
  walValue?: Uint8ArrayLike
}

/**
 * Functions exposed by the vscode host, to be called from within the webview via Comlink
 */
export class VscodeFns implements Comlink.TRemote<WorkerDB> {
  constructor(
    private readonly provider: SQLiteEditorProvider, 
    private readonly document: SQLiteDocument,
    private readonly workerDB: Comlink.Remote<WorkerDB>,
    private readonly importDbPromise: Promise<void>
  ) {}

  private get webviews() { return this.provider.webviews }
  private get reporter() { return this.provider.reporter }

  async init() {
    const { document } = this;
    if (this.webviews.has(document.uri)) {
      this.reporter.sendTelemetryEvent("open");
      await this.importDbPromise;
      return document.uriParts.filename;
    }
    // TODO: propagate errors?
  }

  async refreshFile(): Promise<string|undefined> {

    const { document } = this;
    if (document.uri.scheme !== 'untitled') {
      await document.refresh()
      return document.uriParts.filename;

      // if (document.documentData) {
      //   const { filename, value, walValue } = getTransferables(document, document.documentData);
      //   const maxFileSize = SQLiteDocument.getConfiguredMaxFileSize();
      //   return Comlink.transfer({
      //     filename,
      //     value,
      //     walValue,
      //     editable: false,
      //     maxFileSize,
      //   }, [value.buffer as ArrayBuffer]);
      // }

      // // HACK: There could be other reasons why the data is empty
      // throw Error(TooLargeErrorMsg);
    }
  }

  async downloadBlob(data: Uint8Array, download: string, metaKey: boolean) {
    const { document } = this;
    const { dirname } = document.uriParts;
    const dlUri = vsc.Uri.parse(`${dirname}/${download}`);

    await vsc.workspace.fs.writeFile(dlUri, data);
    if (!metaKey) await vsc.commands.executeCommand('vscode.open', dlUri);
    return;
  }

  // FIXME: better way to forward these?

  importDb(filename: string, args: { [k: string]: any; }): Promise<void> {
    console.log("importDb (should never happen)", filename)
    return this.workerDB.importDb(filename, args);
  }
  getTableGroups(filename: string) {
    return this.workerDB.getTableGroups(filename);
  }
  getCount(params: DbParams, opts?: DbOptions, signal?: AbortSignal): Promise<number> {
    return this.workerDB.getCount(params, opts, signal);
  }
  getIdsFromToIndex(params: DbParams, start: number, end: number, opts?: DbOptions, signal?: AbortSignal): Promise<(string|number)[]> {
    return this.workerDB.getIdsFromToIndex(params, start, end, opts, signal);
  }
  getPage(params: DbParams, opts: DbOptions = {}, signal?: AbortSignal) {
    return this.workerDB.getPage(params, opts, signal);
  }
  getByRowId(params: DbParams, rowId: string|number, opts = {}, signal?: AbortSignal) {
    return this.workerDB.getByRowId(params, rowId, opts, signal);
  }
  getByRowIds(params: DbParams, rowIds: Iterable<string|number> = [], opts = {}, signal?: AbortSignal) {
    return this.workerDB.getByRowIds(params, rowIds, opts, signal);
  }
  getBlob(params: DbParams, rowId: string, colName: string, signal?: AbortSignal) {
    return this.workerDB.getBlob(params, rowId, colName, signal)
  }
  exportDb(filename: string): Promise<Uint8Array> {
    return this.workerDB.exportDb(filename);
  }
  getStorageSize(params: DbParams): Promise<{ totalSize: number; numPages: number; }> {
    return this.workerDB.getStorageSize(params);
  }
  getIndices(params: DbParams): Promise<{ seq: string; name: string; unique: boolean; origin: string; partial: boolean; }[]> {
    return this.workerDB.getIndices(params);
  }
  close(filename: string): Promise<void> {
    return this.workerDB.close(filename);
  }
}
