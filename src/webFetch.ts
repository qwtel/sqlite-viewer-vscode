export const FormData: typeof globalThis.FormData = import.meta.env.BROWSER_EXT ? globalThis.FormData : require('node-fetch').FormData;
export const Headers: typeof globalThis.Headers = import.meta.env.BROWSER_EXT ? globalThis.Headers : require('node-fetch').Headers;
export const Request: typeof globalThis.Request = import.meta.env.BROWSER_EXT ? globalThis.Request : require('node-fetch').Request;
export const Response: typeof globalThis.Response = import.meta.env.BROWSER_EXT ? globalThis.Response : require('node-fetch').Response;
export const Blob: typeof globalThis.Blob = import.meta.env.BROWSER_EXT ? globalThis.Blob : require('node-fetch').Blob;
export const File: typeof globalThis.File = import.meta.env.BROWSER_EXT ? globalThis.File : require('node-fetch').File;
export const fetch: typeof globalThis.fetch = import.meta.env.BROWSER_EXT ? globalThis.fetch : require('node-fetch').fetch;
