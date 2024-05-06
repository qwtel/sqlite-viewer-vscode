export const Worker: typeof globalThis.Worker = process.env.VSCODE_WEB ? globalThis.Worker : require('worker_threads').Worker;
export const MessageChannel: typeof globalThis.MessageChannel = process.env.VSCODE_WEB ? globalThis.MessageChannel : require('worker_threads').MessageChannel;
export const MessagePort: typeof globalThis.MessagePort = process.env.VSCODE_WEB ? globalThis.MessagePort : require('worker_threads').MessagePort;
export const BroadcastChannel: typeof globalThis.BroadcastChannel = process.env.VSCODE_WEB ? globalThis.BroadcastChannel : require('worker_threads').BroadcastChannel;
