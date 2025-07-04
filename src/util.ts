import * as vsc from 'vscode';
import { base58 } from '@scure/base';
import { Disposable } from './dispose';
import { ReadableStream, WritableStream } from './o/stream/web';
import { crypto } from './o/crypto';
import { Title } from './constants';

// A bunch of tests to figure out where we're running. Some more reliable than others.
export const IsVSCode = vsc.env.uriScheme.includes("vscode");
export const IsVSCodium = vsc.env.uriScheme.includes("vscodium");
export const IsGitHubDotDev = vsc.env.uriScheme.includes("vscode") && vsc.env.appHost === "gihub.dev";
export const IsGitPodWeb = vsc.env.uriScheme.includes("gitpod-code") || vsc.env.appHost === "Gitpod" || vsc.env.appName === "Gitpod Code";
export const IsGoogleIDX = vsc.env.appName.includes("IDX") || (vsc.env.appHost === "web" && vsc.env.remoteName?.startsWith('idx'));
export const IsCursorIDE = vsc.env.appName.includes("Cursor") || vsc.env.uriScheme.includes("cursor");

export const IsDesktop = vsc.env.appHost === "desktop";

export class WebviewCollection {
  private readonly _webviews = new Set<{
    readonly resource: string;
    readonly webviewPanel: vsc.WebviewPanel;
  }>();

  public *get(uri: vsc.Uri): IterableIterator<vsc.WebviewPanel> {
    const key = uri.toString();
    for (const entry of this._webviews) {
      if (entry.resource === key) {
        yield entry.webviewPanel;
      }
    }
  }

  public has(uri: vsc.Uri): boolean {
    return !this.get(uri).next().done;
  }

  public add(uri: vsc.Uri, webviewPanel: vsc.WebviewPanel) {
    const entry = { resource: uri.toString(), webviewPanel };
    this._webviews.add(entry);

    webviewPanel.onDidDispose(() => {
      this._webviews.delete(entry);
    });
  }
}

/**
 * Wraps a VSCode webview and returns a readable and writable stream pair.
 * This can be used to overlay another binary protocol on top of the webview's message passing, such as my own `postmessage-over-wire`.
 * This is especially useful considering how badly implemented object support in vscode's `postMessage` is: No structured clone, no message channels, 
 * and randomly dropped `Uint8Array`s if there's too many in one message.
 */
export class WebviewStream extends Disposable {
  #readable;
  #writable;
  #readableController!: ReadableStreamDefaultController<Uint8Array>;
  #writableController!: WritableStreamDefaultController;
  #readableClosed = false;
  #writableClosed = false;
  constructor(private readonly webviewPanel: vsc.WebviewPanel) {
    super();
    this.#readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#readableController = controller;
        this._register(this.webviewPanel.webview.onDidReceiveMessage(data => {
          // const [header, code, port1, port2, tl, payload] = cborDecoder.decode(data);
          // console.log("Receiving...", [header, code, port1?.toString(16), port2?.toString(16), tl, payload && { byteLength: payload?.byteLength }])
          if (data instanceof Uint8Array)
            controller.enqueue(data);
        }));
        this._register(this.webviewPanel.onDidDispose(() => {
          this.#cleanup(new DOMException('Underlying webviewPanel disposed', 'AbortError'))
        }));
      },
      cancel: (reason) => {
        this.#readableClosed = true;
        this.#cleanup(reason);
      },
    });
    this.#writable = new WritableStream<Uint8Array>({
      start: (controller) => {
        this.#writableController = controller;
      },
      write: (chunk, controller) => {
        try {
          const { buffer, byteOffset, byteLength } = chunk;
          // const [header, code, port1, port2, tl, payload] = cborDecoder.decode(chunk);
          // console.log("Sending...", [header, code, port1?.toString(16), port2?.toString(16), tl, payload && { byteLength: payload?.byteLength }])
          this.webviewPanel.webview.postMessage({ buffer, byteOffset, byteLength });
        } catch (err) {
          // const [header, code, port1, port2, tl, payload] = cborDecoder.decode(chunk);
          // console.log("could not send", [header, code, port1?.toString(16), port2?.toString(16), tl, payload && { byteLength: payload?.byteLength }])
          controller.error(err);
        }
      },
      close: () => {
        this.#writableClosed = true;
        this.#cleanup(null);
      },
      abort: (reason) => {
        this.#writableClosed = true;
        this.#cleanup(reason);
      },
    });
  }
  #cleanup(reason?: any) {
    super.dispose();
    if (!this.#readableClosed) {
      this.#readableClosed = true;
      this.#readableController[reason ? 'error' : 'close'](reason);
    }
    if (!this.#writableClosed) {
      this.#writableClosed = true;
      if (this.#writable.locked || reason)
        this.#writableController.error(reason ?? new DOMException('WebviewStream disposed', 'AbortError'));
      else
        this.#writable.getWriter().close().catch(() => {});
    }
  }
  get readable() { return this.#readable }
  get writable() { return this.#writable }
  dispose() { this.#cleanup() }
  [Symbol.dispose]() { this.#cleanup() }
}

export const cspUtil = {
  defaultSrc: 'default-src',
  scriptSrc: 'script-src',
  styleSrc: 'style-src',
  imgSrc: 'img-src',
  fontSrc: 'font-src',
  frameSrc: 'frame-src',
  childSrc: 'child-src',
  self: "'self'",
  data: 'data:',
  blob: 'blob:',
  inlineStyle: "'unsafe-inline'",
  unsafeEval: "'unsafe-eval'",
  wasmUnsafeEval: "'wasm-unsafe-eval'",
  build(cspObj: Record<string, string[]>) {
    return Object.entries(cspObj)
      .map(([k, vs]) => `${k} ${vs.filter(x => x != null).join(' ')};`)
      .join(' ');
  }
} as const;

const PathRegExp = /(?<dirname>.*)\/(?<filename>(?<basename>.*)(?<extname>\.[^.]+)?)$/
export function getUriParts(uri: vsc.Uri) {
  const { dirname, filename, basename, extname } = decodeURI(uri.toString()).match(PathRegExp)?.groups ?? {}
  return { dirname, filename, basename, extname };
}

export function cancelTokenToAbortSignal(token?: vsc.CancellationToken): AbortSignal|undefined {
  if (token == null) return;
  const ctrl = new AbortController();
  if (token.isCancellationRequested) ctrl.abort(); 
  else token.onCancellationRequested(() => ctrl.abort());
  return ctrl.signal;
}

export const encodeUtf8 = TextEncoder.prototype.encode.bind(new TextEncoder());
export const getShortMachineId = async () => base58.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', encodeUtf8(vsc.env.machineId))).subarray(0, 6));

export type ESDisposable = {
  [Symbol.dispose](): void
}

export const assignESDispose = <T extends vsc.Disposable>(ch: T): T & ESDisposable => {
  return Object.assign(ch, { [Symbol.dispose]() { ch.dispose() } });
}

export function doTry<T extends (...args: any) => any>(fn: T): ReturnType<T>|undefined {
  try {
    return fn();
  } catch (err) {
    console.error(`[${Title}]`, err instanceof Error ? err.message : String(err));
  }
}

export async function doTryAsync<T extends (...args: any) => Promise<any>>(fn: T): Promise<ReturnType<T>|undefined> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[${Title}]`, err instanceof Error ? err.message : String(err));
  }
}

const toDashCase = (str: string) => str.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);

export function toDatasetAttrs(obj: Record<string, string|boolean|undefined>) {
  return Object.entries(obj).map(([k, v]) => v != null ? `data-${toDashCase(k)}="${v}"` : '').join(' ');
}

export function themeToCss(theme: vsc.ColorTheme) {
  switch (theme.kind) {
    case vsc.ColorThemeKind.Dark: return 'dark';
    case vsc.ColorThemeKind.Light: return 'light';
    case vsc.ColorThemeKind.HighContrast: return 'dark';
    case vsc.ColorThemeKind.HighContrastLight: return 'light';
  }
}

export function uiKindToString(uiKind: vsc.UIKind) {
  switch (uiKind) {
    case vsc.UIKind.Web: return 'web';
    case vsc.UIKind.Desktop: return 'desktop';
  }
}

export type BoolString = 'true'|'false';
export const toBoolString = (x?: boolean|null): BoolString|undefined => x === true ? 'true' : x === false ? 'false' : undefined;
