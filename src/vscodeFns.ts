import * as vsc from 'vscode';
import * as path from 'path';

import { SQLiteEditorProvider, SQLiteReadonlyEditorProvider } from './sqliteEditorProvider';
import { ExtensionId, FullExtensionId, SidebarLeft, SidebarRight, UriScheme } from './constants';
import { IsCursorIDE } from './util';

import type { SQLiteDocument, SQLiteEdit } from './sqliteDocument';
import type { DbParams } from '../sqlite-viewer-core/src/signals';
import type { SqlValue } from '../sqlite-viewer-core/src/worker-db';
import type { RowId } from '../sqlite-viewer-core/src/worker-db-utils';
import type { FileTypeResult } from '../sqlite-viewer-core/src/file-type';
import type { MessageItem, MessageOptions, ToastService } from '../sqlite-viewer-core/src/interfaces';

import * as Caplink from "../sqlite-viewer-core/src/caplink";
import { determineColumnTypes, sqlBufferToUint8Array, type UITypeAffinity } from '../sqlite-viewer-core/src/utils';

import { determineCellExtension } from '../sqlite-viewer-core/pro/src/uriHandler';
import { confirmLargeChanges } from '../sqlite-viewer-core/pro/src/undoHistory';

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
export class VscodeFns implements ToastService {
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
      return document.dbRemote;
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

  async downloadBlob(data: Uint8Array|Int8Array|ArrayBuffer, download: string, preserveFocus: boolean) {
    const { document } = this;
    const { dirname } = document.uriParts;
    const dlUri = vsc.Uri.joinPath(vsc.Uri.parse(dirname), download);

    await vsc.workspace.fs.writeFile(dlUri, sqlBufferToUint8Array(data));
    if (!preserveFocus) await vsc.commands.executeCommand('vscode.open', dlUri);
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
      vsc.window.showErrorMessage(`'Enter License Key' resulted in an error`, { // XXX: translate
        modal: true, 
        detail: err instanceof Error ? err.message : String(err) 
      });
    }
  }

  saveSidebarState(side: 'left'|'right', position: number) {
    const key = side === 'left' ? SidebarLeft : SidebarRight;
    return Promise.resolve(this.context.globalState.update(key, position));
  }

  acquireOutputChannel() {
    return this.provider.outputChannel ? Caplink.proxy(this.provider.outputChannel) : null;
  }

  async showInformationToast<T extends string|MessageItem>(message: string, options?: MessageOptions, ...items: T[]): Promise<T | undefined> {
    return await vsc.window.showInformationMessage(message, options, ...items as any[]);
  }

  async showWarningToast<T extends string|MessageItem>(message: string, options?: MessageOptions, ...items: T[]): Promise<T | undefined> {
    return await vsc.window.showWarningMessage(message, options, ...items as any[]);
  }

  async showErrorToast<T extends string|MessageItem>(message: string, options?: MessageOptions, ...items: T[]): Promise<T | undefined> {
    return await vsc.window.showErrorMessage(message, options, ...items as any[]);
  }

  async openCellEditor(params: DbParams, rowId: RowId, colName?: string, colTypes: Partial<ReturnType<typeof determineColumnTypes>> = {}, { 
    value, type, webviewId, rowCount
  }: { 
    value?: SqlValue, 
    type?: FileTypeResult,
    webviewId?: string,
    rowCount?: number,
  } = {}) {
    const { document } = this;
    if (document.uri.scheme !== 'untitled') {
      let cellParts;

      if (rowId === '__create__.sql') {
        cellParts = [params.table, params.name, '__create__.sql'];
      } else {
        const extname = await determineCellExtension(colTypes, value, type);
        const cellFilename = colName + extname;
        
        // Get the range folder info for this ROWID
        const rangeInfo = await document.dbRemote.getRangeFolderForRowId(params, rowId, rowCount ?? 0);
        if (rangeInfo.needsRangeFolder) {
          cellParts = [params.table, params.name, rangeInfo.rangeFolder!, String(rowId), cellFilename];
        } else {
          cellParts = [params.table, params.name, String(rowId), cellFilename];
        }
      }
      
      const encodedParts = cellParts.map(x => x.replaceAll(path.sep, encodeURIComponent(path.sep)));
      const cellUri = vsc.Uri.joinPath(vsc.Uri.parse(await document.key), ...encodedParts).with({ scheme: UriScheme, query: `webview-id=${webviewId}` })

      await vsc.commands.executeCommand('vscode.open', cellUri, vsc.ViewColumn.Two);
    }
  }

  async openChat() {
    if (IsCursorIDE) {
      await vsc.commands.executeCommand('workbench.action.focusAuxiliaryBar');
    } else {
      await vsc.commands.executeCommand('workbench.action.chat.open', {
        query: `@db Hello!`,
        mode: "ask",
      });
    }
  }

  confirmLargeChanges() {
    return confirmLargeChanges();
  }

  async confirmLargeSelection(openExportDialog: () => void) {
    const answer = await vsc.window.showWarningMessage(vsc.l10n.t('Large Selection Warning'), {
      detail: vsc.l10n.t('You are attempting to select more than 10,000 rows. Large selections may impact performance. Do you want to open the export menu instead?'),
      modal: true,
    }, ...[{ title: vsc.l10n.t('Export data'), value: 'export' }, { title: vsc.l10n.t('Continue'), value: 'continue' }]);
    if (answer?.value === 'export') {
      openExportDialog();
    }
    return answer?.value === 'continue';
  }

  updateInstantCommit(value: boolean) {
    this.document.instantCommit = value;
  }

  async exportTable(dbParams: DbParams, columns: string[], dbOptions?: any, tableStore?: any, exportOptions?: any, extras?: any) {
    await vsc.commands.executeCommand(`${ExtensionId}.exportTable`, dbParams, columns, dbOptions, tableStore, exportOptions, extras);
  }

  async readWorkspaceFileUri(uriString: string): Promise<Uint8Array> {
    const uri = vsc.Uri.parse(uriString);
    return await vsc.workspace.fs.readFile(uri);
  }
}
