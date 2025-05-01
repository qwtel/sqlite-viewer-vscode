import type TelemetryReporter from '@vscode/extension-telemetry';
import type { WebviewFns } from '../sqlite-viewer-core/src/file-system';
import type { WorkerDb, SqlValue } from '../sqlite-viewer-core/src/worker-db';

import * as vsc from 'vscode';
import * as v8 from '@workers/v8-value-serializer/v8';
import { encodeBase64 } from '@std/encoding';

import * as Caplink from "../sqlite-viewer-core/src/caplink";
import { WireEndpoint } from '../sqlite-viewer-core/src/vendor/postmessage-over-wire/comlinked'

import { AccessToken, ExtensionId, FistInstallMs, FullExtensionId, LicenseKey, Ns, SidebarLeft, SidebarRight } from './constants';
import { Disposable, disposeAll } from './dispose';
import { ESDisposable, IS_DESKTOP, IS_VSCODE, IS_VSCODIUM, WebviewCollection, WebviewStream, cancelTokenToAbortSignal, cspUtil, getShortMachineId, getUriParts, doTry } from './util';
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

export type BoolString = 'true'|'false';
export const toBoolString = (x?: boolean|null): BoolString|undefined => x === true ? 'true' : x === false ? 'false' : undefined;

export type VSCODE_ENV = {
    appName: string, 
    appHost: string,
    uriScheme: string, 
    extensionUrl: string,
    accessToken?: string,
    uiKind?: 'desktop'|'web',
    machineId: string,
    firstInstall: string,
    sidebarLeft?: string
    sidebarRight?: string
    l10nBundle?: string,
    panelVisible?: BoolString,
    panelActive?: BoolString,
};

const Extension = vsc.extensions.getExtension(FullExtensionId);

const LocalMode = !vsc.env.remoteName;
const RemoteWorkspaceMode = !!vsc.env.remoteName && Extension?.extensionKind === vsc.ExtensionKind.Workspace;
const ReadWriteMode = LocalMode || RemoteWorkspaceMode;

const MaxHistory = 100;

export const globalSQLiteDocuments = new Map<string, SQLiteDocument>();

export class SQLiteDocument extends Disposable implements vsc.CustomDocument {
  static async create(
    uri: vsc.Uri,
    openContext: vsc.CustomDocumentOpenContext,
    extensionUri: vsc.Uri,
    verified: boolean,
    readOnly?: boolean,
    reporter?: TelemetryReporter,
    token?: vsc.CancellationToken,
  ): Promise<SQLiteDocument> {

    const createWorkerBundle = !import.meta.env.VSCODE_BROWSER_EXT && verified && ReadWriteMode // Do not change this line
      ? createProWorker
      : createWebWorker;

    const { filename } = getUriParts(uri);

    let workerFns, createWorkerDb, dbRemote;
    try {
      ({ workerFns, createWorkerDb } = await createWorkerBundle(extensionUri, reporter));
      ({ dbRemote, readOnly } = await createWorkerDb(uri, filename, readOnly));
    } catch (err) {
      // In case something goes wrong, try to create using the WASM worker
      if (createWorkerBundle !== createWebWorker) {
        try {
          ({ workerFns, createWorkerDb } = await createWebWorker(extensionUri, reporter));
          ({ dbRemote, readOnly } = await createWorkerDb(uri, filename, readOnly));
          if (err instanceof Error) vsc.window.showWarningMessage(vsc.l10n.t("[{0}] occurred while trying to open '{1}'", err.message, filename), {
            detail: vsc.l10n.t('The document could not be opened using SQLite Viewer PRO and will be opened in read-only mode instead.'),
          }); 
        } catch (err2) {
          throw new AggregateError([err, err2], vsc.l10n.t('Failed to open database'));
        }
      } else {
        throw err;
      }
    }

    let history: UndoHistory<SQLiteEdit>|null = null;
    if (typeof openContext.backupId === 'string') {
      const editsUri = vsc.Uri.parse(openContext.backupId);
      const editsBuffer = await vsc.workspace.fs.readFile(editsUri);
      const h = history = UndoHistory.restore(editsBuffer, MaxHistory);

      try {
        await dbRemote.applyEdits(h.getUnsavedEdits(), cancelTokenToAbortSignal(token));
      } catch (err) {
        await vsc.window.showErrorMessage(vsc.l10n.t('[{0}] occurred while trying to apply unsaved changes', err instanceof Error ? err.message : vsc.l10n.t('Unknown error')), { 
          modal: true, 
          detail: vsc.l10n.t('The document was opened from a backup, but the unsaved changes could not be applied. The document will be opened in read-only mode.')
        });
        readOnly = true;
      }
    }

    return new SQLiteDocument(uri, history, workerFns, createWorkerDb, { dbRemote, readOnly }, reporter);
  }

  getConfiguredMaxFileSize() { return getConfiguredMaxFileSize() }

  readonly #uri: vsc.Uri;
  readonly #history: UndoHistory<SQLiteEdit>;

  private constructor(
    uri: vsc.Uri,
    history: UndoHistory<SQLiteEdit>|null,
    private readonly workerFns: WorkerBundle["workerFns"],
    private readonly createWorkerDb: WorkerBundle["createWorkerDb"],
    private workerDb: { dbRemote: Caplink.Remote<WorkerDb>, readOnly?: boolean },
    private readonly reporter?: TelemetryReporter,
  ) {
    super();
    this.#uri = uri;
    this.#history = history ?? new UndoHistory<SQLiteEdit>(MaxHistory);
    globalSQLiteDocuments.set(this.uri.path, this);
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
    globalSQLiteDocuments.delete(this.uri.path);
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
        await this.db.undo(edit);
        this.#onDidChangeDocument.fire({ /* edits: this.#edits */ });
      },
      redo: async () => {
        const edit = history.redo();
        if (!edit) return;
        await this.db.redo(edit);
        this.#onDidChangeDocument.fire({ /* edits: this.#edits */ });
      }
    });
  }

  checkReadonly = async () => {
    if (this.readOnly) throw new Error(vsc.l10n.t('Document is read-only'));
  }

  /**
   * Called by VS Code when the user saves the document.
   */
  async save(token: vsc.CancellationToken): Promise<void> {
    await this.checkReadonly();
    await this.#history.save();
    await this.db.commit(cancelTokenToAbortSignal(token));
  }

  /**
   * Called by VS Code when the user saves the document to a new location.
   */
  async saveAs(targetResource: vsc.Uri, token: vsc.CancellationToken): Promise<void> {
    await this.checkReadonly();
    const stat = await vsc.workspace.fs.stat(this.uri);
    if (stat.size > this.getConfiguredMaxFileSize()) {
      throw new Error("File too large to save");
    }
    const { filename } = this.uriParts;
    const data = await this.db.exportDb(filename, cancelTokenToAbortSignal(token));
    await vsc.workspace.fs.writeFile(targetResource, data);
  }

  /**
   * Called by VS Code when the user calls `revert` on a document.
   */
  async revert(token: vsc.CancellationToken): Promise<void> {
    await this.checkReadonly();
    this.#history.revert();
    await this.db.rollback(this.#history.getUnsavedEdits(), cancelTokenToAbortSignal(token));
    this.#onDidChangeDocument.fire({ /* edits: this.#edits */ });
  }

  get db() {
    return this.workerDb.dbRemote;
  }

  get readOnly() {
    return this.workerDb.readOnly;
  }

  async refreshDb() {
    const oldDbRemote = this.db;
    if ((await oldDbRemote.type) === 'wasm') { // XXX: hard-coded refresh for wasm, not sure if this could be put in a better place
      oldDbRemote[Symbol.dispose]();
      const { dbRemote, readOnly } = await this.createWorkerDb(this.uri, this.uriParts.filename);
      this.workerDb = { dbRemote, readOnly };
      return dbRemote;
    }
    return oldDbRemote;
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
    readonly viewType: string,
    readonly context: vsc.ExtensionContext,
    readonly reporter: TelemetryReporter,
    readonly outputChannel: vsc.OutputChannel & ESDisposable,
    readonly verified: boolean,
    readonly accessToken?: string,
    readonly readOnly?: boolean,
  ) {}

  async openCustomDocument(
    uri: vsc.Uri,
    openContext: vsc.CustomDocumentOpenContext,
    token?: vsc.CancellationToken
  ): Promise<SQLiteDocument> {

    const document = await SQLiteDocument.create(uri, openContext, this.context.extensionUri, this.verified, this.readOnly, this.reporter, token);

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

  #mkWebviewPanelDidDispose = (webviewPanel: vsc.WebviewPanel) => () => {
    this.webviewRemotes.get(webviewPanel)?.[Symbol.dispose]();
    this.webviewRemotes.delete(webviewPanel);
  }

  #mkWebviewPanelDidChangeViewState = (webviewPanel: vsc.WebviewPanel) => (e: vsc.WebviewPanelOnDidChangeViewStateEvent) => {
    const webviewRemote = this.webviewRemotes.get(webviewPanel);
    if (webviewRemote) {
      webviewRemote.updateViewState({
        visible: e.webviewPanel.visible,
        active: e.webviewPanel.active,
        // viewColumn: e.webviewPanel.viewColumn,
      })
    }
  }

  async resolveCustomEditor(
    document: SQLiteDocument,
    webviewPanel: vsc.WebviewPanel,
    _token: vsc.CancellationToken
  ): Promise<void> {
    this.webviews.add(document.uri, webviewPanel);

    const webviewEndpoint = new WireEndpoint(new WebviewStream(webviewPanel), document.uriParts.filename)
    webviewEndpoint.addEventListener('messageerror', ev => console.error('WireEndpoint.onmessageerror', ev.data))
    webviewEndpoint.addEventListener('error', ev => console.error('WireEndpoint.onerror', ev.error))

    const webviewRemote = Caplink.wrap<WebviewFns>(webviewEndpoint, undefined, { owned: true });
    this.webviewRemotes.set(webviewPanel, webviewRemote);

    const vscodeFns = this.hostFns.get(document)!;
    Caplink.expose(vscodeFns, webviewEndpoint);

    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel);

    webviewPanel.onDidChangeViewState(this.#mkWebviewPanelDidChangeViewState(webviewPanel)),
    webviewPanel.onDidDispose(this.#mkWebviewPanelDidDispose(webviewPanel));
  }

  private async getHtmlForWebview(webviewPanel: vsc.WebviewPanel): Promise<string> {
    const webview = webviewPanel.webview;
    const buildUri = vsc.Uri.joinPath(this.context.extensionUri, 'sqlite-viewer-core', 'vscode', 'build');
    const codiconsUri = vsc.Uri.joinPath(this.context.extensionUri, 'node_modules', 'codicons', 'dist', 'codicon.css');

    const assetAsWebviewUri = (x: string) => webview.asWebviewUri(vsc.Uri.joinPath(buildUri, x));

    const html = new TextDecoder().decode(await vsc.workspace.fs.readFile(vsc.Uri.joinPath(buildUri, 'index.html')));

    const cspObj = {
      [cspUtil.defaultSrc]: [webview.cspSource],
      [cspUtil.scriptSrc]: [webview.cspSource, cspUtil.wasmUnsafeEval],
      [cspUtil.styleSrc]: [webview.cspSource, cspUtil.inlineStyle],
      [cspUtil.imgSrc]: [webview.cspSource, cspUtil.data, cspUtil.blob],
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
      firstInstall: new Date(this.context.globalState.get<number>(FistInstallMs) ?? Date.now()).toISOString(),
      sidebarLeft: this.context.globalState.get<number>(SidebarLeft)?.toString(),
      sidebarRight: this.context.globalState.get<number>(SidebarRight)?.toString(),
      l10nBundle: doTry(() => encodeBase64(v8.serialize(vsc.l10n.bundle))), // XXX: this is a hack to get the l10n bundle into the webview, maybe send as a message instead?
      panelVisible: toBoolString(webviewPanel.visible),
      panelActive: toBoolString(webviewPanel.active),
    } satisfies VSCODE_ENV;

    const lang = vsc.env.language.split('.')[0]?.replace('_', '-') ?? 'en';

    const preparedHtml = html
      .replace('<html lang="en"', `<html lang="${lang}"`)
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
function toDatasetAttrs(obj: Record<string, string|boolean|undefined>) {
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

export function registerProvider(
  viewType: string, 
  context: vsc.ExtensionContext, 
  reporter: TelemetryReporter, 
  outputChannel: vsc.OutputChannel & ESDisposable,
  { verified, accessToken, readOnly }: { verified: boolean, accessToken?: string, readOnly?: boolean }
) {
  const readWrite = !import.meta.env.VSCODE_BROWSER_EXT && verified && ReadWriteMode;
  const Provider = readWrite ? SQLiteEditorProvider : SQLiteReadonlyEditorProvider;
  return vsc.window.registerCustomEditorProvider(
    viewType,
    new Provider(viewType, context, reporter, outputChannel, verified, accessToken, readOnly),
    {
      webviewOptions: {
        enableFindWidget: false,
        retainContextWhenHidden: true, // TODO: serialize state!?
      },
      supportsMultipleEditorsPerDocument: true,
    }
  );
}

export function registerFileProvider(_context: vsc.ExtensionContext) {
  const sqliteFileProvider = new (class implements vsc.TextDocumentContentProvider {
    async provideTextDocumentContent(cellUri: vsc.Uri, token: vsc.CancellationToken): Promise<string> {
      const [cellFilename, modalId, name, table] = cellUri.path.split('/').reverse().map(decodeURIComponent)
      const documentUri = vsc.Uri.joinPath(cellUri, '../../../..');
      const document = globalSQLiteDocuments.get(documentUri.path)
      if (document) {
        const workerDb = document.db;
        if (workerDb) {
          // console.log("workerDb", await workerDb.filename, 'readonly?', await workerDb.readOnly, 'type', await workerDb.type)
          const filename = document.uriParts.filename;
          const row = await workerDb.getByRowId({ filename, table, name }, modalId, {}, cancelTokenToAbortSignal(token));
          const colName = cellFilename.endsWith('.json') ? cellFilename.slice(0, -5) : cellFilename.slice(0, -4)
          const value = row[colName];
          if (typeof value === 'string') {
            if (cellFilename.endsWith('.json')) {
              try { return value && JSON.stringify(JSON.parse(value), null, 2) } catch { return value }
            } else {
              return value;
            }
          } else if (typeof value == 'number' || typeof value == 'bigint') {
            return value.toString();
          }
        }
      }
      throw new Error(vsc.l10n.t('Document not found'));
    }
    // onDidChangeEmitter = new vsc.EventEmitter<vsc.Uri>();
    // onDidChange = this.onDidChangeEmitter.event;
  })();
  return vsc.workspace.registerTextDocumentContentProvider('sqlite-file', sqliteFileProvider);
}
