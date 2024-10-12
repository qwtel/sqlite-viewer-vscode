import type TelemetryReporter from '@vscode/extension-telemetry';
import { WebviewFns } from '../sqlite-viewer-core/src/file-system';
import type { WorkerDb, SqlValue } from '../sqlite-viewer-core/src/worker-db';

import * as vsc from 'vscode';
import * as jose from 'jose';

import * as Caplink from "../sqlite-viewer-core/src/caplink";
import { WireEndpoint } from '../sqlite-viewer-core/src/vendor/postmessage-over-wire/comlinked'

import { AccessToken, ExtensionId, FullExtensionId, JWTPublicKey, LicenseKey } from './constants';
import { Disposable, disposeAll } from './dispose';
import { IS_VSCODE, IS_VSCODIUM, WebviewCollection, WebviewStream, cancellationTokenToAbortSignal, cspUtil, getUriParts } from './util';
import { VscodeFns } from './vscodeFns';
import { WorkerBundle } from './workerBundle';
import { createWebWorker, getConfiguredMaxFileSize } from './webWorker';
// import type { Credentials } from './credentials';

//#region Pro
const pro__createTxikiWorker: () => never = () => { throw new Error("Not implemented") }
class UndoHistory<_T> {
  static restore(_buffer: Uint8Array): never { throw new Error("Not implemented") }
  constructor(_max: number) {}
  push(_edit: SQLiteEdit): never { throw new Error("Not implemented") }
  undo(): never { throw new Error("Not implemented") }
  redo(): never { throw new Error("Not implemented") }
  save(): never { throw new Error("Not implemented") }
  backup(): never { throw new Error("Not implemented") }
}
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

export class SQLiteDocument extends Disposable implements vsc.CustomDocument {
  static async create(
    openContext: vsc.CustomDocumentOpenContext,
    uri: vsc.Uri,
    extensionUri: vsc.Uri,
    isPro: boolean,
    token: vsc.CancellationToken,
  ): Promise<SQLiteDocument> {

    const createWorkerBundle = !import.meta.env.BROWSER_EXT && isPro && ReadWriteMode // Do not change this line
      ? pro__createTxikiWorker
      : createWebWorker;

    // const readWriteMode = !import.meta.env.BROWSER_EXT && pro__IsPro && canUseNativeSqlite3;

    const { filename } = getUriParts(uri);
    const { workerFns, createWorkerDb } = await createWorkerBundle(extensionUri, filename, uri);
    const { promise } = await createWorkerDb(uri, filename, extensionUri);

    let edits: SQLiteEdit[] = []
    if (typeof openContext.backupId === 'string') {
      const editsUri = vsc.Uri.parse(openContext.backupId);
      const editsBuffer = await vsc.workspace.fs.readFile(editsUri);
      edits = UndoHistory.restore(editsBuffer);
    }

    const workerDbPromise = promise
      .then(dbRemote => dbRemote.applyEdits(edits, cancellationTokenToAbortSignal(token)))
      .then(() => promise);

    return new SQLiteDocument(uri, workerFns, createWorkerDb, workerDbPromise);
  }

  getConfiguredMaxFileSize() { return getConfiguredMaxFileSize() }

  readonly #uri: vsc.Uri;

  #history = new UndoHistory<SQLiteEdit>(100);

  private constructor(
    uri: vsc.Uri,
    private readonly workerFns: WorkerBundle["workerFns"],
    private readonly createWorkerDb: WorkerBundle["createWorkerDb"],
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
    const dbRemote = await this.getDb();
    await dbRemote.commit(cancellationTokenToAbortSignal(token));
    this.#history.save();
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
    const data = await dbRemote.exportDb(filename, cancellationTokenToAbortSignal(token));
    await vsc.workspace.fs.writeFile(targetResource, data);
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
    readonly isPro: boolean,
    readonly reporter: TelemetryReporter,
  ) {}

  async openCustomDocument(
    uri: vsc.Uri,
    openContext: vsc.CustomDocumentOpenContext,
    token: vsc.CancellationToken
  ): Promise<SQLiteDocument> {

    const document = await SQLiteDocument.create(openContext, uri, this.context.extensionUri, this.isPro, token);

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

    listeners.push(vsc.window.onDidChangeActiveColorTheme(async (theme) => {
      for (const panel of this.webviews.get(document.uri)) {
        const webviewRemote = this.webviewRemotes.get(panel);
        await webviewRemote?.setColorScheme(themeToCss(theme));
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

    const preparedHtml = html
      .replace(/(href|src)="(\/[^"]*)"/g, (_, attr, url) => {
        return `${attr}="${assetAsWebviewUri(url)}"`;
      })
      .replace('<!--HEAD-->', `
        <meta http-equiv="Content-Security-Policy" content="${cspStr}">
        <meta name="color-scheme" content="${themeToCss(vsc.window.activeColorTheme)}">
        <link rel="stylesheet" href="${webview.asWebviewUri(codiconsUri)}" crossorigin/>
      `)
      .replace('<!--BODY-->', ``)

      return preparedHtml;
  }

  enterLicenseKey() {
    return enterLicenseKeyCommand(this.context, this.reporter);
  }
}

function themeToCss(theme: vsc.ColorTheme) {
  switch (theme.kind) {
    case vsc.ColorThemeKind.Dark:
      return 'dark';
    case vsc.ColorThemeKind.Light:
      return 'light';
    case vsc.ColorThemeKind.HighContrast:
      return 'dark';
    case vsc.ColorThemeKind.HighContrastLight:
      return 'light';
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

function registerProvider(context: vsc.ExtensionContext, viewType: string, isPro: boolean, reporter: TelemetryReporter) {
  const isReadWrite = !import.meta.env.BROWSER_EXT && isPro && ReadWriteMode;
  return vsc.window.registerCustomEditorProvider(
    viewType,
    new class extends (isReadWrite ? SQLiteEditorProvider : SQLiteReadonlyEditorProvider) { static viewType = viewType }(context, isPro, reporter),
    {
      webviewOptions: {
        enableFindWidget: false,
        retainContextWhenHidden: true, // TODO: serialize state!?
      },
      supportsMultipleEditorsPerDocument: true,
    }
  );
}

const providerSubscriptions = new WeakMap<vsc.ExtensionContext, vsc.Disposable[]>();

export async function activateProviders(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const prevSubs = providerSubscriptions.get(context);
  // console.log({ prevSubs });
  prevSubs && disposeAll(prevSubs);

  let subs;
  providerSubscriptions.set(context, subs = []);

  const accessToken = context.globalState.get<string>(AccessToken);
  const valid = !!accessToken && await verifyToken(accessToken);

  subs.push(registerProvider(context, `${ExtensionId}.view`, valid, reporter));
  subs.push(registerProvider(context, `${ExtensionId}.option`, valid, reporter));

  context.subscriptions.push(...subs);
}

export async function enterLicenseKeyCommand(context: vsc.ExtensionContext, reporter: TelemetryReporter) {
  const licenseKey = await vsc.window.showInputBox({
    prompt: 'Enter License Key',
    placeHolder: 'XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX',
    password: false,
    ignoreFocusOut: true,
    validateInput: (value) => {
      return /[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}/i.test(value) || context.extensionMode === vsc.ExtensionMode.Development
        ? null
        : 'License key must be in the format XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX';
    },
  });
  if (!licenseKey) {
    if (context.extensionMode === vsc.ExtensionMode.Development) {
      await Promise.all([
        context.globalState.update(LicenseKey, ''),
        context.globalState.update(AccessToken, ''),
      ]);
      return activateProviders(context, reporter);
    }
    throw Error('No license key entered');
  }
  if (!/[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}/i.test(licenseKey)) throw Error('Invalid license key format');

  let response;
  try {
    const baseURL = context.extensionMode === vsc.ExtensionMode.Development ? 'http://localhost:8788' : 'https://vscode.sqliteviewer.app';
    response = await fetch(new URL('/api/register', baseURL), {
      method: 'POST',
      headers: [['Content-Type', 'application/x-www-form-urlencoded']],
      body: new URLSearchParams({ 'license_key': licenseKey }),
    });
  } catch {
    throw Error('No response from license validation service');
  }

  if (!response.ok || response.headers.get('Content-Type')?.includes('application/json') === false) {
    const message = await response.text();
    throw Error(`License validation request failed: ${message}`);
  }

  let data;
  try {
    data = await response.json() as { token: string };
  } catch {
    throw Error('Failed to parse response');
  }
				
  // console.log(data);

  await Promise.all([
    context.globalState.update(LicenseKey, licenseKey),
    context.globalState.update(AccessToken, data.token),
  ]);
  await activateProviders(context, reporter);

  vsc.window.showInformationMessage('Thank you for purchasing SQLite Viewer PRO!', {
    modal: true, 
    detail: 'SQLite Viewer PRO will be enabled once you open the next file.'
  });
}

function getDaysSinceIssued(token: string) {
	const payload = jose.decodeJwt(token);
  const issuedAt = payload.iat!;
  const currentTime = Date.now() / 1000;
  const diffSeconds = currentTime - issuedAt;
  const diffDays = diffSeconds / (24 * 60 * 60);
  // console.log({ diffDays })
  return diffDays;
}

export async function refreshAccessToken(context: vsc.ExtensionContext, accessToken: string) {
  let response;
  try {
    const baseURL = context.extensionMode === vsc.ExtensionMode.Development ? 'http://localhost:8788' : 'https://vscode.sqliteviewer.app';
    const daysSinceIssued = getDaysSinceIssued(accessToken);
    if (daysSinceIssued > 14) {
      const licenseKey = context.globalState.get<string>(LicenseKey);
      if (!licenseKey) return console.warn('No license key');
      response = await fetch(new URL('/api/register', baseURL), {
        method: 'POST',
        headers: [['Content-Type', 'application/x-www-form-urlencoded']],
        body: new URLSearchParams({ 'license_key': licenseKey }),
      });
    } else if (daysSinceIssued > 0.05) {
      response = await fetch(new URL('/api/refresh', baseURL), {
        method: 'POST',
        headers: [['Content-Type', 'application/x-www-form-urlencoded']],
        body: new URLSearchParams({ 'access_token': accessToken }),
      });
    } else {
      // console.log("OK")
      return;
    }
  } catch {
    return console.warn('No response from license validation service');
  }

  if (!response.ok || response.headers.get('Content-Type')?.includes('application/json') === false) {
    response.text().then(console.error).catch();
    return console.warn(`License validation request failed: ${response.status}`);
  }

  let data;
  try {
    data = await response.json() as { token: string };
  } catch {
    return console.warn('Failed to parse response');
  }
				
  // console.log(data);
  return context.globalState.update(AccessToken, data.token);
}

const jwtKey = jose.importSPKI(JWTPublicKey, 'ES256');
jwtKey.catch();
export async function verifyToken(accessToken: string) {
  try {
    const { payload } = await jose.jwtVerify(accessToken, await jwtKey);
    return !!payload;
  } catch {
    return false;
  }
}
