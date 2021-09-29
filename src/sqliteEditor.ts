import { TextDecoder } from 'util';
import * as vscode from 'vscode';
import { Disposable, disposeAll } from './dispose';
import { getNonce } from './util';

/**
 * Define the type of edits used in paw draw files.
 */
interface PawDrawEdit {
  readonly color: string;
  readonly stroke: ReadonlyArray<[number, number]>;
}

interface SQLiteEdit {
  readonly data: Uint8Array;
}

interface SQLiteDocumentDelegate {
  getFileData(): Promise<Uint8Array>;
}

/**
 * Define the document (the data model) used for paw draw files.
 */
class SQLiteDocument extends Disposable implements vscode.CustomDocument {

  static async create(
    uri: vscode.Uri,
    backupId: string | undefined,
    delegate: SQLiteDocumentDelegate,
  ): Promise<SQLiteDocument | PromiseLike<SQLiteDocument>> {
    // If we have a backup, read that. Otherwise read the resource from the workspace
    const dataFile = typeof backupId === 'string' ? vscode.Uri.parse(backupId) : uri;
    const fileData = await SQLiteDocument.readFile(dataFile);
    return new SQLiteDocument(uri, fileData, delegate);
  }

  private static async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    if (uri.scheme === 'untitled') {
      return new Uint8Array();
    }
    return vscode.workspace.fs.readFile(uri);
  }

  private readonly _uri: vscode.Uri;

  private _documentData: Uint8Array;
  private _edits: Array<PawDrawEdit> = [];
  private _savedEdits: Array<PawDrawEdit> = [];

  private readonly _delegate: SQLiteDocumentDelegate;

  private constructor(
    uri: vscode.Uri,
    initialContent: Uint8Array,
    delegate: SQLiteDocumentDelegate
  ) {
    super();
    this._uri = uri;
    this._documentData = initialContent;
    this._delegate = delegate;
  }

  public get uri() { return this._uri; }

  public get documentData(): Uint8Array { return this._documentData; }

  private readonly _onDidDispose = this._register(new vscode.EventEmitter<void>());
  /**
   * Fired when the document is disposed of.
   */
  public readonly onDidDispose = this._onDidDispose.event;

  private readonly _onDidChangeDocument = this._register(new vscode.EventEmitter<{
    readonly content?: Uint8Array;
    readonly edits: readonly PawDrawEdit[];
  }>());
  /**
   * Fired to notify webviews that the document has changed.
   */
  public readonly onDidChangeContent = this._onDidChangeDocument.event;

  private readonly _onDidChange = this._register(new vscode.EventEmitter<{
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
  makeEdit(edit: PawDrawEdit) {
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
  async save(cancellation: vscode.CancellationToken): Promise<void> {
    await this.saveAs(this.uri, cancellation);
    this._savedEdits = Array.from(this._edits);
  }

  /**
   * Called by VS Code when the user saves the document to a new location.
   */
  async saveAs(targetResource: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
    const fileData = await this._delegate.getFileData();
    if (cancellation.isCancellationRequested) {
      return;
    }
    await vscode.workspace.fs.writeFile(targetResource, fileData);
  }

  /**
   * Called by VS Code when the user calls `revert` on a document.
   */
  async revert(_cancellation: vscode.CancellationToken): Promise<void> {
    const diskContent = await SQLiteDocument.readFile(this.uri);
    this._documentData = diskContent;
    this._edits = this._savedEdits;
    this._onDidChangeDocument.fire({
      content: diskContent,
      edits: this._edits,
    });
  }

  /**
   * Called by VS Code to backup the edited document.
   *
   * These backups are used to implement hot exit.
   */
  async backup(destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
    await this.saveAs(destination, cancellation);

    return {
      id: destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(destination);
        } catch {
          // noop
        }
      }
    };
  }
}

/**
 * Provider for paw draw editors.
 *
 * Paw draw editors are used for `.pawDraw` files, which are just `.png` files with a different file extension.
 *
 * This provider demonstrates:
 *
 * - How to implement a custom editor for binary files.
 * - Setting up the initial webview for a custom editor.
 * - Loading scripts and styles in a custom editor.
 * - Communication between VS Code and the custom editor.
 * - Using CustomDocuments to store information that is shared between multiple custom editors.
 * - Implementing save, undo, redo, and revert.
 * - Backing up a custom editor.
 */
export class SQLiteEditorProvider implements vscode.CustomEditorProvider<SQLiteDocument> {

  private static newPawDrawFileId = 1;

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    // vscode.commands.registerCommand('catCustoms.pawDraw.new', () => {
    //   const workspaceFolders = vscode.workspace.workspaceFolders;
    //   if (!workspaceFolders) {
    //     vscode.window.showErrorMessage("Creating new Paw Draw files currently requires opening a workspace");
    //     return;
    //   }

    //   const uri = vscode.Uri.joinPath(workspaceFolders[0].uri, `new-${PawDrawEditorProvider.newPawDrawFileId++}.pawdraw`)
    //     .with({ scheme: 'untitled' });

    //   vscode.commands.executeCommand('vscode.openWith', uri, PawDrawEditorProvider.viewType);
    // });

    return vscode.window.registerCustomEditorProvider(
      SQLiteEditorProvider.viewType,
      new SQLiteEditorProvider(context),
      {
        // For this demo extension, we enable `retainContextWhenHidden` which keeps the
        // webview alive even when it is not visible. You should avoid using this setting
        // unless is absolutely required as it does have memory overhead.
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false,
      });
  }

  private static readonly viewType = 'sqlite.view';

  /**
   * Tracks all known webviews
   */
  private readonly webviews = new WebviewCollection();

  constructor(
    private readonly _context: vscode.ExtensionContext
  ) { }

  //#region CustomEditorProvider

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    _token: vscode.CancellationToken
  ): Promise<SQLiteDocument> {

    const document: SQLiteDocument = await SQLiteDocument.create(uri, openContext.backupId, {
      getFileData: async () => {
        const webviewsForDocument = Array.from(this.webviews.get(document.uri));
        if (!webviewsForDocument.length) {
          throw new Error('Could not find webview to save for');
        }
        const panel = webviewsForDocument[0];
        const response = await this.postMessageWithResponse<number[]>(panel, 'getFileData', {});
        return new Uint8Array(response);
      }
    });

    const listeners: vscode.Disposable[] = [];

    listeners.push(document.onDidChange(e => {
      // Tell VS Code that the document has been edited by the use.
      this._onDidChangeCustomDocument.fire({
        document,
        ...e,
      });
    }));

    listeners.push(document.onDidChangeContent(e => {
      // Update all webviews when the document changes
      for (const webviewPanel of this.webviews.get(document.uri)) {
        this.postMessage(webviewPanel, 'update', {
          edits: e.edits,
          content: e.content?.buffer,
        }, [e.content?.buffer]);
      }
    }));

    document.onDidDispose(() => disposeAll(listeners));

    return document;
  }

  async resolveCustomEditor(
    document: SQLiteDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Add the webview to our internal set of active webviews
    this.webviews.add(document.uri, webviewPanel);

    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);

    webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(document, e));

    // Wait for the webview to be properly ready before we init
    webviewPanel.webview.onDidReceiveMessage(e => {
      if (e.type === 'ready') {
        if (document.uri.scheme === 'untitled') {
          this.postMessage(webviewPanel, 'init', {
            untitled: true,
            editable: true,
          });
        } else {
          // const editable = vscode.workspace.fs.isWritableFileSystem(document.uri.scheme);
          const editable = false

          // HACK: making a copy to deal with byteoffset. maybe transfer original buffer + offset + length??
          const dd = document.documentData
          const value = dd.buffer.slice(dd.byteOffset, dd.byteOffset + dd.byteLength);

          // console.log('postMessage', document.documentData.length, value.byteLength)
          this.postMessage(webviewPanel, 'init', { value, editable }, [value]);
        }
      }
    });
  }

  private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<SQLiteDocument>>();
  public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

  public saveCustomDocument(document: SQLiteDocument, cancellation: vscode.CancellationToken): Thenable<void> {
    return document.save(cancellation);
  }

  public saveCustomDocumentAs(document: SQLiteDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Thenable<void> {
    return document.saveAs(destination, cancellation);
  }

  public revertCustomDocument(document: SQLiteDocument, cancellation: vscode.CancellationToken): Thenable<void> {
    return document.revert(cancellation);
  }

  public backupCustomDocument(document: SQLiteDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Thenable<vscode.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation);
  }

  //#endregion

  // /**
  //  * Get the static HTML used for in our editor's webviews.
  //  */
  // private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
  //   // Local path to script and css for the webview
  //   const files = [
  //     "css/main.css",
  //     "css/bootstrap.min.css",
  //     "css/select2.css",
  //     "css/select2-bootstrap.css",
  //     "css/ribbons.min.css",
  //     "js/jquery-1.11.3.min.js",
  //     "js/filereader.js",
  //     "js/sql.js",
  //     "js/select2.min.js",
  //     "js/ace/ace.js",
  //     "js/bootstrap.min.js",
  //     "js/mindmup-editabletable.js",
  //     "js/main.js",
  //     "img/icon.png",
  //     "img/logo.svg",
  //     "img/seriously.png",
  //   ].map(s => {
  //     return [s, webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'sqlite-viewer', s))] as const;
  //   });

  //   // Use a nonce to whitelist which scripts can be run
  //   // const nonce = getNonce();

  //   let html = new TextDecoder().decode(
  //     await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this._context.extensionUri, 'sqlite-viewer', 'index.html'))
  //   );

  //   for (const [path, uri] of files) {
  //     html = html.replaceAll(path, uri.toString());
  //   }

  //   return html;
  // }

  /**
   * Get the static HTML used for in our editor's webviews.
   */
  private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    const publicUri = vscode.Uri.joinPath(this._context.extensionUri, 'sqlite-viewer-app', 'public');
    const codiconsUri = vscode.Uri.joinPath(this._context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css');

    const html = new TextDecoder().decode(await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(publicUri, 'index.html')
    ));

    const PUBLIC_URL = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'sqlite-viewer-app', 'public')
    ).toString();

    const prepHtml = html
      .replaceAll('/index.css', '/vscode.css').replaceAll('%PUBLIC_URL%', PUBLIC_URL)
      .replace('<!--%HEAD%-->', `
        <link rel="stylesheet" href="${webview.asWebviewUri(codiconsUri)}"/>
      `)
    return prepHtml;
  }

  private _requestId = 1;
  private readonly _callbacks = new Map<number, (response: any) => void>();

  private postMessageWithResponse<R = unknown>(panel: vscode.WebviewPanel, type: string, body: any): Promise<R> {
    const requestId = this._requestId++;
    const p = new Promise<R>(resolve => this._callbacks.set(requestId, resolve));
    panel.webview.postMessage({ type, requestId, body });
    return p;
  }

  private postMessage(panel: vscode.WebviewPanel, type: string, body: any, transferable?: any[]): void {
    // @ts-ignore
    panel.webview.postMessage({ type, body }, transferable);
  }

  private onMessage(document: SQLiteDocument, message: any) {
    switch (message.type) {
      // case 'stroke':
      //   document.makeEdit(message as PawDrawEdit);
      //   return;

      case 'response': {
        const callback = this._callbacks.get(message.requestId);
        callback?.(message.body);
        return;
      }
    }
  }
}

/**
 * Tracks all webviews.
 */
class WebviewCollection {

  private readonly _webviews = new Set<{
    readonly resource: string;
    readonly webviewPanel: vscode.WebviewPanel;
  }>();

  /**
   * Get all known webviews for a given uri.
   */
  public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
    const key = uri.toString();
    for (const entry of this._webviews) {
      if (entry.resource === key) {
        yield entry.webviewPanel;
      }
    }
  }

  /**
   * Add a new webview to the collection.
   */
  public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
    const entry = { resource: uri.toString(), webviewPanel };
    this._webviews.add(entry);

    webviewPanel.onDidDispose(() => {
      this._webviews.delete(entry);
    });
  }
}
