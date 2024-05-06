export const FormData: typeof globalThis.FormData = process.env.VSCODE_WEB ? globalThis.FormData : require('node-fetch').FormData;
export const Headers: typeof globalThis.Headers = process.env.VSCODE_WEB ? globalThis.Headers : require('node-fetch').Headers;
export const Request: typeof globalThis.Request = process.env.VSCODE_WEB ? globalThis.Request : require('node-fetch').Request;
export const Response: typeof globalThis.Response = process.env.VSCODE_WEB ? globalThis.Response : require('node-fetch').Response;
export const Blob: typeof globalThis.Blob = process.env.VSCODE_WEB ? globalThis.Blob : require('node-fetch').Blob;
export const File: typeof globalThis.File = process.env.VSCODE_WEB ? globalThis.File : require('node-fetch').File;
export const fetch: typeof globalThis.fetch = process.env.VSCODE_WEB ? globalThis.fetch : require('node-fetch').fetch;
