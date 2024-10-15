export const ReadableStream: typeof globalThis.ReadableStream = import.meta.env.VSCODE_BROWSER_EXT ? globalThis.ReadableStream : require('stream/web').ReadableStream;
export const WritableStream: typeof globalThis.WritableStream = import.meta.env.VSCODE_BROWSER_EXT ? globalThis.WritableStream : require('stream/web').WritableStream;
export const TransformStream: typeof globalThis.TransformStream = import.meta.env.VSCODE_BROWSER_EXT ? globalThis.TransformStream : require('stream/web').TransformStream;
