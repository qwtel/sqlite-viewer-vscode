import * as vsc from 'vscode';
import * as Comlink from "../sqlite-viewer-core/src/comlink";
import type { WorkerDB, Options as DbOptions, DbParams } from '../sqlite-viewer-core/src/worker-db';
import type { SQLiteDocument, SQLiteEditorProvider } from './sqliteEditor';
// import type { Credentials } from './credentials';

type Uint8ArrayLike = { buffer: ArrayBufferLike, byteOffset: number, byteLength: number };

const TooLargeErrorMsg = "File too large. You can increase this limit in the settings under 'Sqlite Viewer: Max File Size'."

/**
 * Functions exposed by the vscode host, to be called from within the webview via Comlink
 */
export class VscodeFns implements Comlink.TRemote<WorkerDB> {
  constructor(
    readonly parent: SQLiteEditorProvider, 
    readonly document: SQLiteDocument,
    readonly workerDB: Comlink.Remote<WorkerDB>,
  ) {}

  get #webviews() { return this.parent.webviews }
  get #reporter() { return this.parent.reporter }

  getInitialData(): { 
    filename: string, 
    editable?: boolean, 
    maxFileSize: number, 
    value: Uint8ArrayLike
    walValue?: Uint8ArrayLike
  }|{ 
    filename: string, 
    untitled: true, 
    editable?: boolean, 
    maxFileSize: number, 
  }|string|undefined {
    const { document } = this;
    if (this.#webviews.has(document.uri)) {
      this.#reporter.sendTelemetryEvent("open");
      // this.credentials?.token.then(token => token && this.postMessage(webviewPanel, 'token', { token }));

      if (document.uri.scheme === 'untitled') {
        const maxFileSize = document.getConfiguredMaxFileSize();
        return {
          filename: 'untitled',
          untitled: true,
          editable: false,
          maxFileSize,
        };
      } else if (document.documentData) {
        return document.uri.toString();
        // const editable = false;
        // // const editable = vscode.workspace.fs.isWritableFileSystem(document.uri.scheme);
        // const { filename, value, walValue } = getTransferables(document, document.documentData);
        // const maxFileSize = SQLiteDocument.getConfiguredMaxFileSize();
        // return Comlink.transfer({
        //   filename,
        //   value,
        //   walValue,
        //   editable,
        //   maxFileSize,
        // }, [value.buffer as ArrayBuffer]);
      }

      // HACK: There could be other reasons why the data is empty
      throw Error(TooLargeErrorMsg);
    }
  }

  async refreshFile(): Promise<{
    filename: string, 
    editable?: boolean, 
    maxFileSize: number, 
    value: Uint8ArrayLike
    walValue?: Uint8ArrayLike
  }|string|undefined> {

    const { document } = this;
    if (document.uri.scheme !== 'untitled') {
      return document.uri.toString();
      // await document.refresh()

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
  close(filename: string): Promise<void> {
    return this.workerDB.close(filename);
  }
}