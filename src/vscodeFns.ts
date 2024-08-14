import * as vsc from 'vscode';
import type { SQLiteDocument, SQLiteEditorProvider } from './sqliteEditor';
import { FullExtensionId } from './constants';
// import type { Credentials } from './credentials';

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
    private readonly provider: SQLiteEditorProvider, 
    private readonly document: SQLiteDocument,
  ) {}

  private get webviews() { return this.provider.webviews }
  private get reporter() { return this.provider.reporter }

  async initialize() {
    const { document } = this;
    if (this.webviews.has(document.uri)) {
      this.reporter.sendTelemetryEvent("open");
      return document.getDb();
    }
    throw new Error("Document not found in webviews");
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
}
