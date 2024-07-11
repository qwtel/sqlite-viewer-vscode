import * as vsc from 'vscode';
import type { TypedEventListenerOrEventListenerObject } from "@worker-tools/typed-event-target";
import * as CBOR from 'cbor-x'

// A bunch of tests to figure out where we're running. Some more reliable than others.
export const IS_VSCODE = vsc.env.uriScheme.includes("vscode");
export const IS_VSCODIUM = vsc.env.uriScheme.includes("vscodium");
export const IS_GITHUB_DEV = vsc.env.uriScheme.includes("vscode") && vsc.env.appHost === "gihub.dev";
export const IS_GITPOD_WEB = vsc.env.uriScheme.includes("gitpod-code") || vsc.env.appHost === "Gitpod" || vsc.env.appName === "Gitpod Code";
export const IS_GOOGLE_IDX = vsc.env.appName.includes("IDX") || (vsc.env.appHost === "web" && vsc.env.remoteName?.startsWith('idx'));

export const IS_DESKTOP = vsc.env.appHost === "desktop";

export function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

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

const cborDecoder = new CBOR.Decoder({ structuredClone: true, useRecords: false, pack: false, tagUint8Array: true, structures: undefined })

/**
 * A wrapper for a vscode webview that implements Comlink's endpoint interface
 * @deprecated
 */
export class WebviewEndpointAdapter {
  constructor(private readonly webview: vsc.Webview) {}
  private listeners = new Map<TypedEventListenerOrEventListenerObject<MessageEvent>, vsc.Disposable>
  postMessage(message: any, transfer: Transferable[]) {
    // @ts-expect-error: transferables type missing
    this.webview.postMessage(message, transfer);
  }
  addEventListener(_event: "message", handler: TypedEventListenerOrEventListenerObject<MessageEvent>|null) {
    if (!handler) return;
    if ("handleEvent" in handler) {
      this.listeners.set(handler, this.webview.onDidReceiveMessage(data => {
        handler.handleEvent({ data } as MessageEvent);
      }));
    } else {
      this.listeners.set(handler, this.webview.onDidReceiveMessage(data => {
        handler({ data } as MessageEvent);
      }))
    }
  }
  removeEventListener(_event: "message", handler: TypedEventListenerOrEventListenerObject<MessageEvent>|null) {
    if (!handler) return;
    this.listeners.get(handler)?.dispose();
    this.listeners.delete(handler);
  }
  terminate() {
    this.listeners.forEach(disposable => disposable.dispose());
    this.listeners.clear();
  }
}

export class WebviewStreamPair implements vsc.Disposable {
  #readable;
  #writable;
  #disposable: vsc.Disposable | undefined;
  constructor(private readonly webview: vsc.Webview) {
    this.#readable = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#disposable = this.webview.onDidReceiveMessage(data => {
          // const [header, code, port1, port2, tl, payload] = cborDecoder.decode(data);
          // console.log("Receiving...", [header, code, port1?.toString(16), port2?.toString(16), tl, payload && { byteLength: payload?.byteLength }])
          controller.enqueue(data);
        });
      },
      cancel: () => {
        this.#disposable?.dispose();
      },
    });
    this.#writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        const { buffer, byteOffset, byteLength } = chunk;
        // const [header, code, port1, port2, tl, payload] = cborDecoder.decode(chunk);
        // console.log("Sending...", [header, code, port1?.toString(16), port2?.toString(16), tl, payload && { byteLength: payload?.byteLength }])
        this.webview.postMessage({ buffer, byteOffset, byteLength });
      },
    });
  }
  get readable() {
    return this.#readable;
  }
  get writable() {
    return this.#writable;
  }
  dispose() {
    this.#readable.cancel();
    this.#writable.abort();
  }
}

export const cspUtil = {
  defaultSrc: 'default-src',
  scriptSrc: 'script-src',
  styleSrc: 'style-src',
  imgSrc: 'img-src',
  fontSrc: 'font-src',
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

const PathRegExp = /(?<dirname>.*)\/(?<filename>(?<basename>.*)(?<extname>\.[^.]+))$/
export function getUriParts(uri: vsc.Uri) {
  const { dirname, filename, basename, extname } = decodeURI(uri.toString()).match(PathRegExp)?.groups ?? {}
  return { dirname, filename, basename, extname };
}
