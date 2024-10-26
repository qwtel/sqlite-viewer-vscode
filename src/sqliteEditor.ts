import type TelemetryReporter from '@vscode/extension-telemetry';
import type { WebviewFns } from '../sqlite-viewer-core/src/file-system';
import type { WorkerDb, SqlValue } from '../sqlite-viewer-core/src/worker-db';

import * as vsc from 'vscode';

import * as Caplink from "../sqlite-viewer-core/src/caplink";
import { WireEndpoint } from '../sqlite-viewer-core/src/vendor/postmessage-over-wire/comlinked'

import { AccessToken, ExtensionId, FullExtensionId, LicenseKey, Ns } from './constants';
import { Disposable, disposeAll } from './dispose';
import { IS_DESKTOP, IS_VSCODE, IS_VSCODIUM, WebviewCollection, WebviewStream, cancelTokenToAbortSignal, cspUtil, getShortMachineId, getUriParts } from './util';
import { VscodeFns } from './vscodeFns';
import { WorkerBundle } from './workerBundle';
import { createWebWorker, getConfiguredMaxFileSize } from './webWorker';
import { enterLicenseKeyCommand } from './commands';

//#region Pro
import { createProWorker } from '../sqlite-viewer-core/pro/src/proWorker';
import { UndoHistory } from '../sqlite-viewer-core/pro/src/undoHistory';
//#endregion

export type SQLiteEdit = {
  label: string,
  query: string,
  values: SqlValue[],
  undoQuery?: string,
  undoValues: SqlValue[],
};

const Extension = vsc.extensions.getExtension(FullExtensionId);

const LocalMode = !vsc.env.remoteName;
const RemoteWorkspaceMode = !!vsc.env.remoteName && Extension?.extensionKind === vsc.ExtensionKind.Workspace;
const ReadWriteMode = LocalMode || RemoteWorkspaceMode;

const MaxHistory = 100;

export class SQLiteDocument extends Disposable implements vsc.CustomDocument {
  static async create(
    openContext: vsc.CustomDocumentOpenContext,
    uri: vsc.Uri,
    extensionUri: vsc.Uri,
    isPro: boolean,
    token: vsc.CancellationToken,
  ): Promise<SQLiteDocument> {

    const createWorkerBundle = !import.meta.env.VSCODE_BROWSER_EXT && isPro && ReadWriteMode // Do not change this line
      ? createProWorker
      : createWebWorker;

    // const readWriteMode = !import.meta.env.VSCODE_BROWSER_EXT && pro__IsPro && canUseNativeSqlite3;

    const { filename } = getUriParts(uri);
    const { workerFns, createWorkerDb } = await createWorkerBundle(extensionUri, filename, uri);
    const { promise } = await createWorkerDb(uri, filename, extensionUri);

    let history: UndoHistory<SQLiteEdit>|null = null;
    let workerDbPromise = promise;
    if (typeof openContext.backupId === 'string') {
      const editsUri = vsc.Uri.parse(openContext.backupId);
      const editsBuffer = await vsc.workspace.fs.readFile(editsUri);
      const h = history = UndoHistory.restore(editsBuffer, MaxHistory);
      workerDbPromise = promise
        .then(dbRemote => dbRemote.applyEdits(h.getUnsavedEdits(), cancelTokenToAbortSignal(token)))
        .then(() => promise);
    }

    return new SQLiteDocument(uri, history, workerFns, createWorkerDb, workerDbPromise);
  }

  getConfiguredMaxFileSize() { return getConfiguredMaxFileSize() }

  readonly #uri: vsc.Uri;

  #history: UndoHistory<SQLiteEdit>;

  private constructor(
    uri: vsc.Uri,
    history: UndoHistory<SQLiteEdit>|null,
    private readonly workerFns: WorkerBundle["workerFns"],
    private readonly createWorkerDb: WorkerBundle["createWorkerDb"],
    private workerDbPromise: Promise<Caplink.Remote<WorkerDb>>,
  ) {
    super();
    this.#uri = uri;
    this.#history = history ?? new UndoHistory<SQLiteEdit>(MaxHistory);
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
    undo(): void|Promise<void>,
    redo(): void|Promise<void>,
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
    this.workerFns[Symbol.dispose]();
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
    history.push(edit);
    this._onDidChange.fire({
      label: edit.label,
      undo: async () => {
        const edit = history.undo();
        if (!edit) return;
        const dbRemote = await this.getDb();
        await dbRemote.undo(edit);
        this.#onDidChangeDocument.fire({ /* edits: this.#edits */ });
      },
      redo: async () => {
        const edit = history.redo();
        if (!edit) return;
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
    await this.#history.save();
    const dbRemote = await this.getDb();
    await dbRemote.commit(cancelTokenToAbortSignal(token));
  }

  /**
   * Called by VS Code when the user saves the document to a new location.
   */
  async saveAs(targetResource: vsc.Uri, token: vsc.CancellationToken): Promise<void> {
    const dbRemote = await this.getDb();
    const stat = await vsc.workspace.fs.stat(this.uri);
    if (stat.size > this.getConfiguredMaxFileSize()) {
      throw new Error("File too large to save");
    }
    const { filename } = this.uriParts;
    const data = await dbRemote.exportDb(filename, cancelTokenToAbortSignal(token));
    await vsc.workspace.fs.writeFile(targetResource, data);
  }

  /**
   * Called by VS Code when the user calls `revert` on a document.
   */
  async revert(token: vsc.CancellationToken): Promise<void> {
    const dbRemote = await this.getDb();
    await dbRemote.rollback(cancelTokenToAbortSignal(token));
    // XXX: how to handle savedEdits in this case?
  }

  async getDb() {
    return this.workerDbPromise;
  }

  async refreshDb() {
    const dbRemote = await this.workerDbPromise;
    if ((await dbRemote.type) === 'wasm') {
      dbRemote[Symbol.dispose]();
      const { promise } = await this.createWorkerDb(this.uri, this.uriParts.filename);
      this.workerDbPromise = promise;
      return promise;
    }
    return this.workerDbPromise;
  }

  /**
   * Called by VS Code to backup the edited document.
   *
   * These backups are used to implement hot exit.
   */
  async backup(destination: vsc.Uri, _token: vsc.CancellationToken): Promise<vsc.CustomDocumentBackup> {
    const unsavedEditsBuffer = this.#history.backup();
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
    readonly verified: boolean,
    readonly accessToken?: string,
  ) {}

  async openCustomDocument(
    uri: vsc.Uri,
    openContext: vsc.CustomDocumentOpenContext,
    token: vsc.CancellationToken
  ): Promise<SQLiteDocument> {

    const document = await SQLiteDocument.create(openContext, uri, this.context.extensionUri, this.verified, token);

    const listeners = this.setupListeners(document);

    this.hostFns.set(document, new VscodeFns(this, document));

    document.onDidDispose(() => {
      this.hostFns.delete(document);
      disposeAll(listeners)
    });

    return document;
  }

  protected setupListeners(document: SQLiteDocument): vsc.Disposable[] {
    const listeners: vsc.Disposable[] = [];

    listeners.push(vsc.window.onDidChangeActiveColorTheme((theme) => {
      for (const panel of this.webviews.get(document.uri)) {
        const webviewRemote = this.webviewRemotes.get(panel);
        webviewRemote?.updateColorScheme(themeToCss(theme)).catch(console.warn);
      }
    }));

    return listeners;
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

    const webviewRemote = Caplink.wrap<WebviewFns>(webviewEndpoint);
    this.webviewRemotes.set(webviewPanel, webviewRemote);

    const vscodeFns = this.hostFns.get(document)!;
    Caplink.expose(vscodeFns, webviewEndpoint);

    webviewPanel.webview.options = { enableScripts: true };
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

    const html = new TextDecoder().decode(await vsc.workspace.fs.readFile(vsc.Uri.joinPath(buildUri, 'index.html')));

    const cspObj = {
      [cspUtil.defaultSrc]: [webview.cspSource],
      [cspUtil.scriptSrc]: [webview.cspSource, cspUtil.wasmUnsafeEval],
      [cspUtil.styleSrc]: [webview.cspSource, cspUtil.inlineStyle],
      [cspUtil.imgSrc]: [webview.cspSource, cspUtil.data],
      [cspUtil.fontSrc]: [webview.cspSource],
      [cspUtil.frameSrc]: [this.context.extensionMode === vsc.ExtensionMode.Development ? '*' : 'https://vscode.sqliteviewer.app'],
      [cspUtil.childSrc]: [cspUtil.blob],
    };

    // Only set csp for hosts that are known to correctly set `webview.cspSource`
    const cspStr = IS_VSCODE || IS_VSCODIUM
      ? cspUtil.build(cspObj)
      : ''

    const { uriScheme, appHost, appName, uiKind } = vsc.env;
    const extensionUrl = uriScheme.includes('vscode')
      ? `https://marketplace.visualstudio.com/items?itemName=${FullExtensionId}&ref=vscode`
      : `https://open-vsx.org/extension/${Ns}/${ExtensionId}&ref=vscode`;

    const vscodeEnv = { 
      uriScheme, appHost, appName, extensionUrl, 
      accessToken: this.accessToken, 
      uiKind: uiKindToString(uiKind),
      machineId: vsc.env.machineId,
    };

    const preparedHtml = html
      .replace(/(href|src)="(\/[^"]*)"/g, (_, attr, url) => {
        return `${attr}="${assetAsWebviewUri(url)}"`;
      })
      .replace('<!--HEAD-->', `
        <meta http-equiv="Content-Security-Policy" content="${cspStr}">
        <meta name="color-scheme" content="${themeToCss(vsc.window.activeColorTheme)}">
        <meta id="__VSCODE_ENV__" ${toDatasetAttrs(vscodeEnv)}>
        <link rel="stylesheet" href="${webview.asWebviewUri(codiconsUri)}" crossorigin/>
      `)
      .replace('<!--BODY-->', ``)

      return preparedHtml;
  }

  enterLicenseKey() {
    return enterLicenseKeyCommand(this.context, this.reporter);
  }
}

const toDashCase = (str: string) => str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
function toDatasetAttrs(obj: Record<string, string|undefined>) {
  return Object.entries(obj).map(([k, v]) => v != null ? `data-${toDashCase(k)}="${v}"` : '').join(' ');
}

function themeToCss(theme: vsc.ColorTheme) {
  switch (theme.kind) {
    case vsc.ColorThemeKind.Dark: return 'dark';
    case vsc.ColorThemeKind.Light: return 'light';
    case vsc.ColorThemeKind.HighContrast: return 'dark';
    case vsc.ColorThemeKind.HighContrastLight: return 'light';
  }
}

function uiKindToString(uiKind: vsc.UIKind) {
  switch (uiKind) {
    case vsc.UIKind.Web: return 'web';
    case vsc.UIKind.Desktop: return 'desktop';
  }
}

export class SQLiteEditorProvider extends SQLiteReadonlyEditorProvider implements vsc.CustomEditorProvider<SQLiteDocument> {
  protected setupListeners(document: SQLiteDocument): vsc.Disposable[] {
    const listeners: vsc.Disposable[] = super.setupListeners(document);

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

export function registerProvider(context: vsc.ExtensionContext, reporter: TelemetryReporter, viewType: string, verified: boolean, accessToken?: string) {
  const isReadWrite = !import.meta.env.VSCODE_BROWSER_EXT && verified && ReadWriteMode;
  return vsc.window.registerCustomEditorProvider(
    viewType,
    new class extends (isReadWrite ? SQLiteEditorProvider : SQLiteReadonlyEditorProvider) { static viewType = viewType }(context, reporter, verified, accessToken),
    {
      webviewOptions: {
        enableFindWidget: false,
        retainContextWhenHidden: true, // TODO: serialize state!?
      },
      supportsMultipleEditorsPerDocument: true,
    }
  );
}
