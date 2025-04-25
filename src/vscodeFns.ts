import * as vsc from 'vscode';
import { SQLiteDocument, SQLiteEdit, SQLiteEditorProvider, SQLiteReadonlyEditorProvider } from './sqliteEditor';
import { FullExtensionId } from './constants';

import * as Caplink from "../sqlite-viewer-core/src/caplink";
import type { DbParams } from '../sqlite-viewer-core/src/signals';
import type { UITypeAffinity } from '../sqlite-viewer-core/src/utils';
import type { RowId } from '../sqlite-viewer-core/src/worker-db-utils';

type Uint8ArrayLike = { buffer: ArrayBufferLike, byteOffset: number, byteLength: number };

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
export class VscodeFns {
  constructor(
    private readonly provider: SQLiteEditorProvider|SQLiteReadonlyEditorProvider, 
    private readonly document: SQLiteDocument,
  ) {}

  private get webviews() { return this.provider.webviews }
  private get reporter() { return this.provider.reporter }
  private get context() { return this.provider.context }

  async initialize() {
    const { document } = this;
    if (this.webviews.has(document.uri)) {
      this.reporter.sendTelemetryEvent("open");
      return document.db;
    }
    throw new Error("Document not found in webviews");
  }

  get readOnly() {
    return this.provider instanceof SQLiteReadonlyEditorProvider;
  } 

  async refreshFile() {
    const { document } = this;
    if (document.uri.scheme !== 'untitled') {
      return document.refreshDb()
    }
    throw new Error("Document not found in webviews");
  }

  async downloadBlob(data: Uint8Array, download: string, metaKey: boolean) {
    const { document } = this;
    const { dirname } = document.uriParts;
    const dlUri = vsc.Uri.parse(`${dirname}/${download}`);

    await vsc.workspace.fs.writeFile(dlUri, data);
    if (!metaKey) await vsc.commands.executeCommand('vscode.open', dlUri);
    return;
  }
  
  async openExtensionStorePage() {
    await vsc.commands.executeCommand('extension.open', FullExtensionId)
  }

  async fireEditEvent(edit: SQLiteEdit) {
    this.document.makeEdit(edit);
  }

  async enterLicenseKey() {
    try {
      await this.provider.enterLicenseKey();
    } catch (err) {
      vsc.window.showErrorMessage(`'Enter License Key' resulted in an error`, { 
        modal: true, 
        detail: err instanceof Error ? err.message : String(err) 
      });
    }
  }

  saveSidebarState(side: 'left'|'right', position: number) {
    const key = side === 'left' ? 'sidebarLeft' : 'sidebarRight';
    return Promise.resolve(this.context.globalState.update(key, position));
  }

  acquireOutputChannel() {
    return Caplink.proxy(this.provider.outputChannel);
  }

  async showInformationMessage<T extends string|vsc.MessageItem>(message: string, options?: vsc.MessageOptions, ...items: T[]): Promise<T | undefined> {
    return await vsc.window.showInformationMessage(message, options, ...items as any[]);
  }

  async showWarningMessage<T extends string|vsc.MessageItem>(message: string, options?: vsc.MessageOptions, ...items: T[]): Promise<T | undefined> {
    return await vsc.window.showWarningMessage(message, options, ...items as any[]);
  }

  async showErrorMessage<T extends string|vsc.MessageItem>(message: string, options?: vsc.MessageOptions, ...items: T[]): Promise<T | undefined> {
    return await vsc.window.showErrorMessage(message, options, ...items as any[]);
  }

  async openCellEditor(params: DbParams, rowId: RowId, colName: string, uiTypeAffinity?: UITypeAffinity) {
    const { document } = this;
    if (document.uri.scheme !== 'untitled') {
      const cellFilename = colName + (uiTypeAffinity === 'JSON' ? '.json' : '.txt');
      const cellParts = [params.table, params.name, String(rowId), cellFilename].map(x => x.replaceAll('/', '%2F').replaceAll('\\', '%5C'));
      const cellUri = vsc.Uri.joinPath(document.uri, ...cellParts).with({ scheme: 'sqlite-file' })
      // console.log('Opening cell editor:', cellUri.toString());
      await vsc.window.showTextDocument(cellUri, { 
        viewColumn: vsc.ViewColumn.Beside,
        // preserveFocus: false,
        preview: true,
      });
    }
  }
}
