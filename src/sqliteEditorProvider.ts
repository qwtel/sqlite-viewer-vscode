import type { TelemetryReporter } from '@vscode/extension-telemetry';
import type { WebviewFns } from '../sqlite-viewer-core/src/file-system';

import * as vsc from 'vscode';
import * as v8 from '@workers/v8-value-serializer/v8';
import { base64 } from '@scure/base';

import * as Caplink from "../sqlite-viewer-core/src/caplink";
import { WireEndpoint } from '../sqlite-viewer-core/src/vendor/postmessage-over-wire/comlinked'

import { crypto } from './o/crypto';
import { ConfigurationSection, CopilotChatId, ExtensionId, FistInstallMs, FullExtensionId, Ns, SidebarLeft, SidebarRight } from './constants';
import { Disposable } from './dispose';
import { IsVSCode, IsVSCodium, WebviewCollection, WebviewStream, cspUtil, doTry, toDatasetAttrs, themeToCss, uiKindToString, BoolString, toBoolString, IsCursorIDE, lang } from './util';

import { enterLicenseKeyCommand } from './commands';
import { ReadWriteMode, RemoteWorkspaceMode, SQLiteDocument, getInstantCommit } from './sqliteDocument';

export type VSCODE_ENV = {
  webviewId: string,
  browserExt?: BoolString,
  appName: string, 
  appHost: string,
  uriScheme: string, 
  extensionUrl: string,
  accessToken?: string,
  uiKind?: 'desktop'|'web',
  machineId: string,
  firstInstall?: string,
  sidebarLeft?: string
  sidebarRight?: string
  l10nBundle?: string,
  panelVisible?: BoolString,
  panelActive?: BoolString,
  copilotActive?: BoolString,
  instantCommit?: BoolString,
  remoteWorkspace?: BoolString,
  doubleClickBehavior?: string,
};

export class SQLiteReadonlyEditorProvider extends Disposable implements vsc.CustomReadonlyEditorProvider<SQLiteDocument> {
  readonly webviews = new WebviewCollection();
  readonly webviewRemotes = new Map<vsc.WebviewPanel, Caplink.Remote<WebviewFns>>

  constructor(
    readonly viewType: string,
    readonly context: vsc.ExtensionContext,
    readonly reporter: TelemetryReporter,
    readonly outputChannel: vsc.OutputChannel|null,
    readonly verified: boolean,
    readonly accessToken?: string,
    readonly readOnly?: boolean,
  ) {
    super();
  }

  async openCustomDocument(
    uri: vsc.Uri,
    openContext: vsc.CustomDocumentOpenContext,
    token?: vsc.CancellationToken
  ): Promise<SQLiteDocument> {

    const document = await SQLiteDocument.create(this, uri, openContext, token);

    this.setupListeners(document);

    document.onDidDispose(() => {
      this.dispose();
    });

    return document;
  }

  protected setupListeners(document: SQLiteDocument) {
    this._register(vsc.window.onDidChangeActiveColorTheme((theme) => {
      const value = themeToCss(theme)
      for (const remote of this.#getWebviewRemotes(document.uri)) {
        remote.updateColorScheme(value).catch(console.warn);
      }
    }));

    this._register(vsc.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(`${ConfigurationSection}.instantCommit`)) {
        const value = document.instantCommit = getInstantCommit();
        for (const remote of this.#getWebviewRemotes(document.uri)) {
          remote.updateInstantCommit(value).catch(console.warn);
        }
      }
      
      if (e.affectsConfiguration(`${ConfigurationSection}.doubleClickBehavior`)) {
        const value = document.doubleClickBehavior;
        for (const remote of this.#getWebviewRemotes(document.uri)) {
          remote.updateDoubleClickBehavior(value).catch(console.warn);
        }
      }
    }));

    // Listen for when this document gains focus to trigger pending saves
    this._register(vsc.window.onDidChangeActiveTextEditor(editor => {
    }));
  }

  *#getWebviewRemotes(uri: vsc.Uri): Generator<Caplink.Remote<WebviewFns>> {
    for (const panel of this.webviews.get(uri)) {
      const webviewRemote = this.webviewRemotes.get(panel);
      if (webviewRemote) {
        yield webviewRemote;
      }
    }
  }

  #mkWebviewPanelDidDispose = (webviewPanel: vsc.WebviewPanel) => () => {
    this.webviewRemotes.get(webviewPanel)?.[Symbol.dispose]();
    this.webviewRemotes.delete(webviewPanel);
  }

  #mkWebviewPanelDidChangeViewState = (webviewPanel: vsc.WebviewPanel, document: SQLiteDocument) => (e: vsc.WebviewPanelOnDidChangeViewStateEvent) => {
    const webviewRemote = this.webviewRemotes.get(webviewPanel);
    if (webviewRemote) {
      webviewRemote.updateViewState({
        visible: e.webviewPanel.visible,
        active: e.webviewPanel.active,
        // viewColumn: e.webviewPanel.viewColumn,
      }).catch(() => {})
    }
    // If the webview panel is active and there is a pending save, save the document
    document.hasActiveEditor = e.webviewPanel.active;
    if (e.webviewPanel.active && document.pendingSave) {
      document.forceSave().catch(() => {});
    }
  }

  #mkExtensionsDidChange = (webviewPanel: vsc.WebviewPanel) => () => {
    const chat = vsc.extensions.getExtension(CopilotChatId);
    const webviewRemote = this.webviewRemotes.get(webviewPanel);
    webviewRemote?.updateCopilotActive(!!chat?.isActive || IsCursorIDE).catch(() => {})
  }

  async resolveCustomEditor(
    document: SQLiteDocument,
    webviewPanel: vsc.WebviewPanel,
    _token: vsc.CancellationToken
  ): Promise<void> {
    const webviewId = crypto.randomUUID();
    this.webviews.add(document.uri, webviewPanel, webviewId);

    const webviewEndpoint = new WireEndpoint(new WebviewStream(webviewPanel), document.uriParts.filename)
    webviewEndpoint.addEventListener('messageerror', ev => console.error('WireEndpoint.onmessageerror', ev.data))
    webviewEndpoint.addEventListener('error', ev => console.error('WireEndpoint.onerror', ev.error))

    const webviewRemote = Caplink.wrap<WebviewFns>(webviewEndpoint, undefined, { owned: true });
    this.webviewRemotes.set(webviewPanel, webviewRemote);

    Caplink.expose(document.vscodeFns, webviewEndpoint);

    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = await this.#getHtmlForWebview(webviewPanel, document, webviewId);

    document.hasActiveEditor = webviewPanel.active;

    webviewPanel.onDidChangeViewState(this.#mkWebviewPanelDidChangeViewState(webviewPanel, document)),
    webviewPanel.onDidDispose(this.#mkWebviewPanelDidDispose(webviewPanel));

    vsc.extensions.onDidChange(this.#mkExtensionsDidChange(webviewPanel));
  }

  async #getHtmlForWebview(webviewPanel: vsc.WebviewPanel, document: SQLiteDocument, webviewId: string): Promise<string> {
    const { webview } = webviewPanel;
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
    const cspStr = IsVSCode || IsVSCodium
      ? cspUtil.build(cspObj)
      : ''

    const { uriScheme, appHost, appName, uiKind } = vsc.env;
    const extensionUrl = uriScheme?.includes('vscode')
      ? `https://marketplace.visualstudio.com/items?itemName=${FullExtensionId}&ref=vscode`
      : `https://open-vsx.org/extension/${Ns}/${ExtensionId}&ref=vscode`;

    const vscodeEnv = {
      webviewId,
      browserExt: toBoolString(!!import.meta.env.VSCODE_BROWSER_EXT),
      uriScheme, appHost, appName, extensionUrl, 
      accessToken: this.accessToken, 
      uiKind: uiKindToString(uiKind),
      machineId: vsc.env.machineId,
      firstInstall: doTry(() => new Date(this.context.globalState.get<number>(FistInstallMs) ?? Date.now()).toISOString()),
      sidebarLeft: this.context.globalState.get<number>(SidebarLeft)?.toString(),
      sidebarRight: this.context.globalState.get<number>(SidebarRight)?.toString(),
      l10nBundle: doTry(() => base64.encode(v8.serialize(vsc.l10n.bundle))), // XXX: this is a hack to get the l10n bundle into the webview, maybe send as a message instead?
      panelVisible: toBoolString(webviewPanel.visible),
      panelActive: toBoolString(webviewPanel.active),
      copilotActive: toBoolString(vsc.extensions.getExtension(CopilotChatId)?.isActive || IsCursorIDE),
      instantCommit: toBoolString(document.instantCommit),
      remoteWorkspace: toBoolString(RemoteWorkspaceMode),
      doubleClickBehavior: document.doubleClickBehavior,
    } satisfies VSCODE_ENV;

    const preparedHtml = html
      .replace('<html lang="en"', `<html lang="${lang}"`)
      .replace(/(href|src)="(\/[^"]*)"/g, (_, attr, url) => {
        return `${attr}="${assetAsWebviewUri(url)}"`;
      })
      .replace('<!--HEAD-->', `
        <meta http-equiv="Content-Security-Policy" content="${cspStr}">
        <meta name="color-scheme" content="${themeToCss(vsc.window.activeColorTheme)}">
        <meta id="vscode-env" ${toDatasetAttrs(vscodeEnv)}>
        <link rel="stylesheet" href="${webview.asWebviewUri(codiconsUri)}" crossorigin/>
      `)
      .replace('<!--BODY-->', ``)

      return preparedHtml;
  }

  enterLicenseKey() {
    return enterLicenseKeyCommand(this.context, this.reporter);
  }
}

export class SQLiteEditorProvider extends SQLiteReadonlyEditorProvider implements vsc.CustomEditorProvider<SQLiteDocument> {
  protected setupListeners(document: SQLiteDocument) {
    super.setupListeners(document);

    this._register(document.onDidChange(edit => {
      // Tell VS Code that the document has been edited by the use.
      this.#onDidChangeCustomDocument.fire({ document, ...edit });
    }));

    this._register(document.onDidChangeContent(async () => {
      // Update all webviews when the document changes
      const { filename } = document.uriParts;
      for (const panel of this.webviews.get(document.uri)) {
        const webviewRemote = this.webviewRemotes.get(panel);
        await webviewRemote?.forceUpdate(filename);
      }
    }));
  }

  readonly #onDidChangeCustomDocument = new vsc.EventEmitter<vsc.CustomDocumentEditEvent<SQLiteDocument>>();
  readonly onDidChangeCustomDocument = this.#onDidChangeCustomDocument.event;

  saveCustomDocument(document: SQLiteDocument, cancellation: vsc.CancellationToken): Thenable<void> {
    return document.save(cancellation);
  }

  saveCustomDocumentAs(document: SQLiteDocument, destination: vsc.Uri, cancellation: vsc.CancellationToken): Thenable<void> {
    return document.saveAs(destination, cancellation);
  }

  revertCustomDocument(document: SQLiteDocument, cancellation: vsc.CancellationToken): Thenable<void> {
    return document.revert(cancellation);
  }

  backupCustomDocument(document: SQLiteDocument, context: vsc.CustomDocumentBackupContext, cancellation: vsc.CancellationToken): Thenable<vsc.CustomDocumentBackup> {
    return document.backup(context.destination, cancellation);
  }
}

export function registerEditorProvider(
  viewType: string, 
  context: vsc.ExtensionContext, 
  reporter: TelemetryReporter, 
  outputChannel: vsc.OutputChannel|null,
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
