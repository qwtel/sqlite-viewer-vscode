import * as vscode from 'vscode';

export default function acquireFetch(): Pick<typeof globalThis, "FormData"|"Headers"|"Request"|"Response"|"Blob"|"File"|"fetch"> {
  if (vscode.env.uiKind == vscode.UIKind.Web) {
    return globalThis;
  } else {
    const { FormData, Headers, Request, Response, Blob, File, fetch } = require('node-fetch');
    return { FormData, Headers, Request, Response, Blob, File, fetch };
  }
}
