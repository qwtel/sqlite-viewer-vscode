import type TelemetryReporter from '@vscode/extension-telemetry';
import type { WebviewFns } from '../sqlite-viewer-core/src/file-system';

import * as vsc from 'vscode';
import * as Comlink from "../sqlite-viewer-core/src/comlink";
import { Disposable, disposeAll } from './dispose';
import { WebviewCollection, WebviewEndpointAdapter } from './util';
// import type { Credentials } from './credentials';

interface SQLiteEdit {
  readonly data: Uint8Array;
}

interface SQLiteDocumentDelegate {
  getFileData(): Promise<Uint8Array>;
}

class SQLiteDocument extends Disposable implements vsc.CustomDocument {
  static async create(
    uri: vsc.Uri,
    backupId: string | undefined,
    delegate: SQLiteDocumentDelegate,
  ): Promise<SQLiteDocument | PromiseLike<SQLiteDocument>> {
    // If we have a backup, read that. Otherwise read the resource from the workspace
    const dataFile = typeof backupId === 'string' ? vsc.Uri.parse(backupId) : uri;
    const fileData = await SQLiteDocument.readFile(dataFile);
    return new SQLiteDocument(uri, fileData, delegate);
  }

  private static async readFile(uri: vsc.Uri): Promise<Uint8Array|null> {
    if (uri.scheme === 'untitled') {
      return new Uint8Array();
    }

    const config = vsc.workspace.getConfiguration('sqliteViewer');
    const maxFileSizeMB = config.get<number>('maxFileSize') ?? 200;
    const maxFileSize = maxFileSizeMB * 2 ** 20;

    const stat = await vsc.workspace.fs.stat(uri)
    if (maxFileSize !== 0 && stat.size > maxFileSize)
      return null;
    return vsc.workspace.fs.readFile(uri);
  }

  private readonly _uri: vsc.Uri;

  private _documentData: Uint8Array|null;
  private _edits: Array<SQLiteEdit> = [];
  private _savedEdits: Array<SQLiteEdit> = [];

  private readonly _delegate: SQLiteDocumentDelegate;

  private constructor(
    uri: vsc.Uri,
    initialContent: Uint8Array|null,
    delegate: SQLiteDocumentDelegate
  ) {
    super();
    this._uri = uri;
    this._documentData = initialContent;
    this._delegate = delegate;
  }

  public get uri() { return this._uri; }

  private pathRegExp = /(?<dirname>.*)\/(?<filename>(?<basename>.*)(?<extname>\.[^.]+))$/
  public get uriParts() {
    const { dirname, filename, basename, extname } = this._uri.toString().match(this.pathRegExp)?.groups ?? {}
    return { dirname, filename, basename, extname };
  }

  public get documentData(): Uint8Array|null { return this._documentData }

  private readonly _onDidDispose = this._register(new vsc.EventEmitter<void>());
  /**
   * Fired when the document is disposed of.
   */
  public readonly onDidDispose = this._onDidDispose.event;

  private readonly _onDidChangeDocument = this._register(new vsc.EventEmitter<{
    readonly content?: Uint8Array;
    readonly edits: readonly SQLiteEdit[];
  }>());
  /**
   * Fired to notify webviews that the document has changed.
   */
  public readonly onDidChangeContent = this._onDidChangeDocument.event;

  private readonly _onDidChange = this._register(new vsc.EventEmitter<{
    readonly label: string,
    undo(): void,
    redo(): void,
  }>());
  /**
   * Fired to tell VS Code that an edit has occurred in the document.
   *
   * This updates the document's dirty indicator.
   */
  public readonly onDidChange = this._onDidChange.event;

  /**
   * Called by VS Code when there are no more references to the document.
   *
   * This happens when all editors for it have been closed.
   */
  dispose(): void {
    this._onDidDispose.fire();
    super.dispose();
  }

  /**
   * Called when the user edits the document in a webview.
   *
   * This fires an event to notify VS Code that the document has been edited.
   */
  makeEdit(edit: SQLiteEdit) {
    this._edits.push(edit);

    this._onDidChange.fire({
      label: 'Stroke',
      undo: async () => {
        this._edits.pop();
        this._onDidChangeDocument.fire({
          edits: this._edits,
        });
      },
      redo: async () => {
        this._edits.push(edit);
        this._onDidChangeDocument.fire({
          edits: this._edits,
        });
      }
    });
  }

  /**
   * Called by VS Code when the user saves the document.
   */
  async save(cancellation: vsc.CancellationToken): Promise<void> {
    await this.saveAs(this.uri, cancellation);
    this._savedEdits = Array.from(this._edits);
  }

  /**
   * Called by VS Code when the user saves the document to a new location.
   */
  async saveAs(targetResource: vsc.Uri, cancellation: vsc.CancellationToken): Promise<void> {
    const fileData = await this._delegate.getFileData();
    if (cancellation.isCancellationRequested) {
      return;
    }
    await vsc.workspace.fs.writeFile(targetResource, fileData);
  }

  /**
   * Called by VS Code when the user calls `revert` on a document.
   */
  async revert(_cancellation: vsc.CancellationToken): Promise<void> {
    const diskContent = await SQLiteDocument.readFile(this.uri);
    this._documentData = diskContent;
    this._edits = this._savedEdits;
    diskContent && this._onDidChangeDocument.fire({
      content: diskContent,
      edits: this._edits,
    });
  }

  async refresh(_cancellation?: vsc.CancellationToken): Promise<void> {
    const diskContent = await SQLiteDocument.readFile(this.uri);
    this._documentData = diskContent;
    this._edits = [];
    diskContent && this._onDidChangeDocument.fire({
      content: diskContent,
      edits: [],
    });
  }

  /**
   * Called by VS Code to backup the edited document.
   *
   * These backups are used to implement hot exit.
   */
  async backup(destination: vsc.Uri, cancellation: vsc.CancellationToken): Promise<vsc.CustomDocumentBackup> {
    await this.saveAs(destination, cancellation);

    return {
      id: destination.toString(),
      delete: async () => {
        try {
          await vsc.workspace.fs.delete(destination);
        } catch {
          // noop
        }
      }
    };
  }
}

// const $default = 'default-src';
// const $script = 'script-src';
// const $style = 'style-src';
// const $img = 'img-src';
// const $font = 'font-src';
// const $child = 'child-src';
// const $self = "'self'";
// const $vscode = 'vscode-resource: qwtel.vscode-unpkg.net'; // FIXME: find way to avoid hard-coding web extension domain
// const $data = 'data:'
// const $blob = 'blob:'
// const $inlineStyle = "'unsafe-inline'";
// const $unsafeEval = "'unsafe-eval'";
// const buildCSP = (cspObj: Record<string, string[]>) =>
//   Object.entries(cspObj).map(([k, vs]) => `${k} ${vs.join(' ')};`).join(' ');

/**
 * Functions exposed by the vscode host, to be called from within the webview via Comlink
 * TODO: better name?
 */
export class VscodeFns {
  constructor(
    readonly parent: SQLiteEditorProvider, 
    readonly document: SQLiteDocument
  ) {}

  ready() {
    const { document } = this;
    if (this.parent.webviews.has(document.uri)) {
      this.parent.reporter.sendTelemetryEvent("open");
      // this.credentials?.token.then(token => token && this.postMessage(webviewPanel, 'token', { token }));

      if (document.uri.scheme === 'untitled') {
        return {
          filename: 'untitled',
          untitled: true,
          editable: false,
        };
      } else if (document.documentData) {
        const editable = false;
        // const editable = vscode.workspace.fs.isWritableFileSystem(document.uri.scheme);

        const { filename } = document.uriParts;
        const { buffer, byteOffset, byteLength } = document.documentData
        const value = { buffer, byteOffset, byteLength }; // HACK: need to send uint8array disassembled...

        return Comlink.record({
          filename,
          value: Comlink.transfer(value, [buffer]),
          editable,
        });
      }
      // HACK: There could be other reasons why the data is empty
      throw Error(TooLargeErrorMsg);
    }
  }

  async refreshFile() {
    const { document } = this;
    if (document.uri.scheme !== 'untitled') {
      await document.refresh()
      const { filename } = document.uriParts;
      if (document.documentData) {
        const { buffer, byteOffset, byteLength } = document.documentData;
        const value = { buffer, byteOffset, byteLength }; // HACK: need to send uint8array disassembled...
        return Comlink.record({
          filename,
          value: Comlink.transfer(value, [buffer]),
          editable: false,
        });
      }
      // HACK: There could be other reasons why the data is empty
      throw Error(TooLargeErrorMsg);
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
}

const TooLargeErrorMsg = "File too large. You can increase this limit in the settings under 'Sqlite Viewer: Max File Size'."

class SQLiteEditorProvider implements vsc.CustomEditorProvider<SQLiteDocument> {
  readonly webviews = new WebviewCollection();
  readonly webviewRemotes = new WeakMap<vsc.WebviewPanel, Comlink.Remote<WebviewFns>>

  constructor(
    readonly _context: vsc.ExtensionContext, 
    readonly reporter: TelemetryReporter,
  ) {}

  async openCustomDocument(
    uri: vsc.Uri,
    openContext: { backupId?: string },
    _token: vsc.CancellationToken
  ): Promise<SQLiteDocument> {

    const document: SQLiteDocument = await SQLiteDocument.create(uri, openContext.backupId, {
      getFileData: async () => {
        const webviewsForDocument = [...this.webviews.get(document.uri)];
        if (!webviewsForDocument.length) {
          throw new Error('Could not find webview to save for');
        }
        const panel = webviewsForDocument[0];
        const remote = this.webviewRemotes.get(panel)!
        return await remote.getFileData() ?? new Uint8Array(0);
      }
    });

    const listeners: vsc.Disposable[] = [];

    listeners.push(document.onDidChange(e => {
      // Tell VS Code that the document has been edited by the use.
      this._onDidChangeCustomDocument.fire({
        document,
        ...e,
      });
    }));

    listeners.push(document.onDidChangeContent(async e => {
      // Update all webviews when the document changes
      // NOTE: per configuration there can only be one webview per uri, so transferring the buffer is ok
      for (const panel of this.webviews.get(document.uri)) {
        if (!document.documentData) continue;
        const { filename } = document.uriParts;
        const { buffer, byteOffset, byteLength } = document.documentData;
        const value = { buffer, byteOffset, byteLength }; // HACK: need to send uint8array disassembled...
        const remote = this.webviewRemotes.get(panel);
        await remote?.forceUpdate(Comlink.record({ filename, value: Comlink.transfer(value, [buffer]) }));
      }
    }));

    document.onDidDispose(() => disposeAll(listeners));

    return document;
  }

  async resolveCustomEditor(
    document: SQLiteDocument,
    webviewPanel: vsc.WebviewPanel,
    token: vsc.CancellationToken
  ): Promise<void> {
    // Add the webview to our internal set of active webviews
    this.webviews.add(document.uri, webviewPanel);

    const webviewEndpoint = new WebviewEndpointAdapter(webviewPanel.webview);
    this.webviewRemotes.set(webviewPanel, Comlink.wrap(webviewEndpoint));

    Comlink.expose(new VscodeFns(this, document), webviewEndpoint);

    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);
  }

  private readonly _onDidChangeCustomDocument = new vsc.EventEmitter<vsc.CustomDocumentEditEvent<SQLiteDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  public saveCustomDocument(document: SQLiteDocument, cancellation: vsc.CancellationToken): Thenable<void> {
    return document.save(cancellation);
  }

  public saveCustomDocumentAs(document: SQLiteDocument, destination: vsc.Uri, cancellation: vsc.CancellationToken): Thenable<void> {
    return document.saveAs(destination, cancellation);
  }

  public revertCustomDocument(document: SQLiteDocument, cancellation: vsc.CancellationToken): Thenable<void> {
    return document.revert(cancellation);
  }

  public backupCustomDocument(document: SQLiteDocument, context: vsc.CustomDocumentBackupContext, cancellation: vsc.CancellationToken): Thenable<vsc.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation);
  }

  private async getHtmlForWebview(webview: vsc.Webview): Promise<string> {
    const buildUri = vsc.Uri.joinPath(this._context.extensionUri, 'sqlite-viewer-core', 'vscode', 'build');
    const codiconsUri = vsc.Uri.joinPath(this._context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css');

    const assetAsWebviewUri = (x: string) => webview.asWebviewUri(vsc.Uri.joinPath(buildUri, x));

    const html = new TextDecoder().decode(await vsc.workspace.fs.readFile(
      vsc.Uri.joinPath(buildUri, 'index.html')
    ));

    // const csp = buildCSP({
    //   [$default]: [$self, $vscode],
    //   [$script]: [$self, $vscode, $unsafeEval], // HACK: Needed for WebAssembly in Web Extension. Needless to say, it makes the whole CSP useless...
    //   [$style]: [$self, $vscode, $inlineStyle],
    //   [$img]: [$self, $vscode, $data],
    //   [$font]: [$self, $vscode],
    //   [$child]: [$blob],
    // });

    const preparedHtml = html
      .replace(/(href|src)="(\/[^"]*)"/g, (_, attr, url) => {
        return `${attr}="${assetAsWebviewUri(url)}"`;
      })
      .replace('<!--HEAD-->', `
        <link rel="stylesheet" crossorigin href="${webview.asWebviewUri(codiconsUri)}"/>
        <link rel="preload" crossorigin as="fetch" id="assets/worker.js" href="${assetAsWebviewUri("assets/worker.js")}"/>
        <link rel="preload" crossorigin as="fetch" id="assets/sqlite3.wasm" type="application/wasm" href="${assetAsWebviewUri("assets/sqlite3.wasm")}"/>
        <link rel="preload" crossorigin as="fetch" id="assets/sqlite3-opfs-async-proxy.js" href="${assetAsWebviewUri("assets/sqlite3-opfs-async-proxy.js")}"/>
      `)
      .replace('<!--BODY-->', ``)

      return preparedHtml;
  }
}

const registerOptions = {
  webviewOptions: {
    // TODO: serialize state!?
    retainContextWhenHidden: true,
  },
  supportsMultipleEditorsPerDocument: false,
}

export class SQLiteEditorDefaultProvider extends SQLiteEditorProvider {
  static viewType = 'sqlite-viewer.view';

  public static register(context: vsc.ExtensionContext, reporter: TelemetryReporter): vsc.Disposable {
    return vsc.window.registerCustomEditorProvider(
      SQLiteEditorDefaultProvider.viewType,
      new SQLiteEditorDefaultProvider(context, reporter),
      registerOptions);
  }
}

export class SQLiteEditorOptionProvider extends SQLiteEditorProvider {
  static viewType = 'sqlite-viewer.option';

  public static register(context: vsc.ExtensionContext, reporter: TelemetryReporter): vsc.Disposable {
    return vsc.window.registerCustomEditorProvider(
      SQLiteEditorOptionProvider.viewType,
      new SQLiteEditorOptionProvider(context, reporter),
      registerOptions);
  }
}

