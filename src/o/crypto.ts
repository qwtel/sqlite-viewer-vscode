export const crypto: typeof globalThis.crypto = import.meta.env.VSCODE_BROWSER_EXT ? globalThis.crypto : require('crypto').webcrypto;