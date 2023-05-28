import * as vscode from 'vscode';

export default function acquireFetch(): {
  FormData: typeof FormData, 
  Headers: typeof Headers, 
  Request: typeof Request, 
  Response: typeof Response, 
  Blob: typeof Blob, 
  File: typeof File, 
  fetch: typeof fetch
} {
  if (vscode.env.uiKind == vscode.UIKind.Web) {
    return globalThis;
  } else {
    const { FormData, Headers, Request, Response, Blob, File, fetch } = require('node-fetch');
    return { FormData, Headers, Request, Response, Blob, File, fetch };
  }
}
