import type TelemetryReporter from '@vscode/extension-telemetry';
import * as v8 from '@workers/v8-value-serializer/v8';
import type { WebviewFns } from '../sqlite-viewer-core/src/file-system';
import type { WorkerDb, SqlValue } from '../sqlite-viewer-core/src/worker-db';

import * as vsc from 'vscode';

import * as Caplink from "../sqlite-viewer-core/src/caplink";
import { WireEndpoint } from '../sqlite-viewer-core/src/vendor/postmessage-over-wire/comlinked'

import { ExtensionId, FullExtensionId } from './constants';
import { Disposable, disposeAll } from './dispose';
import { IS_VSCODE, IS_VSCODIUM, WebviewCollection, WebviewStream, cancellationTokenToAbortSignal, cspUtil, getUriParts } from './util';
import { VscodeFns } from './vscodeFns';
import { WorkerBundle } from './workerBundle';
import { createWebWorker, getConfiguredMaxFileSize } from './webWorker';
// import type { Credentials } from './credentials';

//#region Pro
const pro__createTxikiWorker: () => never = () => { throw new Error("Not implemented") }
//#endregion

const pro__IsPro = false;

export type SQLiteEdit = { 
  label: string, 
  query: string, 
  oldValue: SqlValue,
  newValue: SqlValue,
};

interface SQLiteDocumentDelegate {
  extensionUri: vsc.Uri;
}

const Extension = vsc.extensions.getExtension(FullExtensionId);

const LocalMode = !vsc.env.remoteName;
const RemoteWorkspaceMode = !!vsc.env.remoteName && Extension?.extensionKind === vsc.ExtensionKind.Workspace;
const ReadWriteMode = LocalMode || RemoteWorkspaceMode;

const IsReadWrite = !import.meta.env.BROWSER_EXT && pro__IsPro && ReadWriteMode;

export class SQLiteDocument extends Disposable implements vsc.CustomDocument {
  static async create(
    openContext: vsc.CustomDocumentOpenContext,
    uri: vsc.Uri,
    delegate: SQLiteDocumentDelegate,
    token: vsc.CancellationToken,
  ): Promise<SQLiteDocument> {

    const createWorkerBundle = !import.meta.env.BROWSER_EXT && pro__IsPro && ReadWriteMode // Do not change this line
      ? pro__createTxikiWorker 
      : createWebWorker;

    // const readWriteMode = !import.meta.env.BROWSER_EXT && pro__IsPro && canUseNativeSqlite3;

    const { filename } = getUriParts(uri);
    const workerBundle = await createWorkerBundle(delegate.extensionUri, filename, uri);
    const { promise } = await workerBundle.createWorkerDb(uri, filename, delegate.extensionUri);
    
    let edits: SQLiteEdit[] = []
    if (typeof openContext.backupId === 'string') {
      const editsUri = vsc.Uri.parse(openContext.backupId);
      const editsBuffer = await vsc.workspace.fs.readFile(editsUri);
      edits = v8.deserialize(editsBuffer);
    }

    // XXX: no like
    const signal = cancellationTokenToAbortSignal(token);
    const workerDbPromise = promise
      .then(dbRemote => dbRemote.applyEdits(edits, signal))
      .then(() => promise);

    return new SQLiteDocument(uri, workerBundle, workerDbPromise);
  }

  getConfiguredMaxFileSize() { return getConfiguredMaxFileSize() }

  readonly #uri: vsc.Uri;

  #history = {
    cursor: 0,
    savedCursor: 0,
    edits: [] as SQLiteEdit[]
  }

  private constructor(
    uri: vsc.Uri,
    private readonly workerBundle: WorkerBundle,
    private workerDbPromise: Promise<Caplink.Remote<WorkerDb>>,
  ) {
    super();
    this.#uri = uri;
  }

  public get uri() { return this.#uri; }
  public get uriParts() { return getUriParts(this.#uri); }

  readonly #onDidDispose = this._register(new vsc.EventEmitter<void>());
  public readonly onDidDispose = this.#onDidDispose.event;

  readonly #onDidChangeDocument = this._register(new vsc.EventEmitter<{
    // readonly edits: readonly SQLiteEdit[];
  }>());

  /**
   * Fired to notify webviews that the document has changed.
   */
  public readonly onDidChangeContent = this.#onDidChangeDocument.event;

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
  dispose() {
    this.workerBundle.workerFns[Symbol.dispose]();
    // this.workerBundle.workerLike.terminate();
    this.#onDidDispose.fire();
    super.dispose();
  }

  /**
   * Called when the user edits the document in a webview.
   *
   * This fires an event to notify VS Code that the document has been edited.
   */
  makeEdit(edit: SQLiteEdit) {
    const history = this.#history;
    history.edits = history.edits.slice(0, history.cursor).concat(edit);
    history.cursor = history.edits.length;
    this._onDidChange.fire({
      label: edit.label,
      undo: async () => {
        const edit = history.edits[--history.cursor];
        const dbRemote = await this.getDb();
        await dbRemote.undo(edit);
        this.#onDidChangeDocument.fire({ /* edits: this.#edits */ });
      },
      redo: async () => {
        if (history.cursor >= history.edits.length) return;
        const edit = history.edits[history.cursor++];
        const dbRemote = await this.getDb();
        await dbRemote.redo(edit);
        this.#onDidChangeDocument.fire({ /* edits: this.#edits */ });
      }
    });
  }

  /**
   * Called by VS Code when the user saves the document.
   */
  async save(token: vsc.CancellationToken): Promise<void> {
    const dbRemote = await this.getDb();
    await dbRemote.commit(cancellationTokenToAbortSignal(token));
    this.#history.savedCursor = this.#history.cursor;
  }

  /**
   * Called by VS Code when the user saves the document to a new location.
   */
  async saveAs(targetResource: vsc.Uri, cancellation: vsc.CancellationToken): Promise<void> {
    const dbRemote = await this.getDb();
    const stat = await vsc.workspace.fs.stat(this.uri);
    if (stat.size > this.getConfiguredMaxFileSize()) {
      throw new Error("File too large to save");
    }
    const { filename } = this.uriParts;
    const data = await dbRemote.exportDb(filename, cancellationTokenToAbortSignal(cancellation));
    vsc.workspace.fs.writeFile(targetResource, data);
  }

  /**
   * Called by VS Code when the user calls `revert` on a document.
   */
  async revert(token: vsc.CancellationToken): Promise<void> {
    const dbRemote = await this.getDb();
    await dbRemote.rollback(cancellationTokenToAbortSignal(token));
    // XXX: how to handle savedEdits in this case?
  }

  async getDb() {
    return this.workerDbPromise;
  }

  async refreshDb() {
    (await this.workerDbPromise.catch())?.[Symbol.dispose]();
    const { promise } = await this.workerBundle.createWorkerDb(this.uri, this.uriParts.filename);
    this.workerDbPromise = promise;
    return promise;
  }

  /**
   * Called by VS Code to backup the edited document.
   *
   * These backups are used to implement hot exit.
   */
  async backup(destination: vsc.Uri, _token: vsc.CancellationToken): Promise<vsc.CustomDocumentBackup> {
    const history = this.#history;
    if (history.savedCursor > history.cursor) throw Error("Invalid cursor state");
    const unsavedEdits = history.edits.slice(history.savedCursor, history.cursor);
    const unsavedEditsBuffer = v8.serialize(unsavedEdits);
    await vsc.workspace.fs.writeFile(destination, unsavedEditsBuffer);

    return {
      id: destination.toString(),
      delete: async () => {
        try {
          await vsc.workspace.fs.delete(destination) 
        } catch { /* noop */ }
      }
    };
  }
}

export class SQLiteReadonlyEditorProvider implements vsc.CustomReadonlyEditorProvider<SQLiteDocument> {
  readonly webviews = new WebviewCollection();
  protected readonly webviewRemotes = new Map<vsc.WebviewPanel, Caplink.Remote<WebviewFns>>
  protected readonly hostFns = new Map<SQLiteDocument, VscodeFns>();

  constructor(
    readonly context: vsc.ExtensionContext, 
    readonly reporter: TelemetryReporter,
  ) {}

  async openCustomDocument(
    uri: vsc.Uri,
    openContext: vsc.CustomDocumentOpenContext,
    token: vsc.CancellationToken
  ): Promise<SQLiteDocument> {

    const document = await SQLiteDocument.create(openContext, uri, {
      extensionUri: this.context.extensionUri,
      // getFileData: async () => {
      //   throw Error("Not implemented")
      // }
    }, token);

    const listeners = this.setupListeners(document);

    this.hostFns.set(document, new VscodeFns(this, document));

    document.onDidDispose(() => {
      this.hostFns.delete(document);
      disposeAll(listeners)
    });

    return document;
  }

  protected setupListeners(_document: SQLiteDocument): vsc.Disposable[] {
    // noop 
    return [];
  }

  async resolveCustomEditor(
    document: SQLiteDocument,
    webviewPanel: vsc.WebviewPanel,
    _token: vsc.CancellationToken
  ): Promise<void> {
    this.webviews.add(document.uri, webviewPanel);

    const webviewStream = new WebviewStream(webviewPanel);
    const webviewEndpoint = new WireEndpoint(webviewStream, document.uriParts.filename)
    webviewEndpoint.addEventListener('messageerror', ev => console.error(ev.data))
    webviewEndpoint.addEventListener('error', ev => console.error(ev.error))

    this.webviewRemotes.set(webviewPanel, Caplink.wrap(webviewEndpoint));
    Caplink.expose(this.hostFns.get(document)!, webviewEndpoint);

    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);

    webviewPanel.onDidDispose(() => {
      const webviewRemote = this.webviewRemotes.get(webviewPanel);
      if (webviewRemote) {
        this.webviewRemotes.delete(webviewPanel);
        webviewRemote[Symbol.dispose]();
      }
    });
  }

  private async getHtmlForWebview(webview: vsc.Webview): Promise<string> {
    const buildUri = vsc.Uri.joinPath(this.context.extensionUri, 'sqlite-viewer-core', 'vscode', 'build');
    const codiconsUri = vsc.Uri.joinPath(this.context.extensionUri, 'node_modules', 'codicons', 'dist', 'codicon.css');

    const assetAsWebviewUri = (x: string) => webview.asWebviewUri(vsc.Uri.joinPath(buildUri, x));

    const html = new TextDecoder().decode(await vsc.workspace.fs.readFile(
      vsc.Uri.joinPath(buildUri, 'index.html')
    ));

    const cspObj = {
      [cspUtil.defaultSrc]: [webview.cspSource],
      [cspUtil.scriptSrc]: [webview.cspSource, cspUtil.wasmUnsafeEval], 
      [cspUtil.styleSrc]: [webview.cspSource, cspUtil.inlineStyle],
      [cspUtil.imgSrc]: [webview.cspSource, cspUtil.data],
      [cspUtil.fontSrc]: [webview.cspSource],
      [cspUtil.childSrc]: [cspUtil.blob],
    };

    // Only set csp for hosts that are known to correctly set `webview.cspSource`
    const cspStr = IS_VSCODE || IS_VSCODIUM
      ? cspUtil.build(cspObj)
      : ''

    const preparedHtml = html
      .replace(/(href|src)="(\/[^"]*)"/g, (_, attr, url) => {
        return `${attr}="${assetAsWebviewUri(url)}"`;
      })
      .replace('<!--HEAD-->', `
        <meta http-equiv="Content-Security-Policy" content="${cspStr}">
        <link rel="stylesheet" href="${webview.asWebviewUri(codiconsUri)}" crossorigin/>
      `)
      .replace('<!--BODY-->', ``)

      return preparedHtml;
  }
}

export class SQLiteEditorProvider extends SQLiteReadonlyEditorProvider implements vsc.CustomEditorProvider<SQLiteDocument> {
  protected setupListeners(document: SQLiteDocument): vsc.Disposable[] {
    const listeners: vsc.Disposable[] = [];

    listeners.push(document.onDidChange(edit => {
      // Tell VS Code that the document has been edited by the use.
      this._onDidChangeCustomDocument.fire({ document, ...edit });
    }));

    listeners.push(document.onDidChangeContent(async () => {
      // Update all webviews when the document changes
      const { filename } = document.uriParts;
      for (const panel of this.webviews.get(document.uri)) {
        const webviewRemote = this.webviewRemotes.get(panel);
        await webviewRemote?.forceUpdate(filename);
      }
    }));

    return listeners;
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
}

const registerOptions = {
  webviewOptions: {
    enableFindWidget: false,
    retainContextWhenHidden: true, // TODO: serialize state!?
  },
  supportsMultipleEditorsPerDocument: true,
} satisfies Parameters<typeof vsc.window.registerCustomEditorProvider>[2];

export class SQLiteEditorDefaultProvider extends (IsReadWrite ? SQLiteEditorProvider : SQLiteReadonlyEditorProvider) {
  static viewType = `${ExtensionId}.view`;

  public static register(context: vsc.ExtensionContext, reporter: TelemetryReporter): vsc.Disposable {
    return vsc.window.registerCustomEditorProvider(
      SQLiteEditorDefaultProvider.viewType,
      new SQLiteEditorDefaultProvider(context, reporter),
      registerOptions);
  }
}

export class SQLiteEditorOptionProvider extends (IsReadWrite ? SQLiteEditorProvider : SQLiteReadonlyEditorProvider) {
  static viewType = `${ExtensionId}.option`;

  public static register(context: vsc.ExtensionContext, reporter: TelemetryReporter): vsc.Disposable {
    return vsc.window.registerCustomEditorProvider(
      SQLiteEditorOptionProvider.viewType,
      new SQLiteEditorOptionProvider(context, reporter),
      registerOptions);
  }
}

